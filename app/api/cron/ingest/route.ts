import { NextResponse } from 'next/server';
import { ingestNewBuys } from '@/lib/ingest';

export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    // Auth check - allow in development or with valid secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // In production, require valid Bearer token (skip in local dev)
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        // Also allow Vercel cron calls
        const vercelCron = request.headers.get('x-vercel-cron');
        if (!vercelCron) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const result = await ingestNewBuys();
        return NextResponse.json({ ok: true, ...result, timestamp: new Date().toISOString() });
    } catch (e: any) {
        console.error('Ingest error:', e);
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
