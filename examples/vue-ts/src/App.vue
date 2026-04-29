<script setup lang="ts">
import { ref } from 'vue'
import algosdk from 'algosdk'
import { useWallet } from '@txnlab/use-wallet-vue'

const { wallets, activeAddress, signTransactions } = useWallet()

const signedHex = ref<string | null>(null)
const error = ref<string | null>(null)

async function handleConnect() {
  error.value = null
  try {
    const evmWallet = wallets.value[0]
    await evmWallet.connect()
    evmWallet.setActive()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function handleDisconnect() {
  signedHex.value = null
  error.value = null
  await wallets.value[0].disconnect()
}

async function handleSign() {
  error.value = null
  signedHex.value = null
  const sender = activeAddress.value
  if (!sender) {
    error.value = 'No active address'
    return
  }
  try {
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
        genesisHash: new Uint8Array(32)
      }
    })

    const signed = await signTransactions([txn])
    const blob = signed[0]
    if (!blob) {
      error.value = 'Adapter did not return a signed blob (sender mismatch?)'
      return
    }
    signedHex.value = Array.from(blob, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <main>
    <h1>use-wallet-xchain-evm — Vue demo</h1>
    <p>
      Connects an EVM wallet (MetaMask et al.), derives an Algorand address via xChain Accounts,
      signs a 0-ALGO self-payment.
    </p>

    <button v-if="!activeAddress" @click="handleConnect">Connect EVM wallet</button>

    <section v-else>
      <h2>Active account</h2>
      <p>
        <strong>Algorand address (derived):</strong>
        <code>{{ activeAddress }}</code>
      </p>
      <button @click="handleSign">Sign test txn</button>
      <button @click="handleDisconnect">Disconnect</button>
    </section>

    <p v-if="error" class="error">Error: {{ error }}</p>

    <section v-if="signedHex">
      <h2>Signed txn (hex)</h2>
      <pre>{{ signedHex }}</pre>
    </section>
  </main>
</template>

<style scoped>
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
  white-space: pre-wrap;
  word-break: break-all;
}
.error {
  color: #c00;
}
</style>
