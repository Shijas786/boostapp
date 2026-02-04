import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function main() {
    console.log('\n🚀 Starting Ultra-Fast Zora Identity Resolution...\n');

    // Load env
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const zoraApiKey = env.NEXT_PUBLIC_ZORA_API_KEY;

    // Get all unique buyers from the last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBuys } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', oneWeekAgo);

    const uniqueBuyers = Array.from(new Set(recentBuys.map(b => b.buyer.toLowerCase())));
    console.log(`👤 Found ${uniqueBuyers.length} unique buyers.\n`);

    const headers = { 'api-key': zoraApiKey, 'Content-Type': 'application/json' };

    for (let i = 0; i < uniqueBuyers.length; i++) {
        const address = uniqueBuyers[i];
        process.stdout.write(`[${i + 1}/${uniqueBuyers.length}] ${address.slice(0, 10)}... `);

        try {
            const zoraRes = await fetch(`https://api-sdk.zora.engineering/profile?identifier=${address}`, { headers });
            if (zoraRes.ok) {
                const zoraData = await zoraRes.json();
                const profile = zoraData.profile;
                if (profile) {
                    const handle = profile.handle || profile.username || profile.displayName;
                    if (handle) {
                        if (!handle.startsWith('0x')) {
                            await supabase.from('identities').upsert({
                                address,
                                farcaster_username: handle,
                                avatar_url: profile.avatar?.small || profile.avatar?.medium || null,
                                updated_at: new Date().toISOString()
                            });
                            process.stdout.write(`✅ @${handle}`);
                        } else {
                            process.stdout.write(`Hex Handle: ${handle.slice(0, 8)}... `);
                        }
                    } else {
                        process.stdout.write('Literal No Handle ❌');
                    }
                } else {
                    process.stdout.write('No Profile returned ❌');
                }
            } else {
                process.stdout.write(`API Error ${zoraRes.status} ❌`);
            }
        } catch (e) {
            process.stdout.write(`Error ❌ (${e.message})`);
        }
        process.stdout.write('\n');
        await new Promise(r => setTimeout(r, 20));
    }

    console.log('\n✨ Ultra-Fast resolution complete!');
}

main().catch(console.error);
