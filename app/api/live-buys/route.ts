import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const buys = await db.getActivityFeed('', 50); // Empty address gets everyone

        // Fetch identities for these buyers
        const buyerAddresses = Array.from(new Set(buys.map((b: any) => b.buyer.toLowerCase()))) as string[];
        const identities = await db.getIdentities(buyerAddresses);
        const identityMap = new Map(identities.map((id: any) => [id.address.toLowerCase(), id]));

        const enrichedBuys = buys.map((buy: any) => {
            const id: any = identityMap.get(buy.buyer.toLowerCase());
            return {
                ...buy,
                buyer_name: id?.base_name || id?.farcaster_username,
                avatar_url: id?.avatar_url,
                farcaster_fid: id?.farcaster_fid
            };
        });

        return NextResponse.json({
            data: enrichedBuys,
            count: enrichedBuys.length,
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
