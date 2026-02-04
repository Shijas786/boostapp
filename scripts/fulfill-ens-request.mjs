import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const mainnetClient = createPublicClient({
    chain: mainnet,
    transport: http('https://eth-mainnet.public.blastapi.io')
});

async function main() {
    console.log('\n🚀 Fulfilling Request: 100+ ENS Names for Past 24h Transactions...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const zoraApiKey = env.NEXT_PUBLIC_ZORA_API_KEY;

    // 1. Get all unique buyers from the last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBuys } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', oneDayAgo);

    const uniqueBuyers = Array.from(new Set(recentBuys.map(b => b.buyer.toLowerCase())));
    console.log(`👤 Found ${uniqueBuyers.length} unique buyers in 24h. Searching for ENS...`);

    let ensResolved = 0;

    // Process in batches
    const BATCH_SIZE = 4;
    for (let i = 0; i < uniqueBuyers.length; i += BATCH_SIZE) {
        const batch = uniqueBuyers.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (address) => {
            try {
                // Skip if we already have it
                const { data: existing } = await supabase.from('identities').select('ens').eq('address', address).single();
                if (existing?.ens) return;

                const name = await mainnetClient.getEnsName({ address });
                if (name) {
                    await supabase.from('identities').upsert({
                        address,
                        ens: name,
                        updated_at: new Date().toISOString()
                    });
                    console.log(`✅ ${address.slice(0, 10)}... → ${name}`);
                    ensResolved++;
                }
            } catch (e) {
                // process.stdout.write('!');
            }
        });

        await Promise.all(promises);
        if (ensResolved >= 120) break;
        await new Promise(r => setTimeout(r, 100));
        process.stdout.write('.');
    }

    console.log(`\n\n✨ Done! Resolved ${ensResolved} new ENS names for 24h participants.`);
}

main().catch(console.error);
