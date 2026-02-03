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

    const coin = '0x3c0226121d67ead8cb2b48efa4118f6dede5e385'.toLowerCase();

    console.log(`🔎 Inspecting parameters for Transfer events on ${coin}...`);

    const sql = `
        SELECT parameters
        FROM base.events
        WHERE address = '${coin}'
        AND event_name = 'Transfer'
        LIMIT 5
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        const rows = json.data || json.result || [];
        console.log(`📊 Parameters Sample:`, JSON.stringify(rows[0]?.parameters, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
