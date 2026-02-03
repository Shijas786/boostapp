'use client';

import { useState, useEffect } from 'react';

interface IdentityCellProps {
    address?: string;
    initialName?: string;
    initialAvatar?: string;
    isContract?: boolean;
}

export const IdentityCell = ({ address, initialName, initialAvatar, isContract }: IdentityCellProps) => {
    const [displayName, setDisplayName] = useState<string | undefined>(initialName);
    const [avatar, setAvatar] = useState<string | undefined>(initialAvatar);

    useEffect(() => {
        if (!initialName && address) {
            // Fetch from API (Browser will cache this automatically)
            // Note: API resolve-name assumes pure user logic usually, but isContract might be unknown if not passed initially.
            fetch(`/api/resolve-name?address=${address}`)
                .then(res => res.json())
                .then(data => {
                    if (data.displayName) setDisplayName(data.displayName);
                    else if (data.name) setDisplayName(data.name);

                    if (data.avatar) setAvatar(data.avatar);
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
                    className="w-10 h-10 rounded-full object-cover border-2 border-black"
                />
            ) : (
                <div className={`w-10 h-10 rounded-full border-2 border-black flex items-center justify-center text-sm font-bold text-black ${isContract ? 'bg-gray-200' : 'bg-yellow-100'}`}>
                    {isContract ? '🤖' : (display[0]?.toUpperCase() || '?')}
                </div>
            )}

            <div className="flex flex-col">
                <span className={`font-bold ${isBasename ? "text-blue-600" : "text-black"}`}>
                    {isBasename ? '@' : ''}{display}
                </span>
                {isContract && (
                    <span className="text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded font-mono uppercase tracking-wide w-fit border border-black">
                        Contract
                    </span>
                )}
            </div>
        </div>
    );
};
