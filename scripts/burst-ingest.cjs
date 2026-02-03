const fs = require('fs');

async function main() {
    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const secret = env.CRON_SECRET;
    const url = `http://localhost:3001/api/ingest?secret=${secret}`;

    console.log(`🔥 Starting burst ingestion to catch up to real-time...`);

    let totalIngested = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            const start = Date.now();
            const res = await fetch(url);
            const data = await res.json();
            const duration = (Date.now() - start) / 1000;

            if (data.ok) {
                console.log(`✅ Batch: ${data.count} items | New Cursor: ${data.new_cursor} | Time: ${duration}s`);
                totalIngested += data.count;

                // If count < 1000 (our limit), we've likely caught up or there's a gap
                if (data.count < 1000) {
                    console.log('🏁 Caught up to the current CDP index.');
                    hasMore = false;
                }
            } else {
                console.error('❌ Error during batch:', data.error);
                hasMore = false;
            }
        } catch (e) {
            console.error('💥 Request failed:', e.message);
            hasMore = false;
        }
    }

    console.log(`🚀 Done! Total ingested in this burst: ${totalIngested}`);
}
main();
