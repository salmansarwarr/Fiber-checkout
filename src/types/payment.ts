import type { HexString, Pubkey, Script } from "./common.js";

export type PaymentSessionStatus = "Created" | "Inflight" | "Success" | "Failed";

export interface PaymentCustomRecords {
  [k: HexString]: HexString;
}

export interface SessionRouteNode {
  pubkey: Pubkey;
  amount: HexString;
  channel_outpoint: HexString;
}

export interface GetPaymentCommandResult {
  payment_hash: HexString;
  status: PaymentSessionStatus;
  created_at: HexString;
  last_updated_at: HexString;
  failed_error?: string;
  fee: HexString;
  custom_records?: PaymentCustomRecords;
  routers?: { nodes: SessionRouteNode[] }[];
}

export interface GetPaymentCommandParams {
  payment_hash: HexString;
}

export interface HopHint {
  pubkey: Pubkey;
  channel_outpoint: HexString;
  fee_rate: HexString;
  tlc_expiry_delta: HexString;
}

export interface HopRequire {
  pubkey: Pubkey;
  channel_outpoint?: HexString;
}

export interface RouterHop {
  target: Pubkey;
  channel_outpoint: HexString;
  amount_received: HexString;
  incoming_tlc_expiry: HexString;
}

export interface SendPaymentCommandParams {
  target_pubkey?: Pubkey;
  amount?: HexString;
  payment_hash?: HexString;
  final_tlc_expiry_delta?: HexString;
  tlc_expiry_limit?: HexString;
  invoice?: string;
  timeout?: HexString;
  max_fee_amount?: HexString;
  max_fee_rate?: HexString;
  max_parts?: HexString;
  trampoline_hops?: Pubkey[];
  keysend?: boolean;
  udt_type_script?: Script;
  allow_self_payment?: boolean;
  custom_records?: PaymentCustomRecords;
  hop_hints?: HopHint[];
  dry_run?: boolean;
}

export interface BuildRouterParams {
  amount?: HexString;
  udt_type_script?: Script;
  hops_info: HopRequire[];
  final_tlc_expiry_delta?: HexString;
}

export interface BuildPaymentRouterResult {
  router_hops: RouterHop[];
}

export interface SendPaymentWithRouterParams {
  payment_hash?: HexString;
  router: RouterHop[];
  invoice?: string;
  custom_records?: PaymentCustomRecords;
  keysend?: boolean;
  udt_type_script?: Script;
  dry_run?: boolean;
}