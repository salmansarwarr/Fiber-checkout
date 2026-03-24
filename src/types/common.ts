// ─── Shared primitives ───────────────────────────────────────────────────────

/** 0x-prefixed hex string */
export type HexString = `0x${string}`;

/** Compressed secp256k1 public key — 66-char hex, no 0x prefix */
export type Pubkey = string;

export type HashAlgorithm = "ckb_hash" | "sha256";

// ─── Script (CKB cell script) ────────────────────────────────────────────────

export interface Script {
    code_hash: HexString;
    hash_type: "type" | "data" | "data1" | "data2";
    args: HexString;
}
