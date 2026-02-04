import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
    console.log('\n🚀 Mass Resolving Identities via Zora API (Last 24h Buyers)...\n');

    // Load env
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const zoraApiKey = env.NEXT_PUBLIC_ZORA_API_KEY;

    if (!zoraApiKey) {
        console.error('❌ Missing Zora API Key');
        return;
    }

    const headers = { 'api-key': zoraApiKey, 'Content-Type': 'application/json' };

    // Get buyers from last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBuys } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', oneDayAgo);

    if (!recentBuys || recentBuys.length === 0) {
        console.log('No recent buyers to resolve.');
        return;
    }

    const uniqueBuyers = Array.from(new Set(recentBuys.map(b => b.buyer.toLowerCase())));
    console.log(`👤 Found ${uniqueBuyers.length} unique buyers. Starting mass resolution...`);

    let resolved = 0;
    const CHUNK_SIZE = 10; // Resolve in small waves
    const chunks = Array.from({ length: Math.ceil(uniqueBuyers.length / CHUNK_SIZE) }, (v, i) =>
        uniqueBuyers.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE)
    );

    for (const chunk of chunks) {
        const promises = chunk.map(async (address) => {
            try {
                const res = await fetch(`https://api-sdk.zora.engineering/profile?identifier=${address}`, { headers });
                if (!res.ok) return null;
                const data = await res.json();
                const profile = data.profile;
                if (!profile) return null;

                const hasSocials = profile.handle || profile.displayName || profile.username;
                const isHuman = !!(hasSocials || profile.linkedWallets?.edges?.some(e => ['PRIVY', 'EXTERNAL'].includes(e.node.walletType)));

                return {
                    address: address,
                    base_name: null,
                    farcaster_username: profile.handle || profile.username || null,
                    farcaster_fid: null,
                    avatar_url: profile.avatar?.small || profile.avatar?.medium || null,
                    updated_at: new Date().toISOString()
                };
            } catch (e) {
                return null;
            }
        });

        const results = (await Promise.all(promises)).filter(r => r !== null);

        if (results.length > 0) {
            const { error } = await supabase.from('identities').upsert(results);
            if (error) console.error('   ❌ DB Error:', error.message);
            else resolved += results.length;
        }
        process.stdout.write('.');
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n\n✨ Done! Mass resolution complete. Resolved ${resolved} identities.`);
}

main().catch(console.error);
