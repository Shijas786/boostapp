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

    console.log(`\n🔎 Checking creator token holdings for ${targetAddress}...\n`);

    // Use the base.transfers table which is optimized for this kind of query
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    console.log('Querying transfers from the last 24 hours...');
    const transfersSql = `
        SELECT 
            token_address as token,
            from_address,
            to_address,
            value,
            block_timestamp
        FROM base.transfers
        WHERE (to_address = '${targetAddress}' OR from_address = '${targetAddress}')
        AND block_timestamp > '${oneDayAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 1000
    `;

    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ sql: transfersSql }) });

        if (!res.ok) {
            console.error(`❌ HTTP Error: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error('Response:', text.substring(0, 500));
            return;
        }

        const json = await res.json();
        const transfers = json.result || json.data || [];

        console.log(`Found ${transfers.length} transfers\n`);

        // Calculate balances locally
        const balances = {};
        transfers.forEach(t => {
            const token = t.token.toLowerCase();
            if (!balances[token]) balances[token] = 0n;

            try {
                const value = BigInt(t.value || 0);
                if (t.to_address.toLowerCase() === targetAddress) {
                    balances[token] += value;
                }
                if (t.from_address.toLowerCase() === targetAddress) {
                    balances[token] -= value;
                }
            } catch (e) {
                // Skip invalid values
            }
        });

        const nonZeroBalances = Object.entries(balances).filter(([_, bal]) => bal > 0n);

        console.log(`✅ Found ${nonZeroBalances.length} token(s) with non-zero balances:\n`);

        if (nonZeroBalances.length === 0) {
            console.log('   No tokens with positive balance found in the last 24 hours.');
        } else {
            nonZeroBalances.sort((a, b) => (a[1] > b[1] ? -1 : 1)).forEach(([token, balance], i) => {
                const balanceInTokens = Number(balance) / 1e18;
                console.log(`${i + 1}. Token: ${token}`);
                console.log(`   Balance: ${balanceInTokens.toFixed(4)} tokens (${balance} wei)\n`);
            });
        }

        console.log('\n💡 Tip: These are balances calculated from the last 24 hours of transfers.');
        console.log('   This shows recent activity but may not reflect total holdings.');
        console.log(`   Check BaseScan for complete history: https://basescan.org/address/${targetAddress}#tokentxns\n`);

    } catch (e) {
        console.error('❌ Request Error:', e.message);
        console.error(e.stack);
    }
}

main();
