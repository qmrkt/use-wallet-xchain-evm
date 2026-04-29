import { describe, it, expect, vi, beforeEach } from 'vitest'
import algosdk from 'algosdk'

// Mock dynamic imports BEFORE importing the adapter
const mockGetAccount = vi.fn()
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()

vi.mock('@wagmi/core', () => ({
  getAccount: mockGetAccount,
  connect: mockConnect,
  disconnect: mockDisconnect,
  reconnect: vi.fn()
}))

const mockGetAddress = vi.fn()
const mockSignerFn = vi.fn()
const AlgoXEvmSdkConstructor = vi.fn()
const algorandClientSentinel = { __mock__: 'algorand-client', id: 0 }

vi.mock('algo-x-evm-sdk', () => ({
  AlgoXEvmSdk: AlgoXEvmSdkConstructor.mockImplementation(() => ({
    getAddress: mockGetAddress,
    getSigner: vi.fn().mockResolvedValue({ signer: mockSignerFn })
  }))
}))

const fromClientsSentinel = { __mock__: 'from-clients-result', invocation: 0 }

vi.mock('@algorandfoundation/algokit-utils', () => ({
  AlgorandClient: {
    fromClients: vi.fn().mockImplementation(() => {
      fromClientsSentinel.invocation += 1
      return { ...fromClientsSentinel }
    })
  }
}))

import { XChainEvmAdapter } from './adapter'
import type { XChainEvmOptions } from './types'
import { makeFakeStore, makeFakeAlgodClient, makeSubscribe } from './test-helpers'
import type { Config as WagmiConfig } from '@wagmi/core'

const FAKE_EVM_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2'
// Real, checksum-valid Algorand addresses (algosdk validates them when constructing txns)
const FAKE_ALGORAND_ADDRESS = algosdk.generateAccount().addr.toString()
const OTHER_ALGORAND_ADDRESS = algosdk.generateAccount().addr.toString()

function makeWagmiConfig(): WagmiConfig {
  return {
    connectors: [{ name: 'MetaMask' }]
  } as unknown as WagmiConfig
}

function makeAdapter(options: Partial<XChainEvmOptions> = {}, store = makeFakeStore()) {
  const fullOptions: XChainEvmOptions = {
    wagmiConfig: makeWagmiConfig(),
    ...options
  }
  return {
    adapter: new XChainEvmAdapter({
      id: 'xchain-evm',
      metadata: XChainEvmAdapter.defaultMetadata,
      store: store.accessor,
      subscribe: makeSubscribe(),
      getAlgodClient: makeFakeAlgodClient,
      options: fullOptions
    }),
    store
  }
}

/**
 * Build a real Algorand transaction from a sender. Uses a stub suggested-params
 * because we never submit; we only read `txn.sender` from the result.
 */
function buildPaymentTxn(sender: string): algosdk.Transaction {
  const suggestedParams: algosdk.SuggestedParams = {
    fee: 1000,
    firstValid: 1,
    lastValid: 1001,
    genesisID: 'mainnet-v1.0',
    genesisHash: new Uint8Array(32),
    minFee: 1000,
    flatFee: true
  }
  return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender,
    receiver: sender,
    amount: 0,
    suggestedParams
  })
}

async function connectAdapter(adapter: XChainEvmAdapter, addresses: string[] = [FAKE_EVM_ADDRESS]) {
  mockGetAccount.mockReturnValue({
    isConnected: true,
    address: addresses[0],
    addresses,
    connector: { name: 'MetaMask' }
  })
  await adapter.connect()
}

beforeEach(() => {
  vi.clearAllMocks()
  AlgoXEvmSdkConstructor.mockClear()
  AlgoXEvmSdkConstructor.mockImplementation(() => ({
    getAddress: mockGetAddress,
    getSigner: vi.fn().mockResolvedValue({ signer: mockSignerFn })
  }))
  mockGetAddress.mockResolvedValue(FAKE_ALGORAND_ADDRESS)
  mockSignerFn.mockReset()
})

