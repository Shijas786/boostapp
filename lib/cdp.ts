/**
 * CDP API Client with Ed25519 JWT Authentication
 * Per CDP docs: https://docs.cdp.coinbase.com/
 * 
 * Required env vars:
 * - CDP_API_KEY_ID: Your CDP API Key ID
 * - CDP_API_SECRET: Your CDP API Secret (Ed25519 private key, base64)
 */
import * as jose from 'jose';
import { webcrypto } from 'crypto';
import {
    CDPError,
    CDPRateLimitError,
    CDPAuthError,
    createErrorResponse
} from './errors';
import { withRetry } from './retry';

// Polyfill globalThis.crypto for jose library (needed for Node.js 18)
if (!globalThis.crypto) {
    // @ts-ignore
    globalThis.crypto = webcrypto;
}

// Types
export interface CDPQueryResult {
    metadata?: {
        cached: boolean;
        executionTimeMs: number;
        executionTimestamp: string;
        rowCount: number;
    };
    result?: Record<string, unknown>[];
    data?: Record<string, unknown>[];
}

/**
 * Generate Ed25519 JWT for CDP API authentication
 */
export async function generateCDPJWT(
    requestMethod: string = 'POST',
    requestPath: string = '/platform/v2/data/query/run'
): Promise<string> {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_SECRET || process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
        throw new CDPAuthError('CDP_API_KEY_ID and CDP_API_SECRET are required');
    }

    // Decode the base64 secret - it's a 64-byte Ed25519 seed+public key
    const secretBytes = Buffer.from(apiKeySecret, 'base64');

    // For Ed25519, the secret is 64 bytes (32 seed + 32 public)
    // We need just the first 32 bytes (seed/private key)
    const seed = secretBytes.slice(0, 32);

    // Create PKCS8 DER format for Ed25519 private key
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const pkcs8Der = Buffer.concat([pkcs8Header, seed]);
    const pkcs8Pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8Der.toString('base64')}\n-----END PRIVATE KEY-----`;

    try {
        // Import the Ed25519 private key using jose
        const privateKey = await jose.importPKCS8(pkcs8Pem, 'EdDSA');

        // Create nonce for request uniqueness
        const nonce = Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString('hex');

        // Build JWT per CDP spec
        const jwt = await new jose.SignJWT({
            sub: apiKeyId,
            iss: 'cdp',
            aud: ['cdp_service'],
            nbf: Math.floor(Date.now() / 1000),
            uris: [`${requestMethod} api.cdp.coinbase.com${requestPath}`]
        })
            .setProtectedHeader({
                alg: 'EdDSA',
                kid: apiKeyId,
                typ: 'JWT',
                nonce
            })
            .setIssuedAt()
            .setExpirationTime('2m')
            .sign(privateKey);

        return jwt;
    } catch (error) {
        throw new CDPAuthError(`Failed to generate JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Query the CDP SQL API
 * Endpoint: /platform/v2/data/query/run
 * 
 * @param sql - The SQL query to execute
 * @returns The query results
 * @throws CDPError, CDPRateLimitError, or CDPAuthError
 */
export async function queryCDP(sql: string): Promise<Record<string, unknown>[]> {
    const requestMethod = 'POST';
    const requestPath = '/platform/v2/data/query/run';

    const jwtToken = await generateCDPJWT(requestMethod, requestPath);

    const url = `https://api.cdp.coinbase.com${requestPath}`;

    const response = await fetch(url, {
        method: requestMethod,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ sql }),
    });

    // Handle authentication errors
    if (response.status === 401) {
        const errorText = await response.text();
        throw new CDPAuthError(`Unauthorized: ${errorText}`);
    }

    // Handle rate limiting (429)
    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        throw new CDPRateLimitError(waitMs);
    }

    // Handle other errors
    if (!response.ok) {
        const errorText = await response.text();
        throw new CDPError(`CDP API Error: ${response.status} ${errorText}`, response.status);
    }

    const result: CDPQueryResult = await response.json();
    return result.data || result.result || [];
}

/**
 * Query CDP with automatic retry on rate limit and transient errors
 * Implements exponential backoff with jitter
 */
export async function queryCDPWithRetry(
    sql: string,
    options: {
        maxRetries?: number;
        onRetry?: (attempt: number, error: Error, delayMs: number) => void;
    } = {}
): Promise<Record<string, unknown>[]> {
    const { maxRetries = 3, onRetry } = options;

    return withRetry(
        () => queryCDP(sql),
        {
            maxRetries,
            baseDelayMs: 1000,
            maxDelayMs: 30000,
            jitterFactor: 0.2,
            onRetry: onRetry || ((attempt, error, delay) => {
                console.log(`CDP retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
            }),
        }
    );
}

/**
 * Execute multiple CDP queries with rate limiting
 */
export async function queryCDPBatch(
    queries: string[],
    options: {
        delayBetweenQueries?: number;
        onProgress?: (completed: number, total: number) => void;
    } = {}
): Promise<{
    results: Record<string, unknown>[][];
    errors: { query: string; error: Error }[]
}> {
    const { delayBetweenQueries = 500, onProgress } = options;
    const results: Record<string, unknown>[][] = [];
    const errors: { query: string; error: Error }[] = [];

    for (let i = 0; i < queries.length; i++) {
        try {
            const result = await queryCDPWithRetry(queries[i]);
            results.push(result);
        } catch (error) {
            errors.push({
                query: queries[i],
                error: error instanceof Error ? error : new Error(String(error))
            });
            results.push([]); // Push empty result for failed queries
        }

        if (onProgress) {
            onProgress(i + 1, queries.length);
        }

        // Delay between queries to avoid rate limits
        if (i < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenQueries));
        }
    }

    return { results, errors };
}
