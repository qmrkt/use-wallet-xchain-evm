# Contributing to `@algorade/use-wallet-xchain-evm`

Issues and PRs welcome. This is a small, focused adapter — keep changes scoped accordingly.

## Local setup

```bash
git clone https://github.com/qmrkt/use-wallet-xchain-evm.git
cd use-wallet-xchain-evm
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Node 22+, pnpm 10+.

## Project layout

```
src/
├── index.ts              # Public exports + xchainEvm() factory
├── adapter.ts            # XChainEvmAdapter (the wagmi-backed adapter)
├── algo-x-evm-base.ts    # Abstract base class for EVM-derived adapters
├── icon.ts               # ETH diamond SVG (used as the default wallet icon)
├── types.ts              # Public types (XChainEvmOptions, XChainWalletMetadata, etc.)
├── adapter.test.ts       # Adapter behavior tests
├── algo-x-evm-base.test.ts  # Base-class behavior tests (signing, network switch)
└── test-helpers.ts       # FakeStore, fake algod client, subscribe stub
```

## What we need PRs for (priority order)

1. **End-to-end on-chain testnet verification reports.** Comments / PRs documenting "I ran this against testnet, EIP-712 prompt fired, txn confirmed, here's the txid" are valuable signal.
2. **Wallet-specific quirks.** Brave Wallet, Rabby, Coinbase Wallet, Frame, MetaMask Mobile (via WalletConnect injection) — anything where the connector-name detection or signing flow needs special handling.
3. **More adapter implementations on top of `AlgoXEvmBaseWallet`** — e.g. a Coinbase Wallet SDK adapter that doesn't go through wagmi.
4. **Bug fixes.** With a failing test, ideally.

## What we won't accept

- Bundling a connect-modal into this package. The `getEvmAccounts` callback is the seam for that — keeps the package framework-neutral.
- Introducing UI primitives (panels, dialogs, etc.). Those belong in a separate `-ui-*` package.
- Backports to `@txnlab/use-wallet@4` or earlier. v4 already has the upstream xChain implementation in [`tasosbit/use-wallet`](https://github.com/tasosbit/use-wallet); this package serves v5 forward only.
- Conditional v4/v5 dual-target compatibility shims.

## Running tests

```bash
pnpm test            # one-shot
pnpm test:watch      # watch mode
pnpm typecheck       # tsc --noEmit
```

Tests use vitest with `vi.mock()` to stub `@wagmi/core`, `algo-x-evm-sdk`, and `@algorandfoundation/algokit-utils` at module level. Real Algorand addresses are generated via `algosdk.generateAccount()` so transaction-construction stays valid against algosdk's checksum.

When adding a behavior, add a focused test for it in the same file as the code it covers.

## Commit style

Conventional commits encouraged but not enforced. Prefix with `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:` where applicable. CHANGELOG entries are added by the maintainer at release time, so PR descriptions can be informal.

## Release process (maintainer notes)

1. Update `CHANGELOG.md` — move `[Unreleased]` items into a new dated version section.
2. Bump `version` in `package.json`.
3. Commit and tag: `git commit -am "Release v0.x.y" && git tag v0.x.y`.
4. Push: `git push && git push --tags`.
5. The `release` GitHub Actions workflow runs typecheck + tests + build, then publishes to npm with `--provenance`.

## License

MIT. Contributions are accepted under the same license. By submitting a PR you confirm you have the right to license your contribution under MIT.
