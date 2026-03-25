/**
 * Integration test against a real Fiber node.
 * Usage: npx tsx scripts/test-node.ts
 *
 * Set FIBER_RPC_URL to override the default.
 */

import { FiberRpcClient } from "../src/core/rpc-client.js";
import { FiberError } from "../src/core/fiber-error.js";
import type { NewInvoiceParams } from "../src/types/invoice.js";

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL = process.env.FIBER_RPC_URL ?? "http://127.0.0.1:8227";
const CURRENCY = (process.env.FIBER_CURRENCY ?? "Fibt") as "Fibt" | "Fibb" | "Fibd";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const client = new FiberRpcClient({
  url: RPC_URL,
  dangerouslyAllowDirectRpc: true,
  timeoutMs: 10_000,
});

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
      if (err.rpcCode !== undefined) console.error(`    RPC code: ${err.rpcCode}`);
    } else {
      console.error(`    ${err}`);
    }
    failed++;
  }
}

function randomPreimage(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

console.log(`\nFiber node integration tests`);
console.log(`Target: ${RPC_URL}\n`);

// 1. Connectivity — node_info
let nodeId: string | undefined;
await test("node_info — node responds", async () => {
  const info = await client.call<{ pubkey: string; node_name: string | null; version: string }>("node_info", []);
  if (!info.pubkey) throw new Error("Response missing pubkey");
  nodeId = info.pubkey;
  console.log(`\n    pubkey  : ${info.pubkey}`);
  console.log(`    name    : ${info.node_name ?? "(unnamed)"}`);
  console.log(`    version : ${info.version}`);
  process.stdout.write("  ");
});

// 2. new_invoice — CKB (100 shannon)
let paymentHash: `0x${string}` | undefined;
await test("new_invoice — creates CKB invoice (100 shannon)", async () => {
  const params: NewInvoiceParams = {
    amount: "0x64",           // 100 shannon
    currency: CURRENCY,
    payment_preimage: randomPreimage(),
    description: "fiber-checkout integration test",
    expiry: "0xe10",          // 3600 seconds
  };

  const result = await client.newInvoice(params);

  if (!result.invoice_address) throw new Error("Missing invoice_address");
  if (!result.invoice.data.payment_hash) throw new Error("Missing payment_hash");

  paymentHash = result.invoice.data.payment_hash as `0x${string}`;

  console.log(`\n    address : ${result.invoice_address.slice(0, 40)}…`);
  console.log(`    hash    : ${paymentHash}`);
  console.log(`    status  : (freshly created)`);
  process.stdout.write("  ");
});

// 3. new_invoice — hold invoice (hash only, no preimage)
await test("new_invoice — creates hold invoice (payment_hash only)", async () => {
  const preimage = randomPreimage();
  // Derive a fake hash by just reusing the preimage bytes as the hash
  // (in real usage you'd SHA256/CKBHash the preimage)
  const fakeHash = randomPreimage();

  const params: NewInvoiceParams = {
    amount: "0x186a0",        // 100_000 shannon
    currency: CURRENCY,
    payment_hash: fakeHash,
    description: "hold invoice test",
  };

  const result = await client.newInvoice(params);
  if (!result.invoice_address) throw new Error("Missing invoice_address");
});

// 4. get_invoice — fetch the invoice we just created
await test("get_invoice — retrieves invoice by payment_hash", async () => {
  if (!paymentHash) throw new Error("Skipped: new_invoice failed, no payment_hash");

  const result = await client.getInvoice({ payment_hash: paymentHash });

  if (!result.status) throw new Error("Missing status");
  if (result.status !== "Open") throw new Error(`Expected status Open, got ${result.status}`);

  console.log(`\n    status  : ${result.status}`);
  console.log(`    address : ${result.invoice_address.slice(0, 40)}…`);
  process.stdout.write("  ");
});

// 5. get_invoice — unknown hash returns RPC error
await test("get_invoice — unknown hash returns RPC_ERROR (not a crash)", async () => {
  const unknownHash = randomPreimage(); // guaranteed to not exist
  try {
    await client.getInvoice({ payment_hash: unknownHash });
    throw new Error("Expected an error but call succeeded");
  } catch (err) {
    if (!FiberError.is(err)) throw err;
    if (err.code !== "RPC_ERROR") throw new Error(`Expected RPC_ERROR, got ${err.code}`);
    // Expected — node returns an error for unknown hashes
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log(`\nIf you see DIRECT_RPC_BLOCKED errors, make sure the script`);
  console.log(`is running with dangerouslyAllowDirectRpc: true (already set here).`);
  console.log(`\nIf you see NETWORK_ERROR, check that your Fiber node is running:`);
  console.log(`  curl -s -X POST ${RPC_URL} -H 'Content-Type: application/json' \\`);
  console.log(`       -d '{"jsonrpc":"2.0","id":1,"method":"node_info","params":[]}'`);
  process.exit(1);
}

console.log();