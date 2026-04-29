# Vue example — use-wallet-xchain-evm

Minimal Vite + Vue 3.5 + TS demo of the xChain EVM wallet adapter.

## Run

```bash
pnpm install
pnpm dev
```

Open the dev URL, click **Connect EVM wallet**, then **Sign test txn**.

## What this demonstrates

- Wagmi + `xchainEvm({ wagmiConfig, getEvmAccounts })` setup (`src/wallet.ts`).
- `app.use(WalletManagerPlugin, config)` + `useWallet()` from `@txnlab/use-wallet-vue`.
- A 0-ALGO self-payment signed with EIP-712 — the signed bytes are displayed but not broadcast.
