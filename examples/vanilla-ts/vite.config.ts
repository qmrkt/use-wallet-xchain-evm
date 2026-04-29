import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [nodePolyfills({ globals: { Buffer: true } })],
  server: { port: 5176 }
})
