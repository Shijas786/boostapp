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

    const { data: recentBuys, error } = await supabase.from('buys').select('*').order('block_time', { ascending: false }).limit(5);

    if (error) {
        console.error('Error fetching recent buys:', error.message);
    } else {
        console.log('Last 5 buys in DB:');
        recentBuys.forEach(b => console.log(`- ${b.block_time}: ${b.buyer} bought ${b.post_token}`));
    }
}
main();