describe('AlgoXEvmBaseWallet — signTransactions happy path', () => {
  it('signs the txn whose sender matches a connected address', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const signedBlob = new Uint8Array([1, 2, 3])
    mockSignerFn.mockResolvedValue([signedBlob])

    const result = await adapter.signTransactions([txn])
    expect(result).toEqual([signedBlob])
    expect(mockSignerFn).toHaveBeenCalledOnce()
  })

  it('returns null for transactions whose sender is not a connected address', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    const ours = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const theirs = buildPaymentTxn(OTHER_ALGORAND_ADDRESS)
    const signedBlob = new Uint8Array([9, 9, 9])
    mockSignerFn.mockResolvedValue([signedBlob])

    const result = await adapter.signTransactions([ours, theirs])
    expect(result).toEqual([signedBlob, null])
  })

  it('respects indexesToSign filter', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    const txn0 = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const txn1 = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([2, 2])])

    const result = await adapter.signTransactions([txn0, txn1], [1])
    expect(result[0]).toBeNull()
    expect(result[1]).toEqual(new Uint8Array([2, 2]))
  })

  it('handles encoded (Uint8Array) input the same as decoded', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const encoded = algosdk.encodeUnsignedTransaction(txn)
    const signedBlob = new Uint8Array([7, 7])
    mockSignerFn.mockResolvedValue([signedBlob])

    const result = await adapter.signTransactions([encoded])
    expect(result).toEqual([signedBlob])
  })

  it('skips already-signed transactions in encoded input', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const fakeSignedBlob = algosdk.encodeUnsignedTransaction(txn) // shape doesn't matter for this test
    // Build a real signed txn so isSignedTxn returns true
    const sk = new Uint8Array(64)
    const realSigned = algosdk.encodeObj({
      sig: new Uint8Array(64),
      txn: algosdk.decodeObj(algosdk.encodeUnsignedTransaction(txn))
    })
    void sk
    void fakeSignedBlob

    mockSignerFn.mockResolvedValue([])
    const result = await adapter.signTransactions([realSigned])
    // Already-signed txn should produce null (we don't sign already-signed txns)
    expect(result).toEqual([null])
  })
})

describe('AlgoXEvmBaseWallet — error handling', () => {
  it('throws when an unmapped Algorand address must be signed', async () => {
    const { adapter } = makeAdapter()
    await connectAdapter(adapter)

    // Synthesize a state where addresses include OTHER but the EVM map doesn't
    // (simulates corruption / loss of evmAddressMap)
    ;(adapter as unknown as { addresses: string[] }).addresses
    // Force the adapter's connected addresses list to include OTHER
    const stateInjection = (adapter as unknown as {
      store: { getWalletState: () => { accounts: Array<{ address: string; metadata?: Record<string, unknown> }> } | undefined }
    }).store
    vi.spyOn(stateInjection, 'getWalletState').mockReturnValue({
      accounts: [
        { address: FAKE_ALGORAND_ADDRESS, metadata: { evmAddress: FAKE_EVM_ADDRESS } },
        { address: OTHER_ALGORAND_ADDRESS } // no evmAddress metadata
      ]
    } as never)

    const txn = buildPaymentTxn(OTHER_ALGORAND_ADDRESS)
    await expect(adapter.signTransactions([txn])).rejects.toThrow(
      /No EVM address mapped.*disconnecting and reconnecting/
    )
  })

  it('calls onAfterSign(false, message) when signing throws', async () => {
    const onAfterSign = vi.fn()
    const { adapter } = makeAdapter({ uiHooks: { onAfterSign } })
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockRejectedValue(new Error('user rejected'))

    await expect(adapter.signTransactions([txn])).rejects.toThrow(/user rejected/)
    expect(onAfterSign).toHaveBeenCalledWith(false, 'user rejected')
  })
})

