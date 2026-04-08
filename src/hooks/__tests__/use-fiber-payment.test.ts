import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFiberPayment } from "../../hooks/use-fiber-payment";
import * as RpcClientModule from "../../core/rpc-client";
import { FiberError } from "../../core/fiber-error";
import type { GetInvoiceResult } from "../../types/invoice";
import type { GetPaymentCommandResult } from "../../types/payment";
import type { HexString } from "../../types/common";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAYMENT_HASH: HexString =
  "0xdeadbeef00000000000000000000000000000000000000000000000000000000";

const BASE_OPTIONS = {
  nodeUrl: "https://example.com/api/fiber-rpc",
  paymentHash: PAYMENT_HASH,
  pollIntervalMs: 50, // fast polling in tests
};

function makeInvoiceResult(
  status: GetInvoiceResult["status"]
): GetInvoiceResult {
  return {
    invoice_address: "fibt1test",
    invoice: {
      currency: "Fibt",
      amount: "0x64",
      data: { timestamp: "0x1", payment_hash: PAYMENT_HASH, attrs: [] },
    },
    status,
  };
}

// ─── Mock setup ───────────────────────────────────────────────────────────────

const DEFAULT_GET_PAYMENT: GetPaymentCommandResult = {
  payment_hash: PAYMENT_HASH,
  status: "Success",
  created_at: "0x0",
  last_updated_at: "0x0",
  fee: "0x3e8",
};

function makeMockClient(
  getInvoice: () => Promise<GetInvoiceResult> = vi
    .fn()
    .mockResolvedValue(makeInvoiceResult("Open")),
  getPayment: () => Promise<GetPaymentCommandResult> = vi
    .fn()
    .mockResolvedValue(DEFAULT_GET_PAYMENT)
) {
  return {
    getInvoice,
    getPayment,
    newInvoice: vi.fn(),
    call: vi.fn(),
  };
}

let mockClient: ReturnType<typeof makeMockClient>;

