import { ingestNewBuys } from '@/lib/ingest';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        // Authenticate via Bearer token (Step 3: Authenticate via secret)
        const { searchParams } = new URL(request.url);
        const authHeader = request.headers.get('authorization');
        const secret = process.env.CRON_SECRET;

        // Allow matching via secret query param OR Auth header
        const providedSecret = searchParams.get('secret') || authHeader?.replace('Bearer ', '');

        if (secret && providedSecret !== secret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const result = await ingestNewBuys();
        return NextResponse.json({
            ok: true,
            ...result,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({
            ok: false,
            error: e.message,
            timestamp: new Date().toISOString()
        }, { status: 500 });
    }
}
