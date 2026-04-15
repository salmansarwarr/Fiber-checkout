# Fiber Network Payment Verification

This document provides a step-by-step verification path for payments using `fiber-checkout`.

## 1. Wallet Used

For testing and demonstration, we use the **official Fiber command-line testnet node**.

## 2. Scan & Pay

1. The `fiber-checkout` component generates a `lightning:` prefixed Bech32m invoice.
2. The invoice is sent to the Fiber node via `send_payment` RPC.
3. The invoice used in this test: `fibt1000000001peymvjde5cjgfw0pnm6vksuv9ej05ufln9d3vfpjk3swmgm9aaazfns3n8xgh9wedvqmacptyypkaryw487y9u30fygz0xh8t6cwv3qd30nsgqjc7djq53wjx4y9fc35ppz54k2tfa4u8ls9ta49q6kslc27sx483x3e55eyh97tlf0tkzc8t6dkwhuwhgz64wtwy29pwgruhazlym098uuj8mknwnk74jnwxrummhehsss546z4klajwlw9k4g2yxgf68j4g9d9etzz0rcse7kr2vnzd6s0ql2unvwlz9rrpegn9jwfwkskz5rwtdttmkn2cl3z8uj6tmmz68yv6vqw3n2l2v24m6aw7uxsjgqn3uwpv`

## 3. Transaction Confirmation

Once the payment is broadcasted on the Fiber Network:

- The `fiber-checkout` component transitions to the **"Processing"** state.
- Within 1-2 seconds, the node confirms the payment settlement.
- The component transitions to the **"Success"** state.

## 4. Balance Change & Proof of Payment

After the "Success" state is reached, the sender's balance is updated immediately.

- **Status**: `Success` (Confirmed via `get_payment`)
- **Payment Hash**: `0xbbca7def2d1e0a5fa090350429848e65c823f4dbe470bcbb88e28b1624685c92`
- **Fee Paid**: `0x186a0` Shannons
- **CKB Explorer Link**: Since Fiber is a Layer 2 network, the individual payment is off-chain. However, the channel settlement or funding can be viewed on the [CKB Explorer](https://explorer.nervos.org/testnet).

### Verification Checklist

- [x] Invoice generated with correct amount.
- [x] Wallet successfully parses the Bech32m string.
- [x] RPC call to `get_invoice` returns `Paid` status.
- [x] UI displays confirmation checkmark.
