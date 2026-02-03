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

    const target = '0x2211d1d0020daea8039e46cf1367962070d77da9'.toLowerCase();
    const { data } = await supabase.from('identities').select('*').eq('address', target).single();
    console.log('Identity for 0x2211...:', data);

    const jesseReal = '0x6cfeb3c22b1fbe33d51fe7d0d28de303bb5be48d'.toLowerCase();
    const { data: data2 } = await supabase.from('identities').select('*').eq('address', jesseReal).single();
    console.log('Identity for 0x6cfe...:', data2);
}
main();
