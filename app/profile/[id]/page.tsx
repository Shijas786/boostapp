
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { IdentityCell } from '@/app/components/IdentityCell';

export const revalidate = 60; // Cache for 1 minute

export default async function ProfilePage({ params }: { params: { id: string } }) {
    const id = decodeURIComponent(params.id).toLowerCase();

    let address = id.startsWith('0x') ? id : null;
    let name: string | null = null;

    // Resolve Name if ID is not an address
    if (!address) {
        address = await db.getAddressByName(id);
        if (!address) {
            return notFound();
        }
    }

    // Fetch Identity & Stats
    const identityWrapper = await db.getName(address);
    name = identityWrapper?.name || null;

    const stats = await db.getProfileStats(address) as any;
    const activity = await db.getActivityFeed(address, 50) as any[];

    return (
        <main className="min-h-screen bg-white text-black p-4 md:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header Card */}
                <div className="bg-white border-2 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-sm flex flex-col md:flex-row items-center gap-6">
                    <div className="shrink-0">
                        {/* Large Avatar */}
                        <div className="w-24 h-24 rounded-full border-2 border-black overflow-hidden bg-gray-100 flex items-center justify-center text-4xl font-bold">
                            {/* Reusing IdentityCell for consistent visual or just using fallback logic if no avatar url in DB (currently DB doesn't store avatar URL, just name/source) */}
                            {/* Ideally we update DB to store avatar url, but for now IdentityCell handles extraction from name */}
                            <IdentityCell address={address} initialName={name || undefined} />
                            {/* Wait, IdentityCell renders a small row. We want a big avatar here. 
                               For MVP, let's just use IdentityCell but maybe we need a dedicated component later.
                               Actually, IdentityCell renders name too. 
                               Let's just use a clean layout manually here.
                            */}
                        </div>
                    </div>

                    <div className="flex-1 text-center md:text-left">
                        <h1 className="text-4xl font-black mb-2 tracking-tight">
                            {name || 'Unknown User'}
                        </h1>
                        <div className="font-mono text-gray-500 bg-gray-100 inline-block px-2 py-1 rounded border border-gray-300 text-sm">
                            {address}
                        </div>
                        <div className="mt-4 flex gap-4 justify-center md:justify-start">
                            <a href={`https://basescan.org/address/${address}`} target="_blank" className="text-blue-600 hover:underline font-bold text-sm border-b-2 border-transparent hover:border-blue-600">
                                View on Basescan ↗
                            </a>
                            <a href={`https://zora.co/${address}`} target="_blank" className="text-green-600 hover:underline font-bold text-sm border-b-2 border-transparent hover:border-green-600">
                                View on Zora ↗
                            </a>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <StatCard label="Total Buys" value={stats?.total_buys || 0} color="bg-blue-100" />
                    <StatCard label="Unique Creators" value={stats?.unique_creators || 0} color="bg-pink-100" />
                    <StatCard label="Last Active" value={formatTimeAgo(stats?.last_buy_time)} color="bg-yellow-100" />
                </div>

                {/* Activity Feed */}
                <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-6">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <span>📜</span> Activity Feed
                    </h2>

                    {activity.length === 0 ? (
                        <div className="text-gray-500 italic text-center py-8">No recent activity detected.</div>
                    ) : (
                        <div className="space-y-4">
                            {activity.map((item, i) => (
                                <div key={i} className="flex items-center justify-between p-4 border border-black hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-green-100 border border-black flex items-center justify-center font-bold text-green-700">I</div>
                                        <div>
                                            <div className="font-bold">Bought a Signal</div>
                                            <div className="text-xs font-mono text-gray-500">{item.tx_hash?.slice(0, 8)}...</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold">{new Date(item.block_time).toLocaleDateString()}</div>
                                        <div className="text-xs text-gray-500">{new Date(item.block_time).toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </main>
    );
}

function StatCard({ label, value, color }: { label: string, value: string | number, color: string }) {
    return (
        <div className={`border-2 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${color} flex flex-col items-center justify-center h-32 transform hover:-translate-y-1 transition-transform`}>
            <div className="text-4xl font-black">{value}</div>
            <div className="text-sm font-bold uppercase tracking-wider mt-1 opacity-70">{label}</div>
        </div>
    );
}

function formatTimeAgo(dateString: string) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
