import { getName } from "@coinbase/onchainkit/identity";
import { base, mainnet } from "viem/chains";
import { createPublicClient, http } from "viem";
import { db } from "./db";

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http()
});

const baseClient = createPublicClient({
    chain: base,
    transport: http()
});

const MANUAL_OVERRIDES: Record<string, string> = {
    '0x0eee4c7dbe630dbdf475a57f0625bf648b58a068': 'cryptowolf07.farcaster.eth'
};

async function fetchFarcasterIdentity(address: string) {
    const apiKey = process.env.NEYNAR_API_KEY;
    if (!apiKey) return null;

    try {
        // Correct endpoint: bulk-by-address
        const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`;
        const res = await fetch(url, {
            headers: {
                'accept': 'application/json',
                'x-api-key': apiKey  // Correct header name
            }
        });

        if (!res.ok) return null;

        const data = await res.json();
        // Response format: { [address]: [users] }
        const users = data[address.toLowerCase()] || data[address] || [];
        const user = users[0];
        if (user) {
            return {
                fid: user.fid,
                username: user.username,
                displayName: user.display_name,
                pfp: user.pfp_url
            };
        }
    } catch (e) { }
    return null;
}

async function fetchZoraProfile(address: string) {
    const apiKey = process.env.NEXT_PUBLIC_ZORA_API_KEY;
    if (!apiKey) return null;

    try {
        const url = 'https://api.zora.co/graphql';
        const query = `
            query GetProfile($address: String!) {
                profile(identifier: $address) {
                    username
                    displayName
                    avatar { url }
                }
            }
        `;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ query, variables: { address } })
        });

        if (!res.ok) return null;

        const data = await res.json();
        const profile = data.data?.profile;
        if (profile?.username) {
            return {
                username: profile.username,
                displayName: profile.displayName,
                avatar: profile.avatar?.url
            };
        }
    } catch (e) { }
    return null;
}

/*
 * Resolves a name ONLY if it's not already in the DB.
 * Priority: Basename → Farcaster → Zora → ENS
 * Only marks as contract if NO identity found AND has bytecode
 */
export async function resolveNameIfMissing(address: string) {
    const addressLower = address.toLowerCase();

    // 1. Check DB
    const exists = await db.getName(addressLower);
    if (exists) return;

    let name: string | null = null;
    let source = 'none';
    let isContract = false;
    let fid: number | undefined;

    // 2. Check Manual Overrides
    if (MANUAL_OVERRIDES[addressLower]) {
        name = MANUAL_OVERRIDES[addressLower];
        source = 'manual';
    } else {
        // 3. Try Basename FIRST (Smart Wallets have these!)
        try {
            const basename = await getName({ address: addressLower as `0x${string}`, chain: base });
            if (basename) {
                name = basename;
                source = 'base';
            }
        } catch (e) { }

        // 4. ALWAYS try Farcaster to get FID (even if we have Basename)
        const fcUser = await fetchFarcasterIdentity(addressLower);
        if (fcUser) {
            fid = fcUser.fid;
            if (!name) {
                name = fcUser.username;
                source = 'farcaster';
            }
        }

        // 5. Try Zora Profile
        if (!name) {
            const zoraProfile = await fetchZoraProfile(addressLower);
            if (zoraProfile?.username) {
                name = zoraProfile.username;
                source = 'zora';
            }
        }

        // 6. Try ENS
        if (!name) {
            try {
                name = await mainnetClient.getEnsName({ address: addressLower as `0x${string}` });
                if (name) source = 'mainnet';
            } catch (e) { }
        }

        // 7. ONLY check bytecode if NO identity found - mark as contract
        if (!name) {
            try {
                const code = await baseClient.getBytecode({ address: addressLower as `0x${string}` });
                if (code && code !== '0x') {
                    isContract = true;
                    source = 'contract';
                }
            } catch (e) { }
        }
    }

    // 8. Save to DB
    await db.saveName({
        address: addressLower,
        name: isContract ? 'Contract' : name,
        source,
        is_contract: isContract,
        fid
    });

    if (name || isContract || fid) {
        console.log(`✅ Resolved ${address.slice(0, 6)} -> ${isContract ? 'Contract' : name} (Source: ${source}, FID: ${fid || 'None'})`);
    }
}
