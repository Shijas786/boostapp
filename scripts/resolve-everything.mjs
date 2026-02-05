import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

import { getEnv } from '../lib/env-loader.mjs';

async function main() {
    console.log('\n🚀 Fulfilling Request: Resolving EVERY Top Address (Neynar Focused)...\n');

    const env = getEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const neynarKey = env.NEYNAR_API_KEY;

    // 1. Get ALL unique buyers from recent activity (last 7 days)
    console.log('Step 1: Fetching top addresses from DB...');
    const { data: results, error } = await supabase.rpc('get_leaderboard', {
        period_days: 7,
        limit_count: 2000
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    const addresses = results.map(u => u.buyer_address.toLowerCase());
    console.log(`👤 Found ${addresses.length} addresses. Starting Neynar Bulk Resolve...`);

    // 2. Resolve via Neynar (Farcaster) - 100 at a time
    let matches = 0;
    for (let i = 0; i < addresses.length; i += 100) {
        const batch = addresses.slice(i, i + 100);
        console.log(`   Processing batch ${i / 100 + 1}...`);

        try {
            const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${batch.join(',')}`;
            const response = await fetch(url, {
                headers: { 'api_key': neynarKey }
            });

            if (response.ok) {
                const data = await response.json();
                for (const addr in data) {
                    const users = data[addr];
                    if (users && users.length > 0) {
                        const user = users[0];
                        const { error: upsertError } = await supabase.from('identities').upsert({
                            address: addr.toLowerCase(),
                            farcaster_username: user.username,
                            farcaster_fid: user.fid,
                            avatar_url: user.pfp_url,
                            updated_at: new Date().toISOString()
                        });

                        if (!upsertError) {
                            process.stdout.write(`✅ @${user.username} `);
                            matches++;
                        }
                    } else {
                        process.stdout.write('.');
                    }
                }
                console.log('\nBatch complete.');
            } else {
                console.error(`   ❌ Neynar API Error: ${response.status}`);
            }
        } catch (e) {
            console.error(`   ❌ Request failed: ${e.message}`);
        }

        // Anti-rate limit for our own console/updates
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n\n✨ Done! Found ${matches} verified Farcaster identities.`);
    console.log('The leaderboard will now prioritize these users.');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
