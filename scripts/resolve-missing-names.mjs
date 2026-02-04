import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { createPublicClient, http } from 'viem';
import { mainnet, base } from 'viem/chains';
import { getName as getBaseName } from '@coinbase/onchainkit/identity';

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http('https://eth-mainnet.public.blastapi.io')
});

async function main() {
    console.log('\n🚀 Resolving Missing Names for Top Participants...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get current leaderboard addresses that are "anonymous"
    const { data: results, error } = await supabase.rpc('get_leaderboard', {
        period_days: 7,
        limit_count: 500
    });

    if (error) {
        console.error('RPC Error:', error);
        return;
    }

    const anonymous = results.filter(r => !r.base_name && !r.farcaster_username && !r.ens_name);
    console.log(`👤 Found ${anonymous.length} anonymous addresses in top 500. Resolving...\n`);

    let ensCount = 0;
    let baseCount = 0;

    const BATCH_SIZE = 5;
    for (let i = 0; i < anonymous.length; i += BATCH_SIZE) {
        const batch = anonymous.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (user) => {
            const address = user.buyer_address.toLowerCase();

            try {
                // Skip if it's a contract
                const bytecode = await mainnetClient.getBytecode({ address });
                if (bytecode && bytecode !== '0x') return;

                const results = [];

                // Try Base Name
                const bName = await getBaseName({ address, chain: base });
                if (bName) {
                    await supabase.from('identities').upsert({ address, base_name: bName, updated_at: new Date().toISOString() });
                    results.push(`Base: ${bName}`);
                    baseCount++;
                }

                // Try ENS
                const eName = await mainnetClient.getEnsName({ address });
                if (eName) {
                    await supabase.from('identities').upsert({ address, ens: eName, updated_at: new Date().toISOString() });
                    results.push(`ENS: ${eName}`);
                    ensCount++;
                }

                if (results.length > 0) {
                    console.log(`✅ ${address.slice(0, 10)}... → ${results.join(', ')}`);
                } else {
                    process.stdout.write('.');
                }
            } catch (e) {
                process.stdout.write('!');
            }
        });

        await Promise.all(promises);
        if (ensCount >= 110) break;
        await new Promise(r => setTimeout(r, 100));
    }

    console.log(`\n\n🏁 Resolution complete! Resolved ${baseCount} Base Names and ${ensCount} ENS names.`);
}

main().catch(console.error);
