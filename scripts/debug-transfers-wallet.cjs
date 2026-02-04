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

    const wallet = '0x2211d1d0020daea8039e46cf1367962070d77da9'.toLowerCase();

    // Check if Jesse exists in to_address or from_address
    const sql = `
        SELECT to_address, from_address, token_address, value
        FROM base.transfers
        WHERE to_address = '${wallet}' OR from_address = '${wallet}'
        LIMIT 5
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        console.log(JSON.stringify(json, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
