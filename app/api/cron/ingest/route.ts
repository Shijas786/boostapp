import { NextResponse } from 'next/server';
import { ingestNewBuys } from '@/lib/ingest';

export const maxDuration = 300; // 5 minutes max
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await ingestNewBuys();
        return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
    }
}
