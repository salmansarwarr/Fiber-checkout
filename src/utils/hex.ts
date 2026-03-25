import type { HexString } from "../types/common.js";

// ─── Type guards ──────────────────────────────────────────────────────────────

/**
 * Returns true if the value is a valid 0x-prefixed hex string.
 */
export function isHexString(value: unknown): value is HexString {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

// ─── Encoding ─────────────────────────────────────────────────────────────────

/**
 * Encode a `bigint` as a 0x-prefixed hex string.
 * Returns `"0x0"` for zero.
 *
 * @example toHex(100n) // "0x64"
 * @example toHex(0n)   // "0x0"
 */
export function toHex(value: bigint): HexString {
  if (value < 0n) {
    throw new RangeError(`toHex: value must be non-negative, got ${value}`);
  }
  return `0x${value.toString(16)}`;
}

/**
 * Encode a `number` as a 0x-prefixed hex string.
 * The number must be a non-negative safe integer.
 *
 * @example toHexNumber(255) // "0xff"
 */
export function toHexNumber(value: number): HexString {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `toHexNumber: value must be a non-negative safe integer, got ${value}`
    );
  }
  return toHex(BigInt(value));
}

// ─── Decoding ─────────────────────────────────────────────────────────────────

/**
 * Decode a 0x-prefixed hex string to a `bigint`.
 *
 * @example fromHex("0x64") // 100n
 * @example fromHex("0x0")  // 0n
 */
export function fromHex(hex: HexString): bigint {
  if (!isHexString(hex)) {
    throw new TypeError(`fromHex: invalid hex string "${hex}"`);
  }
  if (hex === "0x" || hex === "0x0") return 0n;
  return BigInt(hex);
}

/**
 * Decode a 0x-prefixed hex string to a `number`.
 * Throws if the value exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @example fromHexNumber("0x64") // 100
 */
export function fromHexNumber(hex: HexString): number {
  const big = fromHex(hex);
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(
      `fromHexNumber: value ${big} exceeds MAX_SAFE_INTEGER — use fromHex() for bigint`
    );
  }
  return Number(big);
}

// ─── Shannon ↔ CKB / UDT conversions ─────────────────────────────────────────

const SHANNON_PER_CKB = 100_000_000n; // 1 CKB = 10^8 shannon

/**
 * Convert a CKB decimal amount to shannons as a `bigint`.
 * Accepts up to 8 decimal places.
 *
 * @example ckbToShannon(1)    // 100_000_000n
 * @example ckbToShannon(0.5)  // 50_000_000n
 */
export function ckbToShannon(ckb: number): bigint {
  if (ckb < 0) {
    throw new RangeError(`ckbToShannon: amount must be non-negative, got ${ckb}`);
  }
  // Use string manipulation to avoid floating-point precision issues
  const [intPart = "0", fracPart = ""] = ckb.toFixed(8).split(".");
  const padded = fracPart.padEnd(8, "0").slice(0, 8);
  return BigInt(intPart) * SHANNON_PER_CKB + BigInt(padded);
}

/**
 * Convert a shannon `bigint` to a CKB decimal number.
 *
 * @example shannonToCkb(100_000_000n) // 1
 * @example shannonToCkb(50_000_000n)  // 0.5
 */
export function shannonToCkb(shannon: bigint): number {
  const whole = shannon / SHANNON_PER_CKB;
  const frac = shannon % SHANNON_PER_CKB;
  return Number(whole) + Number(frac) / 100_000_000;
}

/**
 * Convert a CKB decimal amount to a 0x-prefixed shannon hex string.
 * This is the format expected by Fiber RPC `amount` fields.
 *
 * @example ckbToShannonHex(1)   // "0x5f5e100"
 * @example ckbToShannonHex(0.5) // "0x2faf080"
 */
export function ckbToShannonHex(ckb: number): HexString {
  return toHex(ckbToShannon(ckb));
}

/**
 * Convert a 0x-prefixed shannon hex string to a CKB decimal number.
 *
 * @example shannonHexToCkb("0x5f5e100") // 1
 */
export function shannonHexToCkb(hex: HexString): number {
  return shannonToCkb(fromHex(hex));
}

/**
 * Format a shannon hex amount for human display with the asset symbol.
 *
 * @example formatAmount("0x5f5e100", "CKB")  // "1 CKB"
 * @example formatAmount("0x5f5e100", "RUSD") // "1 RUSD"
 */
export function formatAmount(shannonHex: HexString, symbol: string): string {
  const ckb = shannonHexToCkb(shannonHex);
  // Trim trailing zeros after decimal
  const formatted = ckb.toFixed(8).replace(/\.?0+$/, "");
  return `${formatted} ${symbol}`;
}