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

    console.log('🚀 Starting Deep Sync for All Tracked Tokens...');

    // 1. Fetch ALL tokens using pagination
    const tokens = [];
    let start = 0;
    const step = 1000;
    while (true) {
        const { data } = await supabase.from('tracked_tokens').select('address').range(start, start + step - 1);
        if (!data || data.length === 0) break;
        tokens.push(...data);
        start += step;
        if (data.length < step) break;
    }

    if (tokens.length === 0) {
        console.log('⚠️ No tokens to sync. Run discovery first.');
        return;
    }

    console.log(`📊 Syncing history for ${tokens.length} tracked tokens...`);

    const BATCH_SIZE = 100; // CDP can handle batches of tokens in 'IN' clause
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const chunk = tokens.slice(i, i + BATCH_SIZE).map(t => t.address.toLowerCase());
        const tokensList = chunk.map(t => `'${t}'`).join(',');

        console.log(`⏳ Processing batch ${i / BATCH_SIZE + 1}... (${chunk.length} tokens)`);

        try {
            // Fetch all Transfers for this batch
            // Note: We might need to split by time if there are too many, 
            // but let's try all-time first with a limit.
            const sql = `
                SELECT 
                    block_timestamp,
                    transaction_hash as tx_hash,
                    address as post_token,
                    toString(parameters['to']) as buyer
                FROM base.events
                WHERE address IN (${tokensList})
                AND event_name = 'Transfer'
                AND block_timestamp > subtractMonths(now(), 12)
                LIMIT 5000
            `;

            const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({ sql })
            });
            const json = await res.json();

            if (json.result && json.result.length > 0) {
                const buys = json.result.map(r => ({
                    buyer: r.buyer.toLowerCase(),
                    post_token: r.post_token.toLowerCase(),
                    block_time: r.block_timestamp,
                    tx_hash: r.tx_hash
                }));

                console.log(`📝 Ingesting ${buys.length} buys...`);
                await supabase.from('buys').upsert(buys);
            }
        } catch (e) {
            console.error(`❌ Batch Error:`, e.message);
        }
    }

    console.log('🏁 Deep Sync complete!');
}
main();
