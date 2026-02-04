const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('\n🔍 Resolving Base Names for last 24h buyers...\n');

    // Get buyers from last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBuys } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', oneDayAgo);

    if (!recentBuys || recentBuys.length === 0) {
        console.log('No recent buyers found.');
        return;
    }

    const uniqueBuyers = Array.from(new Set(recentBuys.map(b => b.buyer)));
    console.log(`Found ${uniqueBuyers.length} unique buyers.`);

    let resolved = 0;
    for (const address of uniqueBuyers) {
        // Check if we already have a basename
        const { data: existing } = await supabase
            .from('identities')
            .select('base_name')
            .eq('address', address)
            .single();

        if (existing && existing.base_name) {
            continue; // Already has name
        }

        try {
            const res = await fetch(`http://localhost:3000/api/resolve-name?address=${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data.name) {
                    await supabase
                        .from('identities')
                        .upsert({
                            address: address.toLowerCase(),
                            base_name: data.name,
                            avatar_url: data.avatar || undefined,
                            updated_at: new Date().toISOString()
                        });
                    console.log(`   ✅ ${address} -> ${data.name}`);
                    resolved++;
                }
            }
        } catch (e) {
            console.error(`   ❌ Failed to resolve ${address}`);
        }

        await new Promise(r => setTimeout(r, 100)); // Rate limit
    }

    console.log(`\n✨ Done! Resolved ${resolved} new Base names.\n`);
}

main().catch(console.error);
