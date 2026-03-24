import { FiberError } from "./fiber-error.js";
import type {
    NewInvoiceParams,
    InvoiceResult,
    InvoiceParams,
    GetInvoiceResult,
} from "../types/invoice.js";

export interface FiberRpcClientOptions {
    /** The JSON-RPC endpoint URL */
    url: string;
    /** Custom headers to include in every request */
    headers?: Record<string, string>;
    /** Request timeout in milliseconds (default: 30000) */
    timeoutMs?: number;
    /**
     * If true, allows direct RPC connection to IP addresses (e.g. 127.0.0.1).
     * This is insecure for production browser environments and should only be used in dev.
     */
    dangerouslyAllowDirectRpc?: boolean;
    /** Optional fetch implementation (defaults to global fetch) */
    fetch?: typeof fetch;
}

export class FiberRpcClient {
    private readonly url: string;
    private readonly headers: Record<string, string>;
    private readonly timeoutMs: number;
    private readonly fetchFn: typeof fetch;
    private idCounter = 0;

    constructor(options: FiberRpcClientOptions) {
        this.url = options.url;
        this.headers = {
            "Content-Type": "application/json",
            ...options.headers,
        };
        this.timeoutMs = options.timeoutMs ?? 30000;
        this.fetchFn = options.fetch ?? globalThis.fetch;

        this.validateUrlSecurity(options.dangerouslyAllowDirectRpc);
    }

    private validateUrlSecurity(dangerouslyAllowDirectRpc = false) {
        try {
            const parsed = new URL(this.url);
            const hostname = parsed.hostname;

            // Simple regex for IPv4 and IPv6
            const isIp =
                /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname) ||
                hostname.includes(":") ||
                hostname === "[::1]";

            if (isIp && !dangerouslyAllowDirectRpc) {
                throw FiberError.directRpcBlocked(this.url);
            }

            if (isIp && dangerouslyAllowDirectRpc) {
                console.warn(
                    `[FiberRpcClient] dangerouslyAllowDirectRpc is enabled for "${this.url}". ` +
                        `Ensure this is only used in trusted development environments.`,
                );
            }
        } catch (e) {
            if (FiberError.is(e)) throw e;
            // Ignore URL parsing errors here, fetch will catch them
        }
    }

    /** Create a new invoice on the Fiber node */
    async newInvoice(params: NewInvoiceParams): Promise<InvoiceResult> {
        return this.call<InvoiceResult>("new_invoice", [params]);
    }

    /** Retrieve invoice details and status by payment hash */
    async getInvoice(params: InvoiceParams): Promise<GetInvoiceResult> {
        return this.call<GetInvoiceResult>("get_invoice", [params]);
    }

    /** Generic JSON-RPC 2.0 call */
    private async call<T>(method: string, params: unknown[]): Promise<T> {
        const id = ++this.idCounter;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await this.fetchFn(this.url, {
                method: "POST",
                headers: this.headers,
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    method,
                    params,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw FiberError.networkError(
                    `HTTP error ${response.status}: ${response.statusText}`,
                );
            }

            const body = await response.json().catch((e) => {
                throw FiberError.invalidResponse(
                    "Failed to parse JSON response",
                    e,
                );
            });

            if (body.error) {
                throw FiberError.rpcError(
                    body.error.message,
                    body.error.code,
                    method,
                );
            }

            return body.result as T;
        } catch (e) {
            if (FiberError.is(e)) throw e;

            if (e instanceof Error && e.name === "AbortError") {
                throw FiberError.timeout(method, this.timeoutMs);
            }

            throw FiberError.networkError(
                e instanceof Error ? e.message : "Unknown network error",
                e,
            );
        } finally {
            clearTimeout(timeoutId);
        }
    }
}
