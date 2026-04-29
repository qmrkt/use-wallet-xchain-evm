import { NetworkId, type WalletManagerConfig } from '@txnlab/use-wallet'
import { xchainEvm } from '@algorade/use-wallet-xchain-evm'
import { connect, createConfig, http } from '@wagmi/core'
import { injected } from '@wagmi/connectors'
import { mainnet } from 'viem/chains'

const evmConnector = injected()

export const wagmiConfig = createConfig({
  chains: [mainnet],
  connectors: [evmConnector],
  transports: { [mainnet.id]: http() }
})

export const walletManagerConfig: WalletManagerConfig = {
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
}
