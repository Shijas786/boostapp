const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').map(l => {
        const [k, ...v] = l.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const apiKey = env.CDP_API_KEY;
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3';

    console.log('🚀 Starting Robust Incremental Global Token Discovery...');

    const { data: buyersData } = await supabase.from('buys').select('buyer');
    const allWallets = Array.from(new Set(buyersData.map(b => b.buyer.toLowerCase())));
    console.log(`👤 Found ${allWallets.length} total unique wallets to scan.`);

    const BEACON_BATCH = 20; // Smaller batches for better visibility
    for (let i = 0; i < allWallets.length; i += BEACON_BATCH) {
        const batch = allWallets.slice(i, i + BEACON_BATCH);
        console.log(`⏳ [${i}/${allWallets.length}] Processing batch...`);

        const potentialTokens = new Set();
        for (const wallet of batch) {
            try {
                const sql = `SELECT DISTINCT token_address FROM base.transfers WHERE to_address = '${wallet}' AND block_timestamp > subtractMonths(now(), 6) LIMIT 1000`;
                const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body: JSON.stringify({ sql })
                });
                const json = await res.json();
                if (json.result) {
                    json.result.forEach(r => potentialTokens.add(r.token_address.toLowerCase()));
                } else if (json.errorMessage) {
                    console.log(`  ⚠️ Skipping ${wallet}: ${json.errorMessage.split(',')[0]}`);
                }
            } catch (e) { }
        }

        const potentials = Array.from(potentialTokens);
        if (potentials.length === 0) continue;

        console.log(`  🔍 Found ${potentials.length} tokens. Filtering against Zora Factory...`);
        const trackedTokens = [];
        const FILTER_CHUNK = 400;
        for (let j = 0; j < potentials.length; j += FILTER_CHUNK) {
            const chunk = potentials.slice(j, j + FILTER_CHUNK);
            const tokensList = chunk.map(t => `'${t}'`).join(',');
            const filterSql = `SELECT DISTINCT toString(parameters['coin']) as coin FROM base.events WHERE address = '${factoryAddress}' AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated') AND toString(parameters['coin']) IN (${tokensList})`;

            const filterRes = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ sql: filterSql })
            });
            const filterJson = await filterRes.json();
            if (filterJson.result) {
                trackedTokens.push(...filterJson.result.map(r => r.coin.toLowerCase()));
            }
        }

        if (trackedTokens.length > 0) {
            console.log(`  ✨ Found ${trackedTokens.length} NEW creator tokens! Upserting...`);
            const { error } = await supabase.from('tracked_tokens').upsert(trackedTokens.map(addr => ({ address: addr })));
            if (error) console.error('  ❌ Supabase Upsert Error:', error.message);
        } else {
            console.log('  💤 No new Zora creator tokens in this batch.');
        }
    }

    console.log('🏁 Robust Discovery complete!');
}
main();
