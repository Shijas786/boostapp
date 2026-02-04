/**
 * Test CDP API Authentication using Node.js native webcrypto
 * Works with Node.js 18+
 * Run: node scripts/test-cdp-auth.mjs
 */
import * as jose from 'jose';
import { readFileSync } from 'fs';
import { webcrypto } from 'crypto';

// Polyfill globalThis.crypto for jose
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

// Load environment variables
const envFile = readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const cdpApiKeyId = env.CDP_API_KEY_ID;
const cdpApiSecret = env.CDP_API_SECRET || env.CDP_API_KEY_SECRET;

console.log('\n🔐 CDP API Authentication Test (Ed25519 + jose)\n');
console.log('─'.repeat(50));

if (!cdpApiKeyId || !cdpApiSecret) {
    console.error('❌ Missing CDP_API_KEY_ID or CDP_API_SECRET');
    process.exit(1);
}

console.log('✅ CDP_API_KEY_ID:', cdpApiKeyId.substring(0, 8) + '...');
console.log('✅ CDP_API_SECRET:', cdpApiSecret.substring(0, 8) + '... (' + cdpApiSecret.length + ' chars)');

/**
 * Generate Ed25519 JWT for CDP API using jose library
 */
async function generateCDPJWT(requestMethod, requestPath) {
    // Decode the base64 secret - it's a 64-byte Ed25519 seed+public key
    const secretBytes = Buffer.from(cdpApiSecret, 'base64');
    console.log('   Secret decoded:', secretBytes.length, 'bytes');

    // For Ed25519, the secret is typically 64 bytes (32 seed + 32 public)
    // We need just the first 32 bytes (seed/private key)
    const seed = secretBytes.slice(0, 32);

    try {
        // Create PKCS8 DER format for Ed25519 private key
        // PKCS8 header for Ed25519: 302e020100300506032b657004220420 (hex)
        const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
        const pkcs8Der = Buffer.concat([pkcs8Header, seed]);

        // Convert to PEM format
        const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Der.toString('base64')}\n-----END PRIVATE KEY-----`;

        // Import the Ed25519 private key using jose
        const privateKey = await jose.importPKCS8(pkcs8Pem, 'EdDSA');
        console.log('   Private key imported successfully');

        // Create nonce for request uniqueness
        const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex');

        // Build JWT per CDP spec
        const jwt = await new jose.SignJWT({
            sub: cdpApiKeyId,
            iss: 'cdp',
            aud: ['cdp_service'],
            nbf: Math.floor(Date.now() / 1000),
            uris: [`${requestMethod} api.cdp.coinbase.com${requestPath}`]
        })
            .setProtectedHeader({
                alg: 'EdDSA',
                kid: cdpApiKeyId,
                typ: 'JWT',
                nonce
            })
            .setIssuedAt()
            .setExpirationTime('2m')
            .sign(privateKey);

        return jwt;
    } catch (e) {
        console.error('JWT Generation Error:', e.message);
        throw e;
    }
}

async function testCDPAuth() {
    console.log('\n📡 Testing CDP API connection...\n');

    const requestMethod = 'POST';
    const requestPath = '/platform/v2/data/query/run';

    try {
        const token = await generateCDPJWT(requestMethod, requestPath);
        console.log('🔑 Generated JWT:', token.substring(0, 50) + '...');

        // Simple test query
        const sql = `SELECT COUNT(*) as count FROM base.transfers LIMIT 1`;

        const res = await fetch(`https://api.cdp.coinbase.com${requestPath}`, {
            method: requestMethod,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ sql })
        });

        console.log(`\n📊 Response Status: ${res.status} ${res.statusText}`);

        if (res.status === 401) {
            const text = await res.text();
            console.log('\n❌ Authentication Failed!');
            console.log('   Response:', text.substring(0, 300));
            return false;
        }

        if (res.status === 429) {
            console.log('\n⚠️ Rate limited - but auth is working!');
            return true;
        }

        if (res.ok) {
            const data = await res.json();
            console.log('\n✅ CDP API Authentication Successful!');
            console.log('   Response:', JSON.stringify(data).substring(0, 200));
            return true;
        } else {
            const text = await res.text();
            console.log('\n⚠️ Unexpected response:', text.substring(0, 300));
            return false;
        }
    } catch (e) {
        console.error('\n❌ Error:', e.message);
        console.error('   Stack:', e.stack?.split('\n').slice(0, 3).join('\n'));
        return false;
    }
}

testCDPAuth().then(success => {
    console.log('\n' + '─'.repeat(50));
    if (success) {
        console.log('🎉 Your CDP authentication is properly configured!\n');
    } else {
        console.log('❌ Authentication failed. Check your credentials.\n');
    }
});
