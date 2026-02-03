import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { query } = body;
        const apiKey = process.env.CDP_API_KEY;

        if (!apiKey) {
            console.error('CDP_API_KEY is missing in environment variables');
            return NextResponse.json({ error: 'Config Error: CDP_API_KEY is missing. Please add it to your .env.local file.' }, { status: 500 });
        }

        if (!query) {
            return NextResponse.json({ error: 'Missing SQL query in request body' }, { status: 400 });
        }

        // CDP SQL API Endpoint
        const url = 'https://api.cdp.coinbase.com/platform/v2/data/query/run';

        console.log('Executing SQL Query on CDP:', query);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ sql: query }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('CDP API Error:', response.status, errorText);
            return NextResponse.json({
                error: 'CDP API Request Failed',
                details: errorText,
                status: response.status
            }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Internal Server Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
