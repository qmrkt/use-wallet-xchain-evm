# Phase 0 — Recon Findings

## Branch setup

- `fork/` has upstream remote added, all tags fetched.
- New branch `v5-rebase` cut from tag `v5.0.0-rc.1`.
- Reference v4 source: `origin/main` on the fork (currently `4.5.15`).

## v5 layout (relevant subset)

```
packages/
├── core/                            # @txnlab/use-wallet — single core package
│   └── src/
│       ├── adapter.ts               # Public adapter-author entrypoint (exported as @txnlab/use-wallet/adapter)
│       ├── manager.ts               # WalletManager — instantiates adapters via createStoreAccessor()
│       ├── store.ts                 # State + tanstack store (no longer accessed directly by adapters)
│       ├── utils.ts                 # flattenTxnGroup, isSignedTxn, compareAccounts, isTransactionArray
│       └── wallets/
│           ├── base.ts              # BaseWallet<TOptions> abstract class
│           └── types.ts             # WalletId (open string), AdapterStoreAccessor, AdapterConstructorParams, WalletAdapterConfig
├── frameworks/
│   ├── react/   solid/   svelte/    # Framework hooks — pure pass-throughs over WalletManager + tanstack-store
│   └── vue/
└── wallets/                         # Modular wallet adapter packages
    ├── pera/   defly/   defly-web/  # Each: package.json + src/{index,adapter,icon}.ts + tsdown.config.ts
    ├── lute/   kibisis/   exodus/
    ├── kmd/    magic/   mnemonic/
    └── w3wallet/
```

The fork's xChain code lives at v4 paths (`packages/use-wallet/src/wallets/algo-x-evm-base.ts`, `packages/use-wallet/src/wallets/rainbowkit.ts`). v5 has reorganized to `packages/core/` + per-wallet packages under `packages/wallets/<name>/`.

## What our package becomes

**`@questionmarket/use-wallet-xchain-evm`** at `fork/packages/wallets/xchain-evm/`. Mirrors the layout of `packages/wallets/pera/`:

```
packages/wallets/xchain-evm/
├── package.json
├── tsconfig.json                # extends ../tsconfig.base.json
├── tsdown.config.ts             # esm + dts, identical to siblings
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts                 # exports xchainEvm() factory + types
    ├── adapter.ts               # XChainEvmAdapter (extends AlgoXEvmBase)
    ├── algo-x-evm-base.ts       # ported abstract class
    ├── icon.ts                  # ETH diamond SVG string
    ├── types.ts                 # AlgoXEvmOptions, XChainEvmOptions, AlgoXEvmMetadata
    └── adapter.test.ts
```

## Key v4 → v5 deltas (porting impact)

| Concern | v4 (fork) | v5 | Action in port |
|---|---|---|---|
| Constructor params | `WalletConstructor<WalletId.X>` | `AdapterConstructorParams<TOptions>` | Type the constructor `params: AdapterConstructorParams<XChainEvmOptions>`. |
| Base class generics | `BaseWallet` (no generic) | `BaseWallet<TOptions = Record<string, unknown>>` | Declare `extends BaseWallet<XChainEvmOptions>` so `this.options` is typed automatically. |
| Store access | Direct `Store<State>`: `addWallet(this.store, {walletId, wallet})`, `setAccounts(this.store, {walletId, accounts})`, `this.store.state.wallets[this.id]` | `AdapterStoreAccessor` pre-bound to wallet key: `this.store.addWallet(walletState)`, `this.store.setAccounts(accounts)`, `this.store.getWalletState()`, `this.store.getActiveWallet()`, `this.store.getActiveNetwork()`, `this.store.getState()` | Replace every direct-store call. No more `walletId` parameter. Drop `protected store: Store<State>` field — base class already has it. |
| `WalletId` type | Closed enum: `WalletId.RAINBOWKIT = 'rainbowkit'` | Open string type; each wallet exports its own const | Export `export const WALLET_ID = 'xchain-evm' as const`. Drop `WalletConfigMap`/`WalletOptionsMap` augmentation. |
| `getAlgodClient` | Method on `BaseWallet` | Function passed in via `AdapterConstructorParams.getAlgodClient` and assigned to `this.getAlgodClient` | No code change needed in the port — `this.getAlgodClient()` continues to work. |
| `managerUIHooks` | Existed; fork code reads `this.options.uiHooks?.X ?? this.managerUIHooks?.X` | Removed. Only `options.uiHooks` exists. | Drop `?? this.managerUIHooks?.X` fallbacks (3 sites in `algo-x-evm-base.ts`: onBeforeSign, onAfterSign, onConnect). |
| `WalletMetadata` shape | Fork extended with `isAlgoXEvm?: 'EVM'` field | Fixed `{name, icon}` | Two options: (a) module-augment `WalletMetadata` from `@txnlab/use-wallet/adapter` to add `isAlgoXEvm?: 'EVM'`; (b) put it in account metadata instead. Going with (a) — single line of `declare module` augmentation in our package's `types.ts`. |
| Adapter registration | `WalletId.RAINBOWKIT` enum slot + `WalletConfigMap` type entry | `WalletAdapterConfig` factory: `{id, metadata, Adapter, options, capabilities}` | New `xchainEvm()` factory in `src/index.ts`. Pattern identical to `pera()` in `packages/wallets/pera/src/index.ts`. |
| Active network awareness | Implicit via `this.getAlgodClient()` (returns the active client) | Same — `getAlgodClient` always returns the current active network's client | The fork already caches `algoXEvmSdk` and `algorandClient`. Bug carried over: cache survives network switches with stale algod. **Fix in port:** track `this.cachedNetwork` alongside the SDK cache; when `this.activeNetwork` differs, rebuild SDK+client. Use `this.subscribe(state => ...)` to invalidate proactively if needed. |
| Icon | Inlined as a `data:` URL constant in `rainbowkit.ts` | Convention: `src/icon.ts` exports raw SVG string; `adapter.ts` does `data:image/svg+xml;base64,${btoa(icon)}` | Match v5 convention. Move SVG to `src/icon.ts`. |
| Build tool | Whatever the fork uses (tsup-era) | `tsdown` 0.21.0, ESM-only, dts: true | Use `tsdown.config.ts` identical to pera/defly siblings. |

