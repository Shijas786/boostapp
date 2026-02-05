import { createClient } from '@supabase/supabase-js';
import { getName, getAvatar } from '@coinbase/onchainkit/identity';
import { base } from 'viem/chains';
import { getEnv } from '../lib/env-loader.mjs';

async function main() {
    console.log('\n🚀 Fulfilling Request: Resolving EVERY Top Address (CDP/Base Name Focused)...\n');

    const env = getEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 0. Get Recent Buyers (Last 24h) to ensure freshness
    console.log('Step 0: Fetching recent buyers from 24h activity...');
    const { data: recentBuys } = await supabase
        .from('buys')
        .select('buyer')
        .order('block_time', { ascending: false })
        .limit(200);

    const recentAddresses = recentBuys ? recentBuys.map(b => b.buyer.toLowerCase()) : [];

    // 1. Get Top All-Time Buyers
    console.log('Step 1: Fetching top addresses from Leaderboard...');
    const { data: results, error } = await supabase.rpc('get_leaderboard', {
        period_days: 7,
        limit_count: 1000
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    const leaderboardAddresses = results.map(u => u.buyer_address.toLowerCase());

    // Merge and deduplicate
    const allAddresses = [...new Set([...recentAddresses, ...leaderboardAddresses])];
    const addresses = allAddresses.slice(0, 2000); // Limit to 2000

    console.log(`👤 Found ${addresses.length} unique addresses. Checking DB for missing identities...`);

    // 2. Filter out already resolved identities
    // We only want to resolve those who have NO name yet or haven't been updated in 7 days?
    // For simplicity, fetch all KNOWN identities and filter them out if they have a base_name
    const { data: existing } = await supabase
        .from('identities')
        .select('address, base_name, ens')
        .in('address', addresses);

    const resolvedMap = new Map();
    existing?.forEach(i => {
        if (i.base_name || i.ens) {
            resolvedMap.set(i.address.toLowerCase(), true);
        }
    });

    const toResolve = addresses.filter(a => !resolvedMap.has(a));
    console.log(`📝 Addresses needing resolution: ${toResolve.length} (Skipped ${addresses.length - toResolve.length})`);

    // 3. Resolve via OnchainKit (Base Names)
    // Concurrency: 5 at a time to be safe with RPC
    const CONCURRENCY = 5;
    let resolvedCount = 0;

    for (let i = 0; i < toResolve.length; i += CONCURRENCY) {
        const batch = toResolve.slice(i, i + CONCURRENCY);

        await Promise.all(batch.map(async (address) => {
            try {
                // Try Base Name
                const name = await getName({ address, chain: base });

                if (name) {
                    process.stdout.write(`✅ @${name} `);

                    // Try get avatar
                    let avatar = null;
                    try {
                        avatar = await getAvatar({ ensName: name, chain: base });
                    } catch (e) { /* ignore */ }

                    // Upsert identity
                    await supabase.from('identities').upsert({
                        address: address,
                        base_name: name,
                        avatar_url: avatar,
                        updated_at: new Date().toISOString()
                    });
                    resolvedCount++;
                } else {
                    process.stdout.write('.');
                    // Mark as checked
                    await supabase.from('identities').upsert({
                        address: address,
                        updated_at: new Date().toISOString()
                    });
                }
            } catch (e) {
                // Ignore errors (RPC issues etc)
                process.stdout.write('x');
            }
        }));

        // Tiny delay to cool down RPC
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n\n✨ Done! Resolved ${resolvedCount} new Base Names.`);
    console.log('The leaderboard will now prioritize these users.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
