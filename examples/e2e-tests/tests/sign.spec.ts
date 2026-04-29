import { test, expect } from '@playwright/test'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

test('connect derives an Algorand address and signs a transaction', async ({ page }) => {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)

  // Sign EIP-712 typed data on the Node side using the test key. The page calls
  // this binding from inside its fake EIP-1193 provider's eth_signTypedData_v4 handler.
  await page.exposeBinding('__signTypedData', async (_, dataJson: string) => {
    const parsed = JSON.parse(dataJson)
    return account.signTypedData({
      domain: parsed.domain,
      types: parsed.types,
      primaryType: parsed.primaryType,
      message: parsed.message
    })
  })

  // Inject a stub EIP-1193 provider as window.ethereum BEFORE page scripts run.
  // The script body runs in browser context; only the second arg crosses the boundary.
  await page.addInitScript((evmAddress: string) => {
    const provider = {
      isMetaMask: true,
      request: async ({ method, params }: { method: string; params?: unknown[] }) => {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return [evmAddress]
          case 'eth_chainId':
            return '0x1'
          case 'net_version':
            return '1'
          case 'wallet_switchEthereumChain':
          case 'wallet_addEthereumChain':
            return null
          case 'eth_signTypedData_v4': {
            const [, data] = params as [string, string]
            return await (window as unknown as { __signTypedData: (d: string) => Promise<string> }).__signTypedData(data)
          }
          default:
            throw new Error(`Unsupported provider method: ${method}`)
        }
      },
      on: () => {},
      removeListener: () => {}
    }
    ;(window as unknown as { ethereum: typeof provider }).ethereum = provider
  }, account.address)

  await page.goto('/')

  await page.getByTestId('connect').click()

  // The derived Algorand address is 58 chars (base32). Wait for it to be populated.
  await expect(page.getByTestId('address')).toHaveText(/^[A-Z2-7]{58}$/, { timeout: 10_000 })

  await page.getByTestId('sign').click()

  // Signed transaction shows up as hex; just assert non-empty.
  await expect(page.getByTestId('signed')).not.toBeEmpty({ timeout: 10_000 })
  await expect(page.getByTestId('error')).toBeEmpty()
})
