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

    console.log('--- Final Verification ---');

    // 1. Check Buys
    const { count: buys } = await supabase.from('buys').select('*', { count: 'exact', head: true });
    console.log(`📊 Buys in DB: ${buys}`);

    // 2. Check Leaders
    const { data: leaders, error } = await supabase.rpc('get_leaderboard', { period_days: 7, limit_count: 5 });
    if (error) {
        console.error('❌ Leaderboard RPC Error:', error.message);
    } else {
        console.log('🏆 Top 5 Leaders:');
        leaders.forEach((l, i) => {
            console.log(`${i + 1}. ${l.buyer_address} - ${l.buys_count} buys`);
        });
    }

    // 3. Check identities
    const { count: ids } = await supabase.from('identities').select('*', { count: 'exact', head: true });
    console.log(`👤 Resolved Identities: ${ids}`);
}
main();
