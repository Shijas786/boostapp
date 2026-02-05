import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';

    try {
        const results = await db.getLeaderboard(100, period);

        return NextResponse.json({
            ok: true,
            data: results,
            version: 'v2-raw-24h',
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
