import { resolveIdentity } from '@/lib/names';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
        return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    try {
        const identity = await resolveIdentity(address);
        return NextResponse.json(identity);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
