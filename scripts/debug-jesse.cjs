const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Resolve jesse.base.eth address if needed (it's 0x6cfeb3c22b1fbe33d51fe7d0d28de303bb5be48d)
    const jesse = '0x6cfeb3c22b1fbe33d51fe7d0d28de303bb5be48d'.toLowerCase();

    console.log(`🔎 Checking stats for Jesse (${jesse})...`);

    // 1. Total rows in DB for Jesse
    const { count } = await supabase.from('buys').select('*', { count: 'exact', head: true }).eq('buyer', jesse);
    console.log(`Stats in Local DB: ${count} total buy events`);

    // 2. Unique tokens for Jesse
    const { data: uniqueTokens } = await supabase.from('buys').select('post_token').eq('buyer', jesse);
    const distinctTokens = new Set(uniqueTokens.map(t => t.post_token));
    console.log(`Unique tokens bought: ${distinctTokens.size}`);

    // 3. Last buy
    const { data: lastBuy } = await supabase.from('buys').select('block_time').eq('buyer', jesse).order('block_time', { ascending: false }).limit(1);
    console.log(`Last buy time in DB: ${lastBuy?.[0]?.block_time}`);
}
main();
