# fiber-checkout — Next.js Integration Guide

> Add a complete Fiber Network payment flow to your Next.js app in under 15 minutes. No raw RPC knowledge, no hex encoding, no Rust required.

---

## What You'll Build

A Next.js page that displays a `<FiberCheckout />` component. When a user selects an asset and amount, a QR code appears. A Fiber wallet scans it, sends the payment, and your app receives a success callback — all handled automatically.

---

## Prerequisites

- Node.js 18+
- A Next.js 14+ project (App Router or Pages Router)
- Access to a Fiber testnet node — either your own local node or the public Nervos testnet node at `http://18.162.235.225:8227`

---

## Step 1 — Install

```bash
npm install fiber-checkout
```

That's the only dependency. `fiber-checkout` ships as a dual CJS + ESM package with full TypeScript types included.

---

## Step 2 — Set Up the Server-Side Proxy

> **Why is this needed?**
> Fiber nodes run on HTTP and don't serve CORS headers. Browsers block direct calls from HTTPS pages to HTTP endpoints (Mixed Content). A server-side proxy keeps your node URL private and handles the HTTPS → HTTP transition internally. It also lets you whitelist only the RPC methods your app needs.

### App Router (Next.js 14+)

Create `app/api/fiber-rpc/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice"]);
const NODE_URL = process.env.FIBER_NODE_URL;

export async function POST(req: NextRequest) {
  if (!NODE_URL) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "FIBER_NODE_URL not configured" },
    });
  }

  const body = await req.json();
  const { id, method, params } = body;

  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not allowed: ${method}` },
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

### Pages Router (Next.js 12–13)

Create `pages/api/fiber-rpc.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from "next";

const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice"]);
const NODE_URL = process.env.FIBER_NODE_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  if (!NODE_URL) {
    return res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "FIBER_NODE_URL not configured" },
    });
  }

  const { id, method, params } = req.body;

  if (!ALLOWED_METHODS.has(method)) {
    return res.status(403).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not allowed: ${method}` },
    });
  }

  const upstream = await fetch(NODE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  res.status(200).json(await upstream.json());
}
```

---

## Step 3 — Configure Your Environment

Create `.env.local` in your project root:

```env
FIBER_NODE_URL=http://18.162.235.225:8227
```

This points at the Nervos public Fiber testnet node. For production, replace with your own node URL. This value **never leaves the server** — the browser only ever calls `/api/fiber-rpc`.

> **Using a reverse proxy on a different domain?**
> If you serve your API at `https://api.yourdomain.com/fiber-rpc`, set `nodeUrl` to that URL directly. No `dangerouslyAllowDirectRpc` flag needed — HTTPS URLs on named domains are always treated as safe.

---

## Step 4 — Add the Component

```tsx
"use client"; // App Router only

import { FiberCheckout } from "fiber-checkout";
import type { HexString } from "fiber-checkout";

export default function PaymentPage() {
  function handleSuccess(paymentHash: HexString) {
    console.log("Payment confirmed:", paymentHash);
    // fulfil order, redirect, update UI, etc.
  }

  function handleExpired() {
    console.log("Invoice expired — show retry UI");
  }

  function handleError(err: Error) {
    console.error("Payment error:", err.message);
  }

  return (
    <FiberCheckout
      amount="0x3b9aca00"   // 1 CKB in shannons (hex)
      asset="CKB"
      nodeUrl="/api/fiber-rpc"
      onSuccess={handleSuccess}
      onExpired={handleExpired}
      onError={handleError}
    />
  );
}
```

> **Amount encoding:** Fiber amounts are u128 values in shannons, expressed as 0x-prefixed hex strings. Use the built-in helper:
> ```ts
> import { ckbToShannonHex } from "fiber-checkout";
> const amount = ckbToShannonHex(1); // "0x3b9aca00"
> ```

---

## Step 5 — Accepting RUSD

Change the `asset` prop — the component handles the UDT type script automatically:

```tsx
<FiberCheckout
  amount={ckbToShannonHex(10)}
  asset="RUSD"
  nodeUrl="/api/fiber-rpc"
  onSuccess={handleSuccess}
  onExpired={handleExpired}
/>
```

---

## Step 6 — Adding a Custom Asset

If you want to support a token beyond CKB and RUSD, pass a `customAssets` map:

