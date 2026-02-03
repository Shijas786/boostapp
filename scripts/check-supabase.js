
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Simple .env parser
function loadEnv() {
    const content = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const [key, ...rest] = line.split('=');
        if (key && rest.length > 0) {
            env[key.trim()] = rest.join('=').trim();
        }
    });
    return env;
}

async function main() {
    const env = loadEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    // Prefer Service Role, fallback to Anon (Anon might fail for writes/selects if RLS)
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        console.error('Missing URL or Key in .env.local');
        return;
    }

    console.log('Connecting to:', url);
    const supabase = createClient(url, key);

    // 1. Check Table Existence
    console.log('--- Checking "buys" table ---');
    const { count, error } = await supabase.from('buys').select('*', { count: 'exact', head: true });

    if (error) {
        console.error('❌ Error accessing "buys":', error.message);
        if (error.code === '42P01') {
            console.log('💡 HINT: Table "buys" does not exist. Run supabase/schema.sql!');
        }
    } else {
        console.log('✅ "buys" table exists. Row count:', count);
    }

    // 2. Check RPC
    console.log('--- Checking "get_leaderboard" RPC ---');
    const { data, error: rpcError } = await supabase.rpc('get_leaderboard', { period_days: 7, limit_count: 5 });

    if (rpcError) {
        console.error('❌ Error calling RPC:', rpcError.message);
    } else {
        console.log('✅ RPC works. Rows returned:', data?.length);
        if (data && data.length > 0) console.log('Sample:', data[0]);
    }
}

main();
