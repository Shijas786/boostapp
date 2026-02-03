
import fetch from 'node-fetch';

const ADDRESS = '0x0EEE4C7Dbe630dBDF475A57F0625Bf648b58A068'.toLowerCase();
const LOCAL_API_URL = 'http://localhost:3000/api/query';

async function main() {
    // Calculate timestamp for 30 mins ago
    const timeAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

    console.log(`Checking activity for ${ADDRESS} since ${timeAgo}...`);

    const sql = `
        SELECT 
            block_timestamp, 
            transaction_hash, 
            address as token_address, 
            parameters['value'] as value
        FROM base.events
        WHERE event_name = 'Transfer'
        AND parameters['to'] = '${ADDRESS}'
        AND block_timestamp > '${timeAgo}'
        ORDER BY block_timestamp DESC
        LIMIT 20
    `;

    try {
        const res = await fetch(LOCAL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
        });

        if (!res.ok) {
            throw new Error(await res.text());
        }

        const data = await res.json();
        const events = data.data || data.result || [];

        if (events.length === 0) {
            console.log("No buy/transfer activity found in the last 30 minutes.");
        } else {
            console.log(`Found ${events.length} transactions:`);
            console.table(events);
        }
    } catch (error) {
        console.error("Error querying data:", error.message);
    }
}

main();
