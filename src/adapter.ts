import type { SignTypedDataParams } from 'algo-x-evm-sdk'
import type { Config as WagmiConfig } from '@wagmi/core'
import type {
  AdapterConstructorParams,
  WalletAccount,
  WalletMetadata,
  WalletState
} from '@txnlab/use-wallet/adapter'

import { AlgoXEvmBaseWallet } from './algo-x-evm-base'
import { icon } from './icon'
import type { Eip1193Provider, XChainEvmOptions, XChainWalletMetadata } from './types'

const ICON = `data:image/svg+xml;base64,${btoa(icon)}`

interface ConnectorInfo {
  name?: string
  icon?: string
}

export class XChainEvmAdapter extends AlgoXEvmBaseWallet<XChainEvmOptions> {
  private _connecting = false
  private _disconnecting = false

  constructor(params: AdapterConstructorParams<XChainEvmOptions>) {
    super(params)
    if (!this.options.wagmiConfig) {
      throw new Error('XChainEvmAdapter requires `wagmiConfig` in options')
    }
  }

  static defaultMetadata: XChainWalletMetadata = {
    name: 'EVM Wallet',
    icon: ICON,
    isAlgoXEvm: 'EVM'
  }

  public get isConnecting(): boolean {
    return this._connecting
  }

  public get isDisconnecting(): boolean {
    return this._disconnecting
  }

  /**
   * Update the consumer-supplied EVM connect callback after construction.
   *
   * Most consumers can pass `getEvmAccounts` via `xchainEvm({ getEvmAccounts })`
   * at construction time and never call this. The setter exists for hosts where
   * the callback can only be built after the wallet manager is constructed —
   * notably React + RainbowKit, where opening the connect modal requires
   * `useConnectModal` from inside `<RainbowKitProvider>`, which mounts after
   * `WalletManager` instantiation.
   */
  public setGetEvmAccounts(fn: () => Promise<string[]>): void {
    this.options.getEvmAccounts = fn
  }

  private get wagmiConfig(): WagmiConfig {
    return this.options.wagmiConfig
  }

  protected async initializeProvider(): Promise<void> {
    this.logger.info('Using wagmi for EVM provider management')
  }

  private async getRawProvider(): Promise<Eip1193Provider> {
    const { getAccount } = await import('@wagmi/core')
    const account = getAccount(this.wagmiConfig)
    if (!account.connector) {
      throw new Error(
        'No EVM wallet connector available — connect an EVM wallet first via xchainEvm({ getEvmAccounts })'
      )
    }
    return account.connector.getProvider() as Promise<Eip1193Provider>
  }

  public async getEvmProvider(): Promise<Eip1193Provider> {
    return this.getRawProvider()
  }

  /**
   * EIP-712 sign via EIP-1193 provider directly. Bypasses wagmi's signTypedData
   * (which requires the wallet's current chain to be in the wagmi config).
   * The xChain EIP-712 domain has no chainId, so signing is chain-agnostic.
   */
  protected async signWithProvider(
    typedData: SignTypedDataParams,
    evmAddress: string
  ): Promise<string> {
    const provider = await this.getRawProvider()

    const data = JSON.stringify({
      types: typedData.types,
      domain: typedData.domain,
      primaryType: typedData.primaryType,
      message: typedData.message
    })

    this.logger.info('Requesting eth_signTypedData_v4', {
      evmAddress,
      domain: typedData.domain,
      primaryType: typedData.primaryType
    })

    const signature = (await provider.request({
      method: 'eth_signTypedData_v4',
      params: [evmAddress, data]
    })) as string

    this.logger.info('Received signature')
    return signature
  }

  private static extractConnectorInfo(account: unknown): ConnectorInfo {
    const info: ConnectorInfo = {}
    const connector = (account as { connector?: { name?: unknown; icon?: unknown } } | null)
      ?.connector
    if (typeof connector?.name === 'string') info.name = connector.name
    if (typeof connector?.icon === 'string') info.icon = connector.icon
    return info
  }

