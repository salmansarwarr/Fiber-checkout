/**
 * Fiber RPC Proxy — Next.js Pages Router
 * File: pages/api/fiber-rpc.ts
 *
 * Use this file if your Next.js project uses the Pages Router (pages/).
 * For App Router (app/), use app/api/fiber-rpc/route.ts instead.
 *
 * Environment variables (set in .env.local):
 *   FIBER_NODE_URL=http://127.0.0.1:8227
 *
 * Usage in fiber-checkout:
 *   <FiberCheckout nodeUrl="/api/fiber-rpc" ... />
 */

import type { NextApiRequest, NextApiResponse } from "next";

// ─── Config ───────────────────────────────────────────────────────────────────

const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice"]);
const NODE_URL = process.env.FIBER_NODE_URL;

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!NODE_URL) {
    console.error("[fiber-rpc] FIBER_NODE_URL is not set");
    return res
      .status(200)
      .json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Proxy not configured" } });
  }

  const { id = null, method, params = [] } = req.body ?? {};

  if (typeof method !== "string") {
    return res
      .status(200)
      .json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } });
  }

  if (!ALLOWED_METHODS.has(method)) {
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method "${method}" is not allowed through this proxy` },
    });
  }

  try {
    const nodeResponse = await fetch(NODE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });

    const data = await nodeResponse.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("[fiber-rpc] Failed to reach Fiber node:", err);
    return res.status(200).json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Could not reach Fiber node" },
    });
  }
}