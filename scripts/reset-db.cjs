
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
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        console.error('Missing URL or Key');
        return;
    }

    const supabase = createClient(url, key);

    console.log('🧹 Clearing DB...');

    // Delete Buys
    const { error: err1 } = await supabase.from('buys').delete().neq('id', 0); // "Delete all" requires a filter usually
    if (err1) console.error('Error clearing buys:', err1);
    else console.log('✅ Cleared buys');

    // Delete Names
    const { error: err2 } = await supabase.from('names').delete().neq('address', 'dummy');
    if (err2) console.error('Error clearing names:', err2);
    else console.log('✅ Cleared names');

    // Delete Cursors
    const { error: err3 } = await supabase.from('cursors').delete().neq('key', 'dummy');
    if (err3) console.error('Error clearing cursors:', err3);
    else console.log('✅ Cleared cursors');
}

main();
