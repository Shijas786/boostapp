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

    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();

    console.log(`🔎 Counting total coins created by Zora factory...`);

    const sql = `
        SELECT count(*) as total
        FROM base.events
        WHERE address = '${factoryAddress}'
        AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
        AND block_timestamp > '2024-01-01 00:00:00'
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        const total = (json.data || json.result || [])[0]?.total;
        console.log(`📊 Total Zora coins found: ${total}`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
