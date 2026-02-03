'use client';

import { useRouter } from 'next/navigation';
import { IdentityCell } from './IdentityCell';

interface PlayerRowProps {
    row: any;
    rank: number;
}

export function PlayerRow({ row, rank }: PlayerRowProps) {
    const router = useRouter();

    const handleClick = () => {
        router.push(`/profile/${row.buyer_address}`);
    };

    return (
        <div
            onClick={handleClick}
            className="grid grid-cols-12 p-4 items-center hover:bg-yellow-50 cursor-pointer transition-colors group"
        >
            <div className="col-span-2 md:col-span-1 font-black text-xl text-gray-300 group-hover:text-black transition-colors">
                #{rank}
            </div>
            <div className="col-span-7 md:col-span-5 overflow-hidden">
                <IdentityCell
                    address={row.buyer_address}
                    initialName={row.buyer_basename}
                    initialAvatar={row.buyer_avatar}
                    isContract={row.buyer_is_contract}
                />
            </div>
            <div className="col-span-3 md:col-span-2 text-right font-mono font-bold text-lg hidden md:block">
                {row.total_buy_events}
            </div>
            <div className="col-span-3 md:col-span-2 text-right font-mono font-bold text-lg text-blue-600 hidden md:block">
                {row.posts_bought}
            </div>
            <div className="col-span-3 md:col-span-2 text-right px-4 font-mono text-sm text-gray-500 hidden md:block">
                <TimeAgo date={row.last_active} />
            </div>
        </div>
    );
}

function TimeAgo({ date }: { date: string }) {
    if (!date) return <span>Recent</span>;
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);

    let text = '';
    if (diff < 60) text = `${diff}s ago`;
    else if (diff < 3600) text = `${Math.floor(diff / 60)}m ago`;
    else if (diff < 86400) text = `${Math.floor(diff / 3600)}h ago`;
    else text = `${Math.floor(diff / 86400)}d ago`;

    return <span>{text}</span>;
}
