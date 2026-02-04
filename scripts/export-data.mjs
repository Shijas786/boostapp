import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    console.log('📊 Exporting current leaderboard status...');

    const { data: leaders, error } = await supabase
        .rpc('get_leaderboard', { period_days: 1, limit_count: 500 });

    if (error) {
        console.error('Error fetching leaderboard:', error);
        return;
    }

    const output = {
        exported_at: new Date().toISOString(),
        total_unique_buyers: leaders.length,
        data: leaders
    };

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

    const filePath = path.join(dataDir, 'top-buyers.json');
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

    console.log(`✅ Successfully saved ${leaders.length} leaderboard entries to ${filePath}`);
}

main().catch(console.error);
