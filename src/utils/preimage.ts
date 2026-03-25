import type { HexString } from "../types/common.js";

/**
 * Generate a cryptographically random 32-byte preimage.
 *
 * Uses `crypto.getRandomValues` which is available in:
 * - All modern browsers
 * - Node.js >= 19 (global `crypto`)
 * - Node.js 15–18 via `globalThis.crypto`
 *
 * The returned value is a 0x-prefixed 64-character hex string,
 * which is the format expected by the Fiber `new_invoice` RPC.
 *
 * @example
 * const preimage = generatePreimage();
 * // "0x3f2a1b..." (64 hex chars after 0x)
 */
export function generatePreimage(): HexString {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/**
 * Validate that a value is a well-formed 32-byte preimage hex string.
 * Returns true if the string is 0x-prefixed and exactly 64 hex chars.
 *
 * @example
 * isValidPreimage("0x" + "ab".repeat(32)) // true
 * isValidPreimage("0xdeadbeef")            // false (too short)
 */
export function isValidPreimage(value: unknown): value is HexString {
  return (
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{64}$/.test(value)
  );
}