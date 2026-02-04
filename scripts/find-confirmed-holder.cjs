const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').map(l => {
        const [k, ...v] = l.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const apiKey = env.CDP_API_KEY;

    const { data: tokenData } = await supabase.from('buys').select('post_token').limit(10);
    const targetToken = tokenData[0].post_token;
    console.log('Target Token:', targetToken);

    const { data: buyerData } = await supabase.from('buys').select('buyer').eq('post_token', targetToken).limit(5);
    const potentialHolders = buyerData.map(b => b.buyer);
    console.log('Potential Holders:', potentialHolders);

    for (const wallet of potentialHolders) {
        const url = `https://api.cdp.coinbase.com/platform/v2/data/evm/token-balances/base/${wallet}?pageSize=100`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } });
        const json = await res.json();
        const found = json.balances?.find(b => b.token.contractAddress.toLowerCase() === targetToken.toLowerCase());
        if (found) {
            console.log(`✅ ${wallet} HOLDS ${targetToken}: ${found.amount.amount}`);
        } else {
            console.log(`❌ ${wallet} does not hold ${targetToken}`);
        }
    }
}
main();
