// 导入 Anchor 框架的所有功能，用于 Solana 程序开发
import * as anchor from '@coral-xyz/anchor'

// 导入 Anchor 的 Program 和 BN 类，Program 用于与链上程序交互，BN 用于处理大整数
import { Program, BN } from '@coral-xyz/anchor'

// 导入多签程序的类型定义，来自编译后的 IDL 文件
import { Multisig } from '../target/types/multisig'

// 导入 Solana Web3.js 库的必要组件，用于密钥对、系统程序、交易等操作
import {
  Keypair, // 用于生成和管理密钥对
  SystemProgram, // 系统程序，处理账户创建和转账等操作
  PublicKey, // 表示 Solana 公钥
  LAMPORTS_PER_SOL, // Solana 货币单位，1 SOL = 10^9 lamports
  Transaction as Web3Transaction, // Web3.js 的交易类
  sendAndConfirmTransaction, // 发送并确认交易的工具函数
  SendTransactionError, // 交易错误处理
} from '@solana/web3.js'

// 定义主测试套件，测试多签钱包功能
describe('multisig', () => {
  // 配置 Anchor 客户端连接到本地 Solana 集群（如 solana-test-validator）
  const provider = anchor.AnchorProvider.env()
  // 设置 Anchor 提供者，用于与区块链交互
  anchor.setProvider(provider)

  // 从工作空间加载多签程序实例，类型为 Multisig
  const program = anchor.workspace.Multisig as Program<Multisig>
  // 获取测试账户的钱包，用于支付交易费用
  const payer = provider.wallet as anchor.Wallet

  // 声明密钥对和公钥变量，用于测试中的多签所有者和 PDA
  let owners: Keypair[] // 多签所有者的密钥对数组
  let ownerA: Keypair, ownerB: Keypair, ownerC: Keypair // 三个多签所有者的密钥对
  let notAnOwner: Keypair // 非所有者的密钥对，用于测试权限

  let multisigPda: PublicKey // 多签账户的程序派生地址（PDA）
  let vaultPda: PublicKey // 多签金库账户的 PDA
  let whitelistPda: PublicKey // 白名单账户的 PDA
  const nonce = new BN(0) // 用于 PDA 生成的初始 nonce 值

  // 在所有测试开始前执行一次初始化
  beforeAll(async () => {
    // 生成三个所有者的密钥对
    ownerA = Keypair.generate()
    ownerB = Keypair.generate()
    ownerC = Keypair.generate()
    // 将所有者密钥对存入数组
    owners = [ownerA, ownerB, ownerC]
    // 生成一个非所有者的密钥对
    notAnOwner = Keypair.generate()

    // 为所有测试账户空投 2 SOL 以支付交易费用
    const airdropPromises = [ownerA, ownerB, ownerC, notAnOwner].map(async (kp) => {
      // 请求空投 2 SOL 到指定账户
      const sig = await provider.connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL)
      // 获取最新的区块哈希，用于交易确认
      const latestBlockhash = await provider.connection.getLatestBlockhash()
      // 确认空投交易，确保资金到达
      await provider.connection.confirmTransaction({
        signature: sig, // 交易签名
        ...latestBlockhash, // 包含 blockhash 和 lastValidBlockHeight
      })
    })
    // 等待所有空投交易完成
    await Promise.all(airdropPromises)
  })

  // 定义辅助函数，用于生成多签、金库和白名单的 PDA 地址
  const findPdas = (payerPk: PublicKey, currentNonce: BN) => {
    // 生成多签账户 PDA，使用 "multisig" 种子、payer 公钥和 nonce
    const [msPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('multisig'), payerPk.toBuffer(), currentNonce.toBuffer('le', 8)],
      program.programId, // 程序 ID 用于派生地址
    )
    // 生成金库账户 PDA，使用 "vault" 种子和多签 PDA
    const [vPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), msPda.toBuffer()], program.programId)
    // 生成白名单账户 PDA，使用 "whitelist" 种子和多签 PDA
    const [wlPda] = PublicKey.findProgramAddressSync([Buffer.from('whitelist'), msPda.toBuffer()], program.programId)
    // 返回所有生成的 PDA
    return { multisigPda: msPda, vaultPda: vPda, whitelistPda: wlPda }
  }

  // 测试套件：创建多签钱包
  describe('create_multisig', () => {
    // 测试用例：成功创建 2/3 多签钱包
    it('应该成功创建一个 2/3 的多签钱包', async () => {
      const threshold = 2 // 设置阈值为 2（需要 2 个签名）
      // 获取所有者的公钥数组
      const ownerPubkeys = owners.map((o) => o.publicKey)

      // 计算多签、金库和白名单的 PDA 地址
      const { multisigPda: newMs, vaultPda: newVault, whitelistPda: newWl } = findPdas(payer.publicKey, nonce)
      multisigPda = newMs // 更新全局变量
      vaultPda = newVault
      whitelistPda = newWl

      // 调用程序的 createMultisig 方法创建多签钱包
      await program.methods
        .createMultisig(ownerPubkeys, threshold, nonce) // 设置所有者、阈值和 nonce
        .accounts({
          multisig: multisigPda, // 多签账户
          vault: vaultPda, // 金库账户
          whitelist: whitelistPda, // 白名单账户
          payer: payer.publicKey, // 支付者账户
          systemProgram: SystemProgram.programId, // 系统程序
        })
        .rpc() // 执行远程过程调用

      // 验证多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      // 确认所有者列表正确
      expect(multisigAccount.owners.map((o) => o.toString())).toEqual(ownerPubkeys.map((o) => o.toString()))
      // 确认阈值正确
      expect(multisigAccount.threshold).toBe(threshold)
      // 确认 nonce 正确
      expect(multisigAccount.nonce.eq(nonce)).toBe(true)
      // 确认下一个交易 ID 为 0
      expect(multisigAccount.nextTxId.toNumber()).toBe(0)
      // 确认多签未暂停
      expect(multisigAccount.paused).toBe(false)

      // 验证白名单账户状态
      const whitelistAccount = await program.account.programWhitelist.fetch(whitelistPda)
      // 确认白名单包含 2 个程序
      expect(whitelistAccount.programs).toHaveLength(2)
      // 确认白名单包含系统程序
      expect(whitelistAccount.programs.map((p) => p.toBase58())).toContain(SystemProgram.programId.toBase58())
      // 确认白名单包含多签程序
      expect(whitelistAccount.programs.map((p) => p.toBase58())).toContain(program.programId.toBase58())

      // 为金库账户充值 1 SOL 用于后续测试
      const tx = new Web3Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey, // 从支付者账户转账
          toPubkey: vaultPda, // 转到金库账户
          lamports: LAMPORTS_PER_SOL, // 转账 1 SOL
        }),
      )
      // 发送并确认交易
      await sendAndConfirmTransaction(provider.connection, tx, [payer.payer])
      // 验证金库余额
      const vaultBalance = await provider.connection.getBalance(vaultPda)
      expect(vaultBalance).toBe(LAMPORTS_PER_SOL)
    })

    // 测试用例：因重复所有者而失败
    it('应该因重复的 owner 而失败', async () => {
      const localNonce = new BN(1) // 使用新 nonce 避免地址冲突
      // 计算新的多签 PDA
      const { multisigPda: newMs } = findPdas(payer.publicKey, localNonce)
      // 创建包含重复所有者的公钥列表
      const duplicateOwners = [ownerA.publicKey, ownerB.publicKey, ownerA.publicKey]
      // 期望创建多签失败，抛出 DuplicateOwners 错误
      await expect(
        program.methods
          .createMultisig(duplicateOwners, 2, localNonce)
          .accountsPartial({ multisig: newMs, payer: payer.publicKey })
          .rpc(),
      ).rejects.toThrow(/DuplicateOwners/)
    })

    // 测试用例：因阈值过高而失败
    it('应该因无效的阈值 (过高) 而失败', async () => {
      const localNonce = new BN(2) // 新 nonce
      // 计算新的多签 PDA
      const { multisigPda: newMs } = findPdas(payer.publicKey, localNonce)
      // 期望创建多签失败，阈值 4 超过所有者数量 3
      await expect(
        program.methods
          .createMultisig(
            owners.map((o) => o.publicKey),
            4,
            localNonce,
          )
          .accountsPartial({ multisig: newMs, payer: payer.publicKey })
          .rpc(),
      ).rejects.toThrow(/InvalidThreshold/)
    })

    // 测试用例：因阈值为 0 而失败
    it('应该因无效的阈值 (0) 而失败', async () => {
      const localNonce = new BN(3) // 新 nonce
      // 计算新的多签 PDA
      const { multisigPda: newMs } = findPdas(payer.publicKey, localNonce)
      // 期望创建多签失败，阈值 0 无效
      await expect(
        program.methods
          .createMultisig(
            owners.map((o) => o.publicKey),
            0,
            localNonce,
          )
          .accountsPartial({ multisig: newMs, payer: payer.publicKey })
          .rpc(),
      ).rejects.toThrow(/InvalidThreshold/)
    })
  })

  // 测试套件：交易生命周期（提案、批准、撤回、执行）
  describe('Transaction Lifecycle', () => {
    let transactionPda: PublicKey // 交易账户的 PDA
    let recipient: Keypair // 接收转账的账户
    const transferAmount = new BN(0.5 * LAMPORTS_PER_SOL) // 转账金额 0.5 SOL

    // 在测试套件开始前生成接收者密钥对
    beforeAll(() => {
      recipient = Keypair.generate()
    })

    // 测试用例：一个所有者提案交易
    it('应该允许一个 owner 提案一笔交易', async () => {
      // 获取多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      const txId = multisigAccount.nextTxId // 获取当前交易 ID
      // 计算交易账户 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigPda.toBuffer(), txId.toBuffer('le', 8)],
        program.programId,
      )
      transactionPda = txPda // 更新全局变量

      // 定义转账指令，从金库转 0.5 SOL 到接收者
      const ixData = {
        programId: SystemProgram.programId, // 系统程序
        accounts: [
          { pubkey: vaultPda, isSigner: true, isWritable: true }, // 金库作为签名者
          { pubkey: recipient.publicKey, isSigner: false, isWritable: true }, // 接收者账户
        ],
        data: SystemProgram.transfer({
          fromPubkey: vaultPda,
          toPubkey: recipient.publicKey,
          lamports: transferAmount.toNumber(),
        }).data, // 转账指令数据
      }

      // 提案交易
      await program.methods
        .propose([ixData], null, false) // 无过期时间，不自动批准
        .accounts({
          multisig: multisigPda, // 多签账户
          whitelist: whitelistPda, // 白名单账户
          vault: vaultPda, // 金库账户
          transaction: transactionPda, // 交易账户
          proposer: ownerA.publicKey, // 提案者
          systemProgram: SystemProgram.programId, // 系统程序
        })
        .signers([ownerA]) // 由 ownerA 签名
        .rpc() // 执行提案

      // 验证交易账户状态
      const txAccount = await program.account.transaction.fetch(transactionPda)
      expect(txAccount.proposer.equals(ownerA.publicKey)).toBe(true) // 确认提案者
      expect(txAccount.multisig.equals(multisigPda)).toBe(true) // 确认多签账户
      expect(txAccount.approvals).toHaveLength(0) // 确认无批准
      expect(txAccount.executed).toBe(false) // 确认未执行

      // 验证多签账户的交易 ID 已递增
      const multisigAccountAfter = await program.account.multisig.fetch(multisigPda)
      expect(multisigAccountAfter.nextTxId.toNumber()).toBe(txId.toNumber() + 1)
    })

    // 测试用例：另一个所有者批准交易
    it('应该允许另一个 owner 批准该交易', async () => {
      // ownerB 批准交易
      await program.methods
        .approve()
        .accounts({
          multisig: multisigPda, // 多签账户
          transaction: transactionPda, // 交易账户
          owner: ownerB.publicKey, // 批准者
        })
        .signers([ownerB]) // 由 ownerB 签名
        .rpc() // 执行批准

      // 验证交易账户状态
      const txAccount = await program.account.transaction.fetch(transactionPda)
      expect(txAccount.approvals.length).toBe(1) // 确认有一个批准
      expect(txAccount.approvals[0].equals(ownerB.publicKey)).toBe(true) // 确认批准者是 ownerB
    })

    // 测试用例：拒绝重复批准
    it('应该拒绝同一个 owner 重复批准', async () => {
      // 期望 ownerB 重复批准失败
      await expect(
        program.methods
          .approve()
          .accounts({
            multisig: multisigPda,
            transaction: transactionPda,
            owner: ownerB.publicKey,
          })
          .signers([ownerB])
          .rpc(),
      ).rejects.toThrow(/AlreadyApproved/) // 抛出 AlreadyApproved 错误
    })

    // 测试用例：撤回批准
    it('应该允许一个 owner 撤回他们的批准', async () => {
      // ownerB 撤回批准
      await program.methods
        .revoke()
        .accounts({
          multisig: multisigPda,
          transaction: transactionPda,
          owner: ownerB.publicKey,
        })
        .signers([ownerB])
        .rpc()

      // 验证交易账户状态
      const txAccount = await program.account.transaction.fetch(transactionPda)
      expect(txAccount.approvals).toHaveLength(0) // 确认批准列表为空
    })

    // 测试用例：达到阈值后执行交易
    it('当达到阈值时应该成功执行交易', async () => {
      // ownerA 批准交易
      await program.methods
        .approve()
        .accounts({ multisig: multisigPda, transaction: transactionPda, owner: ownerA.publicKey })
        .signers([ownerA])
        .rpc()

      // ownerB 批准交易，达到阈值 2
      await program.methods
        .approve()
        .accounts({ multisig: multisigPda, transaction: transactionPda, owner: ownerB.publicKey })
        .signers([ownerB])
        .rpc()

      // 获取接收者账户余额
      const recipientBalanceBefore = await provider.connection.getBalance(recipient.publicKey)

      // 执行交易
      await program.methods
        .execute()
        .accounts({
          multisig: multisigPda,
          transaction: transactionPda,
        })
        .remainingAccounts([
          { pubkey: vaultPda, isSigner: false, isWritable: true }, // 金库账户
          { pubkey: recipient.publicKey, isSigner: false, isWritable: true }, // 接收者账户
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // 系统程序
        ])
        .rpc()

      // 验证交易已执行
      const txAccountAfter = await program.account.transaction.fetch(transactionPda)
      expect(txAccountAfter.executed).toBe(true)

      // 验证接收者余额增加
      const recipientBalanceAfter = await provider.connection.getBalance(recipient.publicKey)
      expect(recipientBalanceAfter).toBe(recipientBalanceBefore + transferAmount.toNumber())
    })

    // 测试用例：拒绝重复执行
    it('应该拒绝执行一个已经执行过的交易', async () => {
      // 期望重复执行交易失败
      await expect(
        program.methods
          .execute()
          .accounts({
            multisig: multisigPda,
            transaction: transactionPda,
          })
          .remainingAccounts([
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: recipient.publicKey, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ])
          .rpc(),
      ).rejects.toThrow(/AlreadyExecuted/) // 抛出 AlreadyExecuted 错误
    })

    // 测试用例：关闭已执行的交易账户
    it('应该允许一个 owner 关闭一个已执行的交易账户', async () => {
      const rentRecipient = ownerA // 租金返还给 ownerA

      // 关闭交易账户
      await program.methods
        .closeTransaction()
        .accounts({
          multisig: multisigPda,
          transaction: transactionPda,
          recipient: rentRecipient.publicKey, // 租金接收者
          authorizedCloser: rentRecipient.publicKey, // 授权关闭者
        })
        .signers([rentRecipient])
        .rpc()

      // 验证交易账户已关闭，尝试获取应失败
      await expect(program.account.transaction.fetch(transactionPda)).rejects.toThrow()
    })
  })

  // 测试套件：提案边缘情况
  describe('Proposal Edge Cases', () => {
    // 在每个测试用例前创建新的多签账户
    beforeEach(async () => {
      // 使用当前时间戳和随机数生成唯一 nonce
      const newNonce = new BN(Date.now() + Math.floor(Math.random() * 1000000))
      // 计算新的 PDA 地址
      const { multisigPda: newMs, vaultPda: newVault, whitelistPda: newWl } = findPdas(payer.publicKey, newNonce)
      multisigPda = newMs
      vaultPda = newVault
      whitelistPda = newWl

      // 创建新的多签钱包
      await program.methods
        .createMultisig(
          owners.map((o) => o.publicKey),
          2,
          newNonce,
        )
        .accounts({
          multisig: multisigPda,
          vault: vaultPda,
          whitelist: whitelistPda,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()

      // 为金库充值 1 SOL
      const tx = new Web3Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: vaultPda,
          lamports: LAMPORTS_PER_SOL,
        }),
      )
      await sendAndConfirmTransaction(provider.connection, tx, [payer.payer])
    })

    // 测试用例：提案时自动批准
    it('当提案者请求时应该自动批准', async () => {
      // 定义转账指令，从金库转 0.001 SOL
      const dummyInstruction = {
        programId: SystemProgram.programId,
        accounts: [
          { pubkey: vaultPda, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: true },
        ],
        data: SystemProgram.transfer({
          fromPubkey: vaultPda,
          toPubkey: payer.publicKey,
          lamports: 1000000,
        }).data,
      }

      // 获取多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      const txId = multisigAccount.nextTxId
      // 计算交易 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigPda.toBuffer(), txId.toBuffer('le', 8)],
        program.programId,
      )

      // 验证金库 PDA 和 bump 值
      const [expectedVaultPda, expectedVaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), multisigPda.toBuffer()],
        program.programId,
      )
      expect(multisigAccount.vaultBump).toEqual(expectedVaultBump)
      expect(expectedVaultPda.toBase58()).toEqual(vaultPda.toBase58())
      console.log(`Expected vault PDA: ${vaultPda.toBase58()}`)
      console.log(`Stored vault bump: ${multisigAccount.vaultBump}`)

      // 验证金库余额
      const vaultBalance = await provider.connection.getBalance(vaultPda)
      console.log(`Vault balance: ${vaultBalance}`)
      expect(vaultBalance).toBeGreaterThan(1000000)

      // 打印多签和白名单状态用于调试
      console.log('Multisig account:', multisigAccount)
      console.log('Whitelist account:', await program.account.programWhitelist.fetch(whitelistPda))

      // 提案并自动批准
      await program.methods
        .propose([dummyInstruction], null, true) // autoApprove = true
        .accounts({
          multisig: multisigPda,
          whitelist: whitelistPda,
          vault: vaultPda,
          transaction: txPda,
          proposer: ownerA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ownerA])
        .rpc({ commitment: 'confirmed' }) // 使用确认承诺级别

      // 验证交易账户状态
      const txAccount = await program.account.transaction.fetch(txPda)
      expect(txAccount.approvals.length).toBe(1) // 确认自动批准
      expect(txAccount.approvals[0].equals(ownerA.publicKey)).toBe(true) // 确认批准者是 ownerA
    })

    // 测试用例：取消提案
    it('应该允许提案者取消自己的提案', async () => {
      // 定义转账指令
      const dummyInstruction = {
        programId: SystemProgram.programId,
        accounts: [
          { pubkey: vaultPda, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: true },
        ],
        data: SystemProgram.transfer({
          fromPubkey: vaultPda,
          toPubkey: payer.publicKey,
          lamports: 1000000,
        }).data,
      }

      // 获取多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      const txId = multisigAccount.nextTxId
      // 计算交易 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigPda.toBuffer(), txId.toBuffer('le', 8)],
        program.programId,
      )
      console.log(`Transaction PDA: ${txPda.toBase58()}`)

      // 验证金库 PDA
      const [expectedVaultPda, expectedVaultBump] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), multisigPda.toBuffer()],
        program.programId,
      )
      expect(multisigAccount.vaultBump).toEqual(expectedVaultBump)
      expect(expectedVaultPda.toBase58()).toEqual(vaultPda.toBase58())
      console.log(`Expected vault PDA: ${vaultPda.toBase58()}, Bump: ${multisigAccount.vaultBump}`)

      // 验证 ownerB 余额
      const ownerBBalance = await provider.connection.getBalance(ownerB.publicKey)
      console.log(`ownerB balance: ${ownerBBalance}`)
      expect(ownerBBalance).toBeGreaterThan(LAMPORTS_PER_SOL / 10)

      // 提案
      try {
        await program.methods
          .propose([dummyInstruction], null, false)
          .accounts({
            multisig: multisigPda,
            whitelist: whitelistPda,
            vault: vaultPda,
            transaction: txPda,
            proposer: ownerB.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([ownerB])
          .rpc({ commitment: 'confirmed' })
      } catch (err) {
        console.error('Propose error:', err)
        console.error('Transaction logs:', err.logs)
        throw err // 抛出错误以便调试
      }

      // 验证交易账户状态
      const txAccount = await program.account.transaction.fetch(txPda)
      console.log('Transaction account:', txAccount)
      expect(txAccount.proposer.equals(ownerB.publicKey)).toBe(true)
      expect(txAccount.multisig.equals(multisigPda)).toBe(true)
      expect(txAccount.executed).toBe(false)

      // 取消提案
      try {
        await program.methods
          .cancelProposal()
          .accounts({
            multisig: multisigPda,
            transaction: txPda,
            proposer: ownerB.publicKey,
          })
          .signers([ownerB])
          .rpc({ commitment: 'confirmed' })
      } catch (err) {
        console.error('CancelProposal error:', err)
        console.error('Transaction logs:', err.logs)
        throw err
      }

      // 验证交易账户已关闭
      await expect(program.account.transaction.fetch(txPda)).rejects.toThrow()
    })

    // 测试用例：拒绝过期交易的批准
    it('当交易过期后，应该拒绝批准', async () => {
      // 定义转账指令
      const dummyInstruction = {
        programId: SystemProgram.programId,
        accounts: [
          { pubkey: vaultPda, isSigner: true, isWritable: true },
          { pubkey: payer.publicKey, isSigner: false, isWritable: true },
        ],
        data: SystemProgram.transfer({
          fromPubkey: vaultPda,
          toPubkey: payer.publicKey,
          lamports: 1000000,
        }).data,
      }

      // 获取多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      const txId = multisigAccount.nextTxId
      // 计算交易 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigPda.toBuffer(), txId.toBuffer('le', 8)],
        program.programId,
      )

      // 设置交易过期时间为当前时间 + 1 秒
      const now = Math.floor(Date.now() / 1000)
      const expiresAt = new BN(now + 1)

      // 提案交易
      await program.methods
        .propose([dummyInstruction], expiresAt, false)
        .accounts({
          multisig: multisigPda,
          whitelist: whitelistPda,
          vault: vaultPda,
          transaction: txPda,
          proposer: ownerA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ownerA])
        .rpc()

      // 等待 3 秒确保交易过期
      await new Promise((resolve) => setTimeout(resolve, 3000))

      // 期望批准交易失败，抛出 Expired 错误
      await expect(
        program.methods
          .approve()
          .accounts({
            multisig: multisigPda,
            transaction: txPda,
            owner: ownerB.publicKey,
          })
          .signers([ownerB])
          .rpc(),
      ).rejects.toThrow(/Expired/)
    }, 10000) // 设置测试超时为 10 秒
  })

  // 测试套件：管理功能（通过提案、批准、执行流程）
  describe('Management Functions', () => {
    // 辅助函数：执行包含管理指令的交易
    const executeTxWithInstruction = async (instructionPromise, remainingAccounts) => {
      // 获取多签账户状态
      const multisigAccount = await program.account.multisig.fetch(multisigPda)
      const txId = multisigAccount.nextTxId
      // 计算交易 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigPda.toBuffer(), txId.toBuffer('le', 8)],
        program.programId,
      )

      // 获取指令数据
      const ix = await instructionPromise.instruction()
      const ixData = {
        programId: program.programId,
        accounts: ix.keys.map((k) => ({ pubkey: k.pubkey, isSigner: k.isSigner, isWritable: k.isWritable })),
        data: ix.data,
      }
      // 设置客户端剩余账户，禁用签名
      const clientSideRemainingAccounts = remainingAccounts.map((acc) => ({
        ...acc,
        isSigner: false,
      }))

      // 提案并由 ownerA 自动批准
      await program.methods
        .propose([ixData], null, true)
        .accounts({
          multisig: multisigPda,
          whitelist: whitelistPda,
          vault: vaultPda,
          transaction: txPda,
          proposer: ownerA.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([ownerA])
        .rpc()

      // ownerB 批准以达到阈值
      await program.methods
        .approve()
        .accounts({ multisig: multisigPda, transaction: txPda, owner: ownerB.publicKey })
        .signers([ownerB])
        .rpc()

      // 执行交易
      await program.methods
        .execute()
        .accounts({ multisig: multisigPda, transaction: txPda })
        .remainingAccounts(clientSideRemainingAccounts)
        .rpc()
    }

    // 测试用例：修改阈值
    it('应该成功修改阈值', async () => {
      const newThreshold = 1 // 新阈值
      // 定义修改阈值指令
      const changeThresholdIx = program.methods
        .changeThreshold(newThreshold)
        .accounts({ multisig: multisigPda, vault: vaultPda })

      // 定义剩余账户
      const remainingAccounts = [
        { pubkey: multisigPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: false },
      ]

      // 执行交易
      await executeTxWithInstruction(changeThresholdIx, remainingAccounts)

      // 验证阈值已修改
      const msAccount = await program.account.multisig.fetch(multisigPda)
      expect(msAccount.threshold).toBe(newThreshold)

      // 改回阈值 2 以便后续测试
      await executeTxWithInstruction(
        program.methods.changeThreshold(2).accounts({ multisig: multisigPda, vault: vaultPda }),
        remainingAccounts,
      )
    })

    // 测试用例：添加新所有者
    it('应该成功添加一个新 owner', async () => {
      const newOwner = Keypair.generate() // 生成新所有者密钥对
      // 定义添加所有者指令
      const addOwnerIx = program.methods
        .addOwner(newOwner.publicKey)
        .accounts({ multisig: multisigPda, vault: vaultPda })

      // 定义剩余账户
      const remainingAccounts = [
        { pubkey: multisigPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: false },
      ]

      // 执行交易
      await executeTxWithInstruction(addOwnerIx, remainingAccounts)

      // 验证新所有者已添加
      const msAccount = await program.account.multisig.fetch(multisigPda)
      expect(msAccount.owners.length).toBe(4) // 确认所有者数量
      expect(msAccount.owners.map((o) => o.toBase58())).toContain(newOwner.publicKey.toBase58()) // 确认新所有者
    })

    // 测试用例：移除所有者
    it('应该成功移除一个 owner', async () => {
      const ownerToRemove = ownerC.publicKey // 要移除的所有者
      // 定义移除所有者指令
      const removeOwnerIx = program.methods
        .removeOwner(ownerToRemove)
        .accounts({ multisig: multisigPda, vault: vaultPda })

      // 定义剩余账户
      const remainingAccounts = [
        { pubkey: multisigPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: false },
      ]

      // 执行交易
      await executeTxWithInstruction(removeOwnerIx, remainingAccounts)

      // 验证所有者已移除
      const msAccount = await program.account.multisig.fetch(multisigPda)
      expect(msAccount.owners.length).toBe(3) // 确认所有者数量
      expect(msAccount.owners.map((o) => o.toBase58())).not.toContain(ownerToRemove.toBase58()) // 确认已移除
    })
  })
})
