'use client' // 声明此文件为客户端组件

// 导入 Anchor 相关工具函数，用于获取多签程序实例和程序 ID
import { getMultisigProgram, getMultisigProgramId } from '@project/anchor'
// 导入 Solana 钱包适配器 Hook，用于获取区块链连接
import { useConnection } from '@solana/wallet-adapter-react'
// 导入 Solana Web3.js 的核心类，用于处理公钥、系统程序、交易等
import { Cluster, PublicKey, SystemProgram, LAMPORTS_PER_SOL, Transaction } from '@solana/web3.js'
// 导入 React Query 的 Hook，用于管理异步数据查询和变更
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// 导入 React 的 useMemo Hook，用于缓存计算结果
import { useMemo } from 'react'
// 导入自定义 Hook，获取当前 Solana 集群（主网、测试网等）
import { useCluster } from '../cluster/cluster-data-access'
// 导入自定义 Hook，提供 Anchor 提供者（provider）用于程序交互
import { useAnchorProvider } from '../solana/solana-provider'
// 导入自定义 Hook，用于显示交易成功的 toast 通知
import { useTransactionToast } from '../use-transaction-toast'
// 导入 Sonner 库，用于显示成功/错误提示
import { toast } from 'sonner'
// 导入 Anchor 的核心类，BN 用于大整数，Program 用于程序交互
import { BN, Program } from '@coral-xyz/anchor'
// 导入多签程序的类型定义（IDL 生成）
import { Multisig } from '@project/anchor'

// Hook：获取多签程序实例和账户数据，提供创建多签钱包的功能
export function useMultisigProgram() {
  // 获取当前集群（主网、测试网、开发网）
  const { cluster } = useCluster()
  // 获取交易 toast 通知工具
  const transactionToast = useTransactionToast()
  // 获取 Anchor 提供者（包含钱包和连接）
  const provider = useAnchorProvider()
  // 使用 useMemo 缓存程序 ID，避免重复计算
  const programId = useMemo(() => getMultisigProgramId(cluster.network as Cluster), [cluster])
  // 使用 useMemo 缓存程序实例，依赖 provider 和 programId
  const program = useMemo(() => getMultisigProgram(provider, programId), [provider, programId])
  // 获取当前钱包
  const wallet = provider.wallet

  // 查询所有与当前钱包关联的多签账户
  const accounts = useQuery({
    // 查询键，包含集群和钱包公钥，确保查询唯一性
    queryKey: ['multisig', 'all', { cluster, wallet: wallet?.publicKey?.toBase58() }],
    // 查询函数：获取所有多签账户，过滤出当前钱包是所有者的账户
    queryFn: async () => {
      // 如果钱包未连接，返回空数组
      if (!wallet.publicKey) return []
      // 获取所有多签账户
      const allMultisigAccounts = await program.account.multisig.all()
      // 过滤包含当前钱包的账户
      return allMultisigAccounts.filter((account) =>
        account.account.owners.some((owner) => owner.equals(wallet.publicKey!)),
      )
    },
    // 仅在钱包公钥存在时启用查询
    enabled: !!wallet.publicKey,
  })

  // 变更函数：创建新的多签钱包
  const createMultisig = useMutation({
    // 变更键，包含集群和钱包公钥
    mutationKey: ['multisig', 'create', { cluster, wallet: wallet?.publicKey?.toBase58() }],
    // 变更函数：创建多签钱包并可选充值
    mutationFn: async ({
      owners, // 所有者公钥列表
      threshold, // 批准阈值
      initialFunding, // 初始充值金额（SOL）
    }: {
      owners: PublicKey[]
      threshold: number
      initialFunding: number
    }) => {
      // 确保钱包已连接
      if (!wallet.publicKey) throw new Error('Wallet not connected')

      // 使用当前时间戳作为 nonce，生成唯一 PDA
      const nonce = new BN(Date.now())
      // 计算多签账户 PDA
      const [multisigPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('multisig'), wallet.publicKey.toBuffer(), nonce.toArrayLike(Buffer, 'le', 8)],
        program.programId,
      )
      // 计算金库账户 PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), multisigPda.toBuffer()],
        program.programId,
      )
      // 计算白名单账户 PDA
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), multisigPda.toBuffer()],
        program.programId,
      )

      // 创建多签账户交易
      const createTxSignature = await program.methods
        .createMultisig(owners, threshold, nonce) // 调用链上 createMultisig 方法
        .accounts({
          multisig: multisigPda, // 多签账户 PDA
          vault: vaultPda, // 金库账户 PDA
          whitelist: whitelistPda, // 白名单账户 PDA
          payer: wallet.publicKey, // 支付者（钱包）
          systemProgram: SystemProgram.programId, // 系统程序
        })
        .rpc() // 发送交易

      // 等待交易确认
      await provider.connection.confirmTransaction(createTxSignature, 'confirmed')

      // 如果指定初始资金，执行充值交易
      if (initialFunding > 0) {
        // 构造转账交易
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey, // 从钱包转账
            toPubkey: vaultPda, // 转到金库账户
            lamports: initialFunding * LAMPORTS_PER_SOL, // 充值金额（lamports）
          }),
        )

        // 发送并确认充值交易
        const fundTxSignature = await provider.sendAndConfirm(transaction)
        // 记录充值交易成功的签名
        console.log('Funding transaction successful with signature:', fundTxSignature)
      }

      // 返回创建交易的签名
      return createTxSignature
    },
    // 成功回调：显示交易成功通知并刷新账户数据
    onSuccess: (signature) => {
      // 显示交易成功的 toast
      transactionToast(signature)
      // 显示成功提示
      toast.success('多签钱包创建并充值成功!')
      // 2秒后刷新多签账户数据
      setTimeout(() => accounts.refetch(), 2000)
    },
    // 错误回调：显示错误提示
    onError: (err: any) => toast.error(`创建失败: ${err.message}`),
  })

  // 返回程序实例、程序 ID、账户查询和创建函数
  return { program, programId, accounts, createMultisig }
}

