/**
 * Custom Error Types for the CDP Dashboard
 */

// Base error class for all dashboard errors
export class DashboardError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly retryable: boolean;

    constructor(
        message: string,
        code: string,
        statusCode: number = 500,
        retryable: boolean = false
    ) {
        super(message);
        this.name = 'DashboardError';
        this.code = code;
        this.statusCode = statusCode;
        this.retryable = retryable;
    }
}

// CDP API specific errors
export class CDPError extends DashboardError {
    constructor(message: string, statusCode: number = 500) {
        super(message, 'CDP_ERROR', statusCode, statusCode === 429);
        this.name = 'CDPError';
    }
}

export class CDPRateLimitError extends DashboardError {
    public readonly retryAfterMs: number;

    constructor(retryAfterMs: number) {
        super(
            `CDP API rate limited. Retry after ${retryAfterMs}ms`,
            'CDP_RATE_LIMITED',
            429,
            true
        );
        this.name = 'CDPRateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

export class CDPAuthError extends DashboardError {
    constructor(message: string = 'CDP authentication failed') {
        super(message, 'CDP_AUTH_ERROR', 401, false);
        this.name = 'CDPAuthError';
    }
}

// Identity resolution errors
export class IdentityError extends DashboardError {
    public readonly address: string;

    constructor(address: string, message: string = 'Failed to resolve identity') {
        super(message, 'IDENTITY_ERROR', 500, true);
        this.name = 'IdentityError';
        this.address = address;
    }
}

export class BaseNameError extends DashboardError {
    public readonly address: string;

    constructor(address: string, message: string = 'Failed to resolve Base name') {
        super(message, 'BASENAME_ERROR', 500, true);
        this.name = 'BaseNameError';
        this.address = address;
    }
}

// Database errors
export class DatabaseError extends DashboardError {
    constructor(message: string, operation: string) {
        super(`Database ${operation} failed: ${message}`, 'DB_ERROR', 500, true);
        this.name = 'DatabaseError';
    }
}

// Validation errors
export class ValidationError extends DashboardError {
    public readonly field: string;

    constructor(field: string, message: string) {
        super(message, 'VALIDATION_ERROR', 400, false);
        this.name = 'ValidationError';
        this.field = field;
    }
}

// Error response type for API endpoints
export interface ErrorResponse {
    ok: false;
    error: {
        code: string;
        message: string;
        retryable: boolean;
    };
}

// Success response type for API endpoints
export interface SuccessResponse<T> {
    ok: true;
    data: T;
    timestamp: string;
}

// Union type for API responses
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// Helper to create error response
export function createErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof DashboardError) {
        return {
            ok: false,
            error: {
                code: error.code,
                message: error.message,
                retryable: error.retryable,
            },
        };
    }

    if (error instanceof Error) {
        return {
            ok: false,
            error: {
                code: 'UNKNOWN_ERROR',
                message: error.message,
                retryable: false,
            },
        };
    }

    return {
        ok: false,
        error: {
            code: 'UNKNOWN_ERROR',
            message: 'An unknown error occurred',
            retryable: false,
        },
    };
}

// Helper to create success response
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
    return {
        ok: true,
        data,
        timestamp: new Date().toISOString(),
    };
}

// Type guard for DashboardError
export function isDashboardError(error: unknown): error is DashboardError {
    return error instanceof DashboardError;
}

// Type guard for retryable errors
export function isRetryableError(error: unknown): boolean {
    if (error instanceof DashboardError) {
        return error.retryable;
    }
    return false;
}
