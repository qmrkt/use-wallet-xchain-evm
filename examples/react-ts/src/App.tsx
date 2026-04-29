import { useState } from 'react'
import algosdk from 'algosdk'
import { useWallet } from '@txnlab/use-wallet-react'

export function App() {
  const { wallets, activeAddress, signTransactions } = useWallet()
  const evmWallet = wallets[0]

  const [signedHex, setSignedHex] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setError(null)
    try {
      await evmWallet.connect()
      evmWallet.setActive()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDisconnect() {
    setSignedHex(null)
    setError(null)
    await evmWallet.disconnect()
  }

  async function handleSign() {
    setError(null)
    setSignedHex(null)
    if (!activeAddress) {
      setError('No active address')
      return
    }
    try {
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: activeAddress,
        receiver: activeAddress,
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
        setError('Adapter did not return a signed blob (sender mismatch?)')
        return
      }
      setSignedHex(Array.from(blob, (b) => b.toString(16).padStart(2, '0')).join(''))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>use-wallet-xchain-evm — React demo</h1>
      <p>
        Connects an EVM wallet (MetaMask et al.), derives an Algorand address via xChain Accounts,
        signs a 0-ALGO self-payment.
      </p>

      {!activeAddress ? (
        <button onClick={handleConnect}>Connect EVM wallet</button>
      ) : (
        <section>
          <h2>Active account</h2>
          <p>
            <strong>Algorand address (derived):</strong>{' '}
            <code style={{ wordBreak: 'break-all' }}>{activeAddress}</code>
          </p>
          <button onClick={handleSign}>Sign test txn</button>{' '}
          <button onClick={handleDisconnect}>Disconnect</button>
        </section>
      )}

      {error && <p style={{ color: '#c00' }}>Error: {error}</p>}

      {signedHex && (
        <section>
          <h2>Signed txn (hex)</h2>
          <pre style={{ background: '#f4f4f4', padding: '1rem', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {signedHex}
          </pre>
        </section>
      )}
    </main>
  )
}
