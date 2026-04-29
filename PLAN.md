# xChain EVM -> use-wallet v5 Svelte Support — Migration Plan

**Goal:** ship MetaMask / RainbowKit-style xChain EVM wallet support on top of `@txnlab/use-wallet@5`, consumable from `@txnlab/use-wallet-svelte`.

**Proving path:** use `~/Projects23/algonews` / metapost first because it is a simpler Svelte app on `@txnlab/use-wallet@5.0.0-rc.1`; then use `~/Projects26/question/frontend` on testnet to prove real transaction signing and confirmation. Neither proving ground is a bridge proof: metapost is ALGO-native, and question runs on testnet, so onboarding should be swap/get-ALGO for metapost and faucet funding for question.

**Scope:** rebase the relevant xChain wallet pieces from `tasosbit/use-wallet` v4 onto upstream `TxnLab/use-wallet@5`. Do not depend on `tasosbit/use-wallet-ui`. Do not depend on upstream PR review cycles.

**Strategy:** self-contained adapter package under `@questionmarket/*`. Once it works end-to-end in metapost and then on question testnet, optionally open upstream PRs from a known-good codebase.

---

## Background

### Current state

- `tasosbit/use-wallet@main` is at `4.5.15`, on a v4 base. xChain lives only there.
- Upstream `TxnLab/use-wallet` v5 is available at `v5.0.0-rc.1`, with `packages/core`, `packages/frameworks/*`, and `packages/wallets/*`.
- `question/frontend` runs `@txnlab/use-wallet@5.0.0-rc.1` with modular adapters.
- `~/Projects23/algonews` / metapost also runs `@txnlab/use-wallet@5.0.0-rc.1`, is Svelte, is mainnet-only, and has a smaller wallet wiring surface.

### What we are porting

- `packages/use-wallet/src/wallets/algo-x-evm-base.ts` — abstract xChain EVM base wallet. Holds `evmAddress -> algorandAddress` mapping, derives Algorand accounts, signs transaction groups through `algo-x-evm-sdk`, and delegates EIP-712 signing to `signWithProvider`.
- `packages/use-wallet/src/wallets/rainbowkit.ts` — wagmi-backed EVM adapter. Reads connected EVM accounts, asks the consumer to connect when needed, and calls `eth_signTypedData_v4`.
- v4 type additions such as `WalletId.RAINBOWKIT` are **not** ported directly. v5 uses open adapter configs instead of closed wallet enums.

---

## Architecture Decisions

### 1. Publish under our scope

Package name: `@questionmarket/use-wallet-xchain-evm`.

The published name is `xchain-evm` (not `rainbowkit`) because the Svelte consumer path doesn't use RainbowKit, and a future Coinbase/Frame/Rabby EVM adapter fits this name without lying. Internal symbols may keep `RainbowKitAdapter` / `WALLET_ID = 'rainbowkit'` lineage where it eases the port; the public package name is what matters.

### 2. Use the v5 adapter API

The package exports a v5 `WalletAdapterConfig` factory, not a core patch:

```ts
export const WALLET_ID = 'rainbowkit' as const

export function rainbowkit(options: RainbowKitWalletOptions): WalletAdapterConfig {
  return {
    id: WALLET_ID,
    metadata: RainbowKitAdapter.defaultMetadata,
    Adapter: RainbowKitAdapter as unknown as WalletAdapterConfig['Adapter'],
    options: options as unknown as Record<string, unknown>
  }
}
```

Adapter-author imports come from `@txnlab/use-wallet/adapter`, not internal `src/...` paths.

### 3. Keep `AlgoXEvmBaseWallet` inside the new package

Option B remains the path:

- No upstream core change required.
- Future EVM adapters can temporarily import the base from this package.
- If upstream accepts the base later, migration is mechanical.

### 4. Svelte support needs no framework adapter changes

`@txnlab/use-wallet-svelte` reads core wallet state. Once `rainbowkit(...)` is registered with `WalletManager`, `useWallet()` should see the EVM-derived Algorand account like any other wallet.

