import type {
    NewInvoiceParams,
    InvoiceResult,
    InvoiceParams,
    GetInvoiceResult,
    GetPaymentCommandParams,
    GetPaymentCommandResult,
} from "@nervosnetwork/fiber-js";

/**
 * Unified interface for Fiber node interaction.
 *
 * This abstraction supports two backends:
 *   - `FiberRpcClient` — HTTP JSON-RPC to a remote Fiber node (via proxy or direct)
 *   - `FiberWasmBackend` — wraps an in-browser `Fiber` WASM instance from @nervosnetwork/fiber-js
 */
export interface FiberBackend {
    newInvoice(params: NewInvoiceParams): Promise<InvoiceResult>;
    getInvoice(params: InvoiceParams): Promise<GetInvoiceResult>;
    getPayment(
        params: GetPaymentCommandParams,
    ): Promise<GetPaymentCommandResult>;
}

/**
 * Adapter that wraps a running `Fiber` WASM instance (from @nervosnetwork/fiber-js)
 * to satisfy the `FiberBackend` interface.
 *
 * Usage:
 * ```ts
 * import { Fiber } from "@nervosnetwork/fiber-js";
 * import { FiberWasmBackend } from "fiber-checkout";
 *
 * const fiber = new Fiber();
 * await fiber.start(config, keyPair, secretKey);
 * const backend = new FiberWasmBackend(fiber);
 * ```
 */
export class FiberWasmBackend implements FiberBackend {
    constructor(private readonly fiber: FiberLike) {}

    async newInvoice(params: NewInvoiceParams): Promise<InvoiceResult> {
        return this.fiber.newInvoice(params);
    }

    async getInvoice(params: InvoiceParams): Promise<GetInvoiceResult> {
        return this.fiber.getInvoice(params);
    }

    async getPayment(
        params: GetPaymentCommandParams,
    ): Promise<GetPaymentCommandResult> {
        return this.fiber.getPayment(params);
    }
}

/**
 * Structural type matching the subset of `Fiber` methods we need.
 * This avoids a hard import of the full WASM bundle for type-checking.
 */
export interface FiberLike {
    newInvoice(params: NewInvoiceParams): Promise<InvoiceResult>;
    getInvoice(params: InvoiceParams): Promise<GetInvoiceResult>;
    getPayment(
        params: GetPaymentCommandParams,
    ): Promise<GetPaymentCommandResult>;
}
