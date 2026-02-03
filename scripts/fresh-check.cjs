const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    // 1. Load Env
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 2. Set Cursor to 24 hours ago (Just to catch up ALL of today)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    console.log('Resetting cursor to:', yesterday);

    const { error } = await supabase.from('cursors').upsert({
        key: 'last_ingest_time',
        value: yesterday
    });

    if (error) console.error('Error resetting cursor:', error);
    else console.log('✅ Cursor reset successful.');
}

main();
