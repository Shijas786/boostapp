import { resolveIdentities } from '@/lib/names';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { addresses } = await request.json();

        if (!addresses || !Array.isArray(addresses)) {
            return NextResponse.json({ error: 'Addresses array required' }, { status: 400 });
        }

        // Use the newly optimized bulk resolver
        const identities = await resolveIdentities(addresses);

        return NextResponse.json({
            ok: true,
            identities
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
