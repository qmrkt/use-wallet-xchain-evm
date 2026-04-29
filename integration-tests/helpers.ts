/**
 * Integration test helpers — talk to a real algokit localnet.
 *
 * No wagmi / no browser. We use viem's privateKeyToAccount to sign EIP-712
 * typed data the same way MetaMask would, but headlessly. The xChain SDK
 * accepts any `signMessage` callback that returns a 0x-prefixed hex signature,
 * so signing parity with MetaMask is exact.
 */
import algosdk from 'algosdk'
import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoXEvmSdk, type SignTypedDataParams } from 'algo-x-evm-sdk'
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts'

export const LOCALNET_TOKEN = 'a'.repeat(64)
export const LOCALNET_ALGOD = { server: 'http://localhost', port: 4001, token: LOCALNET_TOKEN }
export const LOCALNET_KMD = { server: 'http://localhost', port: 4002, token: LOCALNET_TOKEN }
export const KMD_DEFAULT_WALLET = 'unencrypted-default-wallet'

/** Deterministic test EVM key. Same key → same derived Algorand address every run. */
export const TEST_EVM_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'

export interface LocalnetClients {
  algorand: AlgorandClient
  algod: algosdk.Algodv2
  kmd: algosdk.Kmd
  /** Hexadecimal genesis hash of the connected algod, lazily fetched. */
  getGenesisHash: () => Promise<string>
}

export function makeLocalnetClients(): LocalnetClients {
  const algod = new algosdk.Algodv2(LOCALNET_ALGOD.token, LOCALNET_ALGOD.server, LOCALNET_ALGOD.port)
  const kmd = new algosdk.Kmd(LOCALNET_KMD.token, LOCALNET_KMD.server, LOCALNET_KMD.port)
  const algorand = AlgorandClient.fromClients({ algod })

  let cachedHash: string | undefined
  return {
    algorand,
    algod,
    kmd,
    getGenesisHash: async (): Promise<string> => {
      if (cachedHash !== undefined) return cachedHash
      const params = await algod.getTransactionParams().do()
      cachedHash = Buffer.from(params.genesisHash).toString('base64')
      return cachedHash
    }
  }
}

/** Pull a funded account from KMD's default wallet (the localnet dispenser). */
export async function getDispenserAccount(kmd: algosdk.Kmd): Promise<{
  addr: string
  sk: Uint8Array
}> {
  const { wallets } = await kmd.listWallets()
  const wallet = (wallets as Array<{ id: string; name: string }>).find(
    (w) => w.name === KMD_DEFAULT_WALLET
  )
  if (!wallet) throw new Error(`No "${KMD_DEFAULT_WALLET}" found in KMD`)

  const { wallet_handle_token: handle } = await kmd.initWalletHandle(wallet.id, '')
  try {
    const { addresses } = await kmd.listKeys(handle)
    if (!addresses?.length) throw new Error('KMD wallet has no keys')

    // Pick the highest-balance account so we have headroom for funding tests
    const algod = new algosdk.Algodv2(
      LOCALNET_ALGOD.token,
      LOCALNET_ALGOD.server,
      LOCALNET_ALGOD.port
    )
    const balances = await Promise.all(
      addresses.map(async (addr: string) => {
        const info = await algod.accountInformation(addr).do()
        return { addr, amount: BigInt(info.amount ?? 0) }
      })
    )
    balances.sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0))
    const richest = balances[0].addr

    const exported = await kmd.exportKey(handle, '', richest)
    return { addr: richest, sk: exported.private_key }
  } finally {
    await kmd.releaseWalletHandle(handle)
  }
}

/** viem-based signMessage callback for AlgoXEvmSdk.getSigner. Mimics MetaMask. */
export function makeViemSigner(privateKey: `0x${string}` = TEST_EVM_PRIVATE_KEY): {
  account: PrivateKeyAccount
  signMessage: (params: SignTypedDataParams) => Promise<string>
} {
  const account = privateKeyToAccount(privateKey)
  return {
    account,
    signMessage: async ({ domain, types, primaryType, message }) => {
      // viem's signTypedData has strict generic typing; cast through Parameters
      // because algo-x-evm-sdk emits looser shapes (unknown record types) that
      // viem's compile-time type narrowing can't bridge.
      return account.signTypedData({
        domain,
        types,
        primaryType,
        message
      } as Parameters<typeof account.signTypedData>[0])
    }
  }
}

/**
 * Fund an Algorand address from the KMD dispenser. Idempotent: skips if the
 * target already has at least `amountAlgos` and adds a random note to the txn
 * so re-runs don't collide with previously-confirmed identical txns in the
 * ledger ("transaction already in ledger" rejection).
 */
export async function fundAddress(
  clients: LocalnetClients,
  toAddr: string,
  amountAlgos: number
): Promise<void> {
  const targetMicroAlgos = BigInt(Math.round(amountAlgos * 1_000_000))
  try {
    const info = await clients.algod.accountInformation(toAddr).do()
    const current = BigInt(info.amount ?? 0)
    if (current >= targetMicroAlgos) return // already funded enough; idempotent skip
  } catch {
    // Account doesn't exist yet — fall through to fund it.
  }

  const dispenser = await getDispenserAccount(clients.kmd)
  const params = await clients.algod.getTransactionParams().do()

  // Random note guarantees txn-ID uniqueness across re-runs even if all other
  // params (round window, amount, accounts) match.
  const note = new Uint8Array(8)
  for (let i = 0; i < note.length; i++) note[i] = Math.floor(Math.random() * 256)

  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: dispenser.addr,
    receiver: toAddr,
    amount: Number(targetMicroAlgos),
    suggestedParams: params,
    note
  })

  const signed = txn.signTxn(dispenser.sk)
  const { txid } = await clients.algod.sendRawTransaction(signed).do()
  await algosdk.waitForConfirmation(clients.algod, txid, 4)
}

/** Convenience: derive the Algorand address for a given EVM private key. */
export async function deriveAlgorandAddress(
  algorand: AlgorandClient,
  evmAddress: string
): Promise<string> {
  const sdk = new AlgoXEvmSdk({ algorand })
  return sdk.getAddress({ evmAddress })
}
