import { FiberError } from "./fiber-error.js";
import type { FiberBackend } from "./fiber-backend.js";
import type {
    NewInvoiceParams,
    InvoiceResult,
    InvoiceParams,
    GetInvoiceResult,
} from "../types/invoice.js";
import type {
    GetPaymentCommandParams,
    GetPaymentCommandResult,
} from "../types/payment.js";

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

export class FiberRpcClient implements FiberBackend {
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
        this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);

        this.validateUrlSecurity(options.dangerouslyAllowDirectRpc);
    }

    private validateUrlSecurity(dangerouslyAllowDirectRpc?: boolean): void {
        try {
            // Same-origin relative paths (e.g. /api/fiber-rpc) are always safe
            if (this.url.startsWith("/")) return;

            const parsed = new URL(this.url);

            // HTTPS on any domain is always safe — proper reverse proxy
            if (parsed.protocol === "https:") return;

            // HTTP is only acceptable for raw IPs (local dev / direct RPC)
            const isRawIp =
                /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname) ||
                parsed.hostname === "localhost" ||
                parsed.hostname === "127.0.0.1" ||
                /^\[.*\]$/.test(parsed.hostname); // IPv6

            if (isRawIp && !dangerouslyAllowDirectRpc) {
                throw FiberError.directRpcBlocked(this.url);
            }

            if (isRawIp && dangerouslyAllowDirectRpc) {
                const msg =
                    `[FiberRpcClient] dangerouslyAllowDirectRpc is enabled for "${this.url}". ` +
                    `Ensure this is only used in trusted development environments.`;
                if (
                    typeof process !== "undefined" &&
                    process.env?.NODE_ENV === "production"
                ) {
                    console.error(msg);
                } else {
                    console.warn(msg);
                }
            }

            // HTTP on a named domain (e.g. http://api.example.com) — warn but allow
            // This covers nginx/caddy proxies that haven't yet enabled HTTPS
            if (!isRawIp && parsed.protocol === "http:") {
                console.warn(
                    `[FiberRpcClient] "${this.url}" is using HTTP on a named domain. ` +
                        `Consider using HTTPS in production.`,
                );
            }
        } catch (e) {
            if (FiberError.is(e)) throw e;
            // Ignore URL parsing errors — fetch will surface them
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

    /** Outgoing payment session details by payment hash (includes routing fee when successful) */
    async getPayment(
        params: GetPaymentCommandParams,
    ): Promise<GetPaymentCommandResult> {
        return this.call<GetPaymentCommandResult>("get_payment", [params]);
    }

    /** Generic JSON-RPC 2.0 call */
    async call<T>(method: string, params: unknown[]): Promise<T> {
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
