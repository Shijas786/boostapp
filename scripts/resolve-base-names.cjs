const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function main() {
    // Load environment variables
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    console.log('\n🔍 Resolving Base names for top buyers...\n');

    // Get top 50 buyers without names from buys table
    const { data: topBuyers } = await supabase
        .from('buys')
        .select('buyer')
        .gte('block_time', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // Count by buyer
    const buyerCounts = {};
    (topBuyers || []).forEach(b => {
        buyerCounts[b.buyer] = (buyerCounts[b.buyer] || 0) + 1;
    });

    // Sort by count and take top 50
    const topAddresses = Object.entries(buyerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([addr]) => addr);

    console.log(`Resolving Base/ENS names for top ${topAddresses.length} buyers...\n`);

    let resolved = 0;
    for (const address of topAddresses) {
        try {
            // Call the local API
            const res = await fetch(`http://localhost:3000/api/resolve-name?address=${address}`);
            if (res.ok) {
                const data = await res.json();

                if (data.name) {
                    // Update the identity in database
                    await supabase
                        .from('identities')
                        .upsert({
                            address: address.toLowerCase(),
                            base_name: data.name,
                            avatar_url: data.avatar || null,
                            updated_at: new Date().toISOString()
                        });

                    console.log(`   ✅ ${address.slice(0, 10)}... -> ${data.name}`);
                    resolved++;
                }
            }
        } catch (e) {
            console.error(`   ❌ Error resolving ${address.slice(0, 10)}...`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\n✅ Resolved ${resolved} Base/ENS names\n`);

    // Show updated leaderboard
    console.log('Updated Leaderboard (Top 20):\n');
    console.log('─'.repeat(80));

    const { data: leaders } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 20 });

    if (leaders) {
        leaders.forEach((l, i) => {
            const name = l.farcaster_username || l.base_name || 'anon';
            const addr = `${l.buyer_address.slice(0, 10)}...`;
            console.log(`${String(i + 1).padStart(2)}. ${addr} | Posts: ${String(l.unique_posts).padStart(5)} | Buys: ${String(l.total_buys).padStart(5)} | ${name}`);
        });
    }

    console.log('\n✨ Done!\n');
}

main().catch(console.error);
