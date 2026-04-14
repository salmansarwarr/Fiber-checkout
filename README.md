# fiber-checkout

> Drop-in React components for accepting CKB and RUSD payments via the [Fiber Network](https://github.com/nervosnetwork/fiber).

[![npm](https://img.shields.io/npm/v/fiber-checkout)](https://www.npmjs.com/package/fiber-checkout)
[![license](https://img.shields.io/npm/l/fiber-checkout)](./LICENSE)

---

## Overview

`fiber-checkout` wraps the Fiber Network payment API so web developers can add a complete payment UI with a single React component — no raw RPC knowledge needed. It handles invoice generation, QR code rendering, payment status polling, and expiry detection out of the box.

```tsx
import { FiberCheckout } from "fiber-checkout";

<FiberCheckout
    amount="0x5f5e100"
    asset="CKB"
    nodeUrl="/api/fiber-rpc"
    onSuccess={(hash) => console.log("Paid:", hash)}
    onExpired={() => console.log("Expired")}
/>;
```

**What it does under the hood:**

- Calls `new_invoice` on your Fiber node to generate a Bech32m invoice
- Renders the invoice as a scannable QR code
- Polls `get_invoice` every 2s and maps node statuses to readable checkout states
- Detects expiry client-side without waiting for the node
- Surfaces all errors as typed `FiberError` instances

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Deployment modes](#deployment-modes)
- [Component reference](#component-reference)
- [Hooks](#hooks)
- [Utilities](#utilities)
- [Error handling](#error-handling)
- [Assets](#assets)
- [Architecture](#architecture)
- [Running tests](#running-tests)
- [Demo](#demo)
- [Project structure](#project-structure)

---

## Installation

```bash
npm install fiber-checkout
```

Requires React 18+, TypeScript strict mode, Node.js 18+.

---

## Technical Rationale

### Why use a proxy? (`nodeUrl`)

In production, the browser should **never** talk directly to your Fiber node RPC.

1. **Security**: Publicly exposing your node's RPC port allows anyone to query your node's entire state or attempt to use administrative methods. A proxy allows you to whitelist only `new_invoice` and `get_invoice`.
2. **CORS**: Fiber nodes typically do not serve CORS headers. Trying to `fetch()` from a browser to a node on a different domain/IP will be blocked by the browser.
3. **Mixed Content**: Public web apps are served over HTTPS. Fiber nodes often run over plain HTTP. Browsers block "Mixed Content" (HTTPS calling HTTP). A server-side proxy handles the secure-to-insecure transition internally.
4. **Privacy**: Using a proxy hides your node's real IP address from the user's browser.

### Peer Dependencies (@nervosnetwork/fiber-js)

`@nervosnetwork/fiber-js` is defined as a **peer dependency** rather than a direct dependency for several reasons:

1. **Shared State**: If your application already uses `fiber-js` (e.g., to manage a WASM-based in-browser node), including it as a direct dependency could result in two different versions of the SDK being bundled, leading to type mismatches and bloated bundle sizes.
2. **User Choice**: `fiber-checkout` works in two modes. If you only use the **RPC mode** (via a proxy), you don't actually need the full `fiber-js` SDK. By making it a peer dependency, we keep the core library extremely lightweight for RPC-only users.
3. **WASM Compatibility**: The `FiberWasmBackend` adapter requires `fiber-js`. Users who want WASM support can install the version of `fiber-js` they prefer.

---

## Quick start

### 1. Set up the RPC proxy

In production, the browser must never talk directly to your Fiber node — it would expose your node's full API. Add a server-side proxy that whitelists only `new_invoice` and `get_invoice`.

**Next.js App Router** (`app/api/fiber-rpc/route.ts`):

```ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED = new Set(["new_invoice", "get_invoice"]);
const NODE_URL = process.env.FIBER_NODE_URL;

export async function POST(req: NextRequest) {
    if (!NODE_URL)
        return NextResponse.json({ error: "Not configured" }, { status: 500 });

    const { id, method, params } = await req.json();

    if (!ALLOWED.has(method)) {
        return NextResponse.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: "Method not allowed" },
        });
    }

    const res = await fetch(NODE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    return NextResponse.json(await res.json());
}
```

Set the node URL in `.env.local`:

```env
FIBER_NODE_URL=http://127.0.0.1:8227
```

Full reference implementations (App Router + Pages Router) are in [`examples/nextjs-proxy/`](./examples/nextjs-proxy/).

### 2. Add the component

```tsx
import { FiberCheckout, ckbToShannonHex } from "fiber-checkout";
import type { HexString } from "fiber-checkout";

export default function PaymentPage() {
    const handleSuccess = (paymentHash: HexString) => {
        console.log("Payment confirmed:", paymentHash);
    };

    return (
        <FiberCheckout
            amount={ckbToShannonHex(1)}
            asset="CKB"
            nodeUrl="/api/fiber-rpc"
            onSuccess={handleSuccess}
            onExpired={() => console.log("Invoice expired")}
            onError={(err) => console.error(err.code, err.message)}
        />
    );
}
```

---

## Deployment modes

### Production — server-side proxy (recommended)

```
Browser  →  /api/fiber-rpc (your server)  →  Fiber node
```

The node URL stays on the server. The browser only calls your proxy route.

```tsx
<FiberCheckout nodeUrl="/api/fiber-rpc" amount="0x5f5e100" asset="CKB" />
```

### Local development — direct RPC

```
Browser  →  http://127.0.0.1:8227 (local node)
```

Safe only in trusted local environments. A `console.warn` is always emitted.

```tsx
<FiberCheckout
    nodeUrl="http://127.0.0.1:8227"
    dangerouslyAllowDirectRpc={true}
    amount="0x5f5e100"
    asset="CKB"
/>
```

Never set `dangerouslyAllowDirectRpc={true}` in production — it exposes your node's full API to the browser.

---

## Component reference

### `<FiberCheckout />`

| Prop                        | Type                          | Default  | Description                                                                  |
| --------------------------- | ----------------------------- | -------- | ---------------------------------------------------------------------------- |
| `amount`                    | `HexString`                   | required | Amount in shannons as `0x`-prefixed hex. Use `ckbToShannonHex()` to convert. |
| `asset`                     | `"CKB" \| "RUSD"`             | required | Asset to accept. Determines the UDT type script sent to the node.            |
| `nodeUrl`                   | `string`                      | required | RPC endpoint. Use a proxy route in production.                               |
| `onSuccess`                 | `(hash: HexString) => void`   | —        | Called once when payment status reaches `Paid`.                              |
| `onExpired`                 | `() => void`                  | —        | Called when the invoice expires.                                             |
| `onError`                   | `(err: FiberError) => void`   | —        | Called on invoice generation or polling errors.                              |
| `dangerouslyAllowDirectRpc` | `boolean`                     | `false`  | Allow direct RPC to bare IP addresses. Dev only.                             |
| `expirySeconds`             | `number`                      | `3600`   | Invoice lifetime in seconds.                                                 |
| `description`               | `string`                      | —        | Payment description embedded in the invoice.                                 |
| `qrSize`                    | `number`                      | `240`    | QR code size in pixels.                                                      |
| `customAssets`              | `Record<string, AssetConfig>` | —        | Registry of additional tokens. See [Custom Assets](#custom-assets).          |

**Status-driven UI:**

| Status       | UI state                                        |
| ------------ | ----------------------------------------------- |
| `idle`       | Initializing, no QR yet                         |
| `pending`    | QR visible, copy button shown, awaiting payment |
| `processing` | Payment received by node, settling              |
| `success`    | Payment confirmed                               |
| `failed`     | Invoice cancelled, retry shown                  |
| `expired`    | Invoice expired, retry shown                    |

---

## Hooks

Use the hooks directly to build a fully custom payment UI.

### `useFiberInvoice(options)`

Generates a Fiber invoice on mount. Re-generates when `amount`, `asset`, or `nodeUrl` changes.

```tsx
const {
    invoiceAddress, // Bech32m invoice string — pass to QR renderer
    invoice, // raw CkbInvoice object
    paymentHash, // 0x-prefixed hex — needed for polling
    expiresAt, // Unix ms timestamp
    isLoading,
    error,
    regenerate, // () => void — generate a fresh invoice
} = useFiberInvoice({
    nodeUrl: "/api/fiber-rpc",
    amount: "0x5f5e100",
    asset: "CKB",
    expirySeconds: 3600,
    description: "Order #1234",
});
```

### `useFiberPayment(options)`

Polls `get_invoice` every 2 seconds. Starts when `paymentHash` is provided, stops on terminal states.

```tsx
const {
    status, // "idle" | "pending" | "processing" | "success" | "failed" | "expired"
    feePaid, // HexString | null
    isLoading,
    error,
    poll, // () => void — trigger an immediate poll
} = useFiberPayment({
    nodeUrl: "/api/fiber-rpc",
    paymentHash,
    expiresAt,
    onSuccess: (hash) => console.log("Paid:", hash),
    onExpired: () => console.log("Expired"),
    onError: (err) => console.error(err),
    pollIntervalMs: 2000,
});
```

**Node status → hook status mapping:**

| Fiber node  | Hook         |
| ----------- | ------------ |
| `Open`      | `pending`    |
| `Received`  | `processing` |
| `Paid`      | `success`    |
| `Cancelled` | `failed`     |
| `Expired`   | `expired`    |

---

## Utilities

```ts
import {
    ckbToShannonHex,
    shannonHexToCkb,
    ckbToShannon,
    shannonToCkb,
    formatAmount,
    toHex,
    fromHex,
    generatePreimage,
    isValidPreimage,
    ASSETS,
    getAsset,
    isUdtAsset,
} from "fiber-checkout";

// Amount conversion
ckbToShannonHex(1); // "0x5f5e100"
shannonHexToCkb("0x5f5e100"); // 1
formatAmount("0x5f5e100", "CKB"); // "1 CKB"

// Hex utilities
toHex(255n); // "0xff"
fromHex("0xff"); // 255n

// Preimage
generatePreimage(); // "0x..." (32 cryptographically random bytes)
isValidPreimage(x); // boolean

// Asset registry
getAsset("CKB"); // AssetConfig
isUdtAsset(ASSETS.RUSD); // true
```

---

## Error handling

```ts
import { FiberError } from "fiber-checkout";

function handleError(err: FiberError) {
    switch (err.code) {
        case "RPC_ERROR":
            // Node returned a JSON-RPC error
            // err.rpcCode: number, err.method: string
            break;
        case "NETWORK_ERROR":
            // fetch() failed
            break;
        case "DIRECT_RPC_BLOCKED":
            // Bare IP without dangerouslyAllowDirectRpc
            break;
        case "INVALID_RESPONSE":
            // Non-JSON response from node
            break;
        case "REQUEST_TIMEOUT":
            // Exceeded timeoutMs (default 30s)
            break;
    }
}

// Type guard
if (FiberError.is(err)) {
    console.log(err.code, err.message);
}
```

---

## Assets

| Asset  | Symbol | Decimals | UDT type script                                                                 |
| ------ | ------ | -------- | ------------------------------------------------------------------------------- |
| `CKB`  | CKB    | 8        | None (native)                                                                   |
| `RUSD` | RUSD   | 8        | `code_hash: 0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a` |
| `SEAL` | SEAL   | 8        | Pending — type script not yet deployed on testnet                               |

---

## Custom Assets

You can extend the library to support any UDT (User Defined Token) without waiting for a new package release. Pass your token definitions to the `customAssets` prop:

```tsx
const MY_TOKEN = {
    name: "My Token",
    symbol: "MTK",
    decimals: 8,
    udtTypeScript: {
        code_hash: "0x...",
        hash_type: "type",
        args: "0x...",
    },
    supported: true,
};

<FiberCheckout
    amount="0x..."
    asset="MTK"
    nodeUrl="/api/fiber-rpc"
    customAssets={{ MTK: MY_TOKEN }}
/>;
```

---

## Architecture & Peer Exports

`fiber-checkout` is designed to be flexible:

- **Standalone Mode**: Use the library with just a `nodeUrl`. It uses a lightweight internal RPC client. No need to install `@nervosnetwork/fiber-js`.
- **Integrated Mode**: Use `FiberWasmBackend` to wrap an existing `Fiber` instance from `@nervosnetwork/fiber-js`.

```tsx
import { Fiber } from "@nervosnetwork/fiber-js";
import { FiberWasmBackend, FiberCheckout } from "fiber-checkout";

// Assuming 'fiber' is an initialized instance
const backend = new FiberWasmBackend(fiber);

<FiberCheckout
    amount="..."
    asset="CKB"
    backend={backend} // Direct integration with your in-browser node
/>;
```

We **re-export** core types and the `FiberWasmBackend` adapter so you can build advanced flows without importing deeply into the package internals.

---

## SEAL Verification

Since public testnet nodes do not currently whitelist SEAL, it cannot be verified on the public Fiber testnet today.

### Local Verification Path

To verify SEAL behavior, set up a minimal local Fiber node:

1. **Install Fiber**: Follow the [Fiber Network](https://github.com/nervosnetwork/fiber) setup guide.
2. **Whitelist SEAL**: Add the SEAL type script to your `config.yml` under `udt_whitelist`.
3. **Configure Checkout**:
    - In `src/core/assets.ts`, set the `udtTypeScript` for SEAL.
    - Set `supported: true` for the SEAL entry.
4. **Run Integration Test**:
    ```bash
    npm run test:node -- --asset SEAL --node-url http://127.0.0.1:8227
    ```

**What is required for public verification?**
SEAL will become verifiable on public testnet once the SEAL contract is deployed to CKB Testnet and public Fiber nodes update their `udt_whitelist` to include it.

---

## Architecture

```
src/
├── core/
│   ├── fiber-error.ts      # Typed error class with 5 error codes
│   ├── rpc-client.ts       # JSON-RPC 2.0 client + direct-IP security guard
│   └── assets.ts           # CKB + RUSD asset registry with UDT scripts
├── hooks/
│   ├── use-fiber-invoice.ts  # Invoice generation, preimage, regenerate()
│   └── use-fiber-payment.ts  # Polling, status mapping, client-side expiry
├── components/
│   └── FiberCheckout.tsx   # Drop-in UI component
├── utils/
│   ├── hex.ts              # Shannon ↔ CKB conversions, hex encode/decode
│   └── preimage.ts         # crypto.getRandomValues 32-byte preimage
└── types/
    ├── common.ts           # HexString, Pubkey, Script
    ├── invoice.ts          # Invoice RPC param/result types
    ├── payment.ts          # Payment RPC param/result types
    └── channel.ts          # Channel RPC param/result types
```

**Data flow:**

```
useFiberInvoice → FiberRpcClient.newInvoice() → Fiber node: new_invoice
                → returns { invoiceAddress, paymentHash, expiresAt }

useFiberPayment → FiberRpcClient.getInvoice() every 2s → Fiber node: get_invoice
                → maps CkbInvoiceStatus → CheckoutStatus
                → fires onSuccess / onExpired callbacks

<FiberCheckout /> → composes both hooks → QR + status badge + action buttons
```

---

## Running tests

See **[docs/TESTING.md](./docs/TESTING.md)** for the complete testing guide including unit tests, testnet integration tests, and demo testing.

```bash
npm test              # unit tests (no node required)
npm run coverage      # with ≥80% coverage threshold
npm run typecheck     # TypeScript strict mode
npm run test:testnet  # testnet integration (node required)
npm run verify        # typecheck + test + build + bundle size
```

---

## Demo

Run locally against your Fiber testnet node:

```bash
cd examples/demo
cp .env.example .env.local
# Edit .env.local — set VITE_FIBER_NODE_URL and VITE_FIBER_INVOICE_NODE_URL
npm install
npm run dev
# Open http://localhost:5173
```

See [docs/TESTING.md](./docs/TESTING.md) for full demo testing instructions.

---

## License

MIT
