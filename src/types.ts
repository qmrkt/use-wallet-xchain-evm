import type algosdk from 'algosdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type { WalletMetadata } from '@txnlab/use-wallet/adapter'

export interface EvmAccount {
  evmAddress: string
  algorandAddress: string
}

/**
 * Wallet metadata for xChain EVM-derived wallets.
 *
 * Consumers can detect EVM-backed wallets by checking
 * `(wallet.metadata as XChainWalletMetadata).isAlgoXEvm === 'EVM'`.
 */
export type XChainWalletMetadata = WalletMetadata & {
  isAlgoXEvm: 'EVM'
}

/**
 * Minimal EIP-1193 provider shape — the return type of
 * `XChainEvmAdapter.getEvmProvider()`. Consumers can use this for arbitrary
 * `eth_*` RPC calls on top of the same connector backing this adapter (e.g.
 * for bridge transactions).
 */
export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export interface UiHooks {
  onConnect?: (evmAccount: EvmAccount) => void
  onBeforeSign?: (
    txnGroup: algosdk.Transaction[] | Uint8Array[],
    indexesToSign?: number[]
  ) => Promise<void>
  onAfterSign?: (success: boolean, errorMessage?: string) => void
}

export interface AlgoXEvmOptions {
  uiHooks?: UiHooks
}

export interface XChainEvmOptions extends AlgoXEvmOptions {
  /** wagmi Config instance (e.g. from `createConfig` or RainbowKit's `getDefaultConfig`). */
  wagmiConfig: WagmiConfig
  /**
   * Optional callback invoked when no EVM account is connected.
   * The host app should open its own connect modal, perform the connection,
   * and resolve once the wallet is connected. After resolve, wagmi state is read.
   */
  getEvmAccounts?: () => Promise<string[]>
}

