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

    const { count, error } = await supabase.from('buys').select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Error checking buys:', error.message);
    } else {
        console.log(`📊 Current buys count in Supabase: ${count}`);

        // Also check if identities are being filled
        const { count: idCount } = await supabase.from('identities').select('*', { count: 'exact', head: true });
        console.log(`👤 Current identities count in Supabase: ${idCount}`);
    }
}
main();
