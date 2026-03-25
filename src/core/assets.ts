import type { Script } from "../types/common.js";

// ─── Asset definitions ────────────────────────────────────────────────────────

export interface AssetConfig {
  /** Human-readable asset name */
  name: string;
  /** Display symbol */
  symbol: string;
  /** Decimal places for display (CKB = 8, RUSD = 8) */
  decimals: number;
  /**
   * UDT type script. `null` for native CKB — the Fiber node uses
   * the absence of a script to mean "native CKB payment".
   */
  udtTypeScript: Script | null;
}

// ─── RUSD UDT script (testnet) ────────────────────────────────────────────────
// Verified from live node_info response at http://127.0.0.1:8227

const RUSD_TESTNET_SCRIPT: Script = {
  code_hash:
    "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a",
  hash_type: "type",
  args: "0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b",
};

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Built-in asset configurations.
 *
 * Keys are stable identifiers used throughout the library
 * (e.g. as the `asset` prop on `<FiberCheckout />`).
 */
export const ASSETS = {
  CKB: {
    name: "CKB",
    symbol: "CKB",
    decimals: 8,
    udtTypeScript: null,
  },
  RUSD: {
    name: "RUSD",
    symbol: "RUSD",
    decimals: 8,
    udtTypeScript: RUSD_TESTNET_SCRIPT,
  },
} as const satisfies Record<string, AssetConfig>;

export type AssetId = keyof typeof ASSETS;

/**
 * Look up an asset config by ID.
 * Throws if the ID is not registered.
 */
export function getAsset(id: AssetId): AssetConfig {
  const asset = ASSETS[id];
  if (!asset) {
    throw new Error(
      `Unknown asset "${id}". Available assets: ${Object.keys(ASSETS).join(", ")}`
    );
  }
  return asset;
}

/**
 * Returns true if the asset uses a UDT type script (i.e. is not native CKB).
 */
export function isUdtAsset(asset: AssetConfig): boolean {
  return asset.udtTypeScript !== null;
}