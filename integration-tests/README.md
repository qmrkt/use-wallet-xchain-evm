# Integration tests

These tests exercise the full signing pipeline against a real algokit localnet:
derive Algorand address → fund → build txn → sign via EIP-712 → submit → confirm.

Run separately from the unit suite. They require Docker and `algokit` on PATH;
the default `pnpm test` does **not** run them.

## Run

```sh
algokit localnet start              # one-time, leaves Docker containers running
pnpm test:integration               # runs the full integration suite
```

To stop localnet: `algokit localnet stop`.

## What they cover

| File | What it proves |
|---|---|
| `round-trip.test.ts` | Derive → fund → sign → submit → confirm a self-payment. End-to-end cryptographic proof against real algod. |
| `network-binding.test.ts` | EIP-712 digest captures the txn's genesis hash; signatures for identical-shape txns on different networks differ. Rebuilding the SDK against a fresh `AlgorandClient` yields the same derived address (deterministic). |
| `multi-signer.test.ts` | Atomic group with one xChain-derived signer + one native algosdk signer composes correctly and submits atomically. ARC-0001 multi-wallet group composition. |
| `opt-in.test.ts` | Documents the failure mode when sending an ASA to a non-opted-in derived account. Useful as a reference for consumer error handling. |

## How EVM signing is mocked

We use `viem`'s `privateKeyToAccount(...).signTypedData(...)` instead of an
EIP-1193 provider. The EIP-712 signature output is byte-identical to what
MetaMask produces for the same typed data, so this is a faithful test of the
cryptographic path — just headless.

The test EVM private key is hardcoded in `helpers.ts`. Same key → same derived
Algorand address every run, which keeps tests deterministic. Don't ever fund
this address with real assets; it's a well-known throwaway.

## What they do NOT cover

- Real wallet UX (popups, user rejection, network-mismatch warnings) — that's
  what Synpress / Dappwright would catch in a future browser-driven suite
- Mainnet behavior — localnet has different consensus parameters but same
  transaction shape; mainnet-specific bugs would require manual testing
- WalletConnect mobile injection
- Concurrent connect/disconnect race conditions