// Hook：管理特定多签账户的操作，包括查询账户数据、充值和提案
export function useMultisigProgramAccount({ account: multisigAccount }: { account: PublicKey }) {
  // 获取 Solana 区块链连接
  const { connection } = useConnection()
  // 获取当前集群
  const { cluster } = useCluster()
  // 获取交易 toast 通知工具
  const transactionToast = useTransactionToast()
  // 获取多签程序实例
  const { program } = useMultisigProgram()
  // 获取 Anchor 提供者
  const provider = useAnchorProvider()

  // 查询多签账户数据
  const accountQuery = useQuery({
    // 查询键，包含集群和多签账户公钥
    queryKey: ['multisig', 'fetch', { cluster, multisigAccount }],
    // 查询函数：获取指定多签账户的状态
    queryFn: () => program.account.multisig.fetch(multisigAccount),
  })

  // 缓存多签账户数据
  const multisigData = accountQuery.data

  // 查询与多签账户关联的交易
  const transactionsQuery = useQuery({
    // 查询键，包含集群和多签账户公钥
    queryKey: ['multisig', 'transactions', { cluster, multisigAccount }],
    // 查询函数：获取所有交易账户，按交易 ID 降序排序
    queryFn: async () => {
      // 过滤与多签账户关联的交易
      const accounts = await program.account.transaction.all([
        { memcmp: { offset: 8, bytes: multisigAccount.toBase58() } },
      ])
      // 按交易 ID 降序排序
      return accounts.sort((a, b) => b.account.id.cmp(a.account.id))
    },
  })

  // 查询金库账户的余额
  const vaultQuery = useQuery({
    // 查询键，包含集群和多签账户公钥
    queryKey: ['multisig', 'vault', { cluster, multisigAccount }],
    // 查询函数：计算金库 PDA 并获取余额
    queryFn: async () => {
      // 计算金库账户 PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), multisigAccount.toBuffer()],
        program.programId,
      )
      // 获取金库账户余额
      const balance = await connection.getBalance(vaultPda)
      // 返回金库公钥和余额
      return {
        publicKey: vaultPda,
        balance,
      }
    },
    // 仅在多签账户有效时启用查询
    enabled: !!multisigAccount,
  })

  // 变更函数：为金库账户充值
  const fundVault = useMutation({
    // 变更键，包含集群和多签账户公钥
    mutationKey: ['multisig', 'fundVault', { cluster, multisigAccount }],
    // 变更函数：向金库转账 SOL
    mutationFn: async (amountInSol: number) => {
      // 确保钱包已连接
      if (!provider.wallet.publicKey) {
        throw new Error('Wallet not connected')
      }
      // 确保充值金额为正
      if (amountInSol <= 0) {
        throw new Error('Amount must be positive')
      }

      // 刷新金库数据
      const vaultData = await vaultQuery.refetch()
      // 确保金库地址存在
      if (!vaultData.data?.publicKey) {
        throw new Error('Vault address not found')
      }

      // 构造转账交易
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: provider.wallet.publicKey, // 从钱包转账
          toPubkey: vaultData.data.publicKey, // 转到金库账户
          lamports: amountInSol * LAMPORTS_PER_SOL, // 充值金额（lamports）
        }),
      )

      // 发送并确认交易
      return provider.sendAndConfirm(transaction)
    },
    // 成功回调：显示成功通知并刷新金库余额
    onSuccess: (signature) => {
      // 显示交易成功通知
      transactionToast(signature)
      // 显示成功提示
      toast.success('充值成功!')
      // 刷新金库余额
      return vaultQuery.refetch()
    },
    // 错误回调：显示错误提示
    onError: (err: any) => {
      toast.error(`充值失败: ${err.message}`)
    },
  })

  // 变更函数：提案新的转账交易
  const proposeTransaction = useMutation({
    // 变更键，包含集群和多签账户公钥
    mutationKey: ['multisig', 'propose', { cluster, multisigAccount }],
    // 变更函数：发起新的提案
    mutationFn: async ({
      instructions, // 交易指令列表
      autoApprove, // 是否自动批准
    }: {
      instructions: any[]
      autoApprove: boolean
    }) => {
      // 确保数据和钱包已加载
      if (!multisigData || !program.provider.publicKey) throw new Error('数据未加载或钱包未连接')

      // 获取下一个交易 ID
      const txId = multisigData.nextTxId
      // 计算交易账户 PDA
      const [txPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('tx'), multisigAccount.toBuffer(), txId.toArrayLike(Buffer, 'le', 8)],
        program.programId,
      )
      // 获取金库和白名单 PDA
      const { vaultPda, whitelistPda } = await findPdas(program, multisigAccount)

      // 调用链上 propose 方法
      return program.methods
        .propose(instructions, null, autoApprove)
        .accounts({
          multisig: multisigAccount, // 多签账户
          whitelist: whitelistPda, // 白名单账户
          vault: vaultPda, // 金库账户
          transaction: txPda, // 交易账户
          proposer: program.provider.publicKey, // 提案者
          systemProgram: SystemProgram.programId, // 系统程序
        })
        .rpc() // 发送交易
    },
    // 成功回调：显示成功通知并刷新数据
    onSuccess: (signature) => {
      // 显示交易成功通知
      transactionToast(signature)
      // 显示成功提示
      toast.success('提案已成功发起!')
      // 2秒后刷新交易列表和账户数据
      setTimeout(() => {
        transactionsQuery.refetch()
        accountQuery.refetch()
      }, 2000)
    },
    // 错误回调：显示错误提示
    onError: (err: any) => toast.error(`提案失败: ${err.message}`),
  })

  // 查询白名单账户数据
  const whitelistQuery = useQuery({
    // 查询键，包含集群和多签账户公钥
    queryKey: ['multisig', 'whitelist', { cluster, multisigAccount }],
    // 查询函数：获取白名单账户数据
    queryFn: async () => {
      // 计算白名单账户 PDA
      const [whitelistPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('whitelist'), multisigAccount.toBuffer()],
        program.programId,
      )
      // 获取白名单账户状态
      return program.account.programWhitelist.fetch(whitelistPda)
    },
    // 仅在多签账户有效时启用查询
    enabled: !!multisigAccount,
  })

  // 返回多签账户查询、金库查询、交易查询、充值和提案函数
  return { accountQuery, vaultQuery, transactionsQuery, fundVault, whitelistQuery, proposeTransaction }
}

