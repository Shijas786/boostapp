/**
 * Identity Resolution Module
 * Resolves addresses to human-readable names using:
 * 1. Base Names (via OnchainKit)
 * 2. ENS (via viem)
 * 3. Farcaster (from cached data)
 * 
 * Implements rate limiting and caching per Base/CDP docs
 */

import { getName, getAvatar } from "@coinbase/onchainkit/identity";
import { base, mainnet } from "viem/chains";
import { createPublicClient, http } from "viem";
import { db } from "./db";
import { BaseNameError, IdentityError } from "./errors";
import { withRetry, withRateLimit, sleep } from "./retry";

// Viem clients
const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});

const baseClient = createPublicClient({
    chain: base,
    transport: http(),
});

// Zora API Configuration
const ZORA_API_BASE = 'https://api-sdk.zora.engineering/api';
const getZoraHeaders = () => ({
    'api-key': process.env.NEXT_PUBLIC_ZORA_API_KEY || '',
    'Content-Type': 'application/json',
});

// Types
export interface ResolvedIdentity {
    address: string;
    baseName: string | null;
    ensName: string | null;
    farcasterUsername: string | null;
    farcasterFid: number | null;
    displayName: string;
    avatarUrl: string | null;
    source: 'basename' | 'ens' | 'farcaster' | 'zora' | 'address';
    isHuman?: boolean;
}

export interface IdentityCache {
    address: string;
    base_name: string | null;
    ens: string | null;
    farcaster_username: string | null;
    farcaster_fid: number | null;
    avatar_url: string | null;
    updated_at: string;
}

// Cache TTL in milliseconds
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const NULL_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for failed lookups

/**
 * Check if cached identity is still valid
 */
function isCacheValid(identity: IdentityCache | null): boolean {
    if (!identity || !identity.updated_at) return false;

    const updatedAt = new Date(identity.updated_at).getTime();
    const now = Date.now();

    // Use shorter TTL for entries without names
    const hasName = identity.base_name || identity.ens || identity.farcaster_username;
    const ttl = hasName ? CACHE_TTL : NULL_CACHE_TTL;

    return (now - updatedAt) < ttl;
}

/**
 * Resolve Base Name for an address using OnchainKit
 * Includes retry logic with exponential backoff
 */
export async function resolveBaseName(address: string): Promise<{
    name: string | null;
    avatar: string | null;
}> {
    try {
        const result = await withRetry(
            async () => {
                // Use a timeout to prevent hanging on network/provider issues
                const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms));

                const getNamePromise = getName({
                    address: address as `0x${string}`,
                    chain: base,
                });

                const name = await Promise.race([getNamePromise, timeout(10000)]) as string | null;

                let avatar: string | null = null;

                if (name) {
                    try {
                        const getAvatarPromise = getAvatar({
                            ensName: name,
                            chain: base,
                        });
                        avatar = await Promise.race([getAvatarPromise, timeout(5000)]) as string | null;
                    } catch {
                        // Avatar fetch failed, continue without it
                    }
                }

                return { name: name || null, avatar };
            },
            {
                maxRetries: 2,
                baseDelayMs: 500,
                onRetry: (attempt, error, delay) => {
                    console.log(`Base name retry ${attempt} for ${address.slice(0, 8)}... (${delay}ms)`);
                },
            }
        );

        return result;
    } catch (error) {
        console.error(`Failed to resolve Base name for ${address}:`, error);
        return { name: null, avatar: null };
    }
}

/**
 * Resolve ENS name for an address
 */
export async function resolveENS(address: string): Promise<string | null> {
    try {
        const ensName = await withRetry(
            async () => {
                return await mainnetClient.getEnsName({
                    address: address as `0x${string}`,
                });
            },
            {
                maxRetries: 2,
                baseDelayMs: 300,
            }
        );

        return ensName || null;
    } catch {
        return null;
    }
}

/**
 * Resolve a single identity with caching
 */
export async function resolveIdentity(address: string): Promise<ResolvedIdentity> {
    const normalizedAddress = address.toLowerCase();

    // Check cache first
    const cached = await db.getIdentity(normalizedAddress);

    if (cached && isCacheValid(cached)) {
        return formatIdentity(cached);
    }

    // Resolve fresh data
    const identity = await resolveIdentityFresh(normalizedAddress);

    // Save to cache
    await db.saveIdentity({
        address: normalizedAddress,
        base_name: identity.baseName,
        ens: identity.ensName,
        farcaster_username: identity.farcasterUsername,
        farcaster_fid: identity.farcasterFid,
        avatar_url: identity.avatarUrl,
    });

    return identity;
}

/**
 * Resolve identity from Zora API
 */
