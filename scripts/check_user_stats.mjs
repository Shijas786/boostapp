
import fetch from 'node-fetch';

const ADDRESS = '0x0EEE4C7Dbe630dBDF475A57F0625Bf648b58A068'.toLowerCase();
const LOCAL_API_URL = 'http://localhost:3000/api/query';

async function main() {
    const timeAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');

    console.log(`Checking 7-day activity for ${ADDRESS}...`);

    const sql = `
        WITH content_coins AS (
            SELECT DISTINCT CAST(parameters['coin'] AS VARCHAR) AS token_address
            FROM base.events
            WHERE address = '0x777777751622c0d3258f214f9df38e35bf45baf3'
            AND event_name IN ('CoinCreated', 'CoinCreatedV4', 'CreatorCoinCreated')
            AND block_timestamp > '${timeAgo}'
        ),
        user_buys AS (
            SELECT
                t.address as post_token
            FROM base.events t
            JOIN content_coins cc ON t.address = cc.token_address
            WHERE t.event_name = 'Transfer'
            AND t.parameters['to'] = '${ADDRESS}'
            AND t.block_timestamp > '${timeAgo}'
        )
        SELECT COUNT(DISTINCT post_token) as distinct_posts_bought FROM user_buys
    `;

    try {
        const res = await fetch(LOCAL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: sql })
        });
        const data = await res.json();
        console.table(data.data || data.result);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

main();
