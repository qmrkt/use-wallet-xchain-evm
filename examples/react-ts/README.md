# React example — use-wallet-xchain-evm

Minimal Vite + React 19 + TS demo of the xChain EVM wallet adapter.

## Run

```bash
pnpm install
pnpm dev
```

Open the dev URL, click **Connect EVM wallet**, then **Sign test txn**.

## What this demonstrates

- Wagmi + `xchainEvm({ wagmiConfig, getEvmAccounts })` setup (`src/wallet.ts`).
- `<WalletProvider>` + `useWallet()` from `@txnlab/use-wallet-react`.
- A 0-ALGO self-payment signed with EIP-712 — the signed bytes are displayed but not broadcast.

## RainbowKit?

For RainbowKit integration, omit `getEvmAccounts` at construction and use `setGetEvmAccounts(fn)` from inside a `<RainbowKitProvider>` child — see the package README for the pattern.
