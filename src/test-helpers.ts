import { vi } from 'vitest'
import type {
  AdapterStoreAccessor,
  State,
  WalletAccount,
  WalletKey,
  WalletState
} from '@txnlab/use-wallet/adapter'
import type algosdk from 'algosdk'

export interface FakeStoreState {
  walletState: WalletState | undefined
  activeWallet: WalletKey | null
  activeNetwork: string
}

export interface FakeStore {
  accessor: AdapterStoreAccessor
  state: FakeStoreState
  /** Mutate `state.activeNetwork` (simulates `walletManager.setActiveNetwork`). */
  setActiveNetwork: (network: string) => void
}

export function makeFakeStore(initial: Partial<FakeStoreState> = {}): FakeStore {
  const state: FakeStoreState = {
    walletState: initial.walletState,
    activeWallet: initial.activeWallet ?? null,
    activeNetwork: initial.activeNetwork ?? 'mainnet'
  }

  const accessor: AdapterStoreAccessor = {
    getWalletState: () => state.walletState,
    getActiveWallet: () => state.activeWallet,
    getActiveNetwork: () => state.activeNetwork,
    getState: () => ({}) as State,
    addWallet: vi.fn((wallet: WalletState) => {
      state.walletState = wallet
      state.activeWallet = 'xchain-evm'
    }),
    removeWallet: vi.fn(() => {
      state.walletState = undefined
      state.activeWallet = null
    }),
    setAccounts: vi.fn((accounts: WalletAccount[]) => {
      if (state.walletState) {
        state.walletState = { ...state.walletState, accounts }
      }
    }),
    setActiveAccount: vi.fn(),
    setActive: vi.fn(() => {
      state.activeWallet = 'xchain-evm'
    })
  }

  return {
    accessor,
    state,
    setActiveNetwork: (network: string) => {
      state.activeNetwork = network
    }
  }
}

/** Stand-in algod client. Tests should not reach into its methods. */
export function makeFakeAlgodClient(): algosdk.Algodv2 {
  return { __mock__: 'algod' } as unknown as algosdk.Algodv2
}

export function makeSubscribe(): (cb: (state: State) => void) => () => void {
  return () => () => {
    /* no-op unsubscribe */
  }
}
