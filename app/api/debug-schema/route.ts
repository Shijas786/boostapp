import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const apiKey = process.env.CDP_API_KEY;
        const sql = `SELECT * FROM base.events LIMIT 1`;

        const response = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ sql }),
        });

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
