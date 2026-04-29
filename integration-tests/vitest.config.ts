import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'xchain-evm:integration',
    include: ['integration-tests/**/*.test.ts'],
    watch: false,
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000
  },
  resolve: {
    alias: {
      // Resolve package self-imports back to source for fast iteration
      '@algorade/use-wallet-xchain-evm': new URL('../src/index.ts', import.meta.url).pathname
    }
  }
})
