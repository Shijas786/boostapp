const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').map(l => {
        const [k, ...v] = l.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const apiKey = env.CDP_API_KEY;
    const wallet = '0x2211d1d0020daea8039e46cf1367962070d77da9'.toLowerCase(); // Jesse
    const network = 'base';
    const url = `https://api.cdp.coinbase.com/platform/v2/evm/token-balances/${network}/${wallet}`;

    const headers = {
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const res = await fetch(url, { method: 'GET', headers });
        const text = await res.text();
        console.log('Status:', res.status);
        console.log('Body:', text);
    } catch (e) {
        console.error('Error:', e.message);
    }
}
main();
