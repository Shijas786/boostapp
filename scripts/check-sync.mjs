import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
    console.log('\n📊 HubNation Sync Status Report\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check Buys
    const { count: buysCount } = await supabase.from('buys').select('*', { count: 'exact', head: true });
    const { data: latestBuy } = await supabase.from('buys').select('block_time').order('block_time', { ascending: false }).limit(1);

    // 2. Check Identities
    const { count: idCount } = await supabase.from('identities').select('*', { count: 'exact', head: true });
    const { count: namedCount } = await supabase.from('identities')
        .select('*', { count: 'exact', head: true })
        .or('base_name.not.is.null,farcaster_username.not.is.null,ens.not.is.null');

    // 3. Check Bots
    const { count: botCount } = await supabase.from('identities')
        .select('*', { count: 'exact', head: true })
        .ilike('ens', '%Bot%');

    console.log(`📈 Transactions: ${buysCount} total`);
    console.log(`🕒 Latest Buy: ${latestBuy?.[0]?.block_time || 'None'}`);
    console.log(`👤 Identities cached: ${idCount}`);
    console.log(`✅ Verified Humans: ${namedCount - botCount}`);
    console.log(`🤖 Flagged Bots: ${botCount}`);

    const now = new Date();
    const latestDate = new Date(latestBuy?.[0]?.block_time || 0);
    const diffMins = Math.floor((now - latestDate) / (1000 * 60));

    if (diffMins < 15) {
        console.log(`\n🟢 Status: Healthy (Syncing data from ${diffMins} mins ago)`);
    } else {
        console.log(`\n🟡 Status: Delayed (Last sync ${diffMins} mins ago)`);
    }
}

main().catch(console.error);
