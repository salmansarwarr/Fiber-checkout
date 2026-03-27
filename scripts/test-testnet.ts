/**
 * Testnet integration test — fiber-checkout Phase 8
 * Usage: npx tsx scripts/test-testnet.ts
 *
 * Tests the full payment flow against a real Fiber testnet node:
 *   1. node_info connectivity
 *   2. new_invoice (CKB)
 *   3. new_invoice (RUSD)
 *   4. get_invoice status polling
 *   5. Full end-to-end payment via send_payment → poll until Paid
 */

import { FiberRpcClient } from "../src/core/rpc-client.js";
import { FiberError } from "../src/core/fiber-error.js";
import { generatePreimage } from "../src/utils/preimage.js";
import { ckbToShannonHex, shannonHexToCkb, fromHex } from "../src/utils/hex.js";
import { ASSETS } from "../src/core/assets.js";
import type { HexString } from "../src/types/common.js";
import type { GetInvoiceResult } from "../src/types/invoice.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const LOCAL_URL  = process.env.FIBER_RPC_URL  ?? "http://127.0.0.1:8227";
// node2 — used to generate invoices for end-to-end payment test
const NODE2_URL  = process.env.FIBER_NODE2_URL ?? "http://18.163.221.211:8227";

// Bootnode — the peer we have an open channel with locally.
// Payment to node2 routes THROUGH this peer, not directly to node2.
const BOOTNODE_PUBKEY = process.env.BOOTNODE_PUBKEY
  ?? "02b6d4e3ab86a2ca2fad6fae0ecb2e1e559e0b911939872a90abdda6d20302be71";
const BOOTNODE_P2P = process.env.BOOTNODE_P2P
  ?? "/ip4/54.179.226.154/tcp/8228/p2p/Qmes1EBD4yNo9Ywkfe6eRw9tG1nVNGLDmMud1xJMsoYFKy";

