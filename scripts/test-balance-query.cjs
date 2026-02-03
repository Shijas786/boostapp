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

    const wallet = '0x498581ff718922c3f8e6a244956af099b2652b2b'.toLowerCase();

    // Query balance by summing transfers
    const sql = `
        SELECT token, SUM(delta) as balance
        FROM (
            SELECT address as token, toInt256OrZero(toString(parameters['value'])) as delta
            FROM base.events
            WHERE event_name = 'Transfer'
            AND toString(parameters['to']) = '${wallet}'
            UNION ALL
            SELECT address as token, -toInt256OrZero(toString(parameters['value'])) as delta
            FROM base.events
            WHERE event_name = 'Transfer'
            AND toString(parameters['from']) = '${wallet}'
        )
        GROUP BY token
        HAVING balance > 0
        LIMIT 10
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
