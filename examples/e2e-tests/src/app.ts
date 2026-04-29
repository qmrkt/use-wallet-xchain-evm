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

function render() {
  const address = manager.activeAddress
  $('address').textContent = address ?? ''
  signBtn.disabled = !address
}

manager.subscribe(() => render())
render()

connectBtn.addEventListener('click', async () => {
  $('error').textContent = ''
  try {
    await evmWallet.connect()
    evmWallet.setActive()
  } catch (err) {
    $('error').textContent = err instanceof Error ? err.message : String(err)
  }
})

signBtn.addEventListener('click', async () => {
  $('error').textContent = ''
  $('signed').textContent = ''
  const sender = manager.activeAddress
  if (!sender) return
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
      $('error').textContent = 'No signed blob'
      return
    }
    $('signed').textContent = Array.from(blob, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch (err) {
    $('error').textContent = err instanceof Error ? err.message : String(err)
  }
})
