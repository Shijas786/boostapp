import { NextResponse } from 'next/server';
import { getName, getAvatar } from '@coinbase/onchainkit/identity';
import { base, mainnet } from 'viem/chains';
import { createPublicClient, http } from 'viem';

// Setup Viem Client for Mainnet (Fallback)
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http()
});

// In-Memory Cache (Global to persist across hot lambdas)
// Key: address (lowercase), Value: { name, avatar, timestamp }
const identityCache = new Map<string, { name: string | null, avatar: string | null, timestamp: number }>();

async function resolveIdentity(address: string): Promise<{ name: string | null, avatar: string | null }> {
    try {
        let name: string | null = null;
        let chainUsed: any = base;

        // 1. Try Base (Basenames)
        // OnchainKit's getName is optimized for Basenames
        try {
            name = await getName({
                address: address as `0x${string}`,
                chain: base
            });
        } catch (_) {
            // Base resolution failed
        }

        // 2. If not found on Base, try Mainnet (Standard ENS)
        if (!name) {
            try {
                name = await mainnetClient.getEnsName({
                    address: address as `0x${string}`
                });
                if (name) chainUsed = mainnet;
            } catch (_) {
                // Ignore mainnet error
            }
        }

        let avatar: string | null = null;

        // Only fetch avatar if name exists
        if (name) {
            try {
                // Use OnchainKit for avatar (it handles various avatar records well)
                // Note: chainUsed ensures we query the right chain for the avatar record
                avatar = await getAvatar({
                    ensName: name,
                    chain: chainUsed
                });
            } catch (_) {
                // Avatar fetch failed, continue without it
            }
        }

        return { name: name || null, avatar };
    } catch (e) {
        console.error(`Failed to resolve ${address}:`, e);
        return { name: null, avatar: null };
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address')?.toLowerCase();

    if (!address) {
        return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // 1. Check Cache
    const now = Date.now();
    const cached = identityCache.get(address);
    if (cached) {
        // Hit: Return if within TTL
        // HIT TTL: 24h
        // NULL TTL: 30m
        const ttl = cached.name ? (24 * 60 * 60 * 1000) : (30 * 60 * 1000);
        if (now - cached.timestamp < ttl) {
            return NextResponse.json({
                address,
                name: cached.name,
                baseName: cached.name,
                displayName: cached.name || `${address.slice(0, 6)}...${address.slice(-4)}`,
                avatar: cached.avatar,
                cached: true
            }, {
                headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' }
            });
        }
    }

    // 2. Resolve
    const { name, avatar } = await resolveIdentity(address);

    // 3. Update Cache (Always cache result, even null)
    identityCache.set(address, { name, avatar, timestamp: now });

    // 4. Return Normalized Object
    const responseData = {
        address,
        name, // Legacy compatibility
        baseName: name,
        displayName: name || `${address.slice(0, 6)}...${address.slice(-4)}`,
        avatar,
        cached: false
    };

    return NextResponse.json(responseData, {
        headers: {
            // Browser/CDN Cache: 24 hours
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600'
        }
    });
}
