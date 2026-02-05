import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

import { getEnv } from '../lib/env-loader.mjs';

async function main() {
    console.log('\n🚀 Flagging Contracts for Top Participants...\n');

    const env = getEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const baseClient = createPublicClient({ chain: base, transport: http() });

    // Get the top 1000 addresses from the leaderboard
    const { data: results } = await supabase.rpc('get_leaderboard', {
        period_days: 7,
        limit_count: 1000
    });

    const addresses = results.map(u => u.buyer_address.toLowerCase());
    console.log(`Checking ${addresses.length} addresses for bytecode...`);

    let contractCount = 0;
    for (const addr of addresses) {
        try {
            const bytecode = await baseClient.getBytecode({ address: addr });
            if (bytecode && bytecode !== '0x') {
                // It is a contract. We will flag it in the identities table using a special field or nickname
                // Let's use the 'ens' field to temporarily label them if they have nothing else, 
                // or just ensure they are marked.
                await supabase.from('identities').upsert({
                    address: addr,
                    ens: 'Contract Bot 🤖',
                    updated_at: new Date().toISOString()
                });
                process.stdout.write('C');
                contractCount++;
            } else {
                process.stdout.write('.');
            }
        } catch (e) {
            process.stdout.write('!');
        }
        // Small delay to avoid rate limit
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n\n✨ Done! Flagged ${contractCount} contracts as "Contract Bot 🤖"`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
