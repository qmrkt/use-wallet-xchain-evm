/**
 * Atomic group with mixed signers.
 *
 * Group of 2 payment txns:
 *   txn 0 sender = xChain-derived address (signed via EIP-712)
 *   txn 1 sender = regular algosdk-generated account (signed via ed25519)
 *
 * Both signatures must be valid against the same group ID. Submitting the
 * group must succeed atomically. This catches:
 * - Group ID computation bugs in the xChain SDK
 * - ARC-0001 multi-wallet composition correctness (one signer's null entries
 *   must merge cleanly with another signer's blobs)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import algosdk from 'algosdk'
import { AlgoXEvmSdk } from 'algo-x-evm-sdk'
import {
  makeLocalnetClients,
  makeViemSigner,
  fundAddress,
  deriveAlgorandAddress,
  type LocalnetClients
} from './helpers'

describe('integration: atomic group with xChain + native co-signers', () => {
  let clients: LocalnetClients
  let xchainAddr: string
  let nativeAccount: algosdk.Account

  beforeAll(async () => {
    clients = makeLocalnetClients()
    const { account } = makeViemSigner()
    xchainAddr = await deriveAlgorandAddress(clients.algorand, account.address)
    nativeAccount = algosdk.generateAccount()

    await fundAddress(clients, xchainAddr, 1.0)
    await fundAddress(clients, nativeAccount.addr.toString(), 1.0)
  }, 60_000)

  it('signs and submits a 2-txn group with mixed signers', async () => {
    const params = await clients.algod.getTransactionParams().do()
    const { account, signMessage } = makeViemSigner()
    // Random note for idempotency across re-runs against persistent localnet.
    const uniqueNote = new Uint8Array(8)
    for (let i = 0; i < uniqueNote.length; i++) uniqueNote[i] = Math.floor(Math.random() * 256)

    const xchainTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: xchainAddr,
      receiver: xchainAddr,
      amount: 1,
      suggestedParams: params,
      note: uniqueNote
    })
    const nativeTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: nativeAccount.addr.toString(),
      receiver: nativeAccount.addr.toString(),
      amount: 1,
      suggestedParams: params,
      note: uniqueNote
    })

    // Atomic group
    algosdk.assignGroupID([xchainTxn, nativeTxn])

    // Sign each half independently
    const sdk = new AlgoXEvmSdk({ algorand: clients.algorand })
    const { signer: xchainSigner } = await sdk.getSigner({
      evmAddress: account.address,
      signMessage
    })
    const [xchainSigned] = await xchainSigner([xchainTxn, nativeTxn], [0])
    const nativeSigned = nativeTxn.signTxn(nativeAccount.sk)

    // Compose the signed group
    const signedGroup = [xchainSigned, nativeSigned]
    const { txid } = await clients.algod.sendRawTransaction(signedGroup).do()
    const confirmed = await algosdk.waitForConfirmation(clients.algod, txid, 4)
    expect(confirmed.confirmedRound).toBeGreaterThan(0)
  }, 90_000)
})
