
import { createPublicClient, http, namehash } from 'viem';
import { base } from 'viem/chains';

// Use the explicit Base RPC and L2 Resolver
const client = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
});

const L2_RESOLVER_ADDRESS = '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD';

async function testResolution() {
    // Jesse Pollak's Address
    const address = '0x8C3159937E92BB91A07b0292E6b1778912e7D3cf';
    console.log(`Resolving name for ${address}...`);

    try {
        // Method 1: Standard getEnsName (might fail if chain not perfectly configured in viem internals for Base)
        /*
        const stdName = await client.getEnsName({ address });
        console.log('Standard Resolution:', stdName || 'None');
        */

        // Method 2: Manual L2 Resolver Query
        const cleanAddr = address.toLowerCase().replace('0x', '');
        const reverseName = `${cleanAddr}.addr.reverse`;
        const node = namehash(reverseName);
        console.log(`Checking L2 Resolver (${L2_RESOLVER_ADDRESS}) for node: ${reverseName}`);

        const name = await client.readContract({
            address: L2_RESOLVER_ADDRESS,
            abi: [{
                name: 'name',
                type: 'function',
                stateMutability: 'view',
                inputs: [{ name: 'node', type: 'bytes32' }],
                outputs: [{ name: '', type: 'string' }],
            }],
            functionName: 'name',
            args: [node],
        });

        console.log('Manual Resolution Result:', name ? `✅ ${name}` : '❌ No Name Found (Empty String)');

    } catch (e) {
        console.error('Test Failed:', e);
    }
}

testResolution();
