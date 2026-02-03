import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Get the 50 most recent buys with names
        const supabase = (await import('@/lib/db-supabase')).supabase;

        if (!supabase) {
            return NextResponse.json({ error: 'DB not available' }, { status: 500 });
        }

        const { data, error } = await supabase
            .from('buys')
            .select(`
                buyer,
                post_token,
                block_time,
                tx_hash
            `)
            .order('block_time', { ascending: false })
            .limit(50);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Enrich with names
        const buyersSet = new Set(data?.map(b => b.buyer) || []);
        const buyerAddresses = Array.from(buyersSet);

        const { data: names } = await supabase
            .from('names')
            .select('address, name, fid, is_contract')
            .in('address', buyerAddresses);

        const nameMap = new Map(names?.map(n => [n.address, n]) || []);

        // Filter out contracts and users without names - show only verified users
        const enrichedBuys = data
            ?.map(buy => {
                const nameInfo = nameMap.get(buy.buyer);
                return {
                    ...buy,
                    buyer_name: nameInfo?.name,
                    buyer_fid: nameInfo?.fid,
                    is_contract: nameInfo?.is_contract
                };
            })
            .filter(buy => !buy.is_contract && buy.buyer_name) // Only verified users with names
            || [];

        return NextResponse.json({
            data: enrichedBuys,
            count: enrichedBuys.length,
            timestamp: new Date().toISOString()
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
