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
    const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    console.log('🔄 Fetching all unique tokens from DB...');
    const { data: tokenData } = await supabase.from('buys').select('post_token');
    if (!tokenData) return;

    const uniqueTokens = Array.from(new Set(tokenData.map(t => t.post_token)));
    console.log(`📊 Found ${uniqueTokens.length} unique tokens to check.`);

    // Process in batches of 500 to stay safe with query size
    const BATCH_SIZE = 500;
    for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
        const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
        console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(uniqueTokens.length / BATCH_SIZE)}...`);

        const tokensList = batch.map(t => `'${t}'`).join(',');

        const sql = `
            SELECT wallet, token, SUM(delta) as balance
            FROM (
                SELECT toString(parameters['to']) as wallet, address as token, toInt256OrZero(toString(parameters['value'])) as delta
                FROM base.events
                WHERE event_name = 'Transfer'
                AND address IN (${tokensList})
                UNION ALL
                SELECT toString(parameters['from']) as wallet, address as token, -toInt256OrZero(toString(parameters['value'])) as delta
                FROM base.events
                WHERE event_name = 'Transfer'
                AND address IN (${tokensList})
            )
            GROUP BY wallet, token
            HAVING balance > 0
        `;

        try {
            const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
            const json = await res.json();
            const results = json.data || json.result || [];

            if (results.length > 0) {
                console.log(`✅ Batch found ${results.length} active holdings.`);

                const toInsert = results.map(r => ({
                    wallet: r.wallet.toLowerCase(),
                    post_token: r.token.toLowerCase(),
                    balance: r.balance,
                    updated_at: new Date().toISOString()
                }));

                // Chunk Supabase inserts to avoid payload limits
                for (let j = 0; j < toInsert.length; j += 1000) {
                    const chunk = toInsert.slice(j, j + 1000);
                    const { error } = await supabase.from('holdings').upsert(chunk);
                    if (error) console.error(`❌ Supabase Error (Batch ${i}, Chunk ${j}):`, error.message);
                }
            } else {
                console.log('⚪ No active holdings in this batch.');
            }
        } catch (e) {
            console.error('💥 Batch failed:', e.message);
        }
    }

    console.log('🏁 Sync complete.');
}
main();
