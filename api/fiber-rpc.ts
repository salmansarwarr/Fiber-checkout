/**
 * Vercel serverless function — Fiber RPC proxy for the demo site.
 * File: api/fiber-rpc.js (Vercel auto-detects this as a serverless function)
 *
 * Set FIBER_NODE_URL in your Vercel project environment variables.
 */

const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice", "send_payment"]);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Support dynamic node URL via header (for ngrok/dev use cases)
    const customNodeUrl = req.headers["x-fiber-node-url"];
    let NODE_URL = process.env.FIBER_NODE_URL;

    if (customNodeUrl) {
        if (
            typeof customNodeUrl !== "string" ||
            !customNodeUrl.startsWith("http")
        ) {
            return res.status(400).json({ error: "Invalid x-fiber-node-url" });
        }
        NODE_URL = customNodeUrl;
    }

    if (!NODE_URL) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: "Fiber node URL not configured" },
        });
    }

    const { id = null, method, params = [] } = req.body ?? {};

    if (typeof method !== "string") {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32600, message: "Invalid Request" },
        });
    }

    if (!ALLOWED_METHODS.has(method)) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method "${method}" not allowed` },
        });
    }

    try {
        const upstream = await fetch(NODE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Bypass ngrok's transition/warning page if the user is using it
                "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        });
        const data = await upstream.json();
        return res.status(200).json(data);
    } catch (err) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "Could not reach Fiber node" },
        });
    }
}
