# Examples

Each example is a self-contained app that installs `@algorade/use-wallet-xchain-evm` from npm and demonstrates the same flow: connect an EVM wallet → display the derived Algorand address → sign a 0-ALGO self-payment → display the signed-transaction bytes.

| Example | Stack | Demonstrates |
|---------|-------|--------------|
| [`svelte-ts`](./svelte-ts) | Vite 8 + Svelte 5 | `@txnlab/use-wallet-svelte` with `useWalletContext` + `useWallet()` |
| [`react-ts`](./react-ts) | Vite 8 + React 19 | `@txnlab/use-wallet-react` with `<WalletProvider>` + `useWallet()` |
| [`vue-ts`](./vue-ts) | Vite 8 + Vue 3.5 | `@txnlab/use-wallet-vue` with `WalletManagerPlugin` + `useWallet()` |
| [`vanilla-ts`](./vanilla-ts) | Vite 8 + plain TS | Framework-neutral `WalletManager` with `manager.subscribe(...)` |
| [`e2e-tests`](./e2e-tests) | Vite 8 + Playwright | Headless connect → sign round-trip with a stub EIP-1193 provider |

## Run any example

```bash
cd examples/<name>
pnpm install
pnpm dev      # most examples
pnpm test     # for e2e-tests
```

Then open the dev URL, connect MetaMask (or any injected EIP-1193 wallet), and sign a test transaction.

## Common patterns across all examples

- **Wagmi setup** lives in `src/wallet.ts` (or `src/app.ts` for vanilla / e2e). Each one uses `@wagmi/core@2.21.2` (peer-pinned by `@wagmi/connectors@5.x`) and the `injected()` connector for MetaMask et al.
- **Buffer polyfill** via `vite-plugin-node-polyfills` — algokit-utils still references the Node `Buffer` global, so each Vite config provides one for the browser.
- **Signed-only flow.** The demos do not broadcast — `suggestedParams.genesisHash` is a placeholder, and there's no algod URL. The point is to prove the connect → derive → sign cycle works in your framework. To broadcast, fill in real `suggestedParams` and call `algorand.send.rawTransactions(blob)` (or equivalent).

## Shared dependency versions

The same versions across all examples (matching the package's tested set):

```
@algorade/use-wallet-xchain-evm  ^0.1.0
@algorandfoundation/algokit-utils ^9.2.0
@txnlab/use-wallet                5.0.0-rc.1
@wagmi/core                       2.21.2
@wagmi/connectors                 ^5.11.2
algo-x-evm-sdk                    ^0.1.2
algosdk                           ^3.5.2
viem                              ^2.48.4
```
