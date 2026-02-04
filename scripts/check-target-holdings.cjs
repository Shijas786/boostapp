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

    const targetAddress = '0x0EEE4C7Dbe630dBDF475A57F0625Bf648b58A068'.toLowerCase();
    const factoryAddress = '0x777777751622c0d3258f214f9df38e35bf45baf3'.toLowerCase();

    const sql = `
        SELECT 
            address as token_address,
            event_name,
            block_timestamp,
            transaction_hash,
            parameters
        FROM base.events
        WHERE (toString(parameters['to']) = '${targetAddress}' OR toString(parameters['from']) = '${targetAddress}')
        AND event_name = 'Transfer'
        ORDER BY block_timestamp DESC
        LIMIT 1000
    `;

    console.log(`🔎 Checking holdings for ${targetAddress}...`);

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql }) });
        const text = await res.text();

        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse JSON. Response text:', text.slice(0, 500));
            return;
        }

        if (json.error) {
            console.error('API Error:', json.error);
            return;
        }

        const rows = json.data || json.result || [];
        const balances = {};
        rows.forEach(r => {
            const token = r.token_address;
            const params = r.parameters || {};
            const to = toString(params.to).toLowerCase();
            const from = toString(params.from).toLowerCase();
            const value = BigInt(toString(params.value).split('.')[0] || "0");

            if (!balances[token]) balances[token] = 0n;
            if (to === targetAddress) balances[token] += value;
            if (from === targetAddress) balances[token] -= value;
        });

        const activeHoldings = Object.entries(balances).filter(([_, bal]) => bal > 0n);
        console.log(`✅ Found ${activeHoldings.length} potential token holdings.`);

        for (const [token, bal] of activeHoldings) {
            const balance = Number(bal / 1000000000000000000n);
            console.log(`- Token: ${token}, Balance: ${balance} (Raw: ${bal})`);
        }

        function toString(val) {
            return val ? val.toString() : "";
        }

    } catch (e) {
        console.error('Request Error:', e.message);
    }
}
main();
