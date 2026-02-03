import { getName } from "@coinbase/onchainkit/identity";
import { base, mainnet } from "viem/chains";
import { createPublicClient, http } from "viem";
import { db } from "./db";

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http()
});

const MANUAL_OVERRIDES: Record<string, string> = {
    '0x0eee4c7dbe630dbdf475a57f0625bf648b58a068': 'cryptowolf07.farcaster.eth'
};

/*
 * Resolves a name ONLY if it's not already in the DB.
 * Supports Base (Basename) and Mainnet (ENS).
 */
export async function resolveNameIfMissing(address: string) {
    const addressLower = address.toLowerCase();

    // 1. Check DB
    const exists = await db.getName(addressLower);
    if (exists) return;

    let name: string | null = null;
    let source = 'none';

    // 2. Check Manual Overrides
    if (MANUAL_OVERRIDES[addressLower]) {
        name = MANUAL_OVERRIDES[addressLower];
        source = 'manual';
    } else {
        // 3. Try Base
        try {
            name = await getName({ address: addressLower as `0x${string}`, chain: base });
            if (name) source = 'base';
        } catch (e) { }

        // 4. Try Mainnet
        if (!name) {
            try {
                name = await mainnetClient.getEnsName({ address: addressLower as `0x${string}` });
                if (name) source = 'mainnet';
            } catch (e) { }
        }
    }

    // 5. Save to DB (even if null, to avoid resolving again immediately)
    // In a real app we might want a "last_checked" to retry nulls later, 
    // but for now we assume null is final until manual re-run.
    await db.saveName({
        address: addressLower,
        name,
        source
    });

    if (name) {
        console.log(`✅ Resolved ${address.slice(0, 6)} -> ${name} (${source})`);
    }
}
