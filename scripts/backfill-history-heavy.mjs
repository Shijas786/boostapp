import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { SignJWT, importJWK } from 'jose';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

async function generateCDPJWT(apiKeyId, apiSecret) {
    const keyBuffer = Buffer.from(apiSecret, 'base64');
    const toBase64Url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const d = toBase64Url(keyBuffer.subarray(0, 32));
    const x = toBase64Url(keyBuffer.subarray(32, 64));
    const jwk = { kty: 'OKP', crv: 'Ed25519', d, x, kid: apiKeyId };
    const privateKey = await importJWK(jwk, 'EdDSA');
    const uri = `POST api.cdp.coinbase.com/platform/v2/data/query/run`;
    return await new SignJWT({
        iss: 'cdp',
        nbf: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 120,
        sub: apiKeyId,
        uris: [uri]
    }).setProtectedHeader({ alg: 'EdDSA', kid: apiKeyId, typ: 'JWT' }).sign(privateKey);
}

async function main() {
    console.log('\n🏛️ Backfilling 7-Day History for Top 200 Tokens...\n');

    const envFile = fs.readFileSync('.env.local', 'utf8');
    const env = {};
    envFile.split('\n').forEach(line => {
        const [k, ...v] = line.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim();
    });

    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const jwtToken = await generateCDPJWT(env.CDP_API_KEY_ID, env.CDP_API_SECRET);

    const { data: tokens } = await supabase.from('tracked_tokens').select('address').limit(200);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '').split('.')[0];

    const BATCH_SIZE = 25;
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        const tokensList = batch.map(t => `'${t.address.toLowerCase()}'`).join(',');

        const sql = `
            SELECT 
                transaction_hash as tx_hash,
                address as post_token,
                block_timestamp,
                toString(parameters['to']) as buyer
            FROM base.events
            WHERE event_name = 'Transfer'
            AND address IN (${tokensList})
            AND block_timestamp > '${sevenDaysAgo}'
            LIMIT 5000
        `;

        try {
            const res = await fetch('https://api.cdp.coinbase.com/platform/v2/data/query/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
                body: JSON.stringify({ sql })
            });

            if (res.ok) {
                const { result } = await res.json();
                const rows = result || [];
                if (rows.length > 0) {
                    const buys = rows.map(r => ({
                        buyer: r.buyer.toLowerCase(),
                        post_token: r.post_token.toLowerCase(),
                        block_time: r.block_timestamp,
                        tx_hash: r.tx_hash
                    }));
                    await supabase.from('buys').upsert(buys, { onConflict: 'tx_hash,post_token,buyer' });
                    process.stdout.write(`+${rows.length} `);
                } else {
                    process.stdout.write('. ');
                }
            } else {
                process.stdout.write('E ');
            }
        } catch (e) {
            process.stdout.write('! ');
        }
    }

    console.log('\n\n✨ History backfill complete!');
}

main().catch(console.error);
