import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs/promises'
import path from 'path'
import { Transaction, BlockfrostProvider, ForgeScript } from '@meshsdk/core'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { address } = body
    if (!address) return res.status(400).json({ error: 'Missing address' })
    if (!process.env.BLOCKFROST_KEY) return res.status(500).json({ error: 'BLOCKFROST_KEY missing' })

    const provider = new BlockfrostProvider('preprod', 'preprod6zklQbnJjVdXelgKljYSSDqTNXvKrA2R')

    const blueprintPath = path.join(process.cwd(), 'public', 'plutus.json')
    const blueprint = JSON.parse(await fs.readFile(blueprintPath, 'utf8'))
    const nftPolicy = blueprint.validators.find((v: any) => v.title.includes('nft_policy.mint'))
    if (!nftPolicy) return res.status(500).json({ error: 'nft_policy.mint not found in plutus.json' })

    const forgingScript = ForgeScript.withPlutusScriptV3({ code: nftPolicy.compiledCode })
    const policyId = nftPolicy.hash
    const assetName = 'NFT'
    const assetHex = Buffer.from(assetName, 'utf8').toString('hex')
    const unit = `${policyId}${assetHex}`

    const initiator = { getUsedAddresses: async () => [address] } as any

    const tx = new Transaction({ initiator, fetcher: provider, submitter: provider, evaluator: provider })
    tx.mintAsset(forgingScript, unit, '1')
    tx.sendAssets(address, [{ unit, quantity: '1' }])

    const unsigned = await tx.build() 
    return res.status(200).json({ unsigned })
  } catch (e: any) {
    console.error('build-mint error:', e)
    return res.status(500).json({ error: e.message })
  }
}
