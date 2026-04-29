import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dynamic imports BEFORE importing the adapter
const mockGetAccount = vi.fn()
const mockConnect = vi.fn()
const mockDisconnect = vi.fn()
const mockReconnect = vi.fn()

vi.mock('@wagmi/core', () => ({
  getAccount: mockGetAccount,
  connect: mockConnect,
  disconnect: mockDisconnect,
  reconnect: mockReconnect
}))

const mockGetAddress = vi.fn()
const mockGetSigner = vi.fn()

vi.mock('algo-x-evm-sdk', () => ({
  AlgoXEvmSdk: vi.fn().mockImplementation(() => ({
    getAddress: mockGetAddress,
    getSigner: mockGetSigner
  }))
}))

vi.mock('@algorandfoundation/algokit-utils', () => ({
  AlgorandClient: {
    fromClients: vi.fn().mockReturnValue({ __mock__: 'algorand-client' })
  }
}))

import algosdk from 'algosdk'
import { XChainEvmAdapter } from './adapter'
import type { XChainEvmOptions } from './types'
import { makeFakeStore, makeFakeAlgodClient, makeSubscribe } from './test-helpers'
import type { Config as WagmiConfig } from '@wagmi/core'

const FAKE_EVM_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2'
const FAKE_EVM_ADDRESS_2 = '0x123d35Cc6634C0532925a3b844Bc9e7595f0bEbC'
const FAKE_ALGORAND_ADDRESS = algosdk.generateAccount().addr.toString()
const FAKE_ALGORAND_ADDRESS_2 = algosdk.generateAccount().addr.toString()

function makeWagmiConfig(): WagmiConfig {
  return {
    connectors: [{ name: 'MetaMask' } as unknown as WagmiConfig['connectors'][number]]
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

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAddress.mockImplementation(async ({ evmAddress }: { evmAddress: string }) =>
    evmAddress === FAKE_EVM_ADDRESS_2 ? FAKE_ALGORAND_ADDRESS_2 : FAKE_ALGORAND_ADDRESS
  )
})

describe('XChainEvmAdapter — construction', () => {
  it('throws when wagmiConfig is missing', () => {
    expect(() =>
      new XChainEvmAdapter({
        id: 'xchain-evm',
        metadata: XChainEvmAdapter.defaultMetadata,
        store: makeFakeStore().accessor,
        subscribe: makeSubscribe(),
        getAlgodClient: makeFakeAlgodClient,
        options: {} as XChainEvmOptions
      })
    ).toThrow(/wagmiConfig/)
  })

  it('exposes defaultMetadata with isAlgoXEvm marker', () => {
    expect(XChainEvmAdapter.defaultMetadata.name).toBe('EVM Wallet')
    expect(XChainEvmAdapter.defaultMetadata.isAlgoXEvm).toBe('EVM')
    expect(XChainEvmAdapter.defaultMetadata.icon).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})

describe('XChainEvmAdapter — connect()', () => {
  it('uses an existing wagmi connection without invoking getEvmAccounts', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask' }
    })
    const getEvmAccounts = vi.fn()

    const { adapter, store } = makeAdapter({ getEvmAccounts })
    const accounts = await adapter.connect()

    expect(getEvmAccounts).not.toHaveBeenCalled()
    expect(mockConnect).not.toHaveBeenCalled()
    expect(accounts).toHaveLength(1)
    expect(accounts[0].address).toBe(FAKE_ALGORAND_ADDRESS)
    expect(accounts[0].metadata?.evmAddress).toBe(FAKE_EVM_ADDRESS)
    expect(store.accessor.addWallet).toHaveBeenCalledTimes(1)
  })

  it('calls getEvmAccounts when no wagmi account is connected', async () => {
    mockGetAccount
      .mockReturnValueOnce({ isConnected: false, address: undefined })
      .mockReturnValueOnce({
        isConnected: true,
        address: FAKE_EVM_ADDRESS,
        addresses: [FAKE_EVM_ADDRESS],
        connector: { name: 'MetaMask' }
      })
    const getEvmAccounts = vi.fn().mockResolvedValue([FAKE_EVM_ADDRESS])

    const { adapter } = makeAdapter({ getEvmAccounts })
    await adapter.connect()

    expect(getEvmAccounts).toHaveBeenCalledTimes(1)
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('falls back to first connector when no callback and no existing connection', async () => {
    mockGetAccount
      .mockReturnValueOnce({ isConnected: false })
      .mockReturnValueOnce({
        isConnected: true,
        address: FAKE_EVM_ADDRESS,
        addresses: [FAKE_EVM_ADDRESS],
        connector: { name: 'MetaMask' }
      })
    mockConnect.mockResolvedValue({ accounts: [FAKE_EVM_ADDRESS] })

    const { adapter } = makeAdapter() // no getEvmAccounts
    await adapter.connect()

    expect(mockConnect).toHaveBeenCalledTimes(1)
  })

  it('throws when no connection paths are available', async () => {
    mockGetAccount.mockReturnValue({ isConnected: false })
    const wagmiConfig = { connectors: [] } as unknown as WagmiConfig

    const { adapter } = makeAdapter({ wagmiConfig })
    await expect(adapter.connect()).rejects.toThrow(/No EVM wallet connected/)
  })

  it('derives one Algorand account per EVM address', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS, FAKE_EVM_ADDRESS_2],
      connector: { name: 'MetaMask' }
    })

    const { adapter } = makeAdapter()
    const accounts = await adapter.connect()

    expect(accounts).toHaveLength(2)
    expect(accounts.map((a) => a.address).sort()).toEqual(
      [FAKE_ALGORAND_ADDRESS, FAKE_ALGORAND_ADDRESS_2].sort()
    )
  })

  it('returns empty array if connect() is called re-entrantly while in progress', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask' }
    })

    const { adapter } = makeAdapter()
    const firstCall = adapter.connect()
    const reentrantCall = adapter.connect()

    const [firstAccounts, reentrantAccounts] = await Promise.all([firstCall, reentrantCall])
    expect(firstAccounts).toHaveLength(1)
    expect(reentrantAccounts).toHaveLength(0)
  })
})

