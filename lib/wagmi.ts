import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
    chains: [base],
    connectors: [
        coinbaseWallet({
            appName: 'Base Creator Coins Dashboard',
        }),
    ],
    transports: {
        [base.id]: http(),
    },
});
