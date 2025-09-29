import { useState } from 'react'
import { BrowserWallet } from '@meshsdk/core'

export default function Home() {
  const [wallet, setWallet] = useState<any>(null)
  const [addr, setAddr] = useState('')
  const [status, setStatus] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)

  const connectWallet = async () => {
    setIsConnecting(true)
    setStatus('Connecting to Eternl...')
    try {
      if (!(window as any).cardano?.eternl) {
        setStatus('Eternl not found')
        setIsConnecting(false)
        return
      }
      const enabled = await (window as any).cardano.eternl.enable().catch(() => null)
      if (!enabled) {
        setStatus('Failed to enable Eternl')
        setIsConnecting(false)
        return
      }
      const w = await BrowserWallet.enable('eternl')
      const a = await w.getChangeAddress()
      setWallet(w)
      setAddr(a)
      setStatus('Connected')
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    } finally {
      setIsConnecting(false)
    }
  }

  const mint = async () => {
    if (!wallet) { setStatus('Connect first'); return }
    try {
      setStatus('Building tx on server...')
      const buildRes = await fetch('/api/build-mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: addr }) })
      const { unsigned, error } = await buildRes.json()
      if (error) throw new Error(error)
      setStatus('Signing...')
      const signed = await wallet.signTx(unsigned, true)
      const txHash = await wallet.submitTx(signed)

      setStatus('Minted: ' + txHash)
    } catch (e: any) {
      setStatus('Error: ' + e.message)
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <p>Address: {addr || 'Not connected'}</p>
      <button onClick={connectWallet} disabled={isConnecting || !!wallet}>
        {wallet ? 'Connected' : (isConnecting ? 'Connecting...' : 'Connect Eternl')}
      </button>
      <button onClick={mint} disabled={!wallet} style={{ marginLeft: 8 }}>Mint NFT</button>
      <pre style={{ background: '#f5f5f5', padding: 12 }}>{status}</pre>
    </div>
  )
}


