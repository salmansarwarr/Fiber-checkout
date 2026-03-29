# Testing Guide

This document covers all testing levels for `fiber-checkout`: unit tests, testnet integration tests, and demo testing.

---

## Table of contents

- [Unit tests](#unit-tests)
- [Testnet integration tests](#testnet-integration-tests)
  - [Node setup](#node-setup)
  - [Opening a channel](#opening-a-channel)
  - [Running the tests](#running-the-tests)
  - [Verifying a payment by hash](#verifying-a-payment-by-hash)
- [Demo testing](#demo-testing)
  - [Setup](#demo-setup)
  - [Full payment flow](#full-payment-flow)
  - [Verifying the payment](#verifying-the-payment)
- [Troubleshooting](#troubleshooting)

---

## Unit tests

Unit tests run fully offline with mocked fetch — no Fiber node required. They run in CI on every commit.

```bash
# Run once
npm test

# Watch mode during development
npm run test:watch

# With coverage report (≥80% threshold enforced)
npm run coverage

# TypeScript strict mode check
npm run typecheck

# Full verification: typecheck + test + build + bundle size check
npm run verify
```

**What's covered:**

- `FiberError` — all error codes, factory methods, type guard
- `FiberRpcClient` — JSON-RPC 2.0 request shape, headers, security guard (direct IP blocking), all error paths, timeout
- `useFiberInvoice` — loading state, RPC params per asset, preimage uniqueness, error handling, re-fetch on input change, unmount cleanup
- `useFiberPayment` — idle state, all 5 status mappings, polling start/stop, terminal state detection, client-side expiry, callbacks, manual `poll()`, unmount cleanup
- `<FiberCheckout />` — rendering, status badges, copy button, retry button, error display, callback wiring
- Asset registry — CKB and RUSD configs, UDT script values
- Hex utilities — all conversion functions, edge cases, overflow protection
- Preimage utilities — randomness, uniqueness, validation

---

## Testnet integration tests

Integration tests hit a real Fiber testnet node. They verify the full payment flow end-to-end with real on-chain transactions.

### Node setup

**Step 1 — Download and build `fnn`**

```bash
# Clone the Fiber repo and build from source (required for Node.js 22.0.0)
git clone https://github.com/nervosnetwork/fiber.git fiber-node
cd fiber-node
cargo build --release -p fiber-bin
cp target/release/fnn ~/your-working-dir/
```

Or download a pre-built binary from the [releases page](https://github.com/nervosnetwork/fiber/releases) (requires glibc 2.38+).

**Step 2 — Set up keys and config**

```bash
mkdir -p testnet-fnn/nodeA/ckb

# Create a CKB account
./ckb-cli account new
./ckb-cli account export --lock-arg <lock_arg> --extended-privkey-path exported-key
head -n 1 ./exported-key > testnet-fnn/nodeA/ckb/key
chmod 600 testnet-fnn/nodeA/ckb/key

# Copy testnet config
cp config/testnet/config.yml testnet-fnn/nodeA/
```

**Step 3 — Fund your node address**

Get your address:
```bash
./ckb-cli util key-info --privkey-path testnet-fnn/nodeA/ckb/key
```

Fund it with at least 500 CKB at [faucet.nervos.org](https://faucet.nervos.org). Wait ~2 minutes for confirmation.

**Step 4 — Start the node**

```bash
FIBER_SECRET_KEY_PASSWORD='your_password' \
RUST_LOG=info \
./fnn -c testnet-fnn/nodeA/config.yml -d testnet-fnn/nodeA \
> testnet-fnn/nodeA/a.log 2>&1 &

# Verify it's running
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"node_info","params":[]}' | jq '.result.version'
```

### Opening a channel

A channel is required for the end-to-end payment test. Channels persist across node restarts but need to be re-opened if the node's data directory is wiped.

**Step 1 — Connect to the bootnode**

```bash
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "connect_peer",
    "params": [{
      "pubkey": "024714ca19abea4ddc0f3863ffdfb2e2cee76af87c477de4bc67c74a83f8140042",
      "address": "/ip4/54.179.226.154/tcp/8228/p2p/Qmes1EBD4yNo9Ywkfe6eRw9tG1nVNGLDmMud1xJMsoYFKy"
    }]
  }'
# Expected: {"result": null}
```

**Step 2 — Open a channel with 500 CKB**

```bash
sleep 10 && curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 2,
    "method": "open_channel",
    "params": [{
      "pubkey": "024714ca19abea4ddc0f3863ffdfb2e2cee76af87c477de4bc67c74a83f8140042",
      "funding_amount": "0xba43b7400",
      "public": true
    }]
  }'
# Expected: {"result": {"temporary_channel_id": "0x..."}}
```

**Step 3 — Wait for `ChannelReady`** (2–5 minutes)

```bash
# Poll every 30s until state_name is "ChannelReady"
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"list_channels","params":[{}]}' \
  | jq '.result.channels[] | {state: .state.state_name, local_balance}'
```

**Step 4 — Connect to node2 (payment target)**

```bash
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "connect_peer",
    "params": [{
      "pubkey": "0291a6576bd5a94bd74b27080a48340875338fff9f6d6361fe6b8db8d0d1912fcc",
      "address": "/ip4/18.163.221.211/tcp/8119/p2p/QmbKyzq9qUmymW2Gi8Zq7kKVpPiNA1XUJ6uMvsUC4F3p89"
    }]
  }'
```

### Running the tests

Once your node is running with a `ChannelReady` channel:

```bash
npm run test:testnet
```

The script runs 12 tests:

| # | Test | Description |
|---|---|---|
| 1 | `node_info` — local | Verifies local node responds with pubkey and version |
| 2 | `node_info` — node2 | Verifies payment target node is reachable |
| 3 | `new_invoice` CKB | Creates a 1 CKB invoice on local node |
| 4 | `new_invoice` RUSD | Creates a 1 RUSD invoice with UDT type script |
| 5 | `get_invoice` Open | Verifies fresh invoice has status `Open` |
| 6 | `get_invoice` unknown | Verifies unknown hash returns `RPC_ERROR` |
| 7 | `connect_peer` | Ensures bootnode peer is connected |
| 8 | `new_invoice` on node2 | Creates invoice on the payment target |
| 9 | `send_payment` | Sends payment from local node via channel |
| 10 | Poll until `Paid` | Polls node2 every 2s until invoice shows `Paid` |
| 11 | Security guard blocks | Verifies direct IP is blocked without flag |
| 12 | Security guard allows | Verifies direct IP works with flag |

**Environment variables:**

```bash
# Override defaults
FIBER_RPC_URL=http://127.0.0.1:8228 \
FIBER_NODE2_URL=http://18.163.221.211:8227 \
npm run test:testnet
```

**Expected output:**

```
fiber-checkout — testnet integration tests
Local node : http://127.0.0.1:8227
Node2      : http://18.163.221.211:8227

  node_info — local node responds ...
    pubkey  : 028b29c...
    version : 0.7.1
    peers   : 2
    channels: 2
  ✓
  ...
  get_invoice — poll node2 until payment is Paid (≤60s) ...
    polling node2 every 2000ms…
    [Open] [Paid]
  ✓
──────────────────────────────────────────────────
Results: 12 passed, 0 failed out of 12 tests
✓ All testnet integration tests passed
```

### Verifying a payment by hash

After a payment completes, verify it from both sides using the payment hash shown in the output or the demo success screen.

**Sender side (your local node):**

```bash
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "get_payment",
    "params": [{"payment_hash": "0xYOUR_HASH_HERE"}]
  }' | jq '{status: .result.status, fee: .result.fee, created_at: .result.created_at}'
```

Expected: `"status": "Success"`

**Receiver side (node2):**

```bash
curl -s -X POST http://18.163.221.211:8227 \
  -H 'Content-Type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 1,
    "method": "get_invoice",
    "params": [{"payment_hash": "0xYOUR_HASH_HERE"}]
  }' | jq '{status: .result.status, address: .result.invoice_address}'
```

Expected: `"status": "Paid"`

---

## Demo testing

The demo is a Vite + React app that showcases the full payment flow using real testnet transactions.

### Demo setup

**Prerequisites:** Fiber node running with an open channel (see [Node setup](#node-setup) and [Opening a channel](#opening-a-channel) above).

```bash
cd examples/demo
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Your local Fiber node (sends payments)
VITE_FIBER_NODE_URL=http://127.0.0.1:8227
VITE_ALLOW_DIRECT_RPC=true

# Node2 (generates invoices — must be different from your local node
# to avoid the "allow_self_payment is not enabled" error)
VITE_FIBER_INVOICE_NODE_URL=http://18.163.221.211:8227
```

> **Why two node URLs?** The demo generates invoices on node2 and pays them from your local node via the open channel. Using the same node for both would trigger a self-payment error from the Fiber node.

```bash
npm install
npm run dev
# Open http://localhost:5173
```

### Full payment flow

The demo walks through the complete flow. Here's what to expect at each step:

**1. Asset selection**

Click `CKB` or `RUSD` in the left panel. The invoice will be generated in the selected asset.

**2. Amount selection**

Click a preset (0.1, 0.5, 1, 5, 10) or type a custom amount. The code snippet in the sidebar updates live to show the hex amount.

**3. QR generation**

The QR code renders automatically within ~1 second. The status badge shows `Waiting for payment`. The `Copy invoice` button copies the Bech32m invoice string to clipboard.

**4. Send payment**

Click **"⬡ Pay with testnet node"** — this calls `send_payment` on your local node and routes the payment through the open channel to node2. The button shows `Sending…` while the RPC call is in flight.

**5. Status updates**

The demo polls node2's `get_invoice` every 2 seconds. Watch the status badge update:
- `Waiting for payment` → `Sending…` → `Processing…` → `Payment confirmed`

The full flow typically takes 3–10 seconds after clicking the pay button.

**6. Success screen**

The success screen shows:
- ✓ confirmation icon
- Amount and asset
- Truncated payment hash with a copy button

### Verifying the payment

After seeing the success screen, copy the payment hash and verify it from both sides:

**Quick check — sender (your node):**

```bash
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"get_payment\",
    \"params\": [{\"payment_hash\": \"0xPASTE_HASH_HERE\"}]
  }" | jq '{status: .result.status, fee: .result.fee}'
```

Expected: `"status": "Success"`

**Quick check — receiver (node2):**

```bash
curl -s -X POST http://18.163.221.211:8227 \
  -H 'Content-Type: application/json' \
  -d "{
    \"jsonrpc\": \"2.0\", \"id\": 1,
    \"method\": \"get_invoice\",
    \"params\": [{\"payment_hash\": \"0xPASTE_HASH_HERE\"}]
  }" | jq '{status: .result.status}'
```

Expected: `"status": "Paid"`

**Check channel balance change:**

```bash
# Before and after payment — local_balance should decrease by ~1 CKB + fee
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_channels","params":[{}]}' \
  | jq '.result.channels[] | {local_balance, remote_balance, state: .state.state_name}'
```

**Check payment history:**

```bash
# List recent payments from your node
curl -s -X POST http://127.0.0.1:8227 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_payments","params":[{"status":"Success"}]}' \
  | jq '.result.payments[] | {payment_hash, status, fee}'
```

---

## Troubleshooting

**`npm run test:testnet` fails immediately with "Cannot reach Fiber node"**

Your node is not running. Start it:
```bash
FIBER_SECRET_KEY_PASSWORD='your_password' RUST_LOG=info \
./fnn -c testnet-fnn/nodeA/config.yml -d testnet-fnn/nodeA > a.log 2>&1 &
```

**`Failed to build route` on send_payment**

The routing table hasn't synced yet, or your channel isn't ready. Check:
```bash
# Is channel ChannelReady?
curl -s -X POST http://127.0.0.1:8227 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"list_channels","params":[{}]}' \
  | jq '.result.channels[].state.state_name'

# How many graph channels visible?
curl -s -X POST http://127.0.0.1:8227 -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"graph_channels","params":[{}]}' \
  | jq '.result.channels | length'
```

Wait 5–10 minutes after channel opens for gossip to propagate. Typically 500+ graph channels are needed for routing to work.

**`allow_self_payment is not enabled` in the demo**

`VITE_FIBER_NODE_URL` and `VITE_FIBER_INVOICE_NODE_URL` are pointing to the same node. Set `VITE_FIBER_INVOICE_NODE_URL=http://18.163.221.211:8227` in `.env.local`.

**`Peer not found` on connect_peer**

Use the full multiaddr with `/p2p/` peer ID:
```
/ip4/54.179.226.154/tcp/8228/p2p/Qmes1EBD4yNo9Ywkfe6eRw9tG1nVNGLDmMud1xJMsoYFKy
```

**`waiting for peer to send Init message` on open_channel**

The P2P handshake takes a few seconds after `connect_peer`. Wait 10 seconds and retry `open_channel`.

**Node won't start — glibc version error**

Build from source instead of using the pre-built binary:
```bash
git clone https://github.com/nervosnetwork/fiber.git
cd fiber
cargo build --release -p fiber-bin
```

**Demo QR renders but status stays `Waiting for payment` after clicking pay**

Check browser console for errors. Common causes:
- `send_payment` failed — check `VITE_FIBER_NODE_URL` is correct
- Node channel has insufficient balance — check `local_balance` in `list_channels`
- Node lost connection to peers — check `peers_count` in `node_info`