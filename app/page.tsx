'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PlayerRow } from '@/app/components/PlayerRow';
import { LiveFeed } from '@/app/components/LiveFeed';


export default function Home() {
  const router = useRouter();
  const [period, setPeriod] = useState('1d');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchLeaderboard = async (p: string) => {
    console.log(`[Leaderboard] Fetch started for period: ${p}`);
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?period=${p}&_t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();
      const leaderboard = data.data || [];
      console.log(`[Leaderboard] Received ${leaderboard.length} rows`);
      setResults(leaderboard);
      setLoading(false); // Show results immediately

      // Batch resolve missing identities in background
      const missingAddresses = leaderboard
        .filter((r: any) => r.buyer_address && !r.base_name && !r.farcaster_username && !r.ens_name)
        .map((r: any) => r.buyer_address);

      if (missingAddresses.length > 0) {
        console.log(`[Leaderboard] Resolving ${missingAddresses.length} missing identities in background...`);
        try {
          const idRes = await fetch('/api/identities/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addresses: missingAddresses })
          });
          const idData = await idRes.json();

          if (idData.ok && Array.isArray(idData.identities)) {
            const idMap = new Map(idData.identities.map((id: any) => [id.address?.toLowerCase(), id]));
            setResults(prev => prev.map((r: any) => {
              if (!r.buyer_address) return r;
              const id: any = idMap.get(r.buyer_address.toLowerCase());
              if (id) {
                return {
                  ...r,
                  base_name: id.baseName || id.base_name || r.base_name,
                  farcaster_username: id.farcasterUsername || id.farcaster_username || r.farcaster_username,
                  ens_name: id.ensName || id.ens || r.ens_name,
                  avatar_url: id.avatarUrl || id.avatar_url || r.avatar_url,
                  farcaster_fid: id.farcasterFid || id.farcaster_fid || r.farcaster_fid
                };
              }
              return r;
            }));
            console.log(`[Leaderboard] Identity batch resolution complete`);
          }
        } catch (err) {
          console.error('[Leaderboard] Identity batch resolution failed:', err);
        }
      }
    } catch (e) {
      console.error('[Leaderboard] Fetch failed:', e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(period);

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      console.log('[Leaderboard] Auto-refreshing data...');
      fetchLeaderboard(period);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [period]);

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      router.push(`/profile/${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black font-sans p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
        <div className="flex flex-col">
          <h1 className="text-5xl font-black tracking-tighter transform hover:-rotate-1 transition-transform cursor-default">
            <span className="bg-yellow-200 px-3 py-1 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-2 inline-block mr-2">BASE</span>
            <span>LEADERBOARD</span>
          </h1>

        </div>

        {/* Search */}
        <div className="w-full md:w-96 relative group">
          <input
            type="text"
            placeholder="Search @name or 0x..."
            className="w-full border-2 border-black p-4 font-bold outline-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus:translate-x-[2px] focus:translate-y-[2px] focus:shadow-none transition-all placeholder:text-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
          />
          <div className="absolute right-4 top-4 text-gray-400 font-mono text-xs hidden md:block border border-gray-300 px-1 rounded">ENTER ↵</div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column: Leaderboard (2/3 width) */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
            {['1d', '7d', '30d'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`
                        px-8 py-3 border-2 border-black font-black uppercase tracking-wide transition-all select-none
                        ${period === p
                    ? 'bg-black text-white shadow-[4px_4px_0px_0px_rgba(100,100,100,0.5)] translate-x-[2px] translate-y-[2px]'
                    : 'bg-white hover:bg-gray-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-1 hover:bg-blue-50'}
                    `}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Leaderboard Table */}
          <div className="border-2 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="grid grid-cols-12 border-b-2 border-black bg-blue-100 p-4 font-black uppercase text-sm tracking-widest text-black/80">
              <div className="col-span-2 md:col-span-1">#</div>
              <div className="col-span-7 md:col-span-5">Identity</div>
              <div className="col-span-3 md:col-span-2 text-right hidden md:block">Total Buys</div>
              <div className="col-span-3 md:col-span-2 text-right hidden md:block">Unique Posts</div>
              <div className="col-span-3 md:col-span-2 text-right px-4 hidden md:block">Last Active</div>
            </div>

            <div className="divide-y-2 divide-black">
              {loading ? (
                <div className="p-12 text-center font-bold animate-pulse text-gray-400 text-xl">Loading Sketch...</div>
              ) : results.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="text-4xl mb-4">📭</div>
                  <div className="font-bold text-xl">No data found within this period.</div>
                  <div className="text-gray-500 mt-2">Try switching tabs or check back later!</div>
                </div>
              ) : (
                results.map((row, i) => (
                  <PlayerRow key={row.buyer_address} row={row} rank={i + 1} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Feed (1/3 width) */}
        <div className="lg:col-span-1">
          <LiveFeed />
        </div>

      </div>
    </div>
  );
}
