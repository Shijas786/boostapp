const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function main() {
    // Load environment variables
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const cdpApiKey = env.CDP_API_KEY;
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    console.log('\n🚀 Populating Leaderboard from Last 7 Days...\n');

    // Step 1: Get all buyers from CDP for the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const sql = `
        SELECT 
            to_address as buyer,
            token_address as post_token,
            block_timestamp,
            block_number,
            log_index
        FROM base.transfers
        WHERE from_address = '0x0000000000000000000000000000000000000000'
        AND block_timestamp > '${sevenDaysAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 5000
    `;

    console.log('Step 1: Querying CDP for creator token purchases...');

    const cdpUrl = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';
    const cdpHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cdpApiKey}`
    };

    let buys = [];
    try {
        const res = await fetch(cdpUrl, {
            method: 'POST',
            headers: cdpHeaders,
            body: JSON.stringify({ sql })
        });

        if (!res.ok) {
            console.error(`❌ CDP Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response:', text.substring(0, 500));
            return;
        }

        const json = await res.json();
        buys = json.result || json.data || [];
        console.log(`   ✅ Found ${buys.length} creator token purchases\n`);
    } catch (e) {
        console.error('❌ CDP Request Error:', e.message);
        return;
    }

    if (buys.length === 0) {
        console.log('No purchases found in the last 7 days.');
        return;
    }

    // Step 2: Insert buys into database in batches
    console.log('Step 2: Inserting purchases into database...');

    const batchSize = 100;
    const records = buys.map(buy => ({
        buyer: buy.buyer.toLowerCase(),
        post_token: buy.post_token.toLowerCase(),
        block_time: buy.block_timestamp,
        tx_hash: `synthetic_${buy.block_number}_${buy.log_index}`
    }));

    let inserted = 0;
    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase
            .from('buys')
            .upsert(batch, {
                onConflict: 'tx_hash,post_token,buyer',
                ignoreDuplicates: true
            });

        if (error && !error.message.includes('duplicate')) {
            console.error('   Batch error:', error.message);
        } else {
            inserted += batch.length;
        }

        if ((i + batchSize) % 500 === 0) {
            console.log(`   Processed ${Math.min(i + batchSize, records.length)}/${records.length}...`);
        }
    }

    console.log(`   ✅ Processed ${records.length} purchases\n`);

    // Step 3: Get unique buyers
    const uniqueBuyers = Array.from(new Set(buys.map(b => b.buyer.toLowerCase())));
    console.log(`Step 3: Resolving identities for ${uniqueBuyers.length} unique addresses...\n`);

    // Step 4: Resolve identities in batches
    let resolved = 0;
    let cached = 0;
    const resolveBatchSize = 50;

    for (let i = 0; i < uniqueBuyers.length; i += resolveBatchSize) {
        const batch = uniqueBuyers.slice(i, i + resolveBatchSize);

        // Check which are already cached
        const { data: existing } = await supabase
            .from('identities')
            .select('address')
            .in('address', batch);

        const existingSet = new Set((existing || []).map(e => e.address));
        const toResolve = batch.filter(addr => !existingSet.has(addr));
        cached += existingSet.size;

        if (toResolve.length === 0) continue;

        // Batch resolve Farcaster identities
        const identities = [];
        try {
            const neynarKey = env.NEYNAR_API_KEY;
            if (neynarKey) {
                const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${toResolve.join(',')}`;
                const res = await fetch(url, { headers: { 'x-api-key': neynarKey } });
                if (res.ok) {
                    const data = await res.json();

                    toResolve.forEach(addr => {
                        const users = data[addr] || [];
                        const user = users[0];

                        identities.push({
                            address: addr,
                            base_name: null,
                            ens: null,
                            farcaster_username: user?.username || null,
                            farcaster_fid: user?.fid || null,
                            avatar_url: user?.pfp_url || null
                        });
                    });
                }
            } else {
                // No Neynar key, create empty identities
                toResolve.forEach(addr => {
                    identities.push({
                        address: addr,
                        base_name: null,
                        ens: null,
                        farcaster_username: null,
                        farcaster_fid: null,
                        avatar_url: null
                    });
                });
            }
        } catch (e) {
            console.error('   Neynar error:', e.message);
            // Create empty identities on error
            toResolve.forEach(addr => {
                identities.push({
                    address: addr,
                    base_name: null,
                    ens: null,
                    farcaster_username: null,
                    farcaster_fid: null,
                    avatar_url: null
                });
            });
        }

        // Save batch
        if (identities.length > 0) {
            await supabase
                .from('identities')
                .upsert(identities);

            resolved += identities.length;
        }

        console.log(`   Resolved ${i + batch.length}/${uniqueBuyers.length}...`);

        // Rate limit protection
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\n   ✅ Resolved ${resolved} new identities, ${cached} were cached\n`);

    // Step 5: Show leaderboard preview
    console.log('Step 5: Leaderboard Preview (Top 10):\n');

    const { data: leaders, error: leaderError } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 10 });

    if (leaderError) {
        console.error('Error fetching leaderboard:', leaderError);
    } else if (leaders) {
        console.log('Rank | Address | Posts | Buys | Name\n' + '─'.repeat(70));
        leaders.forEach((leader, i) => {
            const name = leader.farcaster_username || leader.base_name || leader.ens || 'anon';
            const addr = `${leader.buyer_address.substring(0, 6)}...${leader.buyer_address.substring(38)}`;
            console.log(`${String(i + 1).padEnd(4)} | ${addr} | ${String(leader.unique_posts).padEnd(5)} | ${String(leader.total_buys).padEnd(4)} | ${name}`);
        });
    }

    console.log('\n✨ Done! Leaderboard populated.\n');
}

main().catch(console.error);
