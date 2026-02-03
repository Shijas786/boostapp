export async function queryCDP(sql: string) {
    const apiKey = process.env.CDP_API_KEY;

    if (!apiKey) {
        throw new Error('CDP_API_KEY is missing');
    }

    const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CDP API Error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result.data || result.result || [];
}
