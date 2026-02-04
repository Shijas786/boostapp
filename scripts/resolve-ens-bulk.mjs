import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const RPC_URLS = [
    'https://eth-mainnet.public.blastapi.io',
    'https://ethereum.publicnode.com',
    'https://1rpc.io/eth'
];

async function main() {
    console.log('\n🚀 Starting Bulk ENS Resolution (All Buyers)...\n');

    // Load env
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Get all unique buyers
    const { data: allBuys } = await supabase.from('buys').select('buyer').limit(10000);
    const uniqueBuyers = Array.from(new Set(allBuys.map(b => b.buyer.toLowerCase())));

    console.log(`👤 Found ${uniqueBuyers.length} unique buyers. Starting exhaustive ENS lookup...`);

    let resolvedCount = 0;
    let checkedCount = 0;

    // We'll rotate RPCs if we hit limits
    let rpcIndex = 0;
    const getClient = () => createPublicClient({ chain: mainnet, transport: http(RPC_URLS[rpcIndex]) });
    let mainnetClient = getClient();

    const BATCH_SIZE = 5;

    for (let i = 0; i < uniqueBuyers.length; i += BATCH_SIZE) {
        const batch = uniqueBuyers.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (address) => {
            checkedCount++;
            try {
                const name = await mainnetClient.getEnsName({ address: address });
                if (name) {
                    await supabase.from('identities').upsert({
                        address: address.toLowerCase(),
                        ens: name,
                        updated_at: new Date().toISOString()
                    });
                    process.stdout.write('✅');
                    return name;
                }
            } catch (e) {
                if (e.message.includes('429') || e.message.includes('401')) {
                    rpcIndex = (rpcIndex + 1) % RPC_URLS.length;
                    mainnetClient = getClient();
                    process.stdout.write('🔄');
                }
            }
            process.stdout.write('.');
            return null;
        });

        const results = await Promise.all(promises);
        resolvedCount += results.filter(r => r !== null).length;

        // Small delay to avoid aggressive rate limiting
        await new Promise(r => setTimeout(r, 200));

        if (i % 25 === 0 && i > 0) {
            console.log(`\nProgress: ${i}/${uniqueBuyers.length} (Total Resolved: ${resolvedCount})`);
        }
    }

    console.log(`\n\n✨ Done! Checked ${checkedCount} addresses and resolved ${resolvedCount} ENS names.`);
}

main().catch(console.error);
