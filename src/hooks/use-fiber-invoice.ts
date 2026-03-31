import { useState, useEffect, useCallback, useRef } from "react";
import { FiberRpcClient } from "../core/rpc-client.js";
import { FiberError } from "../core/fiber-error.js";
import { generatePreimage } from "../utils/preimage.js";
import { getAsset } from "../core/assets.js";
import { fromHex } from "../utils/hex.js";
import type { AssetId } from "../core/assets.js";
import type { HexString } from "../types/common.js";
import type { CkbInvoice } from "../types/invoice.js";

// ─── Public API types ─────────────────────────────────────────────────────────

export interface UseFiberInvoiceOptions {
    /** RPC endpoint — a proxy route in production, direct IP in dev */
    nodeUrl: string;
    /** Amount in shannons as a 0x-prefixed hex string (e.g. "0x5f5e100" = 1 CKB) */
    amount: HexString;
    /** Asset to invoice for */
    asset: AssetId;
    /** Invoice expiry in seconds. Defaults to 3600 (1 hour) */
    expirySeconds?: number;
    /** Optional description embedded in the invoice */
    description?: string;
    /**
     * Only safe in local development — emits a console warning in production.
     */
    dangerouslyAllowDirectRpc?: boolean;
    /** Custom headers to include in every RPC request */
    headers?: Record<string, string>;
}

export interface UseFiberInvoiceResult {
    /** Bech32m-encoded invoice string — pass this to a QR code renderer */
    invoiceAddress: string | null;
    /** Raw invoice object from the node */
    invoice: CkbInvoice | null;
    /** 32-byte payment hash as 0x-prefixed hex */
    paymentHash: HexString | null;
    /** Unix timestamp (ms) when the invoice expires, or null while loading */
    expiresAt: number | null;
    isLoading: boolean;
    error: FiberError | null;
    /** Call to generate a fresh invoice (e.g. after expiry or error) */
    regenerate: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFiberInvoice(
    options: UseFiberInvoiceOptions,
): UseFiberInvoiceResult {
    const {
        nodeUrl,
        amount,
        asset,
        expirySeconds = 3600,
        description,
        dangerouslyAllowDirectRpc = false,
        headers,
    } = options;

    const [invoiceAddress, setInvoiceAddress] = useState<string | null>(null);
    const [invoice, setInvoice] = useState<CkbInvoice | null>(null);
    const [paymentHash, setPaymentHash] = useState<HexString | null>(null);
    const [expiresAt, setExpiresAt] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<FiberError | null>(null);

    // Stable counter — incrementing triggers a new invoice generation
    const [generation, setGeneration] = useState(0);

    // Keep a ref to the client so we don't recreate it on every render
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
            // directRpcBlocked throws synchronously — surface it as error state
            clientRef.current = null;
            setError(
                FiberError.is(err) ? err : FiberError.networkError(String(err)),
            );
        }
    }

    useEffect(() => {
        const client = clientRef.current;
        if (!client) return;

        let cancelled = false;

        async function generate() {
            setIsLoading(true);
            setError(null);
            setInvoiceAddress(null);
            setInvoice(null);
            setPaymentHash(null);
            setExpiresAt(null);

            try {
                const assetConfig = getAsset(asset);
                const preimage = generatePreimage();
                const expiryHex: HexString = `0x${expirySeconds.toString(16)}`;

                const result = await client!.newInvoice({
                    amount,
                    currency: "Fibt",
                    payment_preimage: preimage,
                    expiry: expiryHex,
                    description,
                    udt_type_script: assetConfig.udtTypeScript ?? undefined,
                });

                if (cancelled) return;

                const hash = result.invoice.data.payment_hash as HexString;

                // Derive expiresAt from the invoice timestamp + expiry
                const timestampMs = Number(
                    fromHex(result.invoice.data.timestamp as HexString),
                );
                const expiryMs = expirySeconds * 1000;

                setInvoiceAddress(result.invoice_address);
                setInvoice(result.invoice);
                setPaymentHash(hash);
                setExpiresAt(timestampMs + expiryMs);
            } catch (err) {
                if (cancelled) return;
                setError(
                    FiberError.is(err)
                        ? err
                        : FiberError.networkError(
                              err instanceof Error ? err.message : String(err),
                              err,
                          ),
                );
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        generate();

        return () => {
            cancelled = true;
        };
        // Re-run when generation counter bumps, or when key inputs change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [generation, nodeUrl, amount, asset, expirySeconds, description]);

    const regenerate = useCallback(() => {
        setGeneration((g) => g + 1);
    }, []);

    return {
        invoiceAddress,
        invoice,
        paymentHash,
        expiresAt,
        isLoading,
        error,
        regenerate,
    };
}
