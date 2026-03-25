import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    type MockedFunction,
} from "vitest";
import { FiberRpcClient } from "../rpc-client";
import { FiberError, FiberErrorCode } from "../fiber-error";
import type { NewInvoiceParams } from "../../types/invoice";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const PROXY_URL = "https://example.com/api/fiber-rpc";

function mockFetch(body: unknown, status = 200): MockedFunction<typeof fetch> {
    return vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: () => Promise.resolve(body),
    } as Response);
}

function rpcSuccess<T>(id: number, result: T) {
    return { jsonrpc: "2.0", id, result };
}

function rpcError(id: number, code: number, message: string) {
    return { jsonrpc: "2.0", id, error: { code, message } };
}

const INVOICE_PARAMS: NewInvoiceParams = {
    amount: "0x64",
    currency: "Fibt",
    payment_preimage:
        "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
};

const INVOICE_RESULT = {
    invoice_address: "fib1testaddress",
    invoice: {
        currency: "Fibt",
        amount: "0x64",
        data: {
            timestamp: "0x1",
            payment_hash: "0xabc",
            attrs: [],
        },
    },
};

// ─── Security guard tests ─────────────────────────────────────────────────────

describe("FiberRpcClient — security guard", () => {
    it("throws DIRECT_RPC_BLOCKED for IPv4 URL without flag", () => {
        expect(
            () => new FiberRpcClient({ url: "http://127.0.0.1:8227" }),
        ).toThrow(FiberError);

        expect(
            () => new FiberRpcClient({ url: "http://127.0.0.1:8227" }),
        ).toThrow(
            expect.objectContaining({
                code: FiberErrorCode.DIRECT_RPC_BLOCKED,
            }),
        );
    });

    it("throws DIRECT_RPC_BLOCKED for any RFC-1918 address", () => {
        const ips = [
            "http://192.168.1.1",
            "http://10.0.0.1:9000",
            "http://172.16.0.5",
        ];
        for (const url of ips) {
            expect(() => new FiberRpcClient({ url })).toThrow(
                expect.objectContaining({
                    code: FiberErrorCode.DIRECT_RPC_BLOCKED,
                }),
            );
        }
    });

    it("throws DIRECT_RPC_BLOCKED for IPv6 loopback", () => {
        expect(() => new FiberRpcClient({ url: "http://[::1]:8080/" })).toThrow(
            expect.objectContaining({
                code: FiberErrorCode.DIRECT_RPC_BLOCKED,
            }),
        );
    });

    it("allows named hosts (proxy pattern)", () => {
        expect(() => new FiberRpcClient({ url: PROXY_URL })).not.toThrow();
    });

    it("allows localhost (named host, not IP)", () => {
        expect(
            () => new FiberRpcClient({ url: "http://localhost:3000/api/rpc" }),
        ).not.toThrow();
    });

    it("allows direct IP when dangerouslyAllowDirectRpc is true", () => {
        expect(
            () =>
                new FiberRpcClient({
                    url: "http://127.0.0.1:8227",
                    dangerouslyAllowDirectRpc: true,
                }),
        ).not.toThrow();
    });

    it("emits a console.warn when dangerouslyAllowDirectRpc is true", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        new FiberRpcClient({
            url: "http://127.0.0.1:8227",
            dangerouslyAllowDirectRpc: true,
        });
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toContain("dangerouslyAllowDirectRpc");
        warnSpy.mockRestore();
    });
});

// ─── Successful RPC calls ─────────────────────────────────────────────────────

