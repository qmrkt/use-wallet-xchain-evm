import { createApp } from 'vue'
import { WalletManagerPlugin } from '@txnlab/use-wallet-vue'
import App from './App.vue'
import { walletManagerConfig } from './wallet'

createApp(App).use(WalletManagerPlugin, walletManagerConfig).mount('#app')
