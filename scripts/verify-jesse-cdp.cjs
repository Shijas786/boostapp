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

    const jesse = '0x6cfeb3c22b1fbe33d51fe7d0d28de303bb5be48d'.toLowerCase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();

    console.log(`🔎 Checking CDP for ALL Jesse transfers since ${thirtyDaysAgo}...`);

    const sql = `
        SELECT count(*) as total
        FROM base.events
        WHERE event_name = 'Transfer'
        AND toString(parameters['to']) = '${jesse}'
        AND block_timestamp > '${thirtyDaysAgo}'
        AND address IN (
            SELECT DISTINCT toString(parameters['coin'])
            FROM base.events
            WHERE address = '${factoryAddress}'
        )
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        const count = (json.data || json.result || [])[0]?.total;
        console.log(`📊 CDP reports ${count} buy events for Jesse (0x6cfe...) in 30d.`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