  /**
   * Read connected EVM accounts from wagmi state. If already connected (auto-reconnect
   * on page refresh), use that. Otherwise call the consumer-supplied `getEvmAccounts`,
   * then fall back to the first available connector.
   */
  private async getConnectedEvmAddresses(): Promise<{
    addresses: string[]
    connectorInfo: ConnectorInfo
  }> {
    const { getAccount, connect: wagmiConnect } = await import('@wagmi/core')

    const existing = getAccount(this.wagmiConfig)
    if (existing.isConnected && existing.address) {
      this.logger.info('Using existing wagmi connection')
      return {
        addresses: existing.addresses ? [...existing.addresses] : [existing.address],
        connectorInfo: XChainEvmAdapter.extractConnectorInfo(existing)
      }
    }

    if (this.options.getEvmAccounts) {
      const addresses = await this.options.getEvmAccounts()
      if (addresses.length > 0) {
        const account = getAccount(this.wagmiConfig)
        const connectorInfo = XChainEvmAdapter.extractConnectorInfo(account)
        if (account.isConnected && account.address) {
          return {
            addresses: account.addresses ? [...account.addresses] : [account.address],
            connectorInfo
          }
        }
        return { addresses, connectorInfo }
      }
    }

    const connectors = this.wagmiConfig.connectors
    if (connectors.length > 0) {
      this.logger.info('Attempting connection with first available connector...')
      try {
        const result = await wagmiConnect(this.wagmiConfig, { connector: connectors[0] })
        const updatedAccount = getAccount(this.wagmiConfig)
        return {
          addresses: [...result.accounts],
          connectorInfo: XChainEvmAdapter.extractConnectorInfo(updatedAccount)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Auto-connect failed:', message)
      }
    }

    throw new Error('No EVM wallet connected. Please connect an EVM wallet first.')
  }

  private applyConnectorMetadata(connectorInfo: ConnectorInfo): void {
    const updates: Partial<WalletMetadata> = {}
    // Skip generic connector names that don't identify the underlying wallet
    // (e.g. wagmi's `injected()` reports "Injected" when the provider didn't
    // self-identify). Keep the adapter's default ("EVM Wallet") in those cases.
    if (connectorInfo.name && !XChainEvmAdapter.isGenericConnectorName(connectorInfo.name)) {
      updates.name = connectorInfo.name
    }
    if (connectorInfo.icon) updates.icon = connectorInfo.icon
    if (updates.name || updates.icon) {
      this.metadata = { ...this.metadata, ...updates }
      this.logger.info(`Wallet metadata updated: ${updates.name ?? '(no name)'}`)
    }
  }

  /**
   * Generic connector names that don't identify the underlying EVM wallet.
   * Add to this list as we discover other meaningless names from connector
   * implementations. Comparison is case-insensitive.
   */
  private static readonly GENERIC_CONNECTOR_NAMES = new Set(['injected', 'unknown', ''])

  private static isGenericConnectorName(name: string): boolean {
    return XChainEvmAdapter.GENERIC_CONNECTOR_NAMES.has(name.trim().toLowerCase())
  }

  public connect = async (): Promise<WalletAccount[]> => {
    if (this._connecting) {
      this.logger.info('connect() already in progress, ignoring duplicate call')
      return []
    }
    this._connecting = true

    try {
      this.logger.info('Connecting...')
      await this.initializeEvmSdk()

      const { addresses: evmAddresses, connectorInfo } = await this.getConnectedEvmAddresses()
      this.logger.info(`Connected to ${evmAddresses.length} EVM account(s)`)

      this.applyConnectorMetadata(connectorInfo)

      const walletAccounts = await this.deriveAlgorandAccounts(evmAddresses, connectorInfo)
      const activeAccount = walletAccounts[0]

      const walletState: WalletState = {
        accounts: walletAccounts,
        activeAccount
      }

      this.store.addWallet(walletState)

      this.logger.info('Connected.', walletState)
      this.notifyConnect(evmAddresses[0], activeAccount.address)
      return walletAccounts
    } finally {
      this._connecting = false
    }
  }

  public disconnect = async (): Promise<void> => {
    this._disconnecting = true
    this.logger.info('Disconnecting...')

    try {
      const { disconnect: wagmiDisconnect } = await import('@wagmi/core')
      await wagmiDisconnect(this.wagmiConfig)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn('wagmi disconnect error:', message)
    } finally {
      this._disconnecting = false
    }

    this.evmAddressMap.clear()
    this.metadata = { ...XChainEvmAdapter.defaultMetadata }
    this.onDisconnect()

    this.logger.info('Disconnected')
  }

  public resumeSession = async (): Promise<void> => {
    const walletState = this.store.getWalletState()
    if (!walletState) {
      return
    }

    this.logger.info('Resuming session...')
    await this.initializeEvmSdk()

    const { getAccount, reconnect } = await import('@wagmi/core')
    try {
      await reconnect(this.wagmiConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.logger.warn('wagmi reconnect error (may be expected):', message)
    }

    const account = getAccount(this.wagmiConfig)

    let evmAddresses: string[]
    let connectorInfo: ConnectorInfo

    if (account.isConnected && account.address) {
      evmAddresses = account.addresses ? [...account.addresses] : [account.address]
      connectorInfo = XChainEvmAdapter.extractConnectorInfo(account)
    } else if (account.status === 'reconnecting') {
      this.logger.warn('EVM wallet reconnecting, resuming from persisted state')
      evmAddresses = walletState.accounts
        .map((a) => a.metadata?.evmAddress as string)
        .filter(Boolean)

      if (evmAddresses.length === 0) {
        this.logger.warn('No persisted EVM addresses, cannot resume')
        this.onDisconnect()
        return
      }
      connectorInfo = {}
    } else {
      this.logger.warn('EVM wallet reconnect failed (status: disconnected), disconnecting')
      this.onDisconnect()
      return
    }

    if (!connectorInfo.name && walletState.accounts.length > 0) {
      const first = walletState.accounts[0]
      const persistedName = first.metadata?.connectorName as string | undefined
      const persistedIcon = first.metadata?.connectorIcon as string | undefined
      if (persistedName) connectorInfo.name = persistedName
      if (persistedIcon) connectorInfo.icon = persistedIcon
    }
    this.applyConnectorMetadata(connectorInfo)

    await this.resumeWithAccounts(evmAddresses, connectorInfo)
  }
}

export type { XChainEvmOptions }
