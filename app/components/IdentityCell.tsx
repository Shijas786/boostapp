'use client';

import { useState, useEffect } from 'react';

interface IdentityCellProps {
    address: string;
    initialBaseName?: string;
    initialFarcasterName?: string;
    initialAvatar?: string;
}

export const IdentityCell = ({ address, initialBaseName, initialFarcasterName, initialAvatar }: IdentityCellProps) => {
    const [id, setId] = useState<any>({
        base_name: initialBaseName,
        farcaster_username: initialFarcasterName,
        avatar_url: initialAvatar
    });

    useEffect(() => {
        // Resolve if no cached identity provided
        if (!initialBaseName && !initialFarcasterName) {
            fetch(`/api/identity?address=${address}`)
                .then(res => res.json())
                .then(data => {
                    setId(data);
                })
                .catch(err => console.error('Failed to resolve identity:', err));
        }
    }, [address]);

    const displayName = id.base_name || id.farcaster_username || `${address.slice(0, 6)}...${address.slice(-4)}`;
    const isBase = !!id.base_name;
    const isFc = !!id.farcaster_username && !isBase;

    return (
        <div className="flex items-center space-x-3">
            {id.avatar_url ? (
                <img
                    src={id.avatar_url}
                    alt={displayName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-black"
                />
            ) : (
                <div className="w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-sm font-bold text-black bg-yellow-100 uppercase">
                    {displayName[0]}
                </div>
            )}

            <div className="flex flex-col">
                <span className={`font-bold ${isBase ? "text-blue-600" : isFc ? "text-purple-600" : "text-black"}`}>
                    {displayName}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                    {address.slice(0, 10)}...
                </span>
            </div>
        </div>
    );
};
