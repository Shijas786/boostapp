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

    console.log(`🚀 Manually triggering ingestion: ${url}`);

    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log('--- INGESTION RESULT ---');
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error triggering ingest:', e.message);
    }
}
main();
