import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { FiberCheckout } from "../../components/FiberCheckout";
import * as InvoiceHook from "../../hooks/use-fiber-invoice";
import * as PaymentHook from "../../hooks/use-fiber-payment";
import { FiberError } from "../../core/fiber-error";
import type { UseFiberInvoiceResult } from "../../hooks/use-fiber-invoice";
import type { UseFiberPaymentResult } from "../../hooks/use-fiber-payment";

// ─── Mock both hooks ──────────────────────────────────────────────────────────

const DEFAULT_INVOICE: UseFiberInvoiceResult = {
  invoiceAddress: "fibt1testinvoiceaddress",
  invoice: null,
  paymentHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
  expiresAt: Date.now() + 3_600_000,
  isLoading: false,
  error: null,
  regenerate: vi.fn(),
};

const DEFAULT_PAYMENT: UseFiberPaymentResult = {
  status: "pending",
  feePaid: null,
  isLoading: false,
  error: null,
  poll: vi.fn(),
};

function mockHooks(
  invoice: Partial<UseFiberInvoiceResult> = {},
  payment: Partial<UseFiberPaymentResult> = {}
) {
  vi.spyOn(InvoiceHook, "useFiberInvoice").mockReturnValue({
    ...DEFAULT_INVOICE,
    ...invoice,
  });
  vi.spyOn(PaymentHook, "useFiberPayment").mockReturnValue({
    ...DEFAULT_PAYMENT,
    ...payment,
  });
}

const BASE_PROPS = {
  amount: "0x5f5e100" as const,
  asset: "CKB" as const,
  nodeUrl: "https://example.com/api/fiber-rpc",
};

beforeEach(() => {
  mockHooks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FiberCheckout", () => {
  describe("rendering", () => {
    it("renders the formatted amount", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText("1 CKB")).toBeInTheDocument();
    });

    it("renders RUSD amount correctly", () => {
      render(<FiberCheckout {...BASE_PROPS} asset="RUSD" />);
      expect(screen.getByText("1 RUSD")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
      render(<FiberCheckout {...BASE_PROPS} description="Coffee payment" />);
      expect(screen.getByText("Coffee payment")).toBeInTheDocument();
    });

    it("does not render description when omitted", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.queryByText("Coffee payment")).not.toBeInTheDocument();
    });

    it("renders QR code when invoiceAddress is available", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      // qrcode.react renders an svg
      expect(document.querySelector("svg")).toBeInTheDocument();
    });

    it("does not render QR when invoiceAddress is null", () => {
      mockHooks({ invoiceAddress: null });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(document.querySelector("svg")).not.toBeInTheDocument();
    });

    it("shows loading placeholder while invoice is loading", () => {
      mockHooks({ invoiceAddress: null, isLoading: true });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText("Generating…")).toBeInTheDocument();
    });
  });

  describe("status badge", () => {
    it("shows pending status by default", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Waiting for payment/)).toBeInTheDocument();
    });

    it("shows processing status", () => {
      mockHooks({}, { status: "processing" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Processing/)).toBeInTheDocument();
    });

    it("shows success status", () => {
      mockHooks({}, { status: "success" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Payment confirmed/)).toBeInTheDocument();
    });

    it("shows expired status", () => {
      mockHooks({}, { status: "expired" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Invoice expired/)).toBeInTheDocument();
    });

    it("shows failed status", () => {
      mockHooks({}, { status: "failed" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Payment failed/)).toBeInTheDocument();
    });
  });

  describe("copy button", () => {
    it("renders copy button when invoice is available and status is pending", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByRole("button", { name: /copy invoice/i })).toBeInTheDocument();
    });

    it("hides copy button on success", () => {
      mockHooks({}, { status: "success" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.queryByRole("button", { name: /copy invoice/i })).not.toBeInTheDocument();
    });

    it("calls clipboard.writeText on copy click", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      render(<FiberCheckout {...BASE_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: /copy invoice/i }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith("fibt1testinvoiceaddress")
      );
    });
  });

  describe("retry button", () => {
    it("shows retry button on expired status", () => {
      mockHooks({}, { status: "expired" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(
        screen.getByRole("button", { name: /generate new invoice/i })
      ).toBeInTheDocument();
    });

    it("shows retry button on failed status", () => {
      mockHooks({}, { status: "failed" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(
        screen.getByRole("button", { name: /generate new invoice/i })
      ).toBeInTheDocument();
    });

    it("does not show retry button on success", () => {
      mockHooks({}, { status: "success" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(
        screen.queryByRole("button", { name: /generate new invoice/i })
      ).not.toBeInTheDocument();
    });

    it("calls regenerate when retry is clicked", () => {
      const regenerate = vi.fn();
      mockHooks({ regenerate }, { status: "expired" });
      render(<FiberCheckout {...BASE_PROPS} />);
      fireEvent.click(screen.getByRole("button", { name: /generate new invoice/i }));
      expect(regenerate).toHaveBeenCalledOnce();
    });
  });

  describe("error display", () => {
    it("renders invoice error message", () => {
      const error = FiberError.rpcError("Node unavailable");
      mockHooks({ error, invoiceAddress: null });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText("Node unavailable")).toBeInTheDocument();
    });

    it("renders payment error message", () => {
      const error = FiberError.networkError("Connection lost");
      mockHooks({}, { error });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText("Connection lost")).toBeInTheDocument();
    });

    it("calls onError when invoice error occurs", () => {
      const onError = vi.fn();
      const error = FiberError.rpcError("fail");
      mockHooks({ error, invoiceAddress: null });
      render(<FiberCheckout {...BASE_PROPS} onError={onError} />);
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe("callbacks wired to hooks", () => {
    it("passes onSuccess to useFiberPayment", () => {
      const onSuccess = vi.fn();
      render(<FiberCheckout {...BASE_PROPS} onSuccess={onSuccess} />);
      const callArgs = (PaymentHook.useFiberPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.onSuccess).toBe(onSuccess);
    });

    it("passes onExpired to useFiberPayment", () => {
      const onExpired = vi.fn();
      render(<FiberCheckout {...BASE_PROPS} onExpired={onExpired} />);
      const callArgs = (PaymentHook.useFiberPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.onExpired).toBe(onExpired);
    });

    it("passes dangerouslyAllowDirectRpc to both hooks", () => {
      render(<FiberCheckout {...BASE_PROPS} dangerouslyAllowDirectRpc={true} />);
      const invoiceArgs = (InvoiceHook.useFiberInvoice as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const paymentArgs = (PaymentHook.useFiberPayment as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(invoiceArgs.dangerouslyAllowDirectRpc).toBe(true);
      expect(paymentArgs.dangerouslyAllowDirectRpc).toBe(true);
    });
  });

  describe("expiry hint", () => {
    it("shows expiry time while pending", () => {
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.getByText(/Expires at/)).toBeInTheDocument();
    });

    it("hides expiry hint after success", () => {
      mockHooks({}, { status: "success" });
      render(<FiberCheckout {...BASE_PROPS} />);
      expect(screen.queryByText(/Expires at/)).not.toBeInTheDocument();
    });
  });
});