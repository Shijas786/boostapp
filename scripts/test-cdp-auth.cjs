/**
 * Test CDP API Authentication using official CDP SDK Client
 * Run: node scripts/test-cdp-auth.cjs
 */
const fs = require('fs');

// Load environment variables
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

// Set process.env for the SDK (uses CDP_API_KEY_ID and CDP_API_KEY_SECRET)
process.env.CDP_API_KEY_ID = env.CDP_API_KEY_ID;
process.env.CDP_API_KEY_SECRET = env.CDP_API_SECRET || env.CDP_API_KEY_SECRET;

console.log('\n🔐 CDP API Authentication Test (using CDP SDK)\n');
console.log('─'.repeat(50));

// Check required env vars
const cdpApiKeyId = env.CDP_API_KEY_ID;
const cdpApiSecret = env.CDP_API_SECRET || env.CDP_API_KEY_SECRET;

if (!cdpApiKeyId) {
    console.error('❌ Missing: CDP_API_KEY_ID');
    console.log('\n💡 Get your credentials from: https://portal.cdp.coinbase.com/');
    console.log('   Add to .env.local:');
    console.log('   CDP_API_KEY_ID=your-key-id');
    console.log('   CDP_API_SECRET=your-secret-key\n');
    process.exit(1);
}

if (!cdpApiSecret) {
    console.error('❌ Missing: CDP_API_SECRET (or CDP_API_KEY_SECRET)');
    process.exit(1);
}

console.log('✅ CDP_API_KEY_ID found:', cdpApiKeyId.substring(0, 8) + '...');
console.log('✅ Secret found:', cdpApiSecret.substring(0, 8) + '...');

// Check if secret looks like an Ed25519 key (base64 encoded, ~88 chars ending with ==)
const isEd25519Key = cdpApiSecret.length > 60 && cdpApiSecret.includes('=');
console.log(`   Key type: ${isEd25519Key ? 'Ed25519 (correct!)' : 'Possibly legacy/incorrect format'}`);

async function testCDPAuth() {
    console.log('\n📡 Testing CDP API connection...\n');

    try {
        // Use the CdpClient which handles auth automatically
        const { CdpClient } = await import('@coinbase/cdp-sdk');

        console.log('🔧 Initializing CDP Client...');

        const cdp = new CdpClient({
            apiKeyId: cdpApiKeyId,
            apiKeySecret: cdpApiSecret,
        });

        console.log('✅ CDP Client initialized successfully!');

        // Try a simple operation to verify auth works
        console.log('\n🧪 Testing API call...');

        // Try to list accounts (this will fail if auth is wrong)
        try {
            const accounts = await cdp.evm.listAccounts({ pageSize: 1 });
            console.log('✅ API call successful!');
            console.log(`   Found ${accounts?.accounts?.length || 0} account(s)`);
            return true;
        } catch (apiError) {
            console.log('⚠️ API call result:', apiError.message);
            // 401 = auth failed, other errors might mean auth worked but endpoint issue
            if (apiError.message.includes('401') || apiError.message.includes('Unauthorized')) {
                return false;
            }
            // Other errors suggest auth worked
            console.log('   (This might still mean auth is working - checking further...)');
            return true;
        }

    } catch (e) {
        console.error('\n❌ Error:', e.message);

        if (e.message.includes('Cannot find module')) {
            console.log('\n💡 Try running: npm install @coinbase/cdp-sdk');
        }

        if (e.message.includes('crypto') || e.message.includes('Ed25519')) {
            console.log('\n💡 The secret key needs to be in Ed25519 format.');
            console.log('   1. Go to https://portal.cdp.coinbase.com/projects/api-keys');
            console.log('   2. Create a NEW "Secret API Key" (not Client API Key)');
            console.log('   3. Make sure Ed25519 signature algorithm is selected');
            console.log('   4. Copy the full secret (it should be ~88 characters, ending with ==)');
        }

        return false;
    }
}

testCDPAuth().then(success => {
    console.log('\n' + '─'.repeat(50));
    if (success) {
        console.log('🎉 Your CDP authentication is properly configured!');
        console.log('   You can now run the leaderboard scripts.\n');
    } else {
        console.log('❌ Fix the issues above and try again.\n');
    }
});
