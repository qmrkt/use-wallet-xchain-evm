/**
 * End-to-end signing round-trip on algokit localnet.
 *
 * Proves the cryptographic path works against a real algod node:
 * derive Algorand address from EVM key → fund → build payment txn →
 * sign via xChain SDK + viem-based EIP-712 signer → submit → confirm.
 *
 * Run with: `pnpm test:integration` (requires `algokit localnet start`).
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

const FUND_ALGOS = 1.0
const PAYMENT_ALGOS = 0.1

describe('integration: end-to-end signing round-trip', () => {
  let clients: LocalnetClients
  let derivedAddr: string
  let evmAddress: string

  beforeAll(async () => {
    clients = makeLocalnetClients()
    const { account } = makeViemSigner()
    evmAddress = account.address
    derivedAddr = await deriveAlgorandAddress(clients.algorand, evmAddress)
  }, 30_000)

  it('derives a deterministic Algorand address from the test EVM key', () => {
    expect(derivedAddr).toMatch(/^[A-Z2-7]{58}$/) // base32 checksum address
    expect(algosdk.isValidAddress(derivedAddr)).toBe(true)
  })

  it('signs a self-payment with EIP-712, submits, confirms on-chain', async () => {
    await fundAddress(clients, derivedAddr, FUND_ALGOS)

    const before = await clients.algod.accountInformation(derivedAddr).do()
    const beforeBalance = BigInt(before.amount ?? 0)
    expect(beforeBalance).toBeGreaterThanOrEqual(BigInt(FUND_ALGOS * 1_000_000))

    const params = await clients.algod.getTransactionParams().do()
    const { account, signMessage } = makeViemSigner()

    // Random note ensures txn-ID uniqueness across re-runs (otherwise re-running
    // the suite hits "transaction already in ledger" since localnet is persistent).
    const uniqueNote = new Uint8Array(8)
    for (let i = 0; i < uniqueNote.length; i++) uniqueNote[i] = Math.floor(Math.random() * 256)

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender: derivedAddr,
      receiver: derivedAddr, // self-payment; balance change is just the fee
      amount: Math.round(PAYMENT_ALGOS * 1_000_000),
      suggestedParams: params,
      note: uniqueNote
    })

    const sdk = new AlgoXEvmSdk({ algorand: clients.algorand })
    const { signer } = await sdk.getSigner({
      evmAddress: account.address,
      signMessage
    })

    const [signedBlob] = await signer([txn], [0])
    expect(signedBlob).toBeInstanceOf(Uint8Array)
    expect(signedBlob.length).toBeGreaterThan(0)

    const { txid } = await clients.algod.sendRawTransaction(signedBlob).do()
    const confirmed = await algosdk.waitForConfirmation(clients.algod, txid, 4)
    expect(confirmed.confirmedRound).toBeGreaterThan(0)

    const after = await clients.algod.accountInformation(derivedAddr).do()
    const afterBalance = BigInt(after.amount ?? 0)
    // self-payment: balance decreases by the fee only
    expect(afterBalance).toBeLessThan(beforeBalance)
    const fee = beforeBalance - afterBalance
    expect(fee).toBeLessThan(10_000n) // sanity: fees are in the thousands of microalgos
  }, 60_000)
})
