const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').map(l => {
        const [k, ...v] = l.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const apiKey = env.CDP_API_KEY;
    const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    const sql = "SELECT * FROM base.transfers LIMIT 1";

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
