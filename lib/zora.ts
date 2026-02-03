// Zora API helper for fetching coin activity
const ZORA_API_URL = 'https://api.zora.co/graphql';

export async function queryZoraSwaps(limit = 100): Promise<any[]> {
    const apiKey = process.env.NEXT_PUBLIC_ZORA_API_KEY;
    if (!apiKey) {
        console.warn('⚠️ No Zora API key found');
        return [];
    }

    const query = `
        query GetRecentSwaps($limit: Int!) {
            coinActivities(
                first: $limit,
                orderBy: TIMESTAMP_DESC,
                filter: { type: BUY }
            ) {
                nodes {
                    id
                    type
                    timestamp
                    txHash
                    account {
                        address
                        profile {
                            username
                            displayName
                        }
                    }
                    coin {
                        address
                        name
                        creator {
                            address
                            profile {
                                username
                            }
                        }
                    }
                    amountIn
                    amountOut
                }
            }
        }
    `;

    try {
        const res = await fetch(ZORA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                query,
                variables: { limit }
            })
        });

        if (!res.ok) {
            console.error('Zora API error:', res.status);
            return [];
        }

        const data = await res.json();

        if (data.errors) {
            console.error('Zora GraphQL errors:', data.errors);
            return [];
        }

        const activities = data.data?.coinActivities?.nodes || [];

        // Transform to our format
        return activities.map((a: any) => ({
            buyer: a.account?.address,
            post_token: a.coin?.address,
            block_time: a.timestamp,
            tx_hash: a.txHash,
            // Bonus: Zora provides profile data directly
            buyer_name: a.account?.profile?.username,
            source: 'zora_api'
        }));

    } catch (e) {
        console.error('Zora query failed:', e);
        return [];
    }
}
