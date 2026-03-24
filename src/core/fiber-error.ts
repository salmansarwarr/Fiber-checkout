export const FiberErrorCode = {
    RPC_ERROR: "RPC_ERROR",
    DIRECT_RPC_BLOCKED: "DIRECT_RPC_BLOCKED",
    NETWORK_ERROR: "NETWORK_ERROR",
    INVALID_RESPONSE: "INVALID_RESPONSE",
    REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
} as const;

export type FiberErrorCode =
    (typeof FiberErrorCode)[keyof typeof FiberErrorCode];

export interface FiberErrorOptions {
    code: FiberErrorCode;
    message: string;
    cause?: unknown;
    /** JSON-RPC error code from the node, if present */
    rpcCode?: number;
    /** The RPC method that triggered the error, if applicable */
    method?: string;
}

export class FiberError extends Error {
    readonly code: FiberErrorCode;
    readonly rpcCode?: number;
    readonly method?: string;

    constructor(options: FiberErrorOptions) {
        super(options.message);
        this.name = "FiberError";
        this.code = options.code;
        this.rpcCode = options.rpcCode;
        this.method = options.method;

        // Preserve original cause for stack chain
        if (options.cause !== undefined) {
            this.cause = options.cause;
        }

        // Maintain correct prototype chain in transpiled environments
        Object.setPrototypeOf(this, FiberError.prototype);
    }

    static rpcError(
        message: string,
        rpcCode?: number,
        method?: string,
    ): FiberError {
        return new FiberError({
            code: FiberErrorCode.RPC_ERROR,
            message,
            rpcCode,
            method,
        });
    }

    static directRpcBlocked(url: string): FiberError {
        return new FiberError({
            code: FiberErrorCode.DIRECT_RPC_BLOCKED,
            message:
                `Direct RPC to "${url}" is blocked for security reasons. ` +
                `Route requests through a server-side proxy, or set dangerouslyAllowDirectRpc: true ` +
                `only in trusted development environments.`,
        });
    }

    static networkError(message: string, cause?: unknown): FiberError {
        return new FiberError({
            code: FiberErrorCode.NETWORK_ERROR,
            message,
            cause,
        });
    }

    static invalidResponse(message: string, cause?: unknown): FiberError {
        return new FiberError({
            code: FiberErrorCode.INVALID_RESPONSE,
            message,
            cause,
        });
    }

    static timeout(method: string, timeoutMs: number): FiberError {
        return new FiberError({
            code: FiberErrorCode.REQUEST_TIMEOUT,
            message: `RPC call "${method}" timed out after ${timeoutMs}ms`,
            method,
        });
    }

    /** Type guard */
    static is(value: unknown): value is FiberError {
        return value instanceof FiberError;
    }
}
