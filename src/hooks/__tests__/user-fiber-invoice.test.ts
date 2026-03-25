import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFiberInvoice } from "../../hooks/use-fiber-invoice";
import * as RpcClientModule from "../../core/rpc-client";
import { FiberError } from "../../core/fiber-error";
import type { InvoiceResult } from "../../types/invoice";
import type { HexString } from "../../types/common";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_INVOICE_RESULT: InvoiceResult = {
  invoice_address: "fibt1testaddress",
  invoice: {
    currency: "Fibt",
    amount: "0x64",
    data: {
      timestamp: "0x1958944fa64",
      payment_hash:
        "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
      attrs: [],
    },
  },
};

const BASE_OPTIONS = {
  nodeUrl: "https://example.com/api/fiber-rpc",
  amount: "0x64" as const,
  asset: "CKB" as const,
};

// ─── Mock setup ───────────────────────────────────────────────────────────────

function makeMockClient(overrides?: Partial<{ newInvoice: () => Promise<InvoiceResult> }>) {
  return {
    newInvoice: overrides?.newInvoice ?? vi.fn().mockResolvedValue(MOCK_INVOICE_RESULT),
    getInvoice: vi.fn(),
    call: vi.fn(),
  };
}

let mockClient: ReturnType<typeof makeMockClient>;

beforeEach(() => {
  mockClient = makeMockClient();
  vi.spyOn(RpcClientModule, "FiberRpcClient").mockImplementation(
    () => mockClient as any
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFiberInvoice", () => {
  describe("initial load", () => {
    it("starts in loading state", () => {
      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));
      expect(result.current.isLoading).toBe(true);
      expect(result.current.invoiceAddress).toBeNull();
      expect(result.current.paymentHash).toBeNull();
    });

    it("resolves invoice after successful RPC call", async () => {
      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.invoiceAddress).toBe("fibt1testaddress");
      expect(result.current.paymentHash).toBe(
        "0xdeadbeef00000000000000000000000000000000000000000000000000000000"
      );
      expect(result.current.invoice).not.toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("computes expiresAt from invoice timestamp + expirySeconds", async () => {
      const { result } = renderHook(() =>
        useFiberInvoice({ ...BASE_OPTIONS, expirySeconds: 3600 })
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // timestamp 0x1958944fa64 = 1740788285540ms
      const expectedExpiry = 0x1958944fa64 + 3600 * 1000;
      expect(result.current.expiresAt).toBe(expectedExpiry);
    });
  });

  describe("newInvoice RPC call", () => {
    it("passes amount and asset to newInvoice", async () => {
      renderHook(() =>
        useFiberInvoice({ ...BASE_OPTIONS, amount: "0x5f5e100", asset: "CKB" })
      );

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledOnce()
      );

      const [params] = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params.amount).toBe("0x5f5e100");
      expect(params.udt_type_script).toBeUndefined(); // CKB has no UDT script
    });

    it("includes udt_type_script for RUSD asset", async () => {
      renderHook(() =>
        useFiberInvoice({ ...BASE_OPTIONS, asset: "RUSD" })
      );

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledOnce()
      );

      const [params] = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params.udt_type_script).toBeDefined();
      expect(params.udt_type_script.code_hash).toBe(
        "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a"
      );
    });

    it("passes description when provided", async () => {
      renderHook(() =>
        useFiberInvoice({ ...BASE_OPTIONS, description: "Test payment" })
      );

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledOnce()
      );

      const [params] = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params.description).toBe("Test payment");
    });

    it("uses default expiry of 3600s", async () => {
      renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledOnce()
      );

      const [params] = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params.expiry).toBe("0xe10"); // 3600 in hex
    });

    it("passes custom expiry", async () => {
      renderHook(() =>
        useFiberInvoice({ ...BASE_OPTIONS, expirySeconds: 7200 })
      );

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledOnce()
      );

      const [params] = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(params.expiry).toBe("0x1c20"); // 7200 in hex
    });

    it("generates a unique preimage per call", async () => {
      const { result, rerender } = renderHook(() =>
        useFiberInvoice(BASE_OPTIONS)
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.regenerate());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const calls = (mockClient.newInvoice as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].payment_preimage).not.toBe(calls[1][0].payment_preimage);
    });
  });

  describe("error handling", () => {
    it("surfaces FiberError in error state", async () => {
      mockClient.newInvoice = vi
        .fn()
        .mockRejectedValue(FiberError.rpcError("invalid params", -32602));

      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeInstanceOf(FiberError);
      expect(result.current.error?.code).toBe("RPC_ERROR");
      expect(result.current.invoiceAddress).toBeNull();
    });

    it("wraps non-FiberError in a NETWORK_ERROR", async () => {
      mockClient.newInvoice = vi
        .fn()
        .mockRejectedValue(new TypeError("fetch failed"));

      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error?.code).toBe("NETWORK_ERROR");
    });

    it("clears error on successful regenerate", async () => {
      mockClient.newInvoice = vi
        .fn()
        .mockRejectedValueOnce(FiberError.rpcError("fail"))
        .mockResolvedValueOnce(MOCK_INVOICE_RESULT);

      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.error).not.toBeNull());

      act(() => result.current.regenerate());

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeNull();
      expect(result.current.invoiceAddress).toBe("fibt1testaddress");
    });
  });

  describe("regenerate()", () => {
    it("triggers a new RPC call", async () => {
      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.regenerate());

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledTimes(2)
      );
    });

    it("resets state to loading on regenerate", async () => {
      const { result } = renderHook(() => useFiberInvoice(BASE_OPTIONS));

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.regenerate());

      expect(result.current.isLoading).toBe(true);
      expect(result.current.invoiceAddress).toBeNull();
    });
  });

  describe("input changes", () => {
    it("re-fetches when amount changes", async () => {
      const { result, rerender } = renderHook(
        (props: { amount: HexString }) =>
          useFiberInvoice({ ...BASE_OPTIONS, amount: props.amount }),
        { initialProps: { amount: "0x64" as HexString } }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      rerender({ amount: "0xc8" as HexString });

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledTimes(2)
      );
    });

    it("re-fetches when asset changes", async () => {
      const { result, rerender } = renderHook(
        (props: { asset: "CKB" | "RUSD" }) =>
          useFiberInvoice({ ...BASE_OPTIONS, asset: props.asset }),
        { initialProps: { asset: "CKB" as "CKB" | "RUSD" } }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      rerender({ asset: "RUSD" });

      await waitFor(() =>
        expect(mockClient.newInvoice).toHaveBeenCalledTimes(2)
      );
    });
  });

  describe("cleanup", () => {
    it("does not set state after unmount", async () => {
      let resolve: (v: InvoiceResult) => void;
      const pending = new Promise<InvoiceResult>((r) => (resolve = r));
      mockClient.newInvoice = vi.fn().mockReturnValue(pending);

      const { result, unmount } = renderHook(() =>
        useFiberInvoice(BASE_OPTIONS)
      );

      expect(result.current.isLoading).toBe(true);
      unmount();

      // Resolve after unmount — should not cause state updates or warnings
      act(() => resolve!(MOCK_INVOICE_RESULT));

      // No assertion needed — test passes if no "can't update unmounted component" warning
    });
  });
});