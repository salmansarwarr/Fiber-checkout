/**
 * Fiber RPC Proxy — Next.js App Router
 * File: app/api/fiber-rpc/route.ts
 *
 * This route acts as a secure intermediary between the browser and your
 * Fiber node. It:
 *   1. Whitelists only the RPC methods needed for checkout
 *   2. Keeps your node URL server-side (never exposed to the browser)
 *   3. Forwards the JSON-RPC 2.0 request and streams the response back
 *
 * Environment variables (set in .env.local):
 *   FIBER_NODE_URL=http://127.0.0.1:8227   # your Fiber node RPC endpoint
 *
 * Usage in fiber-checkout:
 *   <FiberCheckout nodeUrl="/api/fiber-rpc" ... />
 */

import { NextRequest, NextResponse } from "next/server";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Only these methods are forwarded to the node.
 * Any other method returns a 403 before hitting the node.
 */
const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice"]);

const NODE_URL = process.env.FIBER_NODE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: string;
  id: number | string | null;
  method: string;
  params: unknown[];
}

function isJsonRpcRequest(body: unknown): body is JsonRpcRequest {
  return (
    typeof body === "object" &&
    body !== null &&
    "jsonrpc" in body &&
    "method" in body &&
    typeof (body as JsonRpcRequest).method === "string"
  );
}

function rpcError(id: number | string | null, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status: 200 } // JSON-RPC errors are HTTP 200 by spec
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1. Validate node URL is configured
  if (!NODE_URL) {
    console.error("[fiber-rpc] FIBER_NODE_URL is not set");
    return rpcError(null, -32603, "Proxy not configured");
  }

  // 2. Parse request body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  if (!isJsonRpcRequest(body)) {
    return rpcError(null, -32600, "Invalid Request");
  }

  const { id, method, params } = body;

  // 3. Method whitelist check
  if (!ALLOWED_METHODS.has(method)) {
    return rpcError(
      id,
      -32601,
      `Method "${method}" is not allowed through this proxy`
    );
  }

  // 4. Forward to the Fiber node
  let nodeResponse: Response;
  try {
    nodeResponse = await fetch(NODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
  } catch (err) {
    console.error("[fiber-rpc] Failed to reach Fiber node:", err);
    return rpcError(id, -32603, "Could not reach Fiber node");
  }

  // 5. Stream response back to the client
  let nodeBody: unknown;
  try {
    nodeBody = await nodeResponse.json();
  } catch {
    return rpcError(id, -32603, "Invalid response from Fiber node");
  }

  return NextResponse.json(nodeBody, { status: nodeResponse.status });
}

// Reject non-POST methods
export function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}