import { NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/names';
import { createSuccessResponse, createErrorResponse, ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// In-memory cache for rapid repeated requests
const requestCache = new Map<string, {
    data: ReturnType<typeof formatResponse>;
    timestamp: number
}>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute for request-level cache

function formatResponse(identity: Awaited<ReturnType<typeof resolveIdentity>>) {
    return {
        address: identity.address,
        name: identity.displayName,
        baseName: identity.baseName,
        ensName: identity.ensName,
        farcasterUsername: identity.farcasterUsername,
        farcasterFid: identity.farcasterFid,
        displayName: identity.displayName,
        avatar: identity.avatarUrl,
        source: identity.source,
        isHuman: identity.isHuman,
    };
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address')?.toLowerCase();

    // Validate address
    if (!address) {
        return NextResponse.json(
            createErrorResponse(new ValidationError('address', 'Address parameter is required')),
            { status: 400 }
        );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return NextResponse.json(
            createErrorResponse(new ValidationError('address', 'Invalid Ethereum address format')),
            { status: 400 }
        );
    }

    try {
        // Check request cache first (for rapid repeated calls)
        const now = Date.now();
        const cached = requestCache.get(address);

        if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
            return NextResponse.json(
                createSuccessResponse({ ...cached.data, cached: true }),
                {
                    headers: {
                        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
                    },
                }
            );
        }

        // Resolve identity (handles DB cache internally)
        const identity = await resolveIdentity(address);
        const responseData = formatResponse(identity);

        // Update request cache
        requestCache.set(address, { data: responseData, timestamp: now });

        // Clean old cache entries periodically
        if (requestCache.size > 1000) {
            const oldEntries = Array.from(requestCache.entries())
                .filter(([_, v]) => (now - v.timestamp) > CACHE_TTL_MS);
            oldEntries.forEach(([k]) => requestCache.delete(k));
        }

        return NextResponse.json(
            createSuccessResponse({ ...responseData, cached: false }),
            {
                headers: {
                    // CDN/Browser cache: 24 hours with stale-while-revalidate
                    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
                },
            }
        );
    } catch (error) {
        console.error('[resolve-name] Error:', error);

        return NextResponse.json(
            createErrorResponse(error),
            { status: 500 }
        );
    }
}
