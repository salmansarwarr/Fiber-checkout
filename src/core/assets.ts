import type { Script } from "../types/common.js";

// ─── Asset definitions ────────────────────────────────────────────────────────

export interface AssetConfig {
    name: string;
    symbol: string;
    decimals: number;
    udtTypeScript: Script | null;
    /**
     * Whether this asset is supported on the current testnet.
     * SEAL requires a node with SEAL configured in udt_whitelist.
     */
    supported: boolean;
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
// ─── SEAL UDT script (testnet) ────────────────────────────────────────────────
// SEAL is an xUDT token on CKB. The type script must be filled in once SEAL
// is deployed on the CKB testnet and its contract address is confirmed.
//
// To enable SEAL on your Fiber node once the type script is known:
//   1. Add it to config.yml under udt_whitelist
//   2. Replace null below with the real Script object
//
// ⚠️  Currently null — SEAL payments will throw until this is populated.
const SEAL_TESTNET_SCRIPT: Script | null = null;

export const ASSETS = {
    CKB: {
        name: "CKB",
        symbol: "CKB",
        decimals: 8,
        udtTypeScript: null,
        supported: true,
    },
    RUSD: {
        name: "RUSD",
        symbol: "RUSD",
        decimals: 8,
        udtTypeScript: RUSD_TESTNET_SCRIPT,
        supported: true,
    },
    SEAL: {
        name: "SEAL",
        symbol: "SEAL",
        decimals: 8,
        udtTypeScript: SEAL_TESTNET_SCRIPT,
        supported: false, // ← type script pending deployment
    },
} as const satisfies Record<string, AssetConfig>;

export type AssetId = keyof typeof ASSETS;

/**
 * Look up an asset config by ID from a combined registry.
 * @param id The asset identifier (e.g. "CKB", "RUSD", or a custom ID)
 * @param customAssets Optional record of additional assets to check
 */
export function getAsset(
    id: string,
    customAssets?: Record<string, AssetConfig>,
): AssetConfig {
    const registry: Record<string, AssetConfig> = {
        ...ASSETS,
        ...customAssets,
    };
    const asset = registry[id];

    if (!asset) {
        throw new Error(
            `Unknown asset "${id}". Registered assets: ${Object.keys(registry).join(", ")}`,
        );
    }
    return asset;
}

/**
 * Returns true if the asset is ready for use on the current network.
 */
export function isAssetSupported(asset: AssetConfig): boolean {
    return asset.supported;
}

/**
 * Returns true if the asset uses a UDT type script (i.e. is not native CKB).
 */
export function isUdtAsset(asset: AssetConfig): boolean {
    return asset.udtTypeScript !== null;
}
