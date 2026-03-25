// ─── Core ─────────────────────────────────────────────────────────────────────
export { FiberError, FiberErrorCode } from "./core/fiber-error.js";
export { FiberRpcClient } from "./core/rpc-client.js";
export { ASSETS, getAsset, isUdtAsset } from "./core/assets.js";
export type { AssetConfig, AssetId } from "./core/assets.js";

// ─── Utils ────────────────────────────────────────────────────────────────────
export {
  isHexString,
  toHex,
  toHexNumber,
  fromHex,
  fromHexNumber,
  ckbToShannon,
  shannonToCkb,
  ckbToShannonHex,
  shannonHexToCkb,
  formatAmount,
} from "./utils/hex.js";

export { generatePreimage, isValidPreimage } from "./utils/preimage.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export type { HexString, Pubkey, HashAlgorithm, Script } from "./types/common.js";

export type {
  Currency,
  CkbInvoiceStatus,
  Attribute,
  InvoiceData,
  CkbInvoice,
  NewInvoiceParams,
  InvoiceResult,
  InvoiceParams,
  GetInvoiceResult,
  ParseInvoiceParams,
  ParseInvoiceResult,
} from "./types/invoice.js";

export type {
  PaymentSessionStatus,
  PaymentCustomRecords,
  SessionRouteNode,
  GetPaymentCommandResult,
  GetPaymentCommandParams,
  HopHint,
  HopRequire,
  RouterHop,
  SendPaymentCommandParams,
  BuildRouterParams,
  BuildPaymentRouterResult,
  SendPaymentWithRouterParams,
} from "./types/payment.js";

export type {
  Channel,
  ChannelState,
  ListChannelsParams,
  ListChannelsResult,
  OpenChannelParams,
  OpenChannelResult,
  AcceptChannelParams,
  AcceptChannelResult,
  AbandonChannelParams,
  ShutdownChannelParams,
  UpdateChannelParams,
} from "./types/channel.js";

// ─── Hooks ────────────────────────────────────────────────────────────────────
export { useFiberInvoice } from "./hooks/use-fiber-invoice.js";
export type {
  UseFiberInvoiceOptions,
  UseFiberInvoiceResult,
} from "./hooks/use-fiber-invoice.js";