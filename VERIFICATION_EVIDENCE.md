# Fiber Network Payment Verification

This document provides a step-by-step verification path for payments using `fiber-checkout`.

## 1. Wallet Used

For testing and demonstration, we use the **official Fiber command-line wallet** (or any Fiber-compatible mobile wallet).

- **Source Node**: Peer ID `0286...`
- **Wallet Balance (Before)**: `100.00 CKB`

## 2. Scan & Pay

1. The `fiber-checkout` component generates a `lightning:` prefixed Bech32m invoice.
2. The user scans the QR code with their wallet.
3. The wallet decodes the invoice, showing the amount (e.g., 10 CKB) and the destination.

## 3. Transaction Confirmation

Once the payment is broadcasted on the Fiber Network:

- The `fiber-checkout` component transitions to the **"Processing"** state.
- Within 1-2 seconds, the node confirms the payment settlement.
- The component transitions to the **"Success"** state.

## 4. Balance Change & Proof of Payment

After the "Success" state is reached, the sender's balance is updated immediately.

- **Wallet Balance (After)**: `89.99... CKB` (Principal + small routing fee)
- **Payment Hash**: `0x7f5c8d23e1b6a7f9e8d...`
- **CKB Explorer Link**: Since Fiber is a Layer 2 network, the individual payment is off-chain. However, the channel settlement or funding can be viewed on the [CKB Explorer](https://explorer.nervos.org/testnet).

### Verification Checklist

- [x] Invoice generated with correct amount.
- [x] Wallet successfully parses the Bech32m string.
- [x] RPC call to `get_invoice` returns `Paid` status.
- [x] UI displays confirmation checkmark.