Important nuance: the Svelte package will not export this adapter’s constants/factory. Consumers import `rainbowkit` / `WALLET_ID` from `@questionmarket/use-wallet-xchain-evm`.

### 5. No `use-wallet-ui` dependency

Skipped intentionally:

- We lose generic transaction-transparency dialogs for EVM signers.
- We lose bridge/swap/send/manage panels.
- We keep app-specific UI control in metapost and question.
- Metapost does not use USDC, so bridge UX is out of scope there. If the connected xChain-derived account needs funds, metapost should guide the user toward ALGO acquisition/onboarding, most likely a swap-to-ALGO affordance.
- Question's proof runs on testnet, so bridge UX is also out of scope there for this plan. Use the faucet path to fund the derived testnet account.

A small app-side pre-sign confirmation can be added later through `options.uiHooks.onBeforeSign`.

### 6. Svelte connect UX

RainbowKit is React-only. The adapter accepts `getEvmAccounts: () => Promise<string[]>`.

For v0, use wagmi `injected()` directly. Later, replace it with a Svelte wallet picker that can choose Injected, WalletConnect, Coinbase, etc.

---

## Repos and Packages

```
~/Projects26/use-wallet-xchain/
├── fork/        # work happens here on a v5-rebase branch
└── upstream/    # read-only reference for v5 internals
```

### Touch/create

| Package/app | Status | Location | Purpose |
|---|---|---|---|
| `@questionmarket/use-wallet-xchain-evm` | new | `fork/packages/wallets/rainbowkit/` | v5 modular adapter package |
| metapost / algonews | modified first | `~/Projects23/algonews` | simple Svelte wallet-plumbing proof |
| question frontend | modified second | `~/Projects26/question/frontend` | testnet real transaction proof |

### Do not touch

- `@txnlab/use-wallet` core, unless a true blocker appears.
- `@txnlab/use-wallet-svelte`, except sanity checks.
- `tasosbit/use-wallet-ui`.
- `algorandfoundation/xchain-accounts`.

---

## Phase 0 — Reconnaissance (half day)

**Goal:** identify every v4 -> v5 API difference before coding.

1. Create the working branch from the actual v5 tag:

```sh
cd fork
git remote add upstream https://github.com/TxnLab/use-wallet.git || true
git fetch upstream --tags
git checkout -b v5-rebase v5.0.0-rc.1
```

2. Diff the fork’s xChain delta:

```sh
git diff v4.6.0..origin/main -- packages/use-wallet/src
```

3. Diff v4 -> v5 on the adapter/core surfaces:

```sh
git diff v4.6.0..v5.0.0-rc.1 -- \
  packages/core/src/adapter.ts \
  packages/core/src/wallets/base.ts \
  packages/core/src/wallets/types.ts \
  packages/core/src/store.ts \
  packages/core/src/manager.ts \
  packages/core/src/utils.ts
```

4. Read v5 adapter examples:

```sh
git show v5.0.0-rc.1:packages/wallets/pera/src/index.ts
git show v5.0.0-rc.1:packages/wallets/pera/src/adapter.ts
git show v5.0.0-rc.1:packages/wallets/pera/package.json
```

**Deliverable:** `RECON.md` listing imported symbols from the v4 xChain files and their v5 replacement/import path.

---

## Phase 1A — v5 Adapter + Metapost Wallet Plumbing (1 day)

**Goal:** prove the adapter compiles, registers, connects MetaMask, derives an Algorand account, and appears through Svelte `useWallet()` in metapost.

1. Create `fork/packages/wallets/rainbowkit/` mirroring `packages/wallets/pera/`:

```txt
packages/wallets/rainbowkit/
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── README.md
└── src/
    ├── index.ts
    ├── adapter.ts
    ├── algo-x-evm-base.ts
    ├── icon.ts
    ├── types.ts
    └── adapter.test.ts
```

2. Package metadata:

