'use client';

import { useState, useEffect } from 'react';
import { IdentityCell } from './IdentityCell';

interface LiveBuy {
    buyer: string;
    buyer_name?: string;
    avatar_url?: string;
    post_token: string;
    block_time: string;
    tx_hash: string;
}

export function LiveFeed() {
    const [buys, setBuys] = useState<LiveBuy[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    const fetchLive = async () => {
        try {
            const res = await fetch(`/api/live-buys?_t=${Date.now()}`);
            const data = await res.json();
            setBuys(data.data || []);
            setLastUpdate(new Date());
        } catch (e) {
            console.error('Failed to fetch live data:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLive();
        // Poll every 10 seconds
        const interval = setInterval(fetchLive, 10000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex justify-between items-center border-b-2 border-black bg-green-100 p-4">
                <div className="font-black uppercase tracking-widest text-sm">🔴 Live Activity</div>
                {lastUpdate && (
                    <div className="text-xs text-gray-500 font-mono">
                        Updated: {lastUpdate.toLocaleTimeString()}
                    </div>
                )}
            </div>

            <div className="divide-y divide-gray-200 max-h-[500px] overflow-y-auto">
                {loading ? (
                    <div className="p-8 text-center animate-pulse">Loading live data...</div>
                ) : buys.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No recent activity</div>
                ) : (
                    buys.map((buy, i) => (
                        <div key={`${buy.tx_hash}-${i}`} className="p-4 hover:bg-green-50 transition-colors flex items-center gap-4">
                            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-xs">
                                💰
                            </div>
                            <div className="flex-1 min-w-0">
                                <IdentityCell
                                    address={buy.buyer}
                                    initialBaseName={buy.buyer_name}
                                    initialAvatar={buy.avatar_url}
                                />
                            </div>
                            <div className="text-right text-sm">
                                <div className="font-mono text-gray-500">
                                    {formatTimeAgo(buy.block_time)}
                                </div>
                                <a
                                    href={`https://basescan.org/tx/${buy.tx_hash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline text-xs"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    View TX →
                                </a>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function formatTimeAgo(dateString: string) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
