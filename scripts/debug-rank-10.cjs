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

    const target = '0x2211d1d0020daea8039e46cf1367962070d77da9'.toLowerCase();

    console.log(`🔎 Checking rows for ${target}...`);

    const { data: buys } = await supabase.from('buys').select('*').eq('buyer', target);
    console.log(`Total rows: ${buys?.length}`);
    if (buys?.length > 0) {
        const posts = new Set(buys.map(b => b.post_token));
        console.log(`Unique Posts (coins): ${posts.size}`);
        console.log('Sample buys:', buys.slice(0, 3));
    }
}
main();
