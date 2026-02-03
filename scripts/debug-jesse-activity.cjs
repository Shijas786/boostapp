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

    const jesse = '0x2211d1d0020daea8039e46cf1367962070d77da9'.toLowerCase();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    console.log(`🔎 Checking CDP for Jesse transfers...`);

    // Simple query: Just count transfers to Jesse, then filter by coin in the app logic if needed.
    // But even better: just list the top coins bought by Jesse.
    const sql = `
        SELECT address, count(*) as count
        FROM base.events
        WHERE event_name = 'Transfer'
        AND toString(parameters['to']) = '${jesse}'
        AND block_timestamp > '${thirtyDaysAgo}'
        GROUP BY address
        ORDER BY count DESC
        LIMIT 10
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const json = await res.json();
        const rows = json.data || json.result || [];
        console.log(`📊 Top 10 tokens received by Jesse in 30d:`);
        rows.forEach(r => console.log(`${r.address}: ${r.count}`));
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
