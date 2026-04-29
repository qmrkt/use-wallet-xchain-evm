# Vanilla TS example — use-wallet-xchain-evm

Minimal Vite + TS demo using `WalletManager` directly (no framework adapter).

## Run

```bash
pnpm install
pnpm dev
```

## What this demonstrates

- Constructing `WalletManager` directly from `@txnlab/use-wallet`.
- Subscribing to manager state changes via `manager.subscribe(...)` for plain DOM rendering.
- Calling `manager.signTransactions(...)` outside of any framework reactivity.
