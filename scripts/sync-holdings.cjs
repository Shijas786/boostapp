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

    console.log('🔄 Fetching managed tokens from DB...');
    const { data: tokenData } = await supabase.from('buys').select('post_token');
    const managedTokens = new Set((tokenData || []).map(t => t.post_token.toLowerCase()));
    console.log(`📊 Tracking ${managedTokens.size} unique creator tokens.`);

    console.log('👥 Fetching all buyers...');
    const { data: buyersData, error: bError } = await supabase.from('buys').select('buyer');

    if (bError) {
        console.error('❌ Supabase Buyers Error:', bError.message);
        return;
    }

    const uniqueBuyers = Array.from(new Set((buyersData || []).map(b => b.buyer.toLowerCase())));
    console.log(`👤 Found ${uniqueBuyers.length} buyers to sync.`);

    for (let i = 0; i < uniqueBuyers.length; i++) {
        const wallet = uniqueBuyers[i];
        if (i % 20 === 0) console.log(`⏳ Progress: ${i}/${uniqueBuyers.length} wallets...`);

        try {
            let pageToken = '';
            let allRawBalances = [];

            do {
                const url = `https://api.cdp.coinbase.com/platform/v2/data/evm/token-balances/base/${wallet}?pageSize=100${pageToken ? `&pageToken=${pageToken}` : ''}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });

                if (!res.ok) {
                    console.error(`❌ API Error for ${wallet}: ${res.status}`);
                    break;
                }

                const json = await res.json();
                allRawBalances.push(...(json.balances || []));
                pageToken = json.nextPageToken;
            } while (pageToken);

            const filteredHoldings = allRawBalances
                .filter(b => managedTokens.has(b.token.contractAddress.toLowerCase()))
                .map(b => ({
                    wallet: wallet,
                    post_token: b.token.contractAddress.toLowerCase(),
                    balance: b.amount.amount,
                    updated_at: new Date().toISOString()
                }));

            if (filteredHoldings.length > 0) {
                await supabase.from('holdings').upsert(filteredHoldings);
                console.log(`✅ Synced ${filteredHoldings.length} holdings for ${wallet}`);
            }

            await new Promise(r => setTimeout(r, 100)); // Rate limit safety
        } catch (e) {
            console.error(`💥 Failed to sync ${wallet}:`, e.message);
        }
    }

    console.log('🏁 Sync complete.');
}
main();
