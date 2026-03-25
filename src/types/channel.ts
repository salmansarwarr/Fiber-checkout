import type { HexString, Pubkey, Script } from "./common.js";

export interface OpenChannelParams {
  pubkey: Pubkey;
  funding_amount: HexString;
  public?: boolean;
  funding_udt_type_script?: Script;
  shutdown_script?: Script;
  commitment_delay_epoch?: HexString;
  commitment_fee_rate?: HexString;
  funding_fee_rate?: HexString;
  tlc_expiry_delta?: HexString;
  tlc_min_value?: HexString;
  tlc_fee_proportional_millionths?: HexString;
  max_tlc_value_in_flight?: HexString;
  max_tlc_number_in_flight?: HexString;
}

export interface OpenChannelResult {
  temporary_channel_id: HexString;
}

export interface AbandonChannelParams {
  channel_id: HexString;
}

export interface AcceptChannelParams {
  temporary_channel_id: HexString;
  funding_amount: HexString;
  shutdown_script?: Script;
  max_tlc_value_in_flight?: HexString;
  max_tlc_number_in_flight?: HexString;
  tlc_min_value?: HexString;
  tlc_fee_proportional_millionths?: HexString;
  tlc_expiry_delta?: HexString;
}

export interface AcceptChannelResult {
  channel_id: HexString;
}

export interface ListChannelsParams {
  pubkey?: Pubkey;
  include_closed?: boolean;
}

export interface ChannelState {
  state_name: string;
  state_flags: string[];
}

export interface Channel {
  channel_id: HexString;
  is_public: boolean;
  channel_outpoint: HexString;
  pubkey: Pubkey;
  funding_udt_type_script?: Script;
  state: ChannelState;
  local_balance: HexString;
  offered_tlc_balance: HexString;
  remote_balance: HexString;
  received_tlc_balance: HexString;
  latest_commitment_transaction_hash?: HexString;
  created_at: HexString;
  enabled: boolean;
  tlc_expiry_delta: HexString;
  tlc_fee_proportional_millionths: HexString;
  shutdown_transaction_hash?: HexString;
}

export interface ShutdownChannelParams {
  channel_id: HexString;
  close_script?: Script;
  fee_rate?: HexString;
  force?: boolean;
}

export interface UpdateChannelParams {
  channel_id: HexString;
  enabled?: boolean;
  tlc_expiry_delta?: HexString;
  tlc_minimum_value?: HexString;
  tlc_fee_proportional_millionths?: HexString;
}

export interface ListChannelsResult {
  channels: Channel[];
}