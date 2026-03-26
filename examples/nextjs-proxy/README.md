# Next.js Proxy Reference — fiber-checkout

This directory contains reference implementations of the server-side RPC proxy
required to use `fiber-checkout` safely in production.

## Why a proxy?

`fiber-checkout` communicates with a Fiber node via JSON-RPC. In production,
the node URL must never be exposed to the browser — it would allow anyone to
call any RPC method on your node. The proxy:

- Keeps the node URL in an environment variable (server-side only)
- Whitelists only `new_invoice` and `get_invoice` — the two methods needed for checkout
- Forwards requests to the node and relays the response back

## Files

| File | Router | Use when |
|---|---|---|
| `app/api/fiber-rpc/route.ts` | App Router | `app/` directory (Next.js 13+) |
| `pages/api/fiber-rpc.ts` | Pages Router | `pages/` directory |

## Setup

### 1. Copy the proxy file

**App Router:**
```bash
mkdir -p app/api/fiber-rpc
cp app/api/fiber-rpc/route.ts your-nextjs-app/app/api/fiber-rpc/route.ts
```

**Pages Router:**
```bash
mkdir -p pages/api
cp pages/api/fiber-rpc.ts your-nextjs-app/pages/api/fiber-rpc.ts
```

### 2. Set the environment variable

```bash
cp .env.example .env.local
# Edit .env.local and set FIBER_NODE_URL
```

```env
FIBER_NODE_URL=http://127.0.0.1:8227
```

### 3. Use the proxy in your component

```tsx
import { FiberCheckout } from "fiber-checkout";

export default function PaymentPage() {
  return (
    <FiberCheckout
      amount="0x5f5e100"
      asset="CKB"
      nodeUrl="/api/fiber-rpc"   // ← proxy route, not the node directly
      onSuccess={(hash) => console.log("Paid:", hash)}
      onExpired={() => console.log("Expired")}
    />
  );
}
```

## Deployment modes

### Production (proxy)

```tsx
// .env.local → FIBER_NODE_URL=http://your-node:8227
<FiberCheckout nodeUrl="/api/fiber-rpc" ... />
```

The node URL stays on the server. The browser only ever talks to `/api/fiber-rpc`.

### Local development (direct)

```tsx
<FiberCheckout
  nodeUrl="http://127.0.0.1:8227"
  dangerouslyAllowDirectRpc={true}
  ...
/>
```

A `console.warn` is emitted when `dangerouslyAllowDirectRpc` is `true`.
Never use this in production.

## Extending the whitelist

To allow additional methods (e.g. for an admin dashboard), add them to the
`ALLOWED_METHODS` set in the proxy file:

```ts
const ALLOWED_METHODS = new Set([
  "new_invoice",
  "get_invoice",
  "node_info",   // ← add here
]);
```

Only add methods you intentionally want browser clients to call.