beforeEach(() => {
  vi.useFakeTimers();
  mockClient = makeMockClient();
  vi.spyOn(RpcClientModule, "FiberRpcClient").mockImplementation(
    () => mockClient as any
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFiberPayment", () => {
  describe("idle state", () => {
    it("starts idle when paymentHash is null", () => {
      const { result } = renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, paymentHash: null })
      );
      expect(result.current.status).toBe("idle");
      expect(result.current.isLoading).toBe(false);
    });

    it("starts idle when paymentHash is undefined", () => {
      const { result } = renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, paymentHash: undefined })
      );
      expect(result.current.status).toBe("idle");
    });

    it("does not call getInvoice when paymentHash is null", async () => {
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, paymentHash: null })
      );
      await act(async () => { vi.advanceTimersByTime(200); });
      expect(mockClient.getInvoice).not.toHaveBeenCalled();
    });
  });

  describe("status mapping", () => {
    it("maps Open → pending", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Open"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("pending");
    });

    it("maps Received → processing", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Received"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("processing");
    });

    it("maps Paid → success", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Paid"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("success");
      expect(result.current.feePaid).toBe(DEFAULT_GET_PAYMENT.fee);
    });

    it("maps Cancelled → failed", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Cancelled"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("failed");
    });

    it("maps Expired → expired", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Expired"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("expired");
    });
  });

  describe("polling", () => {
    it("polls on mount immediately", async () => {
      renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(mockClient.getInvoice).toHaveBeenCalledOnce();
    });

    it("polls again after interval elapses", async () => {
      renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(110);
        await Promise.resolve();
      });
      // immediate + after 50ms + after 100ms = 3 calls
      expect(mockClient.getInvoice).toHaveBeenCalledTimes(3);
    });

    it("stops polling on success", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Paid"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("success");

      const callCount = (mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });
      // No more calls after terminal state
      expect((mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    it("stops polling on expired", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Expired"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("expired");

      const callCount = (mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });
      expect((mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });

    it("resets to idle and restarts polling when paymentHash changes", async () => {
      const { result, rerender } = renderHook(
        (props: { paymentHash: HexString | null }) =>
          useFiberPayment({ ...BASE_OPTIONS, paymentHash: props.paymentHash }),
        { initialProps: { paymentHash: PAYMENT_HASH as HexString | null } }
      );

      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("pending");

      rerender({ paymentHash: null });
      expect(result.current.status).toBe("idle");
    });
  });

  describe("client-side expiry", () => {
    it("transitions to expired immediately if expiresAt is in the past", async () => {
      const pastExpiry = Date.now() - 1000;
      const { result } = renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, expiresAt: pastExpiry })
      );
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("expired");
    });

    it("does not call getInvoice when already expired client-side", async () => {
      const pastExpiry = Date.now() - 1000;
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, expiresAt: pastExpiry })
      );
      await act(async () => { await Promise.resolve(); });
      expect(mockClient.getInvoice).not.toHaveBeenCalled();
    });

    it("calls onExpired when expired client-side", async () => {
      const onExpired = vi.fn();
      const pastExpiry = Date.now() - 1000;
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, expiresAt: pastExpiry, onExpired })
      );
      await act(async () => { await Promise.resolve(); });
      expect(onExpired).toHaveBeenCalledOnce();
    });
  });

  describe("callbacks", () => {
    it("sets feePaid from get_payment when invoice is Paid", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Paid"));
      mockClient.getPayment = vi.fn().mockResolvedValue({
        ...DEFAULT_GET_PAYMENT,
        fee: "0xbeef",
      });
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.feePaid).toBe("0xbeef");
      expect(mockClient.getPayment).toHaveBeenCalledWith({
        payment_hash: PAYMENT_HASH,
      });
    });

    it("leaves feePaid null when get_payment fails", async () => {
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Paid"));
      mockClient.getPayment = vi
        .fn()
        .mockRejectedValue(FiberError.rpcError("payment not found"));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.status).toBe("success");
      expect(result.current.feePaid).toBeNull();
    });

    it("calls onSuccess when status becomes success", async () => {
      const onSuccess = vi.fn();
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Paid"));
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, onSuccess })
      );
      await act(async () => { await Promise.resolve(); });
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(onSuccess).toHaveBeenCalledWith(PAYMENT_HASH);
    });

    it("calls onExpired when node returns Expired", async () => {
      const onExpired = vi.fn();
      mockClient.getInvoice = vi.fn().mockResolvedValue(makeInvoiceResult("Expired"));
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, onExpired })
      );
      await act(async () => { await Promise.resolve(); });
      expect(onExpired).toHaveBeenCalledOnce();
    });

    it("calls onError on RPC failure", async () => {
      const onError = vi.fn();
      mockClient.getInvoice = vi
        .fn()
        .mockRejectedValue(FiberError.rpcError("node error"));
      renderHook(() =>
        useFiberPayment({ ...BASE_OPTIONS, onError })
      );
      await act(async () => { await Promise.resolve(); });
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(FiberError);
    });
  });

  describe("error handling", () => {
    it("surfaces error in error state", async () => {
      mockClient.getInvoice = vi
        .fn()
        .mockRejectedValue(FiberError.rpcError("not found", -32603));
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.error).toBeInstanceOf(FiberError);
      expect(result.current.error?.code).toBe("RPC_ERROR");
    });

    it("clears error on successful poll after failure", async () => {
      mockClient.getInvoice = vi
        .fn()
        .mockRejectedValueOnce(FiberError.rpcError("transient"))
        .mockResolvedValueOnce(makeInvoiceResult("Open"));

      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });
      expect(result.current.error).not.toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(60);
        await Promise.resolve();
      });
      expect(result.current.error).toBeNull();
      expect(result.current.status).toBe("pending");
    });
  });

  describe("manual poll()", () => {
    it("triggers an immediate poll when called", async () => {
      const { result } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });

      const before = (mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length;
      await act(async () => {
        result.current.poll();
        await Promise.resolve();
      });
      expect((mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
    });
  });

  describe("cleanup", () => {
    it("clears interval on unmount", async () => {
      const { unmount } = renderHook(() => useFiberPayment(BASE_OPTIONS));
      await act(async () => { await Promise.resolve(); });

      unmount();
      const callCount = (mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(300);
        await Promise.resolve();
      });
      expect((mockClient.getInvoice as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });
  });
});