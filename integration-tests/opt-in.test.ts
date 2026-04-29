/**
 * Opt-in surfacing. An xChain-derived account starts at 0 ALGO; receiving an
 * ASA requires both a minimum balance AND an opt-in transaction. This test
 * documents what the failure mode looks like, so consumers know what error
 * to expect when their derived account hasn't been onboarded.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import algosdk from 'algosdk'
import {
  makeLocalnetClients,
  makeViemSigner,
  getDispenserAccount,
  fundAddress,
  deriveAlgorandAddress,
  type LocalnetClients
} from './helpers'

describe('integration: ASA opt-in surfacing', () => {
  let clients: LocalnetClients
  let derivedAddr: string
  let testAsaId: bigint
  let dispenser: { addr: string; sk: Uint8Array }

  beforeAll(async () => {
    clients = makeLocalnetClients()
    const { account } = makeViemSigner()
    derivedAddr = await deriveAlgorandAddress(clients.algorand, account.address)
    dispenser = await getDispenserAccount(clients.kmd)

    // Fund derived address with the bare minimum to exist
    await fundAddress(clients, derivedAddr, 0.5)

    // Create a test ASA from dispenser
    const params = await clients.algod.getTransactionParams().do()
    const createTxn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
      sender: dispenser.addr,
      total: 1_000_000n,
      decimals: 0,
      defaultFrozen: false,
      unitName: 'TEST',
      assetName: 'TestASA',
      manager: dispenser.addr,
      reserve: dispenser.addr,
      suggestedParams: params
    })
    const signed = createTxn.signTxn(dispenser.sk)
    const { txid } = await clients.algod.sendRawTransaction(signed).do()
    const confirmed = await algosdk.waitForConfirmation(clients.algod, txid, 4)
    testAsaId = confirmed.assetIndex!
    expect(testAsaId).toBeGreaterThan(0n)
  }, 60_000)

  it('rejects ASA transfer to non-opted-in derived account with a clear error', async () => {
    const params = await clients.algod.getTransactionParams().do()
    const transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: dispenser.addr,
      receiver: derivedAddr,
      amount: 1n,
      assetIndex: testAsaId,
      suggestedParams: params
    })
    const signed = transfer.signTxn(dispenser.sk)

    let error: unknown
    try {
      await clients.algod.sendRawTransaction(signed).do()
    } catch (e) {
      error = e
    }
    expect(error).toBeDefined()
    // Algod rejects with "asset X missing from receiver". Documenting the
    // shape here so consumers know what to catch and surface to users.
    const message = (error as Error)?.message ?? String(error)
    expect(message.toLowerCase()).toMatch(/asset|opted|missing/)
  }, 30_000)
})
