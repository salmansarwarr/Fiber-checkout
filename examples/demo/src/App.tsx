import { useState, useCallback } from "react";
import {
    useFiberInvoice,
    useFiberPayment,
    formatAmount,
    ckbToShannonHex,
} from "fiber-checkout";
import { FiberRpcClient } from "fiber-checkout";
import type { AssetId } from "fiber-checkout";
import type { HexString } from "fiber-checkout";
import { QRCodeSVG } from "qrcode.react";
import styles from "./App.module.css";

// ─── Config ───────────────────────────────────────────────────────────────────

const NODE_URL = import.meta.env.VITE_FIBER_NODE_URL ?? "/api/fiber-rpc";
// Invoice node — generates invoices (must be a DIFFERENT node from NODE_URL)
// In testnet: use node2 so payments route local → node2 (avoids self-payment error)
const INVOICE_NODE_URL =
    import.meta.env.VITE_FIBER_INVOICE_NODE_URL ?? "/api/node2-rpc";
const ALLOW_DIRECT = import.meta.env.VITE_ALLOW_DIRECT_RPC !== "false";

const ASSETS: { id: AssetId; label: string; symbol: string }[] = [
    { id: "CKB", label: "CKB", symbol: "CKB" },
    { id: "RUSD", label: "RUSD", symbol: "RUSD" },
];

const PRESETS = [0.1, 0.5, 1, 5, 10];

// ─── App ──────────────────────────────────────────────────────────────────────

