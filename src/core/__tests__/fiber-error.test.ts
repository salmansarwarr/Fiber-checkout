import { describe, it, expect } from "vitest";
import { FiberError, FiberErrorCode } from "../fiber-error";

describe("FiberError", () => {
    describe("construction", () => {
        it("sets name to FiberError", () => {
            const err = new FiberError({
                code: FiberErrorCode.RPC_ERROR,
                message: "test",
            });
            expect(err.name).toBe("FiberError");
        });

        it("sets code and message", () => {
            const err = new FiberError({
                code: FiberErrorCode.NETWORK_ERROR,
                message: "connection refused",
            });
            expect(err.code).toBe(FiberErrorCode.NETWORK_ERROR);
            expect(err.message).toBe("connection refused");
        });

        it("is an instance of Error", () => {
            const err = new FiberError({
                code: FiberErrorCode.RPC_ERROR,
                message: "x",
            });
            expect(err).toBeInstanceOf(Error);
        });

        it("is an instance of FiberError", () => {
            const err = new FiberError({
                code: FiberErrorCode.RPC_ERROR,
                message: "x",
            });
            expect(err).toBeInstanceOf(FiberError);
        });

        it("attaches cause when provided", () => {
            const cause = new Error("original");
            const err = new FiberError({
                code: FiberErrorCode.NETWORK_ERROR,
                message: "wrapped",
                cause,
            });
            expect(err.cause).toBe(cause);
        });
    });

    describe("FiberError.rpcError()", () => {
        it("creates a RPC_ERROR with code and method", () => {
            const err = FiberError.rpcError(
                "invalid params",
                -32602,
                "new_invoice",
            );
            expect(err.code).toBe(FiberErrorCode.RPC_ERROR);
            expect(err.rpcCode).toBe(-32602);
            expect(err.method).toBe("new_invoice");
        });

        it("works without optional fields", () => {
            const err = FiberError.rpcError("something went wrong");
            expect(err.code).toBe(FiberErrorCode.RPC_ERROR);
            expect(err.rpcCode).toBeUndefined();
            expect(err.method).toBeUndefined();
        });
    });

    describe("FiberError.directRpcBlocked()", () => {
        it("creates a DIRECT_RPC_BLOCKED error", () => {
            const err = FiberError.directRpcBlocked("http://127.0.0.1:8227");
            expect(err.code).toBe(FiberErrorCode.DIRECT_RPC_BLOCKED);
        });

        it("includes the blocked URL in the message", () => {
            const url = "http://192.168.1.50:8080";
            const err = FiberError.directRpcBlocked(url);
            expect(err.message).toContain(url);
        });

        it("mentions the escape hatch in the message", () => {
            const err = FiberError.directRpcBlocked("http://127.0.0.1");
            expect(err.message).toContain("dangerouslyAllowDirectRpc");
        });
    });

    describe("FiberError.networkError()", () => {
        it("creates a NETWORK_ERROR", () => {
            const err = FiberError.networkError("fetch failed");
            expect(err.code).toBe(FiberErrorCode.NETWORK_ERROR);
            expect(err.message).toBe("fetch failed");
        });
    });

    describe("FiberError.invalidResponse()", () => {
        it("creates an INVALID_RESPONSE error", () => {
            const err = FiberError.invalidResponse("not JSON");
            expect(err.code).toBe(FiberErrorCode.INVALID_RESPONSE);
        });
    });

    describe("FiberError.timeout()", () => {
        it("creates a REQUEST_TIMEOUT with method and duration in message", () => {
            const err = FiberError.timeout("get_invoice", 5000);
            expect(err.code).toBe(FiberErrorCode.REQUEST_TIMEOUT);
            expect(err.message).toContain("get_invoice");
            expect(err.message).toContain("5000");
        });
    });

    describe("FiberError.is()", () => {
        it("returns true for FiberError instances", () => {
            const err = FiberError.networkError("x");
            expect(FiberError.is(err)).toBe(true);
        });

        it("returns false for plain Error", () => {
            expect(FiberError.is(new Error("plain"))).toBe(false);
        });

        it("returns false for non-errors", () => {
            expect(FiberError.is("string")).toBe(false);
            expect(FiberError.is(null)).toBe(false);
            expect(FiberError.is(42)).toBe(false);
        });
    });
});