// Hook：管理特定交易账户的操作，包括查询、批准和执行
export function useTransactionProgramAccount({ transactionAccount }: { transactionAccount: PublicKey }) {
  // 获取当前集群
  const { cluster } = useCluster()
  // 获取交易 toast 通知工具
  const transactionToast = useTransactionToast()
  // 获取多签程序实例
  const { program } = useMultisigProgram()
  // 获取 Anchor 提供者
  const provider = useAnchorProvider()
  // 查询交易账户数据
  const accountQuery = useQuery({
    // 查询键，包含集群和交易账户公钥
    queryKey: ['transaction', 'fetch', { cluster, transactionAccount }],
    // 查询函数：获取指定交易账户的状态
    queryFn: () => program.account.transaction.fetch(transactionAccount),
  })

  // 获取交易关联的多签账户公钥
  const multisigAddress = accountQuery.data?.multisig

  // 使用 useMultisigProgramAccount 获取多签账户和交易数据
  const {
    accountQuery: multisigAccountQuery,
    transactionsQuery,
    whitelistQuery,
    vaultQuery,
  } = useMultisigProgramAccount({
    account: multisigAddress!, // 使用交易账户中的 multisig 字段
  })

  // 变更函数：批准交易
  const approveMutation = useMutation({
    // 变更键，包含集群和交易账户公钥
    mutationKey: ['transaction', 'approve', { cluster, transactionAccount }],
    // 变更函数：调用链上 approve 方法
    mutationFn: () => {
      // 确保数据和钱包就绪
      if (!multisigAddress || !program.provider.publicKey) throw new Error('依赖数据未加载')
      // 调用链上 approve 方法
      return program.methods
        .approve()
        .accounts({
          multisig: multisigAddress, // 多签账户
          transaction: transactionAccount, // 交易账户
          owner: program.provider.publicKey, // 批准者
        })
        .rpc() // 发送交易
    },
    // 成功回调：显示成功通知并刷新数据
    onSuccess: (tx) => {
      // 显示交易成功通知
      transactionToast(tx)
      // 显示成功提示
      toast.success('批准成功!')
      // 2秒后刷新交易账户数据和交易列表
      setTimeout(() => {
        accountQuery.refetch()
        transactionsQuery.refetch()
      }, 2000)
    },
    // 错误回调：显示错误提示
    onError: (err: any) => toast.error(`批准失败: ${err.message}`),
  })

  // 变更函数：执行交易
  const executeMutation = useMutation({
    // 变更键，包含集群和交易账户公钥
    mutationKey: ['transaction', 'execute', { cluster, transactionAccount }],
    // 变更函数：调用链上 execute 方法
    mutationFn: async () => {
      // 确保交易数据和多签地址就绪
      const txData = accountQuery.data
      if (!txData || !multisigAddress) throw new Error('交易数据未加载')

      // 构造 remainingAccounts，从交易数据中提取指令账户
      const remainingAccounts = txData.instructions.flatMap((instruction) =>
        instruction.accounts.map((account) => ({
          pubkey: account.pubkey, // 账户公钥
          isSigner: false, // 客户端不提供签名，链上通过 invoke_signed 处理
          isWritable: account.isWritable, // 保留可写属性
        })),
      )

      // 将指令的目标程序 ID 添加到 remainingAccounts
      txData.instructions.forEach((instruction) => {
        remainingAccounts.push({
          pubkey: instruction.programId, // 程序 ID
          isSigner: false, // 程序不签名
          isWritable: false, // 程序不可写
        })
      })

      // 打印 remainingAccounts 用于调试
      console.log(
        'Sending remaining accounts:',
        remainingAccounts.map((a) => ({ ...a, pubkey: a.pubkey.toBase58() })),
      )

      // 调用链上 execute 方法
      return program.methods
        .execute()
        .accounts({
          multisig: multisigAddress, // 多签账户
          transaction: transactionAccount, // 交易账户
        })
        .remainingAccounts(remainingAccounts) // 提供动态账户列表
        .rpc() // 发送交易
    },
    // 成功回调：显示成功通知并刷新数据
    onSuccess: (tx) => {
      // 显示交易成功通知
      transactionToast(tx)
      // 显示成功提示
      toast.success('交易执行成功!')
      // 2秒后刷新金库、交易账户、交易列表、白名单和多签账户数据
      setTimeout(() => {
        vaultQuery.refetch()
        accountQuery.refetch()
        transactionsQuery.refetch()
        whitelistQuery.refetch()
        multisigAccountQuery.refetch()
      }, 2000)
    },
    // 错误回调：记录错误并显示提示
    onError: (err: any) => {
      // 记录错误日志
      console.error('Execute transaction error:', err)
      // 显示错误提示
      toast.error(`执行失败: ${err.message}`)
    },
  })

  // 变更函数：撤销批准
  const revokeMutation = useMutation({
    // 变更键，包含集群和交易账户公钥
    mutationKey: ['transaction', 'revoke', { cluster, transactionAccount }],
    // 变更函数：调用链上 revoke 方法
    mutationFn: () => {
      // 确保数据和钱包就绪
      if (!multisigAddress || !provider.wallet.publicKey) throw new Error('依赖数据未加载')
      // 调用链上 revoke 方法
      return program.methods
        .revoke()
        .accounts({
          multisig: multisigAddress, // 多签账户
          transaction: transactionAccount, // 交易账户
          owner: provider.wallet.publicKey, // 撤销者
        })
        .rpc() // 发送交易
    },
    // 成功回调：显示成功通知并刷新数据
    onSuccess: (tx) => {
      // 显示交易成功通知
      transactionToast(tx)
      // 显示成功提示
      toast.success('撤销批准成功!')
      // 2秒后刷新交易账户、交易列表、白名单和多签账户数据
      setTimeout(() => {
        accountQuery.refetch()
        transactionsQuery.refetch()
        whitelistQuery.refetch()
        multisigAccountQuery.refetch()
      }, 2000)
    },
    // 错误回调：显示错误提示
    onError: (err: any) => toast.error(`撤销失败: ${err.message}`),
  })

  // 变更函数：取消提案
  const cancelMutation = useMutation({
    // 变更键，包含集群和交易账户公钥
    mutationKey: ['transaction', 'cancel', { cluster, transactionAccount }],
    // 变更函数：调用链上 cancelProposal 方法
    mutationFn: () => {
      // 确保提案者和钱包公钥就绪
      if (!accountQuery.data?.proposer || !provider.wallet.publicKey) throw new Error('依赖数据未加载')
      // 调用链上 cancelProposal 方法
      return program.methods
        .cancelProposal()
        .accounts({
          multisig: multisigAddress!, // 多签账户
          transaction: transactionAccount, // 交易账户
          proposer: provider.wallet.publicKey, // 签名者必须是提案者
        })
        .rpc() // 发送交易
    },
    // 成功回调：显示成功通知并刷新交易列表
    onSuccess: (tx) => {
      // 显示交易成功通知
      transactionToast(tx)
      // 显示成功提示
      toast.success('提案已取消!')
      // 2秒后刷新交易列表
      setTimeout(() => {
        transactionsQuery.refetch()
      }, 2000)
    },
    // 错误回调：显示错误提示
    onError: (err: any) => toast.error(`取消失败: ${err.message}`),
  })

  // 返回交易账户查询、多签账户查询、批准、执行、撤销和取消函数
  return { accountQuery, multisigAccountQuery, approveMutation, executeMutation, revokeMutation, cancelMutation }
}

// 辅助函数：计算多签账户的金库和白名单 PDA
async function findPdas(program: Program<Multisig>, multisigPda: PublicKey) {
  // 计算金库账户 PDA
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), multisigPda.toBuffer()], program.programId)
  // 计算白名单账户 PDA
  const [whitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), multisigPda.toBuffer()],
    program.programId,
  )
  // 返回金库和白名单 PDA
  return { vaultPda, whitelistPda }
}