describe('AlgoXEvmBaseWallet — uiHooks', () => {
  it('calls onBeforeSign with encoded txns before signing', async () => {
    const onBeforeSign = vi.fn().mockResolvedValue(undefined)
    const { adapter } = makeAdapter({ uiHooks: { onBeforeSign } })
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([1])])

    await adapter.signTransactions([txn])
    expect(onBeforeSign).toHaveBeenCalledTimes(1)
    const [passedTxns] = onBeforeSign.mock.calls[0]
    expect(passedTxns).toHaveLength(1)
    expect(passedTxns[0]).toBeInstanceOf(Uint8Array)
  })

  it('calls onAfterSign(true) on success', async () => {
    const onAfterSign = vi.fn()
    const { adapter } = makeAdapter({ uiHooks: { onAfterSign } })
    await connectAdapter(adapter)

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([1])])

    await adapter.signTransactions([txn])
    expect(onAfterSign).toHaveBeenCalledWith(true)
  })

  it('calls onConnect with derived account on connect()', async () => {
    const onConnect = vi.fn()
    const { adapter } = makeAdapter({ uiHooks: { onConnect } })
    await connectAdapter(adapter)
    expect(onConnect).toHaveBeenCalledTimes(1)
    expect(onConnect.mock.calls[0][0]).toEqual({
      evmAddress: FAKE_EVM_ADDRESS,
      algorandAddress: FAKE_ALGORAND_ADDRESS
    })
  })
})

describe('AlgoXEvmBaseWallet — evmAddressMap recovery from persisted metadata', () => {
  it('repopulates evmAddressMap from store before signing if empty', async () => {
    const persistedAccount = {
      name: `EVM Wallet ${FAKE_EVM_ADDRESS}`,
      address: FAKE_ALGORAND_ADDRESS,
      metadata: { evmAddress: FAKE_EVM_ADDRESS }
    }
    const store = makeFakeStore({
      walletState: {
        accounts: [persistedAccount],
        activeAccount: persistedAccount
      }
    })
    const { adapter } = makeAdapter({}, store)
    // Do NOT call connect() — simulate cold start where adapter has no in-memory map

    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([5])])

    const result = await adapter.signTransactions([txn])
    expect(result).toEqual([new Uint8Array([5])])
  })
})

describe('AlgoXEvmBaseWallet — network-switch SDK invalidation', () => {
  it('rebuilds AlgoXEvmSdk and AlgorandClient when activeNetwork changes', async () => {
    const store = makeFakeStore({ activeNetwork: 'mainnet' })
    const { adapter } = makeAdapter({}, store)

    await connectAdapter(adapter)
    const constructionsAfterFirstConnect = AlgoXEvmSdkConstructor.mock.calls.length

    // Switch network
    store.setActiveNetwork('testnet')

    // Trigger a sign to force the adapter to recheck the cache
    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([1])])
    await adapter.signTransactions([txn])

    expect(AlgoXEvmSdkConstructor.mock.calls.length).toBe(
      constructionsAfterFirstConnect + 1
    )
  })

  it('does NOT rebuild when activeNetwork is unchanged', async () => {
    const store = makeFakeStore({ activeNetwork: 'mainnet' })
    const { adapter } = makeAdapter({}, store)

    await connectAdapter(adapter)
    const constructionsAfterFirstConnect = AlgoXEvmSdkConstructor.mock.calls.length

    // Sign without network change
    const txn = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    mockSignerFn.mockResolvedValue([new Uint8Array([1])])
    await adapter.signTransactions([txn])

    expect(AlgoXEvmSdkConstructor.mock.calls.length).toBe(constructionsAfterFirstConnect)
  })
})

describe('AlgoXEvmBaseWallet — multi-signer grouping', () => {
  it('issues one signer call per unique EVM address', async () => {
    mockGetAddress.mockImplementation(async ({ evmAddress }: { evmAddress: string }) =>
      evmAddress === FAKE_EVM_ADDRESS ? FAKE_ALGORAND_ADDRESS : OTHER_ALGORAND_ADDRESS
    )

    const { adapter } = makeAdapter()
    const otherEvmAddress = '0xABCdef0000000000000000000000000000000000'
    await connectAdapter(adapter, [FAKE_EVM_ADDRESS, otherEvmAddress])

    const txn0 = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)
    const txn1 = buildPaymentTxn(OTHER_ALGORAND_ADDRESS)
    const txn2 = buildPaymentTxn(FAKE_ALGORAND_ADDRESS)

    mockSignerFn.mockResolvedValue([new Uint8Array([1])])

    await adapter.signTransactions([txn0, txn1, txn2])

    // Two unique EVM addresses → two getSigner() calls → two signer invocations
    expect(mockSignerFn).toHaveBeenCalledTimes(2)
  })
})