describe('XChainEvmAdapter — connector metadata', () => {
  it('keeps default "EVM Wallet" name when wagmi reports generic "Injected"', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'Injected' }
    })

    const { adapter } = makeAdapter()
    await adapter.connect()
    expect(adapter.metadata.name).toBe('EVM Wallet')
  })

  it('overrides metadata when wagmi reports a meaningful connector name', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask', icon: 'data:image/png;base64,abc' }
    })

    const { adapter } = makeAdapter()
    await adapter.connect()
    expect(adapter.metadata.name).toBe('MetaMask')
    expect(adapter.metadata.icon).toBe('data:image/png;base64,abc')
  })

  it('persists connectorName and connectorIcon into account metadata', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask', icon: 'data:image/png;base64,abc' }
    })

    const { adapter } = makeAdapter()
    const accounts = await adapter.connect()
    expect(accounts[0].metadata?.connectorName).toBe('MetaMask')
    expect(accounts[0].metadata?.connectorIcon).toBe('data:image/png;base64,abc')
  })
})

describe('XChainEvmAdapter — disconnect()', () => {
  it('calls wagmi disconnect, removes wallet, resets metadata', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask' }
    })
    mockDisconnect.mockResolvedValue(undefined)

    const { adapter, store } = makeAdapter()
    await adapter.connect()
    expect(adapter.metadata.name).toBe('MetaMask')

    await adapter.disconnect()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(store.accessor.removeWallet).toHaveBeenCalledTimes(1)
    expect(adapter.metadata.name).toBe('EVM Wallet')
  })

  it('does not throw if wagmi disconnect itself fails', async () => {
    mockGetAccount.mockReturnValue({
      isConnected: true,
      address: FAKE_EVM_ADDRESS,
      addresses: [FAKE_EVM_ADDRESS],
      connector: { name: 'MetaMask' }
    })
    mockDisconnect.mockRejectedValue(new Error('wagmi exploded'))

    const { adapter, store } = makeAdapter()
    await adapter.connect()
    await expect(adapter.disconnect()).resolves.toBeUndefined()
    expect(store.accessor.removeWallet).toHaveBeenCalled()
  })
})

describe('XChainEvmAdapter — setGetEvmAccounts()', () => {
  it('updates the callback after construction', async () => {
    mockGetAccount
      .mockReturnValueOnce({ isConnected: false })
      .mockReturnValueOnce({
        isConnected: true,
        address: FAKE_EVM_ADDRESS,
        addresses: [FAKE_EVM_ADDRESS],
        connector: { name: 'MetaMask' }
      })
    const original = vi.fn()
    const replacement = vi.fn().mockResolvedValue([FAKE_EVM_ADDRESS])

    const { adapter } = makeAdapter({ getEvmAccounts: original })
    adapter.setGetEvmAccounts(replacement)
    await adapter.connect()
    expect(original).not.toHaveBeenCalled()
    expect(replacement).toHaveBeenCalledTimes(1)
  })
})
