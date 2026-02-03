'use client';

import { useState, useEffect } from 'react';

interface IdentityCellProps {
    address?: string;
    initialName?: string;
    initialAvatar?: string;
}

export const IdentityCell = ({ address, initialName, initialAvatar }: IdentityCellProps) => {
    const [displayName, setDisplayName] = useState<string | undefined>(initialName);
    const [avatar, setAvatar] = useState<string | undefined>(initialAvatar);

    useEffect(() => {
        if (!initialName && address) {
            // Fetch from API (Browser will cache this automatically)
            fetch(`/api/resolve-name?address=${address}`)
                .then(res => res.json())
                .then(data => {
                    if (data.displayName) {
                        setDisplayName(data.displayName);
                    } else if (data.name) {
                        setDisplayName(data.name);
                    }
                    if (data.avatar) {
                        setAvatar(data.avatar);
                    }
                })
                .catch(err => console.error('Failed to resolve identity:', err));
        }
    }, [address, initialName]);

    const display = displayName || (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Unknown');
    const isBasename = displayName && displayName.includes('.');

    return (
        <div className="flex items-center space-x-3">
            {avatar ? (
                <img
                    src={avatar}
                    alt={display}
                    className="w-10 h-10 rounded-full object-cover border-2 border-blue-500"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.visibility = 'hidden';
                        (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                    {display[0]?.toUpperCase() || '?'}
                </div>
            )}
            <span className={isBasename ? "text-blue-400 font-medium" : "text-gray-300 font-mono"}>
                {isBasename ? '@' : ''}{display}
            </span>
        </div>
    );
};
