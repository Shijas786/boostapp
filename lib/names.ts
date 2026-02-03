import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import { db } from "./db";

/**
 * Step 6: Identity resolver logic (server-only)
 * Handles sequential resolution: Base Name -> ENS -> Farcaster
 */
export async function resolveIdentity(address: string) {
    const results = await resolveIdentities([address]);
    return results[0];
}

/**
 * Bulk Resolution - Much faster for dashboard
 */
export async function resolveIdentities(addresses: string[]) {
    if (addresses.length === 0) return [];

    const uniqueAddresses = Array.from(new Set(addresses.map(a => a.toLowerCase())));

    // 1. Check DB Cache
    const cached = await db.getIdentities(uniqueAddresses);
    const cachedMap = new Map(cached.map((id: any) => [id.address.toLowerCase(), id]));

    const missing = uniqueAddresses.filter(addr => !cachedMap.has(addr));
    if (missing.length === 0) return cached;

    // 2. Prepare Identity Map for Missing
    const identityMap = new Map<string, any>();
    missing.forEach(addr => {
        identityMap.set(addr, {
            address: addr,
            base_name: null,
            farcaster_username: null,
            farcaster_fid: null,
            avatar_url: null
        });
    });

    // 3. Resolve Farcaster Batch (Neynar)
    try {
        const apiKey = process.env.NEYNAR_API_KEY;
        if (apiKey && missing.length > 0) {
            const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${missing.join(',')}`;
            const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
            if (res.ok) {
                const data = await res.json();
                missing.forEach(addr => {
                    const users = data[addr] || [];
                    const user = users[0];
                    if (user) {
                        const id = identityMap.get(addr);
                        id.farcaster_username = user.username;
                        id.farcaster_fid = user.fid;
                        id.avatar_url = user.pfp_url;
                    }
                });
            }
        }
    } catch (e) { }

    // 4. Resolve Base Names in Parallel
    await Promise.all(missing.map(async (addr) => {
        try {
            const basename = await getName({ address: addr as `0x${string}`, chain: base });
            if (basename) {
                identityMap.get(addr).base_name = basename;
            }
        } catch (e) { }
    }));

    // 5. Save all new identities and combine with cached
    const resolvedList = Array.from(identityMap.values());
    for (const id of resolvedList) {
        await db.saveIdentity(id);
    }

    return [...cached, ...resolvedList];
}
