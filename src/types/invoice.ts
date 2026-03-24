import type { HexString, HashAlgorithm, Script } from "./common.js";

// ─── Enums ───────────────────────────────────────────────────────────────────

/** The Fiber network currency / chain identifier */
export type Currency = "Fibb" | "Fibt" | "Fibd";

/**
 * Lifecycle status of a CKB invoice.
 *
 * State machine:
 *   Open → Received → Paid
 *   Open → Cancelled
 *   Open → Expired
 */
export type CkbInvoiceStatus =
    | "Open"
    | "Cancelled"
    | "Expired"
    | "Received"
    | "Paid";

// ─── Invoice attributes ──────────────────────────────────────────────────────

export type Attribute =
    | { FinalHtlcMinimumExpiryDelta: HexString }
    | { ExpiryTime: HexString }
    | { Description: string }
    | { FallbackAddr: string }
    | { UdtScript: HexString }
    | { PayeePublicKey: string }
    | { HashAlgorithm: number }
    | { Feature: HexString };

// ─── Invoice data structures ─────────────────────────────────────────────────

export interface InvoiceData {
    /** Unix timestamp as a 0x-prefixed u128 hex string (milliseconds) */
    timestamp: HexString;
    /** SHA-256 or CKB-hash of the payment preimage */
    payment_hash: HexString;
    /** Variable-length list of invoice attributes */
    attrs: Attribute[];
}

export interface CkbInvoice {
    currency: Currency;
    /** Amount in shannons (or UDT base units) as 0x-prefixed u128 hex, omitted for 0-amount invoices */
    amount?: HexString;
    /** Hex-encoded ECDSA signature over the invoice data */
    signature?: string;
    data: InvoiceData;
}

// ─── RPC param / result types ────────────────────────────────────────────────

/** Parameters for `new_invoice` */
export interface NewInvoiceParams {
    /** Amount in shannons (CKB) or UDT base units — 0x-prefixed u128 hex */
    amount: HexString;
    description?: string;
    currency: Currency;
    /**
     * 32-byte payment preimage — 0x-prefixed hex.
     * If omitted alongside `payment_hash`, the node generates a random preimage.
     * Mutually exclusive with `payment_hash`.
     */
    payment_preimage?: HexString;
    /**
     * 32-byte payment hash — 0x-prefixed hex.
     * Use for "hold invoices" where you supply the hash but keep the preimage secret.
     * Mutually exclusive with `payment_preimage`.
     */
    payment_hash?: HexString;
    /** Invoice expiry in seconds — 0x-prefixed u64 hex */
    expiry?: HexString;
    fallback_address?: string;
    /** Final HTLC minimum expiry delta in milliseconds — 0x-prefixed u64 hex (min 16h, max 14d) */
    final_expiry_delta?: HexString;
    udt_type_script?: Script;
    hash_algorithm?: HashAlgorithm;
    allow_mpp?: boolean;
    allow_trampoline_routing?: boolean;
}

/** Result from `new_invoice` */
export interface InvoiceResult {
    /** Bech32m-encoded invoice string (e.g. `fib1...`) */
    invoice_address: string;
    invoice: CkbInvoice;
}

/** Parameters for `get_invoice` and `cancel_invoice` */
export interface InvoiceParams {
    payment_hash: HexString;
}

/** Result from `get_invoice` */
export interface GetInvoiceResult {
    invoice_address: string;
    invoice: CkbInvoice;
    status: CkbInvoiceStatus;
}

/** Parameters for `parse_invoice` */
export interface ParseInvoiceParams {
    invoice: string;
}

/** Result from `parse_invoice` */
export interface ParseInvoiceResult {
    invoice: CkbInvoice;
}
