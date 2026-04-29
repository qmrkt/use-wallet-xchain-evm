# Changelog

All notable changes to `@algorade/use-wallet-xchain-evm` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Integration test suite** under `integration-tests/` that runs against a real algokit localnet (Docker). 6 tests across 4 files:
  - `round-trip.test.ts` — derive → fund → sign → submit → confirm a self-payment, end-to-end against real algod
  - `network-binding.test.ts` — proves signatures over different genesis hashes differ (cryptographic counterpart to the unit-tested SDK cache invalidation), plus deterministic address derivation across `AlgorandClient` instances
  - `multi-signer.test.ts` — atomic group with one xChain-derived signer + one native algosdk signer composes correctly and confirms atomically (ARC-0001 multi-wallet)
  - `opt-in.test.ts` — documents the failure shape when sending an ASA to a non-opted-in derived account
- `pnpm test:integration` script. Default `pnpm test` is unchanged (unit-only, runs everywhere).
- viem-based `signTypedData` mock in helpers — produces signatures byte-identical to MetaMask without needing a browser.
- `@types/node` and `viem` added to `devDependencies`.

## [0.1.0] — initial release

Initial port of the xChain EVM wallet adapter from [`tasosbit/use-wallet`](https://github.com/tasosbit/use-wallet) (a v4 fork of `@txnlab/use-wallet`) onto `@txnlab/use-wallet@5`'s modular adapter architecture.

### Added

- `XChainEvmAdapter` — wagmi-backed EVM wallet adapter (MetaMask, Brave, Rabby, any EIP-1193 provider) that derives Algorand LogicSig addresses from EVM addresses and signs Algorand transactions via EIP-712 typed data over the txn/group ID.
- `AlgoXEvmBaseWallet` — abstract base class for any EVM-derived Algorand wallet adapter; subclasses implement `initializeProvider`, `getEvmProvider`, `signWithProvider`.
- `xchainEvm()` factory returning a v5 `WalletAdapterConfig` for registration in `WalletManager`.
- `XChainWalletMetadata` type with `isAlgoXEvm: 'EVM'` marker for consumer-side detection of EVM-backed wallets.
- `uiHooks` (`onConnect`, `onBeforeSign`, `onAfterSign`) for app-side pre-sign transparency dialogs.
- 28 unit tests covering construction, connect (existing connection / callback / fallback / re-entrancy), connector metadata (including the "Injected" generic-name filter), disconnect, signing happy path, encoded-txn handling, error propagation, uiHooks, evmAddressMap recovery from persisted metadata, multi-signer grouping, and **active-network SDK invalidation**.

### Changed (relative to the v4 fork)

- Adapter constructor now uses v5's `AdapterConstructorParams<TOptions>` (was `WalletConstructor<WalletId.X>` in v4).
- Store access uses v5's `AdapterStoreAccessor` (was direct `Store<State>` access in v4).
- `WalletId` is no longer a closed enum; this package exports `WALLET_ID = 'xchain-evm' as const`.
- Removed `managerUIHooks` fallback (no longer present in v5); `options.uiHooks` is the only path.
- Build switched from tsup-era to `tsdown`, matching v5 sibling wallet packages.

### Fixed (relative to the v4 fork)

- **Network-switch SDK staleness.** The v4 fork's `initializeEvmSdk()` cached `AlgoXEvmSdk` and `AlgorandClient` lazily without invalidation. After `WalletManager.setActiveNetwork(...)`, the cache held the old algod client, so subsequent address derivation could query against a wrong-network genesis hash. This port tracks `cachedNetwork` next to the cache and rebuilds when `activeNetwork` changes.

### Known caveats (see README for details)

- End-to-end real-transaction signing has been verified on testnet via the `question.market` consumer (see "Status" in README for the current verification matrix).
- `getEvmProvider()` returns `Promise<unknown>`; consumers that need the EIP-1193 provider must cast.
- Connector-name filter for "Injected" is a denylist; future-generic names ("MetaMask Mobile", "Coinbase Wallet" via SDK) pass through verbatim.
- Bundle-size impact: ~15 KB gzipped for this package; consumers also pull `@wagmi/core` + `viem` + connectors (~150 KB+ gzipped).

[Unreleased]: https://github.com/qmrkt/use-wallet-xchain-evm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/qmrkt/use-wallet-xchain-evm/releases/tag/v0.1.0
