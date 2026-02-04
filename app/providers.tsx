'use client';

import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { base } from 'viem/chains';
import { ReactNode, useState } from 'react';
import { config } from '@/lib/wagmi';

// Import OnchainKit styles
import '@coinbase/onchainkit/styles.css';

interface ProvidersProps {
    children: ReactNode;
}

/**
 * App Providers - Wraps the app with Wagmi, React Query, and OnchainKit
 * Per Base docs: https://docs.base.org/onchainkit/
 */
export function Providers({ children }: ProvidersProps) {
    const [queryClient] = useState(() => new QueryClient());

    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <OnchainKitProvider
                    apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
                    chain={base}
                    config={{
                        appearance: {
                            mode: 'light',
                            theme: 'base',
                        },
                    }}
                >
                    {children}
                </OnchainKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
