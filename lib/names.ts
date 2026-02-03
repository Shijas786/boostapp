import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import { db } from "./db";

/**
 * Step 6: Identity resolver logic (server-only)
 * Handles sequential resolution: Base Name -> ENS -> Farcaster
 */
export async function resolveIdentity(address: string) {
    const addressLower = address.toLowerCase();

    // 1. Check Identities Cache
    const cached = await db.getIdentity(addressLower);
    if (cached) return cached;

    // 2. Resolver Object
    const identity: any = {
        address: addressLower,
        base_name: null,
        ens: null,
        farcaster_username: null,
        farcaster_fid: null,
        avatar_url: null
    };

    // 3. Resolve Base Name (OnchainKit/Base)
    try {
        const basename = await getName({ address: addressLower as `0x${string}`, chain: base });
        if (basename) {
            identity.base_name = basename;
        }
    } catch (e) { }

    // 4. Resolve Farcaster (Neynar)
    try {
        const apiKey = process.env.NEYNAR_API_KEY;
        if (apiKey) {
            const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`;
            const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
            if (res.ok) {
                const data = await res.json();
                const users = data[addressLower] || [];
                const user = users[0];
                if (user) {
                    identity.farcaster_username = user.username;
                    identity.farcaster_fid = user.fid;
                    if (!identity.avatar_url) identity.avatar_url = user.pfp_url;
                }
            }
        }
    } catch (e) { }

    // 5. Save and Return
    await db.saveIdentity(identity);
    return identity;
}
