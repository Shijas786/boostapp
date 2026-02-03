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

    // Reset cursor to Feb 3rd 00:00:00
    const newCursor = '2026-02-03T00:00:00.000Z';
    const { error } = await supabase.from('cursors').upsert({ key: 'last_ingest_time', value: newCursor });

    if (error) {
        console.error('Error resetting cursor:', error.message);
    } else {
        console.log(`✅ Cursor reset to: ${newCursor}`);
    }
}
main();
