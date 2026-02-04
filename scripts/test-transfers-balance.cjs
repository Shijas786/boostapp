const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').map(l => {
        const [k, ...v] = l.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const apiKey = env.CD_API_KEY || env.CDP_API_KEY; // Fix typo if any
    const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    const wallet = '0x498581ff718922c3f8e6a244956af099b2652b2b'.toLowerCase();

    // Query balance using base.transfers
    const sql = `
        SELECT token_address as token, SUM(delta) as balance
        FROM (
            SELECT token_address, toInt256(value) as delta
            FROM base.transfers
            WHERE to_address = '${wallet}'
            UNION ALL
            SELECT token_address, -toInt256(value) as delta
            FROM base.transfers
            WHERE from_address = '${wallet}'
        )
        GROUP BY token
        HAVING balance > 0
        LIMIT 20
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
