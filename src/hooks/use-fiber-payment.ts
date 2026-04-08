import { useState, useEffect, useRef, useCallback } from "react";
import { FiberRpcClient } from "../core/rpc-client.js";
import { FiberError } from "../core/fiber-error.js";
import type { HexString } from "../types/common.js";
import type { CkbInvoiceStatus } from "../types/invoice.js";

// ─── Public API types ─────────────────────────────────────────────────────────

/**
 * Simplified checkout status exposed to consumers.
 *
 * Maps from raw Fiber node statuses:
 *   Open      → pending
 *   Received  → processing
 *   Paid      → success
 *   Cancelled → failed
 *   Expired   → expired  (also set client-side when expiresAt is passed)
 */
export type CheckoutStatus =
    | "idle" // no paymentHash yet
    | "pending" // invoice open, waiting for payment
    | "processing" // payment received by node, settling
    | "success" // payment fully settled
    | "failed" // invoice cancelled
    | "expired"; // invoice expired (node or client-side)

export interface UseFiberPaymentOptions {
    /** RPC endpoint */
    nodeUrl: string;
    /**
     * 32-byte payment hash to poll. Polling is paused when null/undefined.
     * Typically comes from `useFiberInvoice`'s `paymentHash`.
     */
    paymentHash: HexString | null | undefined;
    /**
     * Unix timestamp (ms) when the invoice expires.
     * When provided, the hook moves to `expired` client-side without
     * waiting for the node to return the Expired status.
     */
    expiresAt?: number | null;
    /** Polling interval in milliseconds. Defaults to 2000. */
    pollIntervalMs?: number;
    /** Allow direct RPC to bare IP addresses (dev only) */
    dangerouslyAllowDirectRpc?: boolean;
    /** Called once when status transitions to `success` */
    onSuccess?: (paymentHash: HexString) => void;
    /** Called once when status transitions to `expired` */
    onExpired?: () => void;
    /** Called when a polling error occurs */
    onError?: (error: FiberError) => void;
    /** Custom headers to include in every RPC request */
    headers?: Record<string, string>;
}

export interface UseFiberPaymentResult {
    status: CheckoutStatus;
    /**
     * Routing fee in shannons (0x hex) from `get_payment` after success.
     * Null if the RPC node has no outgoing session for this hash or the call fails.
     */
    feePaid: HexString | null;
    isLoading: boolean;
    error: FiberError | null;
    /** Manually trigger an immediate poll (e.g. after a user action) */
    poll: () => void;
}

// ─── Terminal states — polling stops when reached ─────────────────────────────

const TERMINAL: ReadonlySet<CheckoutStatus> = new Set([
    "success",
    "failed",
    "expired",
]);

// ─── Status mapper ────────────────────────────────────────────────────────────

function toCheckoutStatus(nodeStatus: CkbInvoiceStatus): CheckoutStatus {
    switch (nodeStatus) {
        case "Open":
            return "pending";
        case "Received":
            return "processing";
        case "Paid":
            return "success";
        case "Cancelled":
            return "failed";
        case "Expired":
            return "expired";
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFiberPayment(
    options: UseFiberPaymentOptions,
): UseFiberPaymentResult {
    const {
        nodeUrl,
        paymentHash,
        expiresAt,
        pollIntervalMs = 2_000,
        dangerouslyAllowDirectRpc = false,
        onSuccess,
        onExpired,
        onError,
        headers,
    } = options;

    const [status, setStatus] = useState<CheckoutStatus>("idle");
    const [feePaid, setFeePaid] = useState<HexString | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<FiberError | null>(null);

    // Stable refs for callbacks — avoids restarting the interval on every render
    const onSuccessRef = useRef(onSuccess);
    const onExpiredRef = useRef(onExpired);
    const onErrorRef = useRef(onError);
    onSuccessRef.current = onSuccess;
    onExpiredRef.current = onExpired;
    onErrorRef.current = onError;

    // Client ref — recreated only when nodeUrl changes
    const clientRef = useRef<FiberRpcClient | null>(null);
    const prevUrlRef = useRef<string | null>(null);

    if (prevUrlRef.current !== nodeUrl) {
        prevUrlRef.current = nodeUrl;
        try {
            clientRef.current = new FiberRpcClient({
                url: nodeUrl,
                dangerouslyAllowDirectRpc,
                headers,
            });
        } catch (err) {
            clientRef.current = null;
            const fiberErr = FiberError.is(err)
                ? err
                : FiberError.networkError(String(err));
            setError(fiberErr);
        }
    }

    // Manual poll trigger — incrementing forces an immediate poll outside the interval
    const [pollTick, setPollTick] = useState(0);
    const poll = useCallback(() => setPollTick((t) => t + 1), []);

    // Track current status in a ref so the interval callback can read it
    // without being recreated on every status change
    const statusRef = useRef<CheckoutStatus>("idle");
    statusRef.current = status;

    // Reset to idle when paymentHash changes (new invoice)
    useEffect(() => {
        if (!paymentHash) {
            setStatus("idle");
            setFeePaid(null);
            setError(null);
        }
    }, [paymentHash]);

    useEffect(() => {
        const client = clientRef.current;
        if (!client || !paymentHash) return;

        let cancelled = false;

        // ── Client-side expiry check ──────────────────────────────────────────────
        if (
            expiresAt !== null &&
            expiresAt !== undefined &&
            Date.now() >= expiresAt
        ) {
            setStatus("expired");
            onExpiredRef.current?.();
            return;
        }

        async function fetchStatus() {
            if (cancelled) return;
            setIsLoading(true);

            // Client-side expiry guard before each poll
            if (
                expiresAt !== null &&
                expiresAt !== undefined &&
                Date.now() >= expiresAt
            ) {
                setStatus("expired");
                setIsLoading(false);
                onExpiredRef.current?.();
                return;
            }

            try {
                const result = await client!.getInvoice({
                    payment_hash: paymentHash!,
                });
                if (cancelled) return;

                const next = toCheckoutStatus(result.status);
                setStatus(next);
                setError(null);

                if (next === "success") {
                    try {
                        const paymentInfo = await client!.getPayment({
                            payment_hash: paymentHash!,
                        });
                        if (!cancelled) {
                            setFeePaid(paymentInfo.fee ?? null);
                        }
                    } catch {
                        if (!cancelled) {
                            setFeePaid(null);
                        }
                    }
                    if (!cancelled) {
                        onSuccessRef.current?.(paymentHash!);
                    }
                } else if (next === "expired") {
                    onExpiredRef.current?.();
                }
            } catch (err) {
                if (cancelled) return;
                const fiberErr = FiberError.is(err)
                    ? err
                    : FiberError.networkError(
                          err instanceof Error ? err.message : String(err),
                          err,
                      );
                setError(fiberErr);
                onErrorRef.current?.(fiberErr);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        // Immediate poll on mount / manual trigger
        fetchStatus();

        // Set up interval — skips fetching once a terminal state is reached
        const interval = setInterval(() => {
            if (TERMINAL.has(statusRef.current)) {
                clearInterval(interval);
                return;
            }
            fetchStatus();
        }, pollIntervalMs);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paymentHash, pollIntervalMs, pollTick]);

    return { status, feePaid, isLoading, error, poll };
}
