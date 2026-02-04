import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Manual env loading for ESM
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const client = createPublicClient({
    chain: base,
    transport: http()
});

async function main() {
    console.log('🚀 Starting backfill of identities...');

    // 1. Get all unique buyers from the buys table
    const { data: buyersData } = await supabase.from('buys').select('buyer');
    const uniqueBuyers = [...new Set(buyersData.map(b => b.buyer.toLowerCase()))];
    console.log(`📊 Total unique buyers in transactions: ${uniqueBuyers.length}`);

    // 2. Identify those who need resolution (None in identities OR current identity is anonymous)
    const { data: existingIds } = await supabase.from('identities').select('address, base_name, farcaster_username');
    const existingMap = new Map((existingIds || []).map(i => [i.address.toLowerCase(), i]));

    const missing = uniqueBuyers.filter(addr => {
        const id = existingMap.get(addr);
        return !id || (!id.base_name && !id.farcaster_username);
    });

    console.log(`🔍 Found ${missing.length} identities needing resolution.`);

    if (missing.length === 0) {
        console.log('✅ All buyers are already resolved.');
        return;
    }

    // 3. Batch resolve
    const BATCH_SIZE = 25; // Smaller batch for stability
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
        const batch = missing.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(missing.length / BATCH_SIZE)}...`);

        const resolvedBatch = [];

        // A. Farcaster Resolution (Neynar)
        let farcasterData = null;
        if (env.NEYNAR_API_KEY) {
            try {
                const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${batch.map(a => a.toLowerCase()).join(',')}`;
                const res = await fetch(url, { headers: { 'x-api-key': env.NEYNAR_API_KEY } });
                if (res.ok) {
                    farcasterData = await res.json();
                } else if (res.status === 429) {
                    console.warn('⚠️ Neynar Rate Limited. Waiting 10 seconds...');
                    await new Promise(r => setTimeout(r, 10000));
                    // Optional: retry once or just skip to next turn
                }
            } catch (e) {
                console.error('❌ Neynar error:', e.message);
            }
        }

        // B. Individual Resolution for the batch
        await Promise.all(batch.map(async (addr) => {
            const addrLower = addr.toLowerCase();
            const updateObj = {
                address: addrLower,
                updated_at: new Date().toISOString(),
                base_name: null,
                farcaster_username: null,
                farcaster_fid: null,
                avatar_url: null
            };

            let foundAny = false;

            // Farcaster
            if (farcasterData) {
                const fcUser = farcasterData[addrLower]?.[0];
                if (fcUser) {
                    updateObj.farcaster_username = fcUser.username;
                    updateObj.farcaster_fid = fcUser.fid;
                    if (fcUser.pfp_url) updateObj.avatar_url = fcUser.pfp_url;
                    foundAny = true;
                }
            }

            // Basenames (Standard ENS on Base)
            try {
                const name = await client.getEnsName({ address: addrLower });
                if (name) {
                    updateObj.base_name = name;
                    foundAny = true;
                }
            } catch (e) { }

            // Only push if we actually found something NEW
            if (foundAny) {
                resolvedBatch.push(updateObj);
            }
        }));

        // 4. Save this batch
        if (resolvedBatch.length > 0) {
            const { error } = await supabase.from('identities').upsert(resolvedBatch);
            if (error) console.error('❌ DB Error:', error.message);
            else console.log(`✅ Resolved and saved ${resolvedBatch.length} identities.`);
        } else {
            console.log('ℹ️ No names found in this batch.');
        }

        // Rate limiting: 2 seconds between batches
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('🏁 Backfill complete!');
}

main().catch(console.error);