## v5 imports the port will use (from `@txnlab/use-wallet/adapter`)

Confirmed by reading `packages/core/src/adapter.ts`:

```ts
import {
  BaseWallet,
  compareAccounts,
  flattenTxnGroup,
  isSignedTxn,
  isTransactionArray,
  type AdapterConstructorParams,
  type AdapterStoreAccessor,
  type SignerTransaction,
  type WalletAccount,
  type WalletMetadata,
  type WalletState,
  type WalletAdapterConfig,
} from '@txnlab/use-wallet/adapter'
```

All symbols the v4 fork's `algo-x-evm-base.ts` and `rainbowkit.ts` rely on are present in v5 under this entrypoint, with the deltas above. **No core-package patch required.**

## Symbol mapping (v4 fork → v5 port)

| v4 fork symbol | v5 replacement |
|---|---|
| `import type { Store } from '@tanstack/store'` | dropped — no direct store access |
| `import type { State } from 'src/store'` | dropped (only needed if subscribing; see network-switch note) |
| `import { compareAccounts, flattenTxnGroup, isSignedTxn, isTransactionArray } from 'src/utils'` | `import { ... } from '@txnlab/use-wallet/adapter'` |
| `import { BaseWallet } from 'src/wallets/base'` | `import { BaseWallet } from '@txnlab/use-wallet/adapter'` |
| `import type { ..., WalletConstructor } from 'src/wallets/types'` | `import type { ..., AdapterConstructorParams } from '@txnlab/use-wallet/adapter'` |
| `import { WalletState, addWallet, setAccounts } from 'src/store'` | dropped — use `this.store.addWallet(walletState)` and `this.store.setAccounts(accounts)` instead |
| `import { WalletId } from 'src/wallets/types'` | dropped — open string type, just use our own `WALLET_ID` const |
| `WalletConstructor<WalletId.RAINBOWKIT>` | `AdapterConstructorParams<XChainEvmOptions>` |
| `addWallet(this.store, { walletId, wallet })` | `this.store.addWallet(walletState)` |
| `setAccounts(this.store, { walletId, accounts })` | `this.store.setAccounts(accounts)` |
| `this.store.state.wallets[this.id]` | `this.store.getWalletState()` |
| `this.managerUIHooks?.X` | dropped — only `this.options.uiHooks?.X` |

## Known risk surfaced during recon

**Network-switch SDK staleness.** The fork's `initializeEvmSdk()` caches both `algoXEvmSdk` and `algorandClient` lazily. After `WalletManager.setActiveNetwork(...)`, `this.getAlgodClient()` returns a new client — but the cached `algoXEvmSdk` still holds the old `AlgorandClient` (built from the old algod). Address derivation queries genesis hash from algod, so an EVM-derived address is genesis-bound; deriving on the wrong network silently produces a different Algorand address.

**Mitigation in the port:**
1. Track `this.cachedNetwork: string | null` next to the SDK cache.
2. In `initializeEvmSdk()`, compare `this.activeNetwork` to `this.cachedNetwork`; rebuild both SDK and client if mismatch.
3. Add a unit test in Phase 2 that switches networks between two `connect()` calls and asserts the derived address recomputes.

## Phase 0 deliverable: done

Proceeding directly to Phase 1A — scaffolding `packages/wallets/xchain-evm/` and porting the two source files.
