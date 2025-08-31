const anchor = require('@coral-xyz/anchor')
const { PublicKey } = anchor.web3
const programId = new PublicKey('FZoTboRWj9fe74mx2E8sKDM8pVSov2n3QNdmRxTLLFEY')
const payerPk = new PublicKey('EKgq9QRap6QDFT7uUVK3TiAwPL4jPquDgx4Eg8gBQ19V')
const nonce = new anchor.BN(0)

async function main() {
  const [multisigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('multisig'), payerPk.toBuffer(), nonce.toBuffer('le', 8)],
    programId,
  )
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), multisigPda.toBuffer()], programId)
  const [whitelistPda] = PublicKey.findProgramAddressSync([Buffer.from('whitelist'), multisigPda.toBuffer()], programId)
  console.log('MULTISIG_PDA:', multisigPda.toBase58())
  console.log('VAULT_PDA:', vaultPda.toBase58())
  console.log('WHITELIST_PDA:', whitelistPda.toBase58())
}
main()
