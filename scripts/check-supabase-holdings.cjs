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

    const targetAddress = '0x0EEE4C7Dbe630dBDF475A57F0625Bf648b58A068'.toLowerCase();

    console.log(`🔎 Checking holdings in Supabase for ${targetAddress}...`);

    let { data: holdings, error } = await supabase
        .from('holdings')
        .select('*')
        .eq('wallet', targetAddress);

    if (error) {
        console.error('Supabase Error:', error);
        return;
    }

    console.log(`✅ Found ${holdings.length} holdings in Supabase.`);
    holdings.forEach(h => {
        console.log(`- Token: ${h.post_token}, Balance: ${h.balance}`);
    });

}
main();
