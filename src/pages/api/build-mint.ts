import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs/promises'
import path from 'path'
import { BlockfrostProvider, MeshTxBuilder, applyCborEncoding, resolveScriptHash, deserializeAddress, serializePlutusScript } from '@meshsdk/core'
import child_process from 'child_process'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { address, name, image } = body
    if (!address) return res.status(400).json({ error: 'Missing address' })
    if (!process.env.BLOCKFROST_KEY) return res.status(500).json({ error: 'BLOCKFROST_KEY missing' })

    const provider = new BlockfrostProvider(process.env.BLOCKFROST_KEY!)

    const smcDir = path.join(process.cwd(), 'smc')
    const publicBlueprintPath = path.join(process.cwd(), 'public', 'plutus.json')
    const smcBlueprintPath = path.join(smcDir, 'plutus.json')

    const getVaultHash = async () => {
      const readJson = async (p: string) => {
        try { return JSON.parse(await fs.readFile(p, 'utf8')) } catch { return null }
      }
      const fromPublic = await readJson(publicBlueprintPath)
      const fromSmc = await readJson(smcBlueprintPath)
      const pick = (bp: any) => bp?.validators?.find((v: any) => v.title?.includes('vault.spend'))?.hash
      return pick(fromPublic) || pick(fromSmc) || ''
    }

    const ownerHash = deserializeAddress(address).pubKeyHash
    const vaultHash = await getVaultHash()
    if (ownerHash && vaultHash) {
      const envPath = path.join(smcDir, 'env', 'default.ak')
      const libPath = path.join(smcDir, 'lib', 'config.ak')
      const updateCfg = async (p: string) => {
        try {
          let txt = await fs.readFile(p, 'utf8')
          txt = txt.replace(/pub const owner:[^=]*=\s*#"[0-9a-fA-F]{56}"/g, `pub const owner: VerificationKeyHash = #"${ownerHash}"`)
          txt = txt.replace(/pub const vault:[^=]*=\s*Script\(#"[0-9a-fA-F]{56}"\)/g, `pub const vault: Credential = Script(#"${vaultHash}")`)
          await fs.writeFile(p, txt, 'utf8')
        } catch {}
      }
      await updateCfg(envPath)
      await updateCfg(libPath)
      try {
        child_process.execSync('aiken build', { cwd: smcDir })
        await fs.copyFile(smcBlueprintPath, publicBlueprintPath)
      } catch {}
    }

    const blueprintPath = publicBlueprintPath
    const blueprint = JSON.parse(await fs.readFile(blueprintPath, 'utf8'))
    const nftPolicy = blueprint.validators.find((v: any) => v.title.includes('nft_policy.mint'))
    if (!nftPolicy) return res.status(500).json({ error: 'nft_policy.mint not found in plutus.json' })
    const vaultVal = blueprint.validators.find((v: any) => v.title.includes('vault.spend'))
    if (!vaultVal) return res.status(500).json({ error: 'vault.spend not found in plutus.json' })

    const scriptCbor = applyCborEncoding(nftPolicy.compiledCode)
    const policyId = resolveScriptHash(scriptCbor, 'V3')
    const assetName = 'NFT'
    const assetHex = Buffer.from(assetName, 'utf8').toString('hex')
    const unit = `${policyId}${assetHex}`

    const builder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider })
    builder.setNetwork('preprod')
    const utxos = await provider.fetchAddressUTxOs(address)
    if (!utxos || utxos.length === 0) throw new Error('No UTxO at address')
    builder.selectUtxosFrom(utxos)
    for (const u of utxos as any[]) {
      builder.inputForEvaluation(u)
    }
    const collateral = utxos.find((u: any) => {
      const assets = u.output?.amount || u.amount || []
      return Array.isArray(assets) && assets.length === 1 && assets[0]?.unit === 'lovelace'
    })
    if (collateral && collateral.input && collateral.output) {
      const hash = collateral.input.txHash
      const index = Number(collateral.input.outputIndex)
      const amount = collateral.output.amount
      const addr = collateral.output.address
      builder.txInCollateral(hash, index, amount, addr)
      builder.setCollateralReturnAddress(address)
    }
    const { pubKeyHash } = deserializeAddress(address)
    if (pubKeyHash) builder.requiredSignerHash(pubKeyHash)
    builder.changeAddress(address)
    builder
      .mintPlutusScriptV3()
      .mint('1', policyId, assetHex)
      .mintingScript(scriptCbor)
      .mintRedeemerValue({ alternative: 0, fields: [] })
    if (name || image) {
      const md: any = { [policyId]: { [assetName]: { name: name || 'NFT', image: image || '' } } }
      builder.metadataValue('721', md)
    }
    const vaultCbor = applyCborEncoding(vaultVal.compiledCode)
    const vaultAddress = serializePlutusScript({ code: vaultCbor, version: 'V3' }, undefined, 0).address
    builder.txOut(vaultAddress, [{ unit, quantity: '1' }])

    const unsigned = await builder.complete()
    return res.status(200).json({ unsigned })
  } catch (e: any) {
    console.error('build-mint error:', e)
    return res.status(500).json({ error: e.message })
  }
}