- `name: "@questionmarket/use-wallet-xchain-evm"`
- `peerDependencies`: `@txnlab/use-wallet@>=5.0.0-rc.1 <6`, `algo-x-evm-sdk`, `@wagmi/core@^2`, `@wagmi/connectors@^5`, `algosdk@^3`
- Use `tsdown`, matching v5 wallet packages.

3. Port `AlgoXEvmBaseWallet`:

- Import from `@txnlab/use-wallet/adapter`.
- Extend `BaseWallet<AlgoXEvmOptions>`.
- Convert v4 direct store access to v5 `AdapterStoreAccessor`:
  - `this.store.getWalletState()`
  - `this.store.addWallet(walletState)`
  - `this.store.setAccounts(accounts)`
  - `this.store.removeWallet()`
  - `this.store.getActiveNetwork()`
  - `this.store.getState()`
- Remove `managerUIHooks`; keep only `options.uiHooks`.
- Track the active network used to initialize `AlgoXEvmSdk`; recreate SDK/client when `activeNetwork` changes.

4. Port `RainbowKitWallet` to `RainbowKitAdapter`:

- Extend `AlgoXEvmBaseWallet`.
- Accept `AdapterConstructorParams<RainbowKitWalletOptions>`.
- Keep wagmi dynamic imports.
- Confirm `getAccount(config)`, `connect(config, ...)`, `reconnect(config)`, and `connector.getProvider()` behavior.

5. Do not port v4 closed enum/type-map changes.

6. Build:

```sh
pnpm -F @questionmarket/use-wallet-xchain-evm build
```

7. Link into metapost:

```jsonc
{
  "pnpm": {
    "overrides": {
      "@questionmarket/use-wallet-xchain-evm": "link:../../Projects26/use-wallet-xchain/fork/packages/wallets/rainbowkit"
    }
  }
}
```

8. Add browser-only polyfills and wagmi config in metapost:

- `Buffer` on `globalThis`, only in browser context.
- `define: { global: 'globalThis' }` and `buffer` alias if needed.
- `dedupe`: `@txnlab/use-wallet`, `@txnlab/use-wallet-svelte`, `wagmi`, `@wagmi/core`.

9. Hardcode `injected()` for the first pass:

```ts
import { rainbowkit } from '@questionmarket/use-wallet-xchain-evm'
import { algorandChain } from 'algo-x-evm-sdk'
import { createConfig, http, connect } from '@wagmi/core'
import { injected } from '@wagmi/connectors'

const injectedConnector = injected()

const wagmiConfig = createConfig({
  chains: [algorandChain],
  connectors: [injectedConnector],
  transports: { [algorandChain.id]: http() }
})

wallets.push(
  rainbowkit({
    wagmiConfig,
    getEvmAccounts: async () => {
      const result = await connect(wagmiConfig, { connector: injectedConnector })
      return result.accounts as string[]
    }
  })
)
```

10. Smoke test metapost:

- Connect MetaMask.
- Confirm derived Algorand address appears in existing wallet UI.
- Refresh and verify resume behavior.
- Disconnect and verify state cleanup.

**Deliverable:** screenshot/screencast of metapost showing the EVM-derived Algorand account through normal Svelte wallet state.

---

## Phase 1B — Question Testnet Transaction Spike (half to 1 day)

**Goal:** prove real transaction signing: MetaMask EIP-712 signing -> xChain Algorand signed txn/group -> testnet confirmation.

1. Link the same adapter into `~/Projects26/question/frontend`.
2. Add the same wagmi config/polyfills with hardcoded `injected()`.
3. Connect MetaMask and verify the EVM-derived Algorand address appears.
4. Fund the derived address with a small amount of testnet ALGO.
5. Execute the smallest practical question-market testnet action.
6. Confirm MetaMask EIP-712 prompt, transaction confirmation, and app state update.

**Deliverable:** screenshot/screencast of an EVM-signed testnet action settling in `question/frontend`.

---

## Phase 2 — Package Polish (1 day)