```tsx
import { FiberCheckout } from "fiber-checkout";
import type { AssetConfig } from "fiber-checkout";

const MY_TOKEN: AssetConfig = {
  id: "MYTOKEN",
  name: "My Token",
  decimals: 8,
  supported: true,
  udtTypeScript: {
    codeHash: "0xabc123...",
    hashType: "type",
    args: "0x",
  },
};

<FiberCheckout
  amount="0x5f5e100"
  asset="MYTOKEN"
  customAssets={{ MYTOKEN: MY_TOKEN }}
  nodeUrl="/api/fiber-rpc"
  onSuccess={handleSuccess}
/>
```

No library version bump required — custom assets are resolved at runtime.

---

## Step 7 — Using the Hooks Directly (Optional)

If you want to build your own UI, import the hooks individually:

```tsx
import { useFiberInvoice, useFiberPayment, ckbToShannonHex } from "fiber-checkout";

function CustomPayment() {
  const { invoiceAddress, paymentHash, expiresAt, isLoading, error } = useFiberInvoice({
    nodeUrl: "/api/fiber-rpc",
    amount: ckbToShannonHex(1),
    asset: "CKB",
    expirySeconds: 3600,
  });

  const { status, feePaid } = useFiberPayment({
    nodeUrl: "/api/fiber-rpc",
    paymentHash,
    expiresAt,
    onSuccess: (hash) => console.log("Paid:", hash),
    onExpired: () => console.log("Expired"),
  });

  // status: "idle" | "pending" | "processing" | "success" | "failed" | "expired"
  // feePaid: hex string of routing fee in shannons, available after success

  if (isLoading) return <p>Generating invoice...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <p>Invoice: {invoiceAddress}</p>
      <p>Status: {status}</p>
      {feePaid && <p>Fee paid: {feePaid}</p>}
    </div>
  );
}
```

---

## Step 8 — Local Development (No Proxy)

For local development against a node running on your machine:

```tsx
<FiberCheckout
  nodeUrl="http://127.0.0.1:8227"
  dangerouslyAllowDirectRpc={true}
  amount={ckbToShannonHex(1)}
  asset="CKB"
  onSuccess={handleSuccess}
/>
```

> ⚠️ **Never use `dangerouslyAllowDirectRpc` in production.** It exposes your node's full RPC to the browser and will log a `console.error` if `NODE_ENV === "production"`. This flag is intended for raw IP addresses only — HTTPS proxy URLs on named domains do not require it.

---

## Deployment

The proxy pattern works with any hosting platform that supports serverless functions:

| Platform | Proxy location |
|---|---|
| Vercel | `app/api/fiber-rpc/route.ts` or `pages/api/fiber-rpc.ts` |
| Netlify | `netlify/functions/fiber-rpc.ts` |
| Cloudflare Workers | Worker script forwarding to `FIBER_NODE_URL` |
| Self-hosted nginx | Reverse proxy rule pointing to your node |

Set `FIBER_NODE_URL` as an environment variable on your hosting platform. The `nodeUrl` prop in your component always points to your proxy endpoint, never directly to the node.

---

## Error Handling

All errors are typed `FiberError` instances:

```tsx
import { FiberError } from "fiber-checkout";

onError={(err) => {
  if (err instanceof FiberError) {
    switch (err.code) {
      case "NETWORK_ERROR":
        // Node unreachable — check FIBER_NODE_URL
        break;
      case "RPC_ERROR":
        // Node returned an error — check err.rpcCode for the JSON-RPC code
        break;
      case "REQUEST_TIMEOUT":
        // Request exceeded 30s
        break;
      case "DIRECT_RPC_BLOCKED":
        // Raw IP used without dangerouslyAllowDirectRpc
        break;
    }
  }
}}
```

---

## Fiber Payments vs Blockchain Explorers

Fiber Network is a payment channel network, similar in architecture to Bitcoin's Lightning Network. Payments settle **off-chain** between nodes — no individual payment transaction appears on the CKB blockchain explorer. The payment hash returned in `onSuccess` is the cryptographic proof of settlement. Channel opening and closing transactions (which move funds on-chain) are visible on the CKB explorer, but individual routed payments are not.

---

## Testnet Resources

- Public Fiber testnet node: `http://18.162.235.225:8227`
- CKB testnet faucet: https://faucet.nervos.org
- Fiber Network GitHub: https://github.com/nervosnetwork/fiber
- fiber-checkout GitHub: https://github.com/salmansarwarr/Fiber-checkout
- fiber-checkout npm: https://www.npmjs.com/package/fiber-checkout
- Live demo: https://fiber-checkout.vercel.app
