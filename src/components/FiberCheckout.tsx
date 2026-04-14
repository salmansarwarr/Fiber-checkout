import React, { useEffect, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFiberInvoice } from "../hooks/use-fiber-invoice.js";
import { useFiberPayment } from "../hooks/use-fiber-payment.js";
import { formatAmount } from "../utils/hex.js";
import { ASSETS, getAsset } from "../core/assets.js";
import { FiberError } from "../core/fiber-error.js";
import type { AssetConfig } from "../core/assets.js";
import type { HexString } from "../types/common.js";
import type { CheckoutStatus } from "../hooks/use-fiber-payment.js";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FiberCheckoutProps {
    /** Amount in shannons as 0x-prefixed hex (e.g. "0x5f5e100" = 1 CKB) */
    amount: HexString;
    /** Asset identifier (e.g. "CKB", "RUSD", or a custom key from customAssets) */
    asset: string;
    /** RPC endpoint — proxy route in production, direct IP in dev */
    nodeUrl: string;
    /**
     * Optional registry of additional assets.
     * Allows accepting new tokens without a library release.
     */
    customAssets?: Record<string, AssetConfig>;
    /** Called with paymentHash when payment is confirmed */
    onSuccess?: (paymentHash: HexString) => void;
    /** Called when the invoice expires */
    onExpired?: () => void;
    /** Called when an error occurs */
    onError?: (error: FiberError) => void;
    /**
     * Allow direct RPC to bare IP addresses.
     * Only safe in local development.
     * @default false
     */
    dangerouslyAllowDirectRpc?: boolean;
    /** Invoice expiry in seconds. Defaults to 3600 (1 hour) */
    expirySeconds?: number;
    /** Optional payment description */
    description?: string;
    /** QR code size in pixels. Defaults to 240 */
    qrSize?: number;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
    container: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: "16px",
        padding: "24px",
        maxWidth: "320px",
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
    },
    header: {
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: "4px",
        width: "100%",
        textAlign: "center" as const,
    },
    amount: {
        fontSize: "20px",
        fontWeight: 600,
        margin: 0,
    },
    description: {
        margin: 0,
        color: "#666",
        fontSize: "13px",
    },
    qrWrapper: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px",
        borderRadius: "8px",
        border: "1px solid #e5e5e5",
        background: "#fff",
    },
    qrPlaceholder: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#999",
        fontSize: "13px",
    },
    statusBadge: (status: CheckoutStatus) => ({
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 12px",
        borderRadius: "99px",
        fontSize: "13px",
        fontWeight: 500,
        ...statusColors(status),
    }),
    copyButton: {
        width: "100%",
        padding: "8px 16px",
        borderRadius: "6px",
        border: "1px solid #e5e5e5",
        background: "transparent",
        cursor: "pointer",
        fontSize: "13px",
        color: "#444",
    },
    retryButton: {
        width: "100%",
        padding: "8px 16px",
        borderRadius: "6px",
        border: "none",
        background: "#0070f3",
        color: "#fff",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: 500,
    },
    errorText: {
        color: "#c00",
        fontSize: "13px",
        textAlign: "center" as const,
        margin: 0,
    },
    expiryText: {
        color: "#999",
        fontSize: "12px",
        margin: 0,
    },
} as const;

function statusColors(status: CheckoutStatus): React.CSSProperties {
    switch (status) {
        case "pending":
            return { background: "#f5f5f5", color: "#555" };
        case "processing":
            return { background: "#fff8e1", color: "#b45309" };
        case "success":
            return { background: "#e6f9f0", color: "#15803d" };
        case "failed":
            return { background: "#fef2f2", color: "#b91c1c" };
        case "expired":
            return { background: "#fef2f2", color: "#b91c1c" };
        default:
            return { background: "#f5f5f5", color: "#555" };
    }
}

function statusLabel(status: CheckoutStatus): string {
    switch (status) {
        case "idle":
            return "Initializing…";
        case "pending":
            return "Waiting for payment";
        case "processing":
            return "Processing…";
        case "success":
            return "Payment confirmed";
        case "failed":
            return "Payment failed";
        case "expired":
            return "Invoice expired";
    }
}

