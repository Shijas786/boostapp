const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    let { count, error } = await supabase
        .from('tracked_tokens')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Supabase Error:', error);
        return;
    }

    console.log(`✅ Tracked tokens count: ${count}`);
}
main();