describe("FiberRpcClient — successful calls", () => {
    let client: FiberRpcClient;
    let fetchMock: MockedFunction<typeof fetch>;

    beforeEach(() => {
        fetchMock = mockFetch(rpcSuccess(1, INVOICE_RESULT));
        client = new FiberRpcClient({ url: PROXY_URL, fetch: fetchMock });
    });

    it("sends a well-formed JSON-RPC 2.0 request body", async () => {
        await client.newInvoice(INVOICE_PARAMS);

        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);

        expect(body.jsonrpc).toBe("2.0");
        expect(body.method).toBe("new_invoice");
        expect(body.params).toEqual([INVOICE_PARAMS]);
        expect(typeof body.id).toBe("number");
    });

    it("POSTs to the configured URL", async () => {
        await client.newInvoice(INVOICE_PARAMS);
        expect(fetchMock).toHaveBeenCalledWith(
            PROXY_URL,
            expect.objectContaining({ method: "POST" }),
        );
    });

    it("sets Content-Type header", async () => {
        await client.newInvoice(INVOICE_PARAMS);
        const [, init] = fetchMock.mock.calls[0];
        expect((init as RequestInit).headers).toMatchObject({
            "Content-Type": "application/json",
        });
    });

    it("merges custom headers", async () => {
        const withHeader = new FiberRpcClient({
            url: PROXY_URL,
            headers: { "X-Api-Key": "secret" },
            fetch: fetchMock,
        });
        await withHeader.newInvoice(INVOICE_PARAMS);
        const [, init] = fetchMock.mock.calls[0];
        expect((init as RequestInit).headers).toMatchObject({
            "X-Api-Key": "secret",
        });
    });

    it("returns the typed result from newInvoice", async () => {
        const result = await client.newInvoice(INVOICE_PARAMS);
        expect(result.invoice_address).toBe("fib1testaddress");
        expect(result.invoice.currency).toBe("Fibt");
    });

    it("increments the JSON-RPC id per call", async () => {
        const secondFetch = mockFetch(rpcSuccess(2, INVOICE_RESULT));
        const multiClient = new FiberRpcClient({
            url: PROXY_URL,
            fetch: vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(rpcSuccess(1, INVOICE_RESULT)),
                } as Response)
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(rpcSuccess(2, INVOICE_RESULT)),
                } as Response),
        });

        await multiClient.newInvoice(INVOICE_PARAMS);
        await multiClient.newInvoice(INVOICE_PARAMS);

        const firstBody = JSON.parse(
            (multiClient as any).fetchFn.mock.calls[0][1].body,
        );
        const secondBody = JSON.parse(
            (multiClient as any).fetchFn.mock.calls[1][1].body,
        );
        expect(secondBody.id).toBeGreaterThan(firstBody.id);
    });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("FiberRpcClient — error handling", () => {
    let client: FiberRpcClient;

    function makeClient(fetchImpl: typeof fetch) {
        return new FiberRpcClient({ url: PROXY_URL, fetch: fetchImpl });
    }

    it("throws RPC_ERROR on JSON-RPC error response", async () => {
        client = makeClient(mockFetch(rpcError(1, -32602, "invalid params")));

        await expect(client.newInvoice(INVOICE_PARAMS)).rejects.toMatchObject({
            code: FiberErrorCode.RPC_ERROR,
            rpcCode: -32602,
            method: "new_invoice",
            message: "invalid params",
        });
    });

    it("throws NETWORK_ERROR on HTTP 500", async () => {
        client = makeClient(mockFetch({ error: "server error" }, 500));

        await expect(client.newInvoice(INVOICE_PARAMS)).rejects.toMatchObject({
            code: FiberErrorCode.NETWORK_ERROR,
        });
    });

    it("throws NETWORK_ERROR when fetch itself rejects", async () => {
        const failFetch = vi
            .fn()
            .mockRejectedValue(new TypeError("Failed to fetch"));
        client = makeClient(failFetch as unknown as typeof fetch);

        await expect(client.newInvoice(INVOICE_PARAMS)).rejects.toMatchObject({
            code: FiberErrorCode.NETWORK_ERROR,
        });
    });

    it("throws INVALID_RESPONSE when response is not JSON", async () => {
        const badFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.reject(new SyntaxError("Unexpected token")),
        } as unknown as Response);
        client = makeClient(badFetch as unknown as typeof fetch);

        await expect(client.newInvoice(INVOICE_PARAMS)).rejects.toMatchObject({
            code: FiberErrorCode.INVALID_RESPONSE,
        });
    });

    it("throws REQUEST_TIMEOUT when AbortError is raised", async () => {
        const abortFetch = vi.fn().mockRejectedValue(
            Object.assign(new Error("The operation was aborted"), {
                name: "AbortError",
            }),
        );
        client = new FiberRpcClient({
            url: PROXY_URL,
            timeoutMs: 100,
            fetch: abortFetch as unknown as typeof fetch,
        });

        await expect(client.newInvoice(INVOICE_PARAMS)).rejects.toMatchObject({
            code: FiberErrorCode.REQUEST_TIMEOUT,
            message: expect.stringContaining("new_invoice"),
        });
    });
});

// ─── getInvoice ──────────────────────────────────────k─────────────────────────

describe("FiberRpcClient.getInvoice()", () => {
    it("calls get_invoice and returns status", async () => {
        const getInvoiceResult = {
            invoice_address: "fib1test",
            invoice: INVOICE_RESULT.invoice,
            status: "Paid",
        };
        const fetchMock = mockFetch(rpcSuccess(1, getInvoiceResult));
        const client = new FiberRpcClient({ url: PROXY_URL, fetch: fetchMock });

        const result = await client.getInvoice({
            payment_hash: "0xabc123",
        });

        expect(result.status).toBe("Paid");

        const [, init] = fetchMock.mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.method).toBe("get_invoice");
    });
});
