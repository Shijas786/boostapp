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
    const wallet = '0x2211d1d0020daea8039e46cf1367962070d77da9';
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3';

    console.log(`🔍 Deep syncing all historical purchases for ${wallet}...`);

    // Fetch ALL transfers to Jesse
    // Note: We'll filter for tokens that have been created by the factory
    // To make it faster, we first get Jesse's unique received tokens from base.transfers (faster than events)
    const sql = `
        SELECT DISTINCT token_address 
        FROM base.transfers 
        WHERE to_address = '${wallet}'
        AND block_timestamp > subtractMonths(now(), 6)
    `;

    const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ sql })
    });
    const json = await res.json();
    if (!json.result) {
        console.error('❌ CDP Error:', json);
        return;
    }
    const uniqueTokens = json.result.map(r => r.token_address);
    console.log(`📊 Jesse received ${uniqueTokens.length} different tokens in total.`);

    // Now filter those tokens against the Zora factory
    const CHUNK_SIZE = 500;
    const trackedTokens = [];

    for (let i = 0; i < uniqueTokens.length; i += CHUNK_SIZE) {
        const chunk = uniqueTokens.slice(i, i + CHUNK_SIZE);
        const tokensList = chunk.map(t => `'${t}'`).join(',');

        const filterSql = `
            SELECT DISTINCT toString(parameters['coin']) as coin
            FROM base.events
            WHERE address = '${factoryAddress}'
            AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND toString(parameters['coin']) IN (${tokensList})
        `;

        const filterRes = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ sql: filterSql })
        });
        const filterJson = await filterRes.json();
        trackedTokens.push(...(filterJson.result || []).map(r => r.coin));
    }

    console.log(`✅ Identified ${trackedTokens.length} as Zora Creator Coins.`);

    // Now fetch all transfer events for these specific tokens to populate 'buys'
    if (trackedTokens.length > 0) {
        console.log(`📝 Fetching buy events for ${trackedTokens.length} tokens...`);

        let totalBuys = 0;
        const BUY_BATCH = 200; // Small batches for the final query

        for (let i = 0; i < trackedTokens.length; i += BUY_BATCH) {
            const chunk = trackedTokens.slice(i, i + BUY_BATCH);
            const tokensList = chunk.map(t => `'${t}'`).join(',');

            const buySql = `
                SELECT 
                    block_timestamp,
                    transaction_hash as tx_hash,
                    address as post_token,
                    toString(parameters['to']) as buyer
                FROM base.events
                WHERE address IN (${tokensList})
                AND toString(parameters['to']) = '${wallet}'
                AND event_name = 'Transfer'
                LIMIT 1000
            `;

            const buyRes = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ sql: buySql })
            });
            const buyJson = await buyRes.json();

            if (buyJson.result && buyJson.result.length > 0) {
                const buys = buyJson.result.map(r => ({
                    buyer: r.buyer.toLowerCase(),
                    post_token: r.post_token.toLowerCase(),
                    block_time: r.block_timestamp,
                    tx_hash: r.tx_hash
                }));

                await supabase.from('buys').upsert(buys);
                totalBuys += buys.length;
                console.log(`⏳ Progress: ${i + chunk.length}/${trackedTokens.length} tokens... Ingested ${totalBuys} buys total.`);
            }
        }
        console.log('🏁 Deep sync complete!');
    }
}
main();
