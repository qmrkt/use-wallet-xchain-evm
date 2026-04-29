import type { AlgorandClient } from '@algorandfoundation/algokit-utils'
import algosdk from 'algosdk'
import type { AlgoXEvmSdk, SignTypedDataParams } from 'algo-x-evm-sdk'
import {
  BaseWallet,
  compareAccounts,
  flattenTxnGroup,
  isSignedTxn,
  isTransactionArray,
  type AdapterConstructorParams,
  type SignerTransaction,
  type WalletAccount,
  type WalletState
} from '@txnlab/use-wallet/adapter'

import type { AlgoXEvmOptions } from './types'

export abstract class AlgoXEvmBaseWallet<
  TOptions extends AlgoXEvmOptions = AlgoXEvmOptions
> extends BaseWallet<TOptions> {
  protected algoXEvmSdk: AlgoXEvmSdk | null = null
  protected algorandClient: AlgorandClient | null = null
  protected cachedNetwork: string | null = null
  protected evmAddressMap: Map<string, string> = new Map()

  protected constructor(params: AdapterConstructorParams<TOptions>) {
    super(params)
  }

  protected abstract initializeProvider(): Promise<void>
  public abstract getEvmProvider(): Promise<unknown>
  protected abstract signWithProvider(
    typedData: SignTypedDataParams,
    evmAddress: string
  ): Promise<string>

  protected async initializeEvmSdk(): Promise<AlgoXEvmSdk> {
    const network = this.activeNetwork
    if (this.algoXEvmSdk && this.cachedNetwork === network) {
      return this.algoXEvmSdk
    }

    if (this.cachedNetwork && this.cachedNetwork !== network) {
      this.logger.info(
        `Active network changed (${this.cachedNetwork} -> ${network}); rebuilding xChain EVM SDK`
      )
      this.algoXEvmSdk = null
      this.algorandClient = null
    }

    this.logger.info('Initializing xChain EVM SDK...')
    const { AlgorandClient } = await import('@algorandfoundation/algokit-utils')
    const algodClient = this.getAlgodClient()
    this.algorandClient = AlgorandClient.fromClients({ algod: algodClient })

    const { AlgoXEvmSdk } = await import('algo-x-evm-sdk')
    this.algoXEvmSdk = new AlgoXEvmSdk({ algorand: this.algorandClient })
    this.cachedNetwork = network

    this.logger.info('xChain EVM SDK initialized')
    return this.algoXEvmSdk
  }

  protected async deriveAlgorandAccounts(
    evmAddresses: string[],
    connectorInfo?: { name?: string; icon?: string }
  ): Promise<WalletAccount[]> {
    const algoXEvmSdk = await this.initializeEvmSdk()
    const walletAccounts: WalletAccount[] = []

    for (const evmAddress of evmAddresses) {
      const algorandAddress = await algoXEvmSdk.getAddress({ evmAddress })
      this.evmAddressMap.set(algorandAddress, evmAddress)

      const metadata: Record<string, unknown> = { evmAddress }
      if (connectorInfo?.name) metadata.connectorName = connectorInfo.name
      if (connectorInfo?.icon) metadata.connectorIcon = connectorInfo.icon

      walletAccounts.push({
        name: `${this.metadata.name} ${evmAddress}`,
        address: algorandAddress,
        metadata
      })
    }

    return walletAccounts
  }

  protected processTxns(
    txnGroup: algosdk.Transaction[],
    indexesToSign?: number[]
  ): SignerTransaction[] {
    const txnsToSign: SignerTransaction[] = []

    txnGroup.forEach((txn, index) => {
      const isIndexMatch = !indexesToSign || indexesToSign.includes(index)
      const signer = txn.sender.toString()
      const canSignTxn = this.addresses.includes(signer)

      if (isIndexMatch && canSignTxn) {
        txnsToSign.push({ txn })
      } else {
        txnsToSign.push({ txn, signers: [] })
      }
    })

    return txnsToSign
  }

  private processEncodedTxns(
    txnGroup: Uint8Array[],
    indexesToSign?: number[]
  ): SignerTransaction[] {
    const txnsToSign: SignerTransaction[] = []

    txnGroup.forEach((txnBuffer, index) => {
      const decodedObj = algosdk.msgpackRawDecode(txnBuffer)
      const isSigned = isSignedTxn(decodedObj)

      const txn: algosdk.Transaction = isSigned
        ? algosdk.decodeSignedTransaction(txnBuffer).txn
        : algosdk.decodeUnsignedTransaction(txnBuffer)

      const isIndexMatch = !indexesToSign || indexesToSign.includes(index)
      const signer = txn.sender.toString()
      const canSignTxn = !isSigned && this.addresses.includes(signer)

      if (isIndexMatch && canSignTxn) {
        txnsToSign.push({ txn })
      } else {
        txnsToSign.push({ txn, signers: [] })
      }
    })

    return txnsToSign
  }

  public signTransactions = async <T extends algosdk.Transaction[] | Uint8Array[]>(
    txnGroup: T | T[],
    indexesToSign?: number[]
  ): Promise<(Uint8Array | null)[]> => {
    try {
      this.logger.debug('Signing transactions...', { txnGroup, indexesToSign })

      const algoXEvmSdk = await this.initializeEvmSdk()
      let txnsToSign: SignerTransaction[] = []

      if (isTransactionArray(txnGroup)) {
        const flatTxns: algosdk.Transaction[] = flattenTxnGroup(txnGroup)
        txnsToSign = this.processTxns(flatTxns, indexesToSign)
      } else {
        const flatTxns: Uint8Array[] = flattenTxnGroup(txnGroup as Uint8Array[])
        txnsToSign = this.processEncodedTxns(flatTxns, indexesToSign)
      }

      // Restore evmAddressMap from persisted account metadata if needed
      const walletState = this.store.getWalletState()
      if (walletState) {
        for (const account of walletState.accounts) {
          const addr = account.metadata?.evmAddress as string | undefined
          if (addr && !this.evmAddressMap.has(account.address)) {
            this.evmAddressMap.set(account.address, addr)
          }
        }
      }

      const allTxns = txnsToSign.map((t) => t.txn)
      const signIndexes = txnsToSign.reduce<number[]>((acc, t, i) => {
        if (!('signers' in t)) acc.push(i)
        return acc
      }, [])

      // Group sign indexes by EVM address (one wallet prompt per unique signer)
      const evmGroups = new Map<string, number[]>()
      for (const idx of signIndexes) {
        const algorandAddress = allTxns[idx].sender.toString()
        const evmAddress = this.evmAddressMap.get(algorandAddress)
        if (!evmAddress) {
          throw new Error(
            `No EVM address mapped for Algorand address ${algorandAddress}. ` +
              `This usually means the wallet session was lost or the connected EVM ` +
              `account does not derive this Algorand address. Try disconnecting and reconnecting.`
          )
        }
        const group = evmGroups.get(evmAddress)
        if (group) {
          group.push(idx)
        } else {
          evmGroups.set(evmAddress, [idx])
        }
      }

      const onBeforeSign = this.options.uiHooks?.onBeforeSign
      if (onBeforeSign) {
        this.logger.debug('Running onBeforeSign hook', { txnGroup, indexesToSign })
        const txnsAsUint8 = txnsToSign.map(({ txn }) => algosdk.encodeUnsignedTransaction(txn))
        await onBeforeSign(txnsAsUint8, indexesToSign)
      }

      const signedResult: (Uint8Array | null)[] = new Array(txnsToSign.length).fill(null)
      for (const [evmAddress, indexes] of evmGroups) {
        const { signer: evmSigner } = await algoXEvmSdk.getSigner({
          evmAddress,
          signMessage: (typedData) => this.signWithProvider(typedData, evmAddress)
        })

        const signedBlobs = await evmSigner(allTxns, indexes)

        for (let i = 0; i < indexes.length; i++) {
          signedResult[indexes[i]] = signedBlobs[i]
        }
      }

      const onAfterSign = this.options.uiHooks?.onAfterSign
      if (onAfterSign) {
        try {
          onAfterSign(true)
        } catch {
          // user hook errors must not fail the txn pipeline
        }
      }

      this.logger.debug('Transactions signed successfully', signedResult)
      return signedResult
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        this.options.uiHooks?.onAfterSign?.(false, message)
      } catch {
        // user hook errors must not mask the original error
      }
      this.logger.error('Error signing transactions:', message)
      throw error
    }
  }

  protected async resumeWithAccounts(
    evmAddresses: string[],
    connectorInfo?: { name?: string; icon?: string }
  ): Promise<void> {
    const walletState = this.store.getWalletState()
    if (!walletState) {
      this.logger.info('No session to resume')
      return
    }

    for (const account of walletState.accounts) {
      const evmAddr = account.metadata?.evmAddress as string | undefined
      if (evmAddr) {
        this.evmAddressMap.set(account.address, evmAddr)
      }
    }

    const walletAccounts = await this.deriveAlgorandAccounts(evmAddresses, connectorInfo)
    const match = compareAccounts(walletAccounts, walletState.accounts)
    if (!match) {
      this.logger.warn('Session accounts mismatch, updating accounts', {
        prev: walletState.accounts,
        current: walletAccounts
      })
    }

    // Always update so refreshed connector metadata propagates
    this.store.setAccounts(walletAccounts)
    this.logger.info('Session resumed')
  }

  protected notifyConnect(evmAddress: string, algorandAddress: string): void {
    const onConnect = this.options.uiHooks?.onConnect
    if (onConnect) {
      onConnect({ evmAddress, algorandAddress })
    }
  }

  // Explicit re-exports so subclasses keep type ergonomics. Kept here for parity with v4.
  protected get walletStateOrNull(): WalletState | undefined {
    return this.store.getWalletState()
  }
}
