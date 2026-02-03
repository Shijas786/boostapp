const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const apiKey = env.CDP_API_KEY;
    const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    // Query for the last 15 minutes of transfers for content coins
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();
    const cteDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    console.log(`🔎 Checking CDP for transfers since ${fifteenMinsAgo}...`);

    const sql = `
        SELECT 
            block_timestamp,
            transaction_hash as tx_hash,
            address as post_token,
            toString(parameters['to']) as buyer
        FROM base.events
        WHERE event_name = 'Transfer'
        AND block_timestamp > '${fifteenMinsAgo}'
        AND address IN (
            SELECT DISTINCT toString(parameters['coin'])
            FROM base.events
            WHERE event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND address = '${factoryAddress}'
            AND block_timestamp > '${cteDaysAgo}'
        )
        ORDER BY block_timestamp DESC
        LIMIT 50
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        const rows = json.data || json.result || [];
        console.log(`✅ CDP: Found ${rows.length} recent buy events`);
        if (rows.length > 0) {
            console.log('Recent events:');
            rows.forEach(r => console.log(`- ${r.block_timestamp}: ${r.buyer} bought ${r.post_token} (tx: ${r.tx_hash})`));
        } else {
            console.log('No recent events found in the last 15 minutes.');
        }
    } catch (e) {
        console.error('Debug Error:', e.message);
    }
}
main();