function statusDot(status: CheckoutStatus): string {
    switch (status) {
        case "processing":
            return "⏳";
        case "success":
            return "✓";
        case "failed":
        case "expired":
            return "✗";
        default:
            return "●";
    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FiberCheckout({
    amount,
    asset,
    nodeUrl,
    customAssets,
    onSuccess,
    onExpired,
    onError,
    dangerouslyAllowDirectRpc = false,
    expirySeconds = 3600,
    description,
    qrSize = 240,
}: FiberCheckoutProps) {
    const assetConfig = getAsset(asset, customAssets);

    // ── Invoice generation ──────────────────────────────────────────────────────
    const {
        invoiceAddress,
        paymentHash,
        expiresAt,
        isLoading: invoiceLoading,
        error: invoiceError,
        regenerate,
    } = useFiberInvoice({
        nodeUrl,
        amount,
        asset,
        expirySeconds,
        description,
        dangerouslyAllowDirectRpc,
    });

    // ── Payment polling ─────────────────────────────────────────────────────────
    const {
        status,
        isLoading: paymentLoading,
        error: paymentError,
    } = useFiberPayment({
        nodeUrl,
        paymentHash,
        expiresAt,
        dangerouslyAllowDirectRpc,
        onSuccess,
        onExpired,
        onError,
    });

    // Surface invoice errors to the onError callback
    useEffect(() => {
        if (invoiceError) onError?.(invoiceError);
    }, [invoiceError, onError]);

    // ── Copy invoice address ────────────────────────────────────────────────────
    const handleCopy = useCallback(() => {
        if (invoiceAddress) {
            navigator.clipboard.writeText(invoiceAddress).catch(() => {
                // Clipboard API not available — silently ignore
            });
        }
    }, [invoiceAddress]);

    // ── Derived state ───────────────────────────────────────────────────────────
    const isTerminal =
        status === "success" || status === "failed" || status === "expired";
    const isLoading = invoiceLoading || paymentLoading;
    const error = invoiceError ?? paymentError;
    const displayAmount = formatAmount(amount, assetConfig.symbol);

    // ── Expiry countdown ────────────────────────────────────────────────────────
    const expiryDate = expiresAt
        ? new Date(expiresAt).toLocaleTimeString()
        : null;

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <p style={styles.amount}>{displayAmount}</p>
                {description && <p style={styles.description}>{description}</p>}
            </div>

            {/* QR Code */}
            <div
                style={{
                    ...styles.qrWrapper,
                    width: qrSize + 24,
                    height: qrSize + 24,
                    opacity: isTerminal ? 0.4 : 1,
                    transition: "opacity 0.2s",
                }}
            >
                {invoiceAddress && !isTerminal ? (
                    <QRCodeSVG value={invoiceAddress} size={qrSize} level="M" />
                ) : (
                    <div
                        style={{
                            ...styles.qrPlaceholder,
                            width: qrSize,
                            height: qrSize,
                        }}
                    >
                        {invoiceLoading ? "Generating…" : isTerminal ? "" : "—"}
                    </div>
                )}
            </div>

            {/* Status badge */}
            <span style={styles.statusBadge(status)}>
                {statusDot(status)} {statusLabel(status)}
            </span>

            {/* Expiry hint — shown only while pending */}
            {expiryDate && status === "pending" && (
                <p style={styles.expiryText}>Expires at {expiryDate}</p>
            )}

            {/* Error message */}
            {error && <p style={styles.errorText}>{error.message}</p>}

            {/* Copy invoice button — shown while pending */}
            {invoiceAddress && status === "pending" && (
                <button
                    style={styles.copyButton}
                    onClick={handleCopy}
                    type="button"
                >
                    Copy invoice
                </button>
            )}

            {/* Retry button — shown on error, expiry, or failure */}
            {(isTerminal || invoiceError) && status !== "success" && (
                <button
                    style={styles.retryButton}
                    onClick={regenerate}
                    type="button"
                >
                    Generate new invoice
                </button>
            )}
        </div>
    );
}
