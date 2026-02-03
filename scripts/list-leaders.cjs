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

    const { data: leaders, error } = await supabase.rpc('get_leaderboard', { period_days: 30, limit_count: 20 });
    if (error) {
        console.error('❌ Leaderboard RPC Error:', error.message);
    } else {
        console.log('🏆 Top 20 Leaders (30d):');
        if (leaders.length > 0) console.log('DEBUG: Keys in first row:', Object.keys(leaders[0]));
        leaders.forEach((l, i) => {
            console.log(`${i + 1}. ${l.buyer_address} (${l.base_name || l.farcaster_username || 'No Name'})`);
            console.log(`   Unique Posts: ${l.unique_posts}, Total Buys: ${l.total_buys}`);
        });
    }
}
main();
