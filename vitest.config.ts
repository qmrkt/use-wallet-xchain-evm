import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'xchain-evm',
    dir: './src',
    watch: false,
    globals: true
  }
})
