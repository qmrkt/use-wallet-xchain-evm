<script lang="ts">
  import algosdk from 'algosdk'
  import { useWallet, useWalletContext } from '@txnlab/use-wallet-svelte'
  import { createWalletManager } from './wallet'

  useWalletContext(createWalletManager())

  const { wallets, activeAddress, signTransactions } = useWallet()

  // The xChain EVM adapter is the only wallet in this demo, so wallets[0] is it.
  const evmWallet = $derived(wallets[0])

  let signedHex = $state<string | null>(null)
  let error = $state<string | null>(null)

  async function handleConnect() {
    error = null
    try {
      await evmWallet.connect()
      evmWallet.setActive()
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }

  async function handleDisconnect() {
    signedHex = null
    error = null
    await evmWallet.disconnect()
  }

  async function handleSign() {
    error = null
    signedHex = null
    const sender = activeAddress.current
    if (!sender) {
      error = 'No active address'
      return
    }
    try {
      // 0-ALGO self-payment so the demo works without funding.
      // SuggestedParams are hardcoded so the demo doesn't require an algod URL.
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender,
        receiver: sender,
        amount: 0,
        suggestedParams: {
          fee: 1000,
          minFee: 1000,
          flatFee: true,
          firstValid: 1,
          lastValid: 1000,
          genesisID: 'testnet-v1.0',
          genesisHash: new Uint8Array(32) // placeholder; real apps fetch from algod
        }
      })

      const signed = await signTransactions([txn])
      const blob = signed[0]
      if (!blob) {
        error = 'Adapter did not return a signed blob (sender mismatch?)'
        return
      }
      signedHex = Array.from(blob, (b) => b.toString(16).padStart(2, '0')).join('')
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }
  }
</script>

<main>
  <h1>use-wallet-xchain-evm — Svelte demo</h1>

  <p>
    Connects an EVM wallet (MetaMask et al.), derives an Algorand address via xChain Accounts,
    signs a 0-ALGO self-payment.
  </p>

  {#if !activeAddress.current}
    <button onclick={handleConnect}>Connect EVM wallet</button>
  {:else}
    <section>
      <h2>Active account</h2>
      <p>
        <strong>Algorand address (derived):</strong>
        <code>{activeAddress.current}</code>
      </p>
      <button onclick={handleSign}>Sign test txn</button>
      <button onclick={handleDisconnect}>Disconnect</button>
    </section>
  {/if}

  {#if error}
    <p class="error">Error: {error}</p>
  {/if}

  {#if signedHex}
    <section>
      <h2>Signed txn (hex)</h2>
      <pre>{signedHex}</pre>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 800px;
    margin: 2rem auto;
    padding: 1rem;
    font-family: system-ui, sans-serif;
  }
  button {
    padding: 0.5rem 1rem;
    margin-right: 0.5rem;
    cursor: pointer;
  }
  code {
    background: #f4f4f4;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    word-break: break-all;
  }
  pre {
    background: #f4f4f4;
    padding: 1rem;
    overflow-x: auto;
    word-break: break-all;
    white-space: pre-wrap;
  }
  .error {
    color: #c00;
  }
</style>
