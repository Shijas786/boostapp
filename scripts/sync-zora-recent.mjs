import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
    console.log('\n🚀 Syncing Recent Zora Creator Coin Activity (Last 24 Hours)...\n');

    // Load env
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const zoraApiKey = env.NEXT_PUBLIC_ZORA_API_KEY;

    if (!zoraApiKey) {
        console.error('❌ Missing Zora API Key in .env.local');
        return;
    }

    const headers = {
        'api-key': zoraApiKey,
        'Content-Type': 'application/json'
    };

    // Step 1: Get latest coins
    console.log('Step 1: Fetching active coins from Zora...');
    const coinsRes = await fetch('https://api-sdk.zora.engineering/coinsList?first=100&sortBy=TOTAL_VOLUME_DESC', { headers });
    if (!coinsRes.ok) {
        console.error('❌ Zora API Error (coinsList):', coinsRes.status, await coinsRes.text());
        return;
    }

    const coinsData = await coinsRes.json();
    console.log('DEBUG: coinsData keys:', Object.keys(coinsData));
    const coins = (coinsData.coinsBasicInfo?.edges || []).map(e => e.node.coinAddress);
    console.log(`   ✅ Found ${coins.length} coins to check`);
    if (coins.length > 0) console.log('DEBUG: First 5 coins:', coins.slice(0, 5));
    console.log('\n');

    // Step 2: Fetch swaps for each coin
    console.log(`Step 2: Fetching recent swaps for ${coins.length} coins...`);
    let allSwaps = [];

    // Concurrency limit to avoid being seen as bot
    const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
    const tokenChunks = chunk(coins, 10);

    for (const tokenChunk of tokenChunks) {
        const promises = tokenChunk.map(async (address) => {
            try {
                const res = await fetch(`https://api-sdk.zora.engineering/coinSwaps?address=${address}&limit=20`, { headers });
                if (!res.ok) return [];
                const data = await res.json();
                const activities = (data.zora20Token?.swapActivities?.edges || []).map(e => ({
                    ...e.node,
                    coinAddress: address
                }));
                if (activities.length > 0) {
                    console.log(`DEBUG: Found ${activities.length} swaps for ${address}`);
                }
                return activities;
            } catch (e) {
                return [];
            }
        });

        const results = await Promise.all(promises);
        allSwaps.push(...results.flat());
        process.stdout.write('.');
    }
    console.log(`\n   ✅ Fetched ${allSwaps.length} swap events\n`);

    if (allSwaps.length === 0) {
        console.log('No recent swaps found.');
        return;
    }

    // Step 3: Insert into buys table
    console.log('Step 3: Saving swaps to database...');
    const buysToInsert = allSwaps.map(swap => ({
        buyer: (swap.senderAddress || swap.recipientAddress).toLowerCase(),
        post_token: swap.coinAddress.toLowerCase(),
        block_time: swap.blockTimestamp,
        tx_hash: swap.transactionHash
    }));

    // Filter out duplicates in the same batch
    const uniqueBuys = [];
    const seen = new Set();
    for (const b of buysToInsert) {
        const key = `${b.tx_hash}_${b.post_token}_${b.buyer}`;
        if (!seen.has(key)) {
            uniqueBuys.push(b);
            seen.add(key);
        }
    }

    const { error: buyError } = await supabase
        .from('buys')
        .upsert(uniqueBuys, { onConflict: 'tx_hash,post_token,buyer' });

    if (buyError) {
        console.error('   ❌ DB Error (buys):', buyError.message);
    } else {
        console.log(`   ✅ Saved ${uniqueBuys.length} unique swap records\n`);
    }

    // Step 4: Backfill identities from Zora senderProfile metadata (Fast Track)
    console.log('Step 4: Using Zora metadata to backfill identities...');
    const identityRecords = [];
    const seenAddrs = new Set();

    for (const swap of allSwaps) {
        const addr = (swap.senderAddress || swap.recipientAddress).toLowerCase();
        if (seenAddrs.has(addr)) continue;

        const profile = swap.senderProfile;
        if (profile) {
            identityRecords.push({
                address: addr,
                farcaster_username: profile.farcaster?.username || null,
                farcaster_fid: profile.farcaster?.fid || null,
                avatar_url: profile.avatar || null,
                updated_at: new Date().toISOString()
            });
            seenAddrs.add(addr);
        }
    }

    if (identityRecords.length > 0) {
        const { error: idError } = await supabase
            .from('identities')
            .upsert(identityRecords, { onConflict: 'address' });

        if (idError) {
            console.error('   ❌ DB Error (identities):', idError.message);
        } else {
            console.log(`   ✅ Pre-resolved ${identityRecords.length} identities from Zora metadata\n`);
        }
    }

    console.log('✨ Sync complete! New data ready for leaderboard.');
}

main().catch(console.error);
