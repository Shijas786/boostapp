import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

import { getEnv } from '../lib/env-loader.mjs';

async function main() {
    console.log('\n🚀 Refreshing Tracked Tokens from Zora (Top Volume)...\n');

    const env = getEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const zoraApiKey = env.NEXT_PUBLIC_ZORA_API_KEY;

    const headers = {
        'api-key': zoraApiKey,
        'Content-Type': 'application/json'
    };

    // Step 1: Get top 1000 coins by volume
    console.log('Step 1: Fetching top 1000 coins from Zora...');
    const coinsRes = await fetch('https://api-sdk.zora.engineering/coinsList?first=1000&sortBy=TOTAL_VOLUME_DESC', { headers });
    if (!coinsRes.ok) {
        console.error('❌ Zora API Error:', coinsRes.status, await coinsRes.text());
        return;
    }

    const data = await coinsRes.json();
    const tokens = (data.coinsBasicInfo?.edges || []).map(e => ({
        address: e.node.coinAddress.toLowerCase(),
        first_seen: new Date(e.node.createdTimestamp).toISOString(),
        last_synced_at: new Date().toISOString()
    }));

    if (tokens.length === 0) {
        console.error('❌ No tokens found in Zora response');
        return;
    }

    console.log(`   ✅ Found ${tokens.length} tokens. Syncing to DB...`);

    const { error } = await supabase.from('tracked_tokens').upsert(tokens);
    if (error) {
        console.error('   ❌ DB Error:', error.message);
    } else {
        console.log(`   ✅ Successfully tracked ${tokens.length} tokens\n`);
    }

    // Step 2: Trigger Sync for Last 24h
    console.log('Step 2: Starting 24h buy sync for these tokens using CDP...');

    // We'll use our existing ingest logic or a custom one
    // Let's just run fetch-1d-buys.mjs which we already updated or created
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