1. Add focused unit tests:
   - `getEvmAccounts` is called when no wagmi account is connected.
   - existing wagmi account is reused.
   - transaction filtering respects `indexesToSign` and `addresses.includes(signer)`.
   - encoded signed transactions are skipped.
   - EVM address mapping is restored from persisted account metadata.
   - SDK/client is recreated when active network changes.
2. Add signing tests around EIP-712 typed data where feasible with mocked `algo-x-evm-sdk`.
3. README: install, peer deps, wagmi config, Svelte usage, known UX caveats.
4. Root build/test:

```sh
pnpm -r build
pnpm -r test
```

5. Confirm no accidental imports from `src/...`; adapter imports go through `@txnlab/use-wallet/adapter`.

**Deliverable:** package is publishable, with build and tests green.

---

## Phase 3 — Svelte Sanity Checks (half day)

Verify in both apps:

- `rainbowkit` / `WALLET_ID` are imported from `@questionmarket/use-wallet-xchain-evm`.
- `useWallet()` returns the EVM-derived account after MetaMask connects.
- Reactivity updates on disconnect/resume.
- No changes are required in `@txnlab/use-wallet-svelte`.
- If multiple networks are configured, address derivation/signing recreates the xChain SDK for the active network.

**Deliverable:** metapost wallet plumbing and question testnet signing both work through unmodified Svelte hooks.

---

## Phase 4 — Connect Modal (1 day)

Replace hardcoded `injected()` with an app-side Svelte picker.

1. Build a minimal connector picker that reads `wagmiConfig.connectors`.
2. Include Injected first.
3. Add WalletConnect QR via `walletConnect({ projectId })` once a project ID is chosen.
4. Handle loading, rejection, and connector errors.
5. Integrate in metapost first; reuse/adapt in question after.

**Deliverable:** no hardcoded connector path for normal use.

---

## Phase 5 — Onboarding (out of scope)

ALGO acquisition (swap, bridge, faucet, etc.) for empty xChain-derived accounts is **not part of this plan**. The connector ships first; getting ALGO into the derived account is a separate workstream.

- Metapost: a connected EVM user with no ALGO sees the same empty-state UX a fresh native Algorand user sees today. No new affordance ships in v1.
- Question testnet: faucet funding by hand for the proving-ground tests. No UI work.

Tracked elsewhere if/when prioritized.

---

## Phase 6 — Optional Pre-sign Transparency (deferred)

**What this is:** when an EVM wallet signs an Algorand transaction via xChain, MetaMask shows the user EIP-712 typed data containing the Algorand transaction ID hash but no human-readable details. The user can't easily see "I'm sending 5 ALGO to X" or "I'm calling app 12345 with these args" — only an opaque digest.

A pre-sign dialog rendered by the dApp (before MetaMask pops) decodes the txn group into a readable list of rows so the user knows what they're approving. The fork's `AlgoXEvmBaseWallet` already exposes an `options.uiHooks.onBeforeSign(txnGroup, indexesToSign)` callback for this purpose. v1 simply doesn't pass one.

Build only if EVM users say the bare MetaMask prompt is too opaque.

1. App-side pre-sign dialog (Svelte component).
2. Decode txn group into human-readable rows (sender, receiver, amount, asset, app args).
3. Gate by `wallet.metadata.isAlgoXEvm === 'EVM'` so non-EVM wallets are unaffected.
4. Trigger through `options.uiHooks.onBeforeSign` passed to `xchainEvm({ ..., uiHooks: { onBeforeSign } })`.

---

## Phase 7 — Publish + Optional Upstream (half day)

1. Tag fork repo: `v0.1.0-xchain-rebase`.
2. Publish `@questionmarket/use-wallet-xchain-evm@0.1.0`.
3. Remove pnpm link/override from consuming apps.
4. Optionally propose upstream:
   - `AlgoXEvmBaseWallet` in core or a first-party EVM adapter package.
   - `@txnlab/use-wallet-rainbowkit` or better-named first-party package.

---

## Risk Register

