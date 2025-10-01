import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: { bodyParser: false },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      req.on('data', (c) => chunks.push(Buffer.from(c)))
      req.on('end', () => resolve())
      req.on('error', reject)
    })
    const filename = decodeURIComponent((req.headers['x-filename'] as string) || 'file')
    const jwt = process.env.IPFS_JWT
    if (!jwt) return res.status(500).json({ error: 'IPFS_JWT missing' })
    const form = new FormData()
    form.append('file', new Blob([Buffer.concat(chunks)]), filename)
    const up = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: form as any,
    })
    const j = await up.json()
    if (!up.ok) return res.status(up.status).json({ error: j?.error || 'Upload failed' })
    const cid = j?.IpfsHash || j?.cid || j?.Hash
    const uri = cid ? `ipfs://${cid}` : ''
    return res.status(200).json({ uri })
  } catch (e: any) {
    return res.status(500).json({ error: e.message })
  }
}


