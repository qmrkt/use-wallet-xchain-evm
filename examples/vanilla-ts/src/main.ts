import algosdk from 'algosdk'
import { NetworkId, WalletManager } from '@txnlab/use-wallet'
import { xchainEvm } from '@algorade/use-wallet-xchain-evm'
import { connect, createConfig, http } from '@wagmi/core'
import { injected } from '@wagmi/connectors'
import { mainnet } from 'viem/chains'

const evmConnector = injected()

const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [evmConnector],
  transports: { [mainnet.id]: http() }
})

const manager = new WalletManager({
  wallets: [
    xchainEvm({
      wagmiConfig,
      getEvmAccounts: async () => {
        const result = await connect(wagmiConfig, { connector: evmConnector })
        return [...result.accounts]
      }
    })
  ],
  defaultNetwork: NetworkId.TESTNET
})

const evmWallet = manager.wallets[0]

const $ = (id: string) => document.getElementById(id)!
const connectBtn = $('connect') as HTMLButtonElement
const signBtn = $('sign') as HTMLButtonElement
const disconnectBtn = $('disconnect') as HTMLButtonElement
const connectedSection = $('connected')
const addressEl = $('address')
const errorEl = $('error')
const signedSection = $('signed-section')
const signedEl = $('signed')

function showError(msg: string | null) {
  if (msg) {
    errorEl.textContent = `Error: ${msg}`
    errorEl.classList.remove('hidden')
  } else {
    errorEl.classList.add('hidden')
  }
}

function render() {
  const address = manager.activeAddress
  if (address) {
    connectBtn.classList.add('hidden')
    connectedSection.classList.remove('hidden')
    addressEl.textContent = address
  } else {
    connectBtn.classList.remove('hidden')
    connectedSection.classList.add('hidden')
    signedSection.classList.add('hidden')
    addressEl.textContent = ''
    signedEl.textContent = ''
  }
}

manager.subscribe(() => render())
render()

connectBtn.addEventListener('click', async () => {
  showError(null)
  try {
    await evmWallet.connect()
    evmWallet.setActive()
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  }
})

disconnectBtn.addEventListener('click', async () => {
  showError(null)
  signedSection.classList.add('hidden')
  await evmWallet.disconnect()
})

signBtn.addEventListener('click', async () => {
  showError(null)
  signedSection.classList.add('hidden')
  const sender = manager.activeAddress
  if (!sender) {
    showError('No active address')
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

    const signed = await manager.signTransactions([txn])
    const blob = signed[0]
    if (!blob) {
      showError('Adapter did not return a signed blob (sender mismatch?)')
      return
    }
    signedEl.textContent = Array.from(blob, (b) => b.toString(16).padStart(2, '0')).join('')
    signedSection.classList.remove('hidden')
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err))
  }
})