| Risk | Phase | Likelihood | Mitigation |
|---|---:|---:|---|
| Port keeps v4 closed `WalletId` assumptions | 1A | Medium | Use open string `WALLET_ID` + `WalletAdapterConfig` factory |
| Port keeps v4 direct store assumptions | 1A | Medium | Convert to `AdapterStoreAccessor` methods |
| `algo-x-evm-sdk` chain export is not wagmi v2-compatible | 1A | Medium | Wrap into a wagmi v2 chain definition |
| SDK cache survives network switch with stale algod client | 1A/3 | Medium | Track active network and recreate SDK/client |
| SvelteKit SSR polyfills break | 1A | Medium | Keep polyfills browser-only; use Vite aliases/dedupe |
| First real signing bug appears only in transaction flow | 1B | Medium | Prove on question testnet before package polish |
| WalletConnect UX takes longer than expected | 4 | Medium | Ship Injected first; add WalletConnect after |

No known risk is a project-level blocker.

---

## Effort Summary

| Phase | Effort | Cumulative |
|---|---:|---:|
| 0. Recon | half day | 0.5 |
| 1A. Metapost wallet plumbing | 1 day | 1.5 |
| 1B. Question testnet signing | half to 1 day | 2-2.5 |
| 2. Package polish | 1 day | 3-3.5 |
| 3. Svelte sanity checks | half day | 3.5-4 |
| 4. Connect modal | 1 day | 4.5-5 |
| 5. Onboarding | out of scope | — |
| 6. Pre-sign transparency | half day optional | 5-5.5 |
| 7. Publish | half day | 5-6 |

The wallet-plumbing milestone should land by end of day 1. The real testnet transaction milestone should land by end of day 2.

---

## Done Looks Like

- `@questionmarket/use-wallet-xchain-evm@0.1.0` published.
- metapost connects an EVM wallet and surfaces the derived Algorand account through Svelte wallet state.
- question testnet validation uses faucet funding for the derived account.
- `question/frontend` runs MetaMask-signed Algorand testnet actions.
- Onboarding (ALGO acquisition for empty derived accounts) is explicitly out of scope and tracked separately.
- `@txnlab/use-wallet-svelte` consumed unmodified.
- Zero dependency on `tasosbit/use-wallet-ui`.
- Zero dependency on upstream PR review.

---

## Decisions

1. **Package name:** `@questionmarket/use-wallet-xchain-evm`. Accurate (no RainbowKit on Svelte path) and forward-compatible (a future non-RainbowKit EVM adapter — e.g. raw Coinbase, Frame — fits the same name). Internal symbols can keep `rainbowkit` lineage if helpful, but the npm name is `xchain-evm`.
2. **Connect modal scope:** injected-only for v1. WalletConnect lands in Phase 4 when the hardcoded connector goes away. No upfront commitment.
3. **WalletConnect project ID:** deferred until Phase 4. *Implication when it comes up:* WalletConnect's relay servers require a project ID registered at `cloud.walletconnect.com`. It's free, takes 2 minutes, and is keyed to a domain allowlist. We can either register a new ID for `xchain-evm` work or reuse the `question.market` production ID already in `frontend/.env.production`. Reuse is fine; new ID gives cleaner usage analytics. Pick at Phase 4 time.
4. **EVM-derived account onboarding:** ship the connector only in v1. ALGO acquisition (swap, bridge, or otherwise) is tracked separately, not in this plan. Phase 5 is dropped from this document.
5. **Pre-sign transparency:** deferred. *Implication when it comes up:* MetaMask shows the user an EIP-712 typed-data prompt that includes the Algorand transaction ID hash but not the human-readable contents (sender / receiver / amount / app-call args). A pre-sign dialog would decode the txn group in our app and show "you're about to send 5 ALGO to X" *before* MetaMask pops, so the user knows what they're approving. The fork's `AlgoXEvmBaseWallet` already exposes an `options.uiHooks.onBeforeSign(txnGroup, indexesToSign)` hook for exactly this — we just don't pass one in v1. Add later if EVM users say the MetaMask prompt is too opaque.
6. **Publish flow:** build first, publish later. Phase 7 stays in the plan but only fires after metapost + question testnet are both green and the package has tests.
