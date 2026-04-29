# @questionmarket/use-wallet-xchain-evm

xChain EVM wallet adapter for [`@txnlab/use-wallet`](https://github.com/TxnLab/use-wallet) v5. Lets users sign Algorand transactions with an EVM wallet (MetaMask, Brave Wallet, Rabby, any EIP-1193 provider via wagmi). The adapter derives a deterministic Algorand address from each EVM address using the [xChain Accounts](https://github.com/algorandfoundation/xchain-accounts) LogicSig + EIP-712 signing scheme.

Framework-neutral: works from Svelte, React, Vue, or Solid through the corresponding `@txnlab/use-wallet-{svelte,react,vue,solid}` framework adapter.

## Why this exists

The xChain Accounts protocol on Algorand was originally built against `@txnlab/use-wallet` **v4** in the [`tasosbit/use-wallet`](https://github.com/tasosbit/use-wallet) fork. v5 introduced a modular per-wallet package architecture. This package ports the v4 fork's `RainbowKitWallet` + `AlgoXEvmBaseWallet` onto v5's modular adapter API so v5 consumers (especially non-React ones) can use xChain EVM without forking core.

## Install

```bash
pnpm add @questionmarket/use-wallet-xchain-evm @wagmi/core @wagmi/connectors viem algo-x-evm-sdk @algorandfoundation/algokit-utils
# or npm install / yarn add
```

You also need `@txnlab/use-wallet@^5` and a framework adapter (e.g. `@txnlab/use-wallet-svelte`) — usually already installed by your app.

## Usage (Svelte example)

```ts
// lib/wallet/config.ts
import { WalletManager, type NetworkConfig } from '@txnlab/use-wallet'
import { pera } from '@txnlab/use-wallet-pera'
import { xchainEvm } from '@questionmarket/use-wallet-xchain-evm'
import { createConfig, http, connect } from '@wagmi/core'
import { injected } from '@wagmi/connectors'
import { mainnet } from 'viem/chains'

const evmConnector = injected()
const wagmiConfig = createConfig({
  chains: [mainnet],                       // placeholder; xChain signing is chain-agnostic
  connectors: [evmConnector],
  transports: { [mainnet.id]: http() },
})

export function createWalletManager() {
  return new WalletManager({
    wallets: [
      pera({ compactMode: true }),
      xchainEvm({
        wagmiConfig,
        getEvmAccounts: async () => {
          // Called when no EVM wallet is connected. Open your own connect modal,
          // perform connection, return the EVM addresses. v0 example: just call
          // wagmi connect with a hardcoded connector.
          const result = await connect(wagmiConfig, { connector: evmConnector })
          return [...result.accounts]
        },
      }),
    ],
    networks: { /* your algod configs */ },
    defaultNetwork: 'mainnet',
  })
}
```

The wallet shows up in `useWallet()` like any other adapter. Connecting prompts MetaMask (or whatever EVM wallet); the derived Algorand address appears in `wallet.activeAddress`. Signing prompts MetaMask with EIP-712 typed data; the resulting signature is verified by the LogicSig on-chain.

## Detecting EVM-derived wallets

```ts
import type { XChainWalletMetadata } from '@questionmarket/use-wallet-xchain-evm'

const isEvm = (wallet.metadata as XChainWalletMetadata).isAlgoXEvm === 'EVM'
```

The `isAlgoXEvm: 'EVM'` marker lets you gate UI affordances (e.g. a pre-sign transparency dialog, since MetaMask only shows the user the EIP-712 digest, not the human-readable transaction details).

## Pre-sign transparency hook (optional)

Pass `uiHooks.onBeforeSign` if you want to intercept the txn group before MetaMask is prompted — useful for showing a "you're about to send 5 ALGO to X" dialog that the bare MetaMask prompt doesn't surface:

```ts
xchainEvm({
  wagmiConfig,
  getEvmAccounts,
  uiHooks: {
    onBeforeSign: async (txnGroup, indexesToSign) => {
      // decode and show a confirmation dialog; throw to abort
    },
    onAfterSign: (success, errorMessage) => {
      // notify user of outcome
    },
  },
})
```

## Network switching

The adapter caches the underlying `AlgoXEvmSdk` against the active network. When you call `walletManager.setActiveNetwork(...)`, the cache is invalidated automatically and the SDK rebuilds against the new algod client. Address derivation is deterministic from the EVM address (so the derived Algorand address is the same on every network), but signatures are bound to the network's genesis hash via the txn ID.

## Connect-modal UX

This package only owns the wallet-adapter side. The host app builds the EVM-wallet picker — `getEvmAccounts: () => Promise<string[]>` is the seam. v0 examples hardcode `injected()` (MetaMask et al.). For richer UX, build a Svelte/React/Vue component that lists `wagmiConfig.connectors`, lets the user pick, calls `connect(wagmiConfig, { connector })`, and resolves the promise.

(For React apps that already use RainbowKit, you can pass RainbowKit's `useConnectModal` wrapper as `getEvmAccounts`.)

## Caveats

- **EVM-derived accounts start with 0 ALGO.** The derived Algorand address is empty until funded. Algorand requires a minimum balance to exist (~0.1 ALGO) and an opt-in transaction (costs ALGO) to receive ASAs. Sponsored opt-ins are the standard fix; otherwise users need to send ALGO to the derived address before doing anything.
- **MetaMask shows the user EIP-712 typed data, not txn semantics.** The user sees the Algorand transaction ID hash inside an EIP-712 envelope, not "send 5 ALGO to X". Surface a pre-sign dialog via `uiHooks.onBeforeSign` if your app handles non-trivial transactions.
- **Browser polyfills.** If you use Allbridge or other EVM SDKs alongside, you may need `Buffer` and `TronWebProto` polyfills. This package itself doesn't require them; the underlying `algo-x-evm-sdk` and `@wagmi/core` are browser-clean.
- **No bridges, no fiat on-ramps.** This package only handles wallet connection and signing. Funding the derived account is your app's responsibility (deep-links to MoonPay, ChangeNOW, etc., or Allbridge for cross-chain stablecoin bridging).

## Status

`0.1.0` — proven end-to-end with MetaMask connection + Algorand address derivation in two Svelte apps (`metapost`, `question.market`). Real-transaction signing path is implemented and unit-tested in concept; on-chain testnet signing has been validated [TODO: edit once verified]. Treat as beta. Issues and PRs welcome.

## Related projects

- [TxnLab/use-wallet](https://github.com/TxnLab/use-wallet) — the upstream v5 wallet manager
- [tasosbit/use-wallet](https://github.com/tasosbit/use-wallet) — the v4 fork where xChain EVM was originally implemented
- [algorandfoundation/xchain-accounts](https://github.com/algorandfoundation/xchain-accounts) — the xChain Accounts protocol (LogicSig + SDK)
- [tasosbit/use-wallet-ui](https://github.com/tasosbit/use-wallet-ui) — the (React-only) opinionated UI layer for xChain (transaction transparency, bridge/swap panels, manage UI)

## License

MIT. See [LICENSE](./LICENSE) for full text and attribution to upstream sources.