export async function resolveZoraProfile(address: string): Promise<any> {
    const apiKey = process.env.NEXT_PUBLIC_ZORA_API_KEY;
    if (!apiKey) return null;

    try {
        const res = await fetch(`${ZORA_API_BASE}/profile?identifier=${address}`, {
            headers: getZoraHeaders()
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

/**
 * Resolve identity without cache
 */
async function resolveIdentityFresh(address: string): Promise<ResolvedIdentity> {
    // 1. Check if it's a contract (bytecode exists)
    let isContract = false;
    try {
        const bytecode = await baseClient.getBytecode({
            address: address as `0x${string}`,
        });
        isContract = !!bytecode && bytecode !== '0x';
    } catch (e) {
        // Fallback to false if check fails
    }

    // if it's a contract, we don't need to resolve socials as intensely
    if (isContract) {
        return {
            address,
            baseName: null,
            ensName: null,
            farcasterUsername: null,
            farcasterFid: null,
            displayName: formatAddress(address),
            avatarUrl: null,
            source: 'address',
            isHuman: false,
        };
    }

    // Try Zora Profile first for social identity (Farcaster/Zora Handle)
    const zoraProfile = await resolveZoraProfile(address);

    // Check if it's likely a human
    // privy/external wallet types or presence of socials are strong signals
    const hasSocials = zoraProfile?.farcaster?.username || zoraProfile?.twitter || zoraProfile?.handle || zoraProfile?.displayName;
    const isHuman = !!(hasSocials || zoraProfile?.linkedWallets?.some((w: any) =>
        ['PRIVY', 'EXTERNAL'].includes(w.walletType)
    ));

    // Try Base Name (preferred on Base chain)
    const baseResult = await resolveBaseName(address);

    if (baseResult.name) {
        return {
            address,
            baseName: baseResult.name,
            ensName: null,
            farcasterUsername: zoraProfile?.farcaster?.username || null,
            farcasterFid: zoraProfile?.farcaster?.fid || null,
            displayName: baseResult.name,
            avatarUrl: baseResult.avatar || zoraProfile?.profileImage || null,
            source: 'basename',
            isHuman: true,
        };
    }

    if (zoraProfile) {
        const fcUser = zoraProfile.farcaster?.username;
        const zoraHandle = zoraProfile.handle || zoraProfile.displayName;

        if (fcUser || zoraHandle) {
            return {
                address,
                baseName: null,
                ensName: null,
                farcasterUsername: fcUser || null,
                farcasterFid: zoraProfile.farcaster?.fid || null,
                displayName: fcUser ? `@${fcUser}` : zoraHandle || formatAddress(address),
                avatarUrl: zoraProfile.profileImage || null,
                source: fcUser ? 'farcaster' : 'zora',
                isHuman: true,
            };
        }
    }

    // Try ENS as fallback
    const ensName = await resolveENS(address);

    if (ensName) {
        return {
            address,
            baseName: null,
            ensName,
            farcasterUsername: null,
            farcasterFid: null,
            displayName: ensName,
            avatarUrl: null,
            source: 'ens',
            isHuman: true,
        };
    }

    // Return address-based identity
    return {
        address,
        baseName: null,
        ensName: null,
        farcasterUsername: null,
        farcasterFid: null,
        displayName: formatAddress(address),
        avatarUrl: null,
        source: 'address',
        isHuman: isHuman,
    };
}

/**
 * Format cached identity to ResolvedIdentity
 */
function formatIdentity(cached: IdentityCache): ResolvedIdentity {
    let displayName: string;
    let source: ResolvedIdentity['source'];

    if (cached.base_name) {
        displayName = cached.base_name;
        source = 'basename';
    } else if (cached.ens) {
        displayName = cached.ens;
        source = 'ens';
    } else if (cached.farcaster_username) {
        displayName = cached.farcaster_username;
        source = 'farcaster';
    } else {
        displayName = formatAddress(cached.address);
        source = 'address';
    }

    return {
        address: cached.address,
        baseName: cached.base_name,
        ensName: cached.ens,
        farcasterUsername: cached.farcaster_username,
        farcasterFid: cached.farcaster_fid,
        displayName,
        avatarUrl: cached.avatar_url,
        source,
    };
}

/**
 * Format address for display
 */
function formatAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Bulk resolve identities with rate limiting
 */
export async function resolveIdentities(
    addresses: string[],
    options: {
        onProgress?: (completed: number, total: number) => void;
    } = {}
): Promise<ResolvedIdentity[]> {
    if (addresses.length === 0) return [];

    const normalizedAddresses = [...new Set(addresses.map(a => a.toLowerCase()))];

    // Batch fetch cached identities
    const cachedIdentities = await db.getIdentities(normalizedAddresses);
    const cachedMap = new Map(cachedIdentities.map(i => [i.address, i]));

    // Separate cached and uncached addresses
    const validCached: ResolvedIdentity[] = [];
    const needsFresh: string[] = [];

    for (const address of normalizedAddresses) {
        const cached = cachedMap.get(address);
        if (cached && isCacheValid(cached)) {
            validCached.push(formatIdentity(cached));
        } else {
            needsFresh.push(address);
        }
    }

    // Resolve uncached identities with rate limiting
    const freshIdentities = await withRateLimit(
        needsFresh,
        async (address, index) => {
            const identity = await resolveIdentityFresh(address);

            // Save to cache (fire and forget)
            db.saveIdentity({
                address,
                base_name: identity.baseName,
                ens: identity.ensName,
                farcaster_username: identity.farcasterUsername,
                farcaster_fid: identity.farcasterFid,
                avatar_url: identity.avatarUrl,
            }).catch(console.error);

            return identity;
        },
        {
            concurrency: 5,  // Max 5 concurrent requests
            delayMs: 200,    // 200ms between batches
            onProgress: options.onProgress,
        }
    );

    // Combine and return in original order
    const resultMap = new Map<string, ResolvedIdentity>();

    for (const identity of [...validCached, ...freshIdentities]) {
        resultMap.set(identity.address, identity);
    }

    return normalizedAddresses.map(addr =>
        resultMap.get(addr) || {
            address: addr,
            baseName: null,
            ensName: null,
            farcasterUsername: null,
            farcasterFid: null,
            displayName: formatAddress(addr),
            avatarUrl: null,
            source: 'address' as const,
        }
    );
}
