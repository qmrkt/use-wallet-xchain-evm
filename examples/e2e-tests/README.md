# e2e-tests — use-wallet-xchain-evm

Playwright tests that drive the full connect → derive → sign flow against a stubbed EIP-1193 provider. No browser extension required.

## Run

```bash
pnpm install
pnpm test:install   # one-time: download Chromium for Playwright
pnpm test
```

## How it works

A self-contained Vite app (`src/app.ts`, served at `http://127.0.0.1:5180`) wires up the adapter exactly the way the framework examples do. The Playwright test:

1. Generates a fresh secp256k1 private key with viem.
2. Injects a fake `window.ethereum` provider into the page via `addInitScript` before any module loads.
3. The fake provider handles `eth_requestAccounts`, `eth_chainId`, and `eth_signTypedData_v4` — the last delegates to a Playwright `exposeBinding` callback that signs the EIP-712 payload in Node using the test key.
4. The test clicks **Connect**, asserts the derived 58-char Algorand address appears, clicks **Sign test txn**, asserts the signed-transaction hex appears.

Because the signature is real (not stubbed), the on-chain LogicSig would verify it — the test exercises the full cryptographic round-trip without a wallet extension.

## What this catches

- Wagmi connector wiring (it picks up `window.ethereum`).
- The xChain Accounts derivation pipeline (EVM address → Algorand address).
- The EIP-712 envelope construction in the adapter.
- `signTransactions` returning a signed blob for the active sender.
