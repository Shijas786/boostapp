
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
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('--- FID Check ---');
    const { data, error } = await supabase.from('names').select('address, name, fid, is_contract, source').not('fid', 'is', null).limit(10);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${data?.length || 0} users with FIDs:`);
    data?.forEach(r => {
        console.log(`  ${r.name || r.address.slice(0, 10)} -> FID: ${r.fid} (${r.source})`);
    });

    // Also check contracts
    const { data: contracts } = await supabase.from('names').select('address').eq('is_contract', true).limit(5);
    console.log(`\nContracts detected: ${contracts?.length || 0}`);
}

main();
