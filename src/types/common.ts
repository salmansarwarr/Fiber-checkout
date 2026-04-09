// ─── Shared primitives ───────────────────────────────────────────────────────
// Re-exported from @nervosnetwork/fiber-js for type compatibility.

export type { HexString, HashAlgorithm } from "@nervosnetwork/fiber-js";
export type { Script } from "@nervosnetwork/fiber-js";

/** Compressed secp256k1 public key — 66-char hex, no 0x prefix */
export type Pubkey = string;
