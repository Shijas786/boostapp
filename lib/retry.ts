/**
 * Retry Utilities with Exponential Backoff
 * Implements rate limit handling per CDP and Base API best practices
 */

import { DashboardError, CDPRateLimitError, isRetryableError } from './errors';

export interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterFactor?: number;  // 0 to 1, amount of randomness to add
    onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.2,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    jitterFactor: number
): number {
    // Exponential backoff: 2^attempt * baseDelay
    const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

    // Add jitter (randomness to prevent thundering herd)
    const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);

    return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on failure
 * Implements exponential backoff with jitter
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Don't retry if we've exhausted attempts
            if (attempt >= opts.maxRetries) {
                break;
            }

            // Don't retry non-retryable errors
            if (!isRetryableError(error)) {
                break;
            }

            // Calculate delay
            let delayMs: number;

            if (error instanceof CDPRateLimitError) {
                // Use the server-specified retry time for rate limits
                delayMs = error.retryAfterMs;
            } else {
                // Use exponential backoff for other errors
                delayMs = calculateBackoffDelay(
                    attempt,
                    opts.baseDelayMs,
                    opts.maxDelayMs,
                    opts.jitterFactor
                );
            }

            // Call onRetry callback if provided
            if (opts.onRetry) {
                opts.onRetry(attempt + 1, lastError, delayMs);
            }

            // Wait before retrying
            await sleep(delayMs);
        }
    }

    throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Execute multiple async functions with rate limiting
 * Useful for bulk API calls to avoid rate limits
 */
export async function withRateLimit<T, R>(
    items: T[],
    fn: (item: T, index: number) => Promise<R>,
    options: {
        concurrency?: number;
        delayMs?: number;
        onProgress?: (completed: number, total: number) => void;
    } = {}
): Promise<R[]> {
    const { concurrency = 5, delayMs = 100, onProgress } = options;
    const results: R[] = [];
    let completed = 0;

    // Process in batches for concurrency control
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);

        const batchResults = await Promise.all(
            batch.map(async (item, batchIndex) => {
                const result = await fn(item, i + batchIndex);
                completed++;
                if (onProgress) {
                    onProgress(completed, items.length);
                }
                return result;
            })
        );

        results.push(...batchResults);

        // Delay between batches to avoid rate limits
        if (i + concurrency < items.length) {
            await sleep(delayMs);
        }
    }

    return results;
}

/**
 * Batch process with automatic retry on individual failures
 */
export async function batchWithRetry<T, R>(
    items: T[],
    fn: (item: T) => Promise<R>,
    options: RetryOptions & {
        batchSize?: number;
        batchDelayMs?: number;
        onItemComplete?: (item: T, result: R | Error, index: number) => void;
    } = {}
): Promise<{ successes: R[]; failures: { item: T; error: Error }[] }> {
    const { batchSize = 10, batchDelayMs = 200, onItemComplete, ...retryOptions } = options;

    const successes: R[] = [];
    const failures: { item: T; error: Error }[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        await Promise.all(
            batch.map(async (item, batchIndex) => {
                try {
                    const result = await withRetry(() => fn(item), retryOptions);
                    successes.push(result);
                    onItemComplete?.(item, result, i + batchIndex);
                } catch (error) {
                    const err = error instanceof Error ? error : new Error(String(error));
                    failures.push({ item, error: err });
                    onItemComplete?.(item, err, i + batchIndex);
                }
            })
        );

        // Delay between batches
        if (i + batchSize < items.length) {
            await sleep(batchDelayMs);
        }
    }

    return { successes, failures };
}
