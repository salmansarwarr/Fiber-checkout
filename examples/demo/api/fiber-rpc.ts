const ALLOWED_METHODS = new Set(["new_invoice", "get_invoice", "send_payment"]);

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const NODE_URL = process.env.FIBER_NODE_URL || "http://18.163.221.211:8227";
    const { id = null, method, params = [] } = req.body ?? {};

    if (!ALLOWED_METHODS.has(method)) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method "${method}" not allowed` },
        });
    }

    try {
        const response = await fetch(NODE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
        });
        const data = await response.json();
        return res.status(200).json(data);
    } catch (err) {
        return res.status(200).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "Could not reach Fiber node" },
        });
    }
}
