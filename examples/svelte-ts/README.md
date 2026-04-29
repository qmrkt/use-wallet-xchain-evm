# Svelte example — use-wallet-xchain-evm

Minimal Vite + Svelte 5 demo of the xChain EVM wallet adapter.

## Run

```bash
pnpm install
pnpm dev
```

Open the dev URL, click **Connect EVM wallet** (MetaMask or any injected EIP-1193 provider), then **Sign test txn**.

## What this demonstrates

- Wagmi + `xchainEvm({ wagmiConfig, getEvmAccounts })` setup (`src/wallet.ts`).
- `useWallet()` from `@txnlab/use-wallet-svelte` to read state.
- A 0-ALGO self-payment signed with EIP-712 — the derived Algorand address signs a transaction without ever holding ALGO.

The signed transaction is **not broadcast** — `suggestedParams.genesisHash` is a placeholder, and there is no algod URL configured. The point is to prove the connect → derive → sign round-trip works in your framework.

## What's intentionally missing

- A pre-sign transparency dialog (`uiHooks.onBeforeSign`). See the package README for the hook signature.
- Wallet picker UI for non-injected connectors (WalletConnect, Coinbase). Replace `injected()` in `src/wallet.ts` with the connector you want, or build a connector picker component.
- SSR support. This example is CSR-only. For SvelteKit + SSR see the externalize snippet in the package README.
