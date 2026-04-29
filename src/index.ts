import type { WalletAdapterConfig } from '@txnlab/use-wallet'

import { XChainEvmAdapter } from './adapter'
import type { XChainEvmOptions } from './types'

export const WALLET_ID = 'xchain-evm' as const

export function xchainEvm(options: XChainEvmOptions): WalletAdapterConfig {
  return {
    id: WALLET_ID,
    metadata: XChainEvmAdapter.defaultMetadata,
    Adapter: XChainEvmAdapter as unknown as WalletAdapterConfig['Adapter'],
    options: options as unknown as Record<string, unknown>
  }
}

export { XChainEvmAdapter }
export { AlgoXEvmBaseWallet } from './algo-x-evm-base'
export type {
  AlgoXEvmOptions,
  XChainEvmOptions,
  XChainWalletMetadata,
  EvmAccount,
  UiHooks,
  Eip1193Provider
} from './types'
