const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

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
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(url, key);

    const tables = ['buys', 'identities', 'tracked_tokens', 'cursors', 'holdings'];
    for (const table of tables) {
        const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
        if (error) {
            console.log(`❌ ${table}: ${error.message}`);
        } else {
            console.log(`✅ ${table}: ${count} rows`);
        }
    }
}
main();