export default function () {
    const [asset, setAsset] = useState<AssetId>("CKB");
    const [ckbAmount, setCkbAmount] = useState(1);
    const [copied, setCopied] = useState(false);
    const [successHash, setSuccessHash] = useState<HexString | null>(null);
    const [paying, setPaying] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);

    const amountHex = ckbToShannonHex(ckbAmount) as HexString;

    const {
        invoiceAddress,
        paymentHash,
        expiresAt,
        isLoading: invoiceLoading,
        error: invoiceError,
        regenerate,
    } = useFiberInvoice({
        nodeUrl: INVOICE_NODE_URL,
        amount: amountHex,
        asset,
        expirySeconds: 3600,
        description: `fiber-checkout demo — ${ckbAmount} ${asset}`,
        dangerouslyAllowDirectRpc: ALLOW_DIRECT,
    });

    const { status, error: paymentError } = useFiberPayment({
        nodeUrl: INVOICE_NODE_URL,
        paymentHash,
        expiresAt,
        dangerouslyAllowDirectRpc: ALLOW_DIRECT,
        onSuccess: (hash) => setSuccessHash(hash),
        onExpired: () => {},
        onError: () => {},
    });

    const handlePay = useCallback(async () => {
        if (!invoiceAddress || paying) return;
        setPaying(true);
        setPayError(null);
        try {
            const client = new FiberRpcClient({
                url: NODE_URL,
                dangerouslyAllowDirectRpc: ALLOW_DIRECT,
            });
            await client.call("send_payment", [{ invoice: invoiceAddress }]);
        } catch (err: any) {
            setPayError(err?.message ?? "send_payment failed");
        } finally {
            setPaying(false);
        }
    }, [invoiceAddress, paying]);

    const handleCopy = useCallback(async () => {
        if (!invoiceAddress) return;
        await navigator.clipboard.writeText(invoiceAddress).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [invoiceAddress]);

    const handleNewPayment = useCallback(() => {
        setSuccessHash(null);
        setPayError(null);
        regenerate();
    }, [regenerate]);

    const isTerminal =
        status === "success" || status === "expired" || status === "failed";
    const error = invoiceError ?? paymentError;
    const displayError = error ?? (payError ? { message: payError } : null);

    return (
        <div className={styles.layout}>
            {/* ── Left panel — config ── */}
            <aside className={styles.sidebar}>
                <div className={styles.logo}>
                    <span className={styles.logoMark}>⬡</span>
                    <span className={styles.logoText}>fiber-checkout</span>
                    <span className={styles.logoBadge}>demo</span>
                </div>

                <p className={styles.sidebarDesc}>
                    Drop-in React component for Fiber Network payments. Select
                    an asset and amount to generate a testnet invoice.
                </p>

                {/* Asset selector */}
                <div className={styles.field}>
                    <label className={styles.label}>Asset</label>
                    <div className={styles.assetGroup}>
                        {ASSETS.map((a) => (
                            <button
                                key={a.id}
                                className={`${styles.assetBtn} ${asset === a.id ? styles.assetBtnActive : ""}`}
                                onClick={() => {
                                    setAsset(a.id);
                                    setSuccessHash(null);
                                }}
                                type="button"
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Amount */}
                <div className={styles.field}>
                    <label className={styles.label}>Amount ({asset})</label>
                    <div className={styles.presets}>
                        {PRESETS.map((p) => (
                            <button
                                key={p}
                                className={`${styles.presetBtn} ${ckbAmount === p ? styles.presetBtnActive : ""}`}
                                onClick={() => {
                                    setCkbAmount(p);
                                    setSuccessHash(null);
                                    regenerate();
                                }}
                                type="button"
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                    <input
                        className={styles.amountInput}
                        type="number"
                        min="0.00000001"
                        step="0.1"
                        value={ckbAmount}
                        onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (v > 0) {
                                setCkbAmount(v);
                                setSuccessHash(null);
                            }
                        }}
                    />
                </div>

                {/* Code snippet */}
                <div className={styles.field}>
                    <label className={styles.label}>Usage</label>
                    <pre className={styles.codeBlock}>{`<FiberCheckout
  amount="${amountHex}"
  asset="${asset}"
  nodeUrl="/api/node2-rpc"
  onSuccess={onSuccess}
/>`}</pre>
                </div>

                <a
                    className={styles.githubLink}
                    href="https://github.com/nervosnetwork/fiber"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    View on GitHub →
                </a>
            </aside>

            {/* ── Right panel — checkout widget ── */}
            <main className={styles.main}>
                <div className={styles.card}>
                    {status === "success" && successHash ? (
                        <SuccessView
                            hash={successHash}
                            amount={ckbAmount}
                            asset={asset}
                            onNewPayment={handleNewPayment}
                        />
                    ) : (
                        <CheckoutView
                            invoiceAddress={invoiceAddress}
                            invoiceLoading={invoiceLoading}
                            status={status}
                            error={displayError}
                            expiresAt={expiresAt}
                            ckbAmount={ckbAmount}
                            asset={asset}
                            amountHex={amountHex}
                            copied={copied}
                            isTerminal={isTerminal}
                            paying={paying}
                            onCopy={handleCopy}
                            onPay={handlePay}
                            onRegenerate={handleNewPayment}
                        />
                    )}
                </div>

                <p className={styles.networkBadge}>⬡ Fiber Testnet</p>
            </main>
        </div>
    );
}

// ─── Checkout view ────────────────────────────────────────────────────────────

function CheckoutView({
    invoiceAddress,
    invoiceLoading,
    status,
    error,
    expiresAt,
    ckbAmount,
    asset,
    amountHex,
    copied,
    isTerminal,
    paying,
    onCopy,
    onPay,
    onRegenerate,
}: {
    invoiceAddress: string | null;
    invoiceLoading: boolean;
    status: string;
    error: any;
    expiresAt: number | null;
    ckbAmount: number;
    asset: AssetId;
    amountHex: HexString;
    copied: boolean;
    isTerminal: boolean;
    paying: boolean;
    onCopy: () => void;
    onPay: () => void;
    onRegenerate: () => void;
}) {
    return (
        <>
            <div className={styles.cardHeader}>
                <div className={styles.amount}>
                    {ckbAmount}{" "}
                    <span className={styles.assetLabel}>{asset}</span>
                </div>
                <div className={styles.amountHex}>{amountHex}</div>
            </div>

            {/* QR */}
            <div
                className={`${styles.qrArea} ${isTerminal ? styles.qrAreaDimmed : ""}`}
            >
                {invoiceLoading ? (
                    <div className={styles.qrSkeleton}>
                        <span className={styles.skeletonText}>
                            Generating invoice…
                        </span>
                    </div>
                ) : invoiceAddress && !isTerminal ? (
                    <QRCodeSVG
                        value={invoiceAddress}
                        size={220}
                        level="M"
                        bgColor="transparent"
                        fgColor="#e8e8f0"
                    />
                ) : (
                    <div className={styles.qrSkeleton}>
                        <span className={styles.skeletonText}>
                            {isTerminal ? status : "—"}
                        </span>
                    </div>
                )}
            </div>

            {/* Status */}
            <StatusBadge status={status} paying={paying} />

            {/* Expiry */}
            {expiresAt && status === "pending" && (
                <p className={styles.expiry}>
                    Expires {new Date(expiresAt).toLocaleTimeString()}
                </p>
            )}

            {/* Error */}
            {error && <p className={styles.errorMsg}>{error.message}</p>}

            {/* Actions */}
            <div className={styles.actions}>
                {invoiceAddress && !isTerminal && (
                    <button
                        className={styles.copyBtn}
                        onClick={onCopy}
                        type="button"
                    >
                        {copied ? "✓ Copied" : "Copy invoice"}
                    </button>
                )}

                {/* Demo pay button — simulates a wallet paying the invoice */}
                {invoiceAddress && status === "pending" && !paying && (
                    <button
                        className={styles.retryBtn}
                        onClick={onPay}
                        type="button"
                    >
                        ⬡ Pay with testnet node
                    </button>
                )}

                {paying && (
                    <button
                        className={styles.retryBtn}
                        disabled
                        type="button"
                        style={{ opacity: 0.6, cursor: "not-allowed" }}
                    >
                        Sending…
                    </button>
                )}

                {(isTerminal || error) && status !== "success" && (
                    <button
                        className={styles.copyBtn}
                        onClick={onRegenerate}
                        type="button"
                    >
                        Generate new invoice
                    </button>
                )}
            </div>
        </>
    );
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView({
    hash,
    amount,
    asset,
    onNewPayment,
}: {
    hash: HexString;
    amount: number;
    asset: AssetId;
    onNewPayment: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        await navigator.clipboard.writeText(hash).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className={styles.successView}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.successTitle}>Payment confirmed</h2>
            <p className={styles.successAmount}>
                {amount} {asset}
            </p>

            <div className={styles.hashBlock}>
                <span className={styles.hashLabel}>Payment hash</span>
                <button
                    className={styles.hashValue}
                    onClick={copy}
                    title="Click to copy"
                >
                    <code>
                        {hash.slice(0, 18)}…{hash.slice(-8)}
                    </code>
                    <span className={styles.hashCopyHint}>
                        {copied ? "✓" : "copy"}
                    </span>
                </button>
            </div>

            <button
                className={styles.retryBtn}
                onClick={onNewPayment}
                type="button"
            >
                New payment
            </button>
        </div>
    );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, paying }: { status: string; paying?: boolean }) {
    const config: Record<string, { label: string; cls: string }> = {
        idle: {
            label: paying ? "Sending payment…" : "Initializing…",
            cls: styles.statusIdle,
        },
        pending: {
            label: paying ? "Sending payment…" : "Waiting for payment",
            cls: styles.statusPending,
        },
        processing: { label: "Processing…", cls: styles.statusProcessing },
        success: { label: "Payment confirmed", cls: styles.statusSuccess },
        failed: { label: "Payment failed", cls: styles.statusFailed },
        expired: { label: "Invoice expired", cls: styles.statusFailed },
    };
    const { label, cls } = config[status] ?? config.idle;
    return <div className={`${styles.statusBadge} ${cls}`}>{label}</div>;
}
