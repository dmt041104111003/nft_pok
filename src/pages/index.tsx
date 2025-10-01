import { useState } from 'react'
import { BrowserWallet } from '@meshsdk/core'

export default function Home() {
  const [wallet, setWallet] = useState<any>(null)
  const [addr, setAddr] = useState('')
  const [status, setStatus] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [userName, setUserName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [imageUri, setImageUri] = useState('')

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
      const used = await w.getUsedAddresses()
      const a = used && used.length ? used[0] : await w.getChangeAddress()
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
      if (!userName) { setStatus('Enter name'); return }
      let img = imageUri
      if (!img && file) {
        setStatus('Uploading to IPFS...')
        const arrayBuf = await file.arrayBuffer()
        const res = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent(file.name) }, body: arrayBuf })
        const { uri, error } = await res.json()
        if (error) throw new Error(error)
        img = uri
        setImageUri(uri)
      }
      setStatus('Building tx on server...')
      const buildRes = await fetch('/api/build-mint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: addr, name: userName, image: img }) })
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
      <div style={{ marginBottom: 12 }}>
        <label>
          Name
          <input placeholder="User name" value={userName} onChange={e => setUserName(e.target.value)} />
        </label>
        <label style={{ marginLeft: 8 }}>
          Image
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
      <button onClick={connectWallet} disabled={isConnecting || !!wallet}>
        {wallet ? 'Connected' : (isConnecting ? 'Connecting...' : 'Connect Eternl')}
      </button>
      <button onClick={mint} disabled={!wallet} style={{ marginLeft: 8 }}>Mint NFT</button>
      <pre style={{ background: '#f5f5f5', padding: 12 }}>{status}</pre>
    </div>
  )
}