// node2 P2P (only used if you want a direct channel to node2; not required for routing)
const NODE2_P2P    = "/ip4/18.163.221.211/tcp/8119/p2p/QmbKyzq9qUmymW2Gi8Zq7kKVpPiNA1XUJ6uMvsUC4F3p89";
const NODE2_PUBKEY = "0291a6576bd5a94bd74b27080a48340875338fff9f6d6361fe6b8db8d0d1912fcc";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS  = 60_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const local = new FiberRpcClient({ url: LOCAL_URL,  dangerouslyAllowDirectRpc: true });
const node2 = new FiberRpcClient({ url: NODE2_URL,  dangerouslyAllowDirectRpc: true });

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log("✓");
    passed++;
  } catch (err) {
    console.log("✗");
    if (FiberError.is(err)) {
      console.error(`    FiberError [${err.code}]: ${err.message}`);
      if (err.rpcCode !== undefined) console.error(`    RPC code  : ${err.rpcCode}`);
    } else {
      console.error(`    ${err}`);
    }
    failed++;
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * Poll get_invoice until status is terminal or timeout.
 * Returns the final GetInvoiceResult.
 */
async function pollUntilTerminal(
  client: FiberRpcClient,
  paymentHash: HexString,
  terminalStatuses: GetInvoiceResult["status"][]
): Promise<GetInvoiceResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await client.getInvoice({ payment_hash: paymentHash });
    if (terminalStatuses.includes(result.status)) return result;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out after ${POLL_TIMEOUT_MS}ms waiting for ${terminalStatuses.join("|")}`);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

console.log(`\nfiber-checkout — testnet integration tests`);
console.log(`Local node : ${LOCAL_URL}`);
console.log(`Node2      : ${NODE2_URL}\n`);

// ── 1. Connectivity ───────────────────────────────────────────────────────────

let localPubkey: string | undefined;

await test("node_info — local node responds", async () => {
  const info = await local.call<{
    pubkey: string;
    node_name: string | null;
    version: string;
    peers_count: HexString;
    channel_count: HexString;
  }>("node_info", []);

  // Support both pubkey and node_id field names across node versions
  const id = info.pubkey;
  if (!id) throw new Error("Missing pubkey in node_info response");
  localPubkey = id;

  console.log(`\n    pubkey        : ${id}`);
  console.log(`    version       : ${info.version}`);
  console.log(`    peers         : ${Number(fromHex(info.peers_count as HexString))}`);
  console.log(`    channels      : ${Number(fromHex(info.channel_count as HexString))}`);
  process.stdout.write("  ");
});

await test("node_info — node2 (invoice target) responds", async () => {
  // node2 may return node_id or pubkey depending on version
  const info = await node2.call<{
    node_id?: string;
    pubkey?: string;
    node_name?: string;
    version?: string;
  }>("node_info", []);

  const id = info.node_id ?? info.pubkey;
  if (!id) throw new Error("Missing node_id/pubkey in node2 node_info response");

  console.log(`\n    node2 id      : ${id}`);
  console.log(`    node2 name    : ${info.node_name ?? "(none)"}`);
  console.log(`    node2 version : ${info.version ?? "(unknown)"}`);
  process.stdout.write("  ");
});

// ── 2. Invoice generation — CKB ───────────────────────────────────────────────

let ckbPaymentHash: HexString | undefined;
let ckbInvoiceAddress: string | undefined;

await test("new_invoice — CKB (100,000,000 shannon = 1 CKB)", async () => {
  const result = await local.newInvoice({
    amount: ckbToShannonHex(1),        // 1 CKB = 0x5f5e100
    currency: "Fibt",
    payment_preimage: generatePreimage(),
    expiry: "0xe10",                   // 3600s
    description: "fiber-checkout testnet test — CKB",
  });

  if (!result.invoice_address) throw new Error("Missing invoice_address");
  ckbPaymentHash    = result.invoice.data.payment_hash as HexString;
  ckbInvoiceAddress = result.invoice_address;

  console.log(`\n    address       : ${result.invoice_address.slice(0, 48)}…`);
  console.log(`    payment_hash  : ${ckbPaymentHash}`);
  process.stdout.write("  ");
});

// ── 3. Invoice generation — RUSD ──────────────────────────────────────────────

let rusdPaymentHash: HexString | undefined;

await test("new_invoice — RUSD (100,000,000 = 1 RUSD)", async () => {
  const result = await local.newInvoice({
    amount: "0x5f5e100",              // 1 RUSD
    currency: "Fibt",
    payment_preimage: generatePreimage(),
    expiry: "0xe10",
    description: "fiber-checkout testnet test — RUSD",
    udt_type_script: ASSETS.RUSD.udtTypeScript!,
  });

  if (!result.invoice_address) throw new Error("Missing invoice_address");
  rusdPaymentHash = result.invoice.data.payment_hash as HexString;

  console.log(`\n    address       : ${result.invoice_address.slice(0, 48)}…`);
  console.log(`    payment_hash  : ${rusdPaymentHash}`);
  process.stdout.write("  ");
});

// ── 4. Invoice status polling ─────────────────────────────────────────────────

await test("get_invoice — freshly created invoice has status Open", async () => {
  if (!ckbPaymentHash) throw new Error("Skipped: no payment hash from new_invoice");
  const result = await local.getInvoice({ payment_hash: ckbPaymentHash });
  if (result.status !== "Open") throw new Error(`Expected Open, got ${result.status}`);
  console.log(`\n    status        : ${result.status}`);
  process.stdout.write("  ");
});

await test("get_invoice — unknown hash returns RPC_ERROR", async () => {
  try {
    await local.getInvoice({ payment_hash: generatePreimage() as HexString });
    throw new Error("Expected error but got success");
  } catch (err) {
    if (!FiberError.is(err) || err.code !== "RPC_ERROR") throw err;
  }
});

// ── 5. End-to-end payment: local → bootnode → node2 ──────────────────────────
//
// Topology: local ──(open channel)──> bootnode ──> node2
// We do NOT need a direct channel to node2. The bootnode routes the payment.
// We DO need to make sure we're connected to the bootnode peer before sending.

let e2ePaymentHash: HexString | undefined;
let e2eInvoiceAddress: string | undefined;

await test("connect_peer — ensure bootnode peer is connected", async () => {
  // Ignore errors — already connected is fine
  await local.call("connect_peer", [{
    pubkey: BOOTNODE_PUBKEY,
    address: BOOTNODE_P2P,
  }]).catch((err) => {
    // "already connected" surfaces as an RPC error on some node versions — that's OK
    console.log(`\n    note: connect_peer error (may already be connected): ${err?.message ?? err}`);
  });

  // Give P2P handshake time to complete
  await sleep(5_000);
  process.stdout.write("  ");
});

await test("new_invoice — create CKB invoice on node2 (payment target)", async () => {
  const result = await node2.newInvoice({
    amount: ckbToShannonHex(1),
    currency: "Fibt",
    payment_preimage: generatePreimage(),
    hash_algorithm: "sha256",
    expiry: "0xe10",
    description: "fiber-checkout e2e test",
  });

  if (!result.invoice_address) throw new Error("Missing invoice_address");
  e2eInvoiceAddress = result.invoice_address;

  // Capture the payment hash from the invoice for polling node2 later.
  // We intentionally do NOT use result.invoice.data.payment_hash here —
  // we'll capture it from send_payment's response instead, which is authoritative.
  console.log(`\n    invoice       : ${result.invoice_address.slice(0, 48)}…`);
  process.stdout.write("  ");
});

await test("send_payment — local node sends payment to node2 invoice", async () => {
  if (!e2eInvoiceAddress) throw new Error("Skipped: no invoice address from previous test");

  const payment = await local.call<{
    payment_hash: HexString;
    status: string;
    fee: HexString;
    failed_error: string | null;
  }>("send_payment", [{ invoice: e2eInvoiceAddress }]);

  // Authoritative payment hash comes from send_payment response
  e2ePaymentHash = payment.payment_hash;

  console.log(`\n    payment_hash  : ${e2ePaymentHash}`);
  console.log(`    status        : ${payment.status}`);
  console.log(`    fee           : ${shannonHexToCkb(payment.fee as HexString)} CKB`);

  // send_payment returns "Created" immediately — that is expected, not a failure.
  // Polling happens in the next test.
  if (payment.failed_error) {
    throw new Error(`send_payment returned failed_error: ${payment.failed_error}`);
  }
  process.stdout.write("  ");
});

await test("get_invoice — poll node2 until payment is Paid (≤60s)", async () => {
  if (!e2ePaymentHash) throw new Error("Skipped: no e2e payment hash");

  console.log(`\n    polling node2 every ${POLL_INTERVAL_MS}ms…`);
  process.stdout.write("    ");

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last: GetInvoiceResult["status"] = "Open";

  while (Date.now() < deadline) {
    const result = await node2.getInvoice({ payment_hash: e2ePaymentHash });
    last = result.status;
    process.stdout.write(`[${result.status}] `);

    if (result.status === "Paid") {
      console.log("\n");
      process.stdout.write("  ");
      return;
    }
    if (result.status === "Cancelled" || result.status === "Expired") {
      throw new Error(`Payment ended with status: ${result.status}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timed out. Last status: ${last}`);
});

// ── 6. FiberRpcClient security guard ─────────────────────────────────────────

await test("FiberRpcClient — blocks direct IP without flag", async () => {
  try {
    new FiberRpcClient({ url: "http://127.0.0.1:9999" });
    throw new Error("Expected DIRECT_RPC_BLOCKED but client was created");
  } catch (err) {
    if (!FiberError.is(err) || err.code !== "DIRECT_RPC_BLOCKED") throw err;
  }
});

await test("FiberRpcClient — allows direct IP with dangerouslyAllowDirectRpc", async () => {
  const client = new FiberRpcClient({
    url: "http://127.0.0.1:8227",
    dangerouslyAllowDirectRpc: true,
  });
  if (!client) throw new Error("Client not created");
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed > 0) {
  console.log(`\nTroubleshooting:`);
  console.log(`  • Node running?   curl -s http://127.0.0.1:8227 -d '{"jsonrpc":"2.0","id":1,"method":"node_info","params":[]}'`);
  console.log(`  • Channel open?   Needs an open channel with the bootnode (024714ca... or 02b6d4e3...)`);
  console.log(`  • Bootnode conn?  curl ... "method":"list_peers" to verify peer is connected`);
  console.log(`  • Funded?         Node address needs CKB at https://faucet.nervos.org`);
  console.log(`  • Routing?        Local → bootnode → node2 must all be reachable with open channels`);
  process.exit(1);
}

console.log(`\n✓ All testnet integration tests passed`);
console.log(`  Invoice generation (CKB + RUSD) ✓`);
console.log(`  Status polling ✓`);
console.log(`  End-to-end payment ✓\n`);