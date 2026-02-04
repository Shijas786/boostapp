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

    console.log('\n🔍 Re-resolving all identities with missing names...\n');

    // Get all identities that are "anon" (no name)
    const { data: anons, error } = await supabase
        .from('identities')
        .select('*')
        .is('farcaster_username', null)
        .is('base_name', null);

    if (error) {
        console.error('Error fetching anons:', error);
        return;
    }

    console.log(`Found ${anons.length} addresses without names\n`);

    const batchSize = 100;
    let resolved = 0;

    for (let i = 0; i < anons.length; i += batchSize) {
        const batch = anons.slice(i, i + batchSize);
        const addresses = batch.map(a => a.address);

        // Resolve Farcaster via Neynar
        try {
            const neynarKey = env.NEYNAR_API_KEY;
            if (neynarKey) {
                const url = `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${addresses.join(',')}`;
                const res = await fetch(url, { headers: { 'x-api-key': neynarKey } });

                if (res.ok) {
                    const data = await res.json();

                    for (const addr of addresses) {
                        const users = data[addr] || [];
                        const user = users[0];

                        if (user) {
                            await supabase
                                .from('identities')
                                .update({
                                    farcaster_username: user.username,
                                    farcaster_fid: user.fid,
                                    avatar_url: user.pfp_url,
                                    updated_at: new Date().toISOString()
                                })
                                .eq('address', addr);

                            resolved++;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Neynar error:', e.message);
        }

        console.log(`   Processed ${Math.min(i + batchSize, anons.length)}/${anons.length}... (${resolved} resolved)`);

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`\n✅ Resolved ${resolved} Farcaster identities\n`);

    // Now show updated leaderboard
    console.log('Updated Leaderboard (Top 20):\n');

    const { data: leaders } = await supabase
        .rpc('get_leaderboard', { period_days: 7, limit_count: 20 });

    if (leaders) {
        console.log('Rank | Address | Posts | Buys | Name\n' + '─'.repeat(70));
        leaders.forEach((leader, i) => {
            const name = leader.farcaster_username || leader.base_name || 'anon';
            const addr = `${leader.buyer_address.substring(0, 6)}...${leader.buyer_address.substring(38)}`;
            console.log(`${String(i + 1).padEnd(4)} | ${addr} | ${String(leader.unique_posts).padEnd(5)} | ${String(leader.total_buys).padEnd(4)} | ${name}`);
        });
    }

    console.log('\n✨ Done!\n');
}

main().catch(console.error);
