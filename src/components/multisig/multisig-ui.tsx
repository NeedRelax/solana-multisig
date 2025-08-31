// 声明这是一个客户端组件（Next.js 或类似框架中使用）
'use client'

// 导入 Solana Web3.js 的核心功能，用于与 Solana 区块链交互
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js'
// 导入 React 的 useState Hook，用于在函数组件中管理状态
import { useState } from 'react'
// 导入自定义组件，用于生成指向区块链浏览器的链接
import { ExplorerLink } from '../cluster/cluster-ui'
// 导入自定义 Hook，提供对多签程序、账户和交易的访问
import { useMultisigProgram, useMultisigProgramAccount, useTransactionProgramAccount } from './multisig-data-access'
// 导入工具函数，用于缩短长字符串（如公钥）的显示
import { ellipsify } from '@/lib/utils'
// 导入 UI 按钮组件
import { Button } from '@/components/ui/button'
// 导入 UI 卡片组件及其子组件
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
// 导入 UI 输入框组件
import { Input } from '../ui/input'
// 导入 toast 通知库
import { toast } from 'sonner'
// 导入 Solana 钱包适配器 Hook，用于获取当前连接的钱包信息
import { useWallet } from '@solana/wallet-adapter-react'
// 导入 UI 标签组件
import { Label } from '../ui/label'
// 导入 UI 对话框组件及其子组件
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
// 导入 Lucide React 图标库中的各种图标
import {
  Settings,
  UserPlus,
  UserX,
  Target,
  CheckCircle,
  Hourglass,
  Play,
  Send,
  ShieldCheck,
  XCircle,
  Undo2,
  ListChecks,
  ShieldPlus,
  ShieldX,
  PauseCircle,
  PlayCircle,
} from 'lucide-react'
// 导入 UI 标签页组件
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'

// 导入 Anchor 框架的类型和工具，用于与 Solana 程序交互
import { IdlAccounts, BN, Program } from '@coral-xyz/anchor'
// 导入从 Anchor IDL 生成的多签程序类型
import { Multisig } from '@project/anchor'

// 定义 Transaction 账户的类型，基于 IDL
type TransactionAccount = IdlAccounts<Multisig>['transaction']
// 定义各种指令的识别码（discriminators），用于解析指令数据
const IX_DISCRIMINATORS = {
  changeThreshold: Buffer.from([146, 151, 213, 63, 121, 79, 9, 29]),
  addOwner: Buffer.from([211, 140, 15, 161, 64, 48, 232, 184]),
  removeOwner: Buffer.from([153, 251, 84, 208, 33, 62, 15, 247]),
  addToWhitelist: Buffer.from([157, 211, 52, 54, 144, 81, 5, 55]),
  removeFromWhitelist: Buffer.from([7, 144, 216, 239, 243, 236, 193, 235]),
  pause: Buffer.from([211, 22, 221, 251, 74, 121, 193, 47]),
}

// 解析 changeThreshold 指令的辅助函数
function parseChangeThresholdInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  // 检查指令的程序 ID 是否匹配多签程序 ID
  if (!instruction.programId.equals(programId)) return null
  // 将指令数据转换为 Buffer
  const dataBuffer = Buffer.from(instruction.data)
  // 检查数据长度是否符合预期 (8字节discriminator + 1字节threshold)
  if (dataBuffer.length !== 9) return null

  // 提取前8字节作为 discriminator
  const discriminator = dataBuffer.subarray(0, 8)
  // 检查 discriminator 是否匹配 changeThreshold 的识别码
  if (!discriminator.equals(IX_DISCRIMINATORS.changeThreshold)) return null

  // 读取第9字节作为新的阈值
  const newThreshold = dataBuffer.readUInt8(8)
  // 返回解析结果
  return { type: 'changeThreshold', newThreshold }
}

// 解析 addOwner 指令的辅助函数
function parseAddOwnerInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  if (!instruction.programId.equals(programId)) return null
  const dataBuffer = Buffer.from(instruction.data)
  // 检查数据长度是否符合预期 (8字节discriminator + 32字节pubkey)
  if (dataBuffer.length !== 40) return null

  const discriminator = dataBuffer.slice(0, 8)
  if (!discriminator.equals(IX_DISCRIMINATORS.addOwner)) return null

  // 提取后32字节作为新所有者的公钥
  const newOwner = new PublicKey(dataBuffer.slice(8))
  return { type: 'addOwner', newOwner }
}

// 解析 removeOwner 指令的辅助函数
function parseRemoveOwnerInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  if (!instruction.programId.equals(programId)) return null
  const dataBuffer = Buffer.from(instruction.data)
  if (dataBuffer.length !== 40) return null

  const discriminator = dataBuffer.slice(0, 8)
  if (!discriminator.equals(IX_DISCRIMINATORS.removeOwner)) return null

  // 提取后32字节作为要移除所有者的公钥
  const ownerToRemove = new PublicKey(dataBuffer.slice(8))
  return { type: 'removeOwner', ownerToRemove }
}

// 主指令解析函数，尝试按顺序解析不同类型的指令
function parseInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  // 首先尝试解析为转账指令
  const transferDetails = parseTransferInstruction(instruction)
  if (transferDetails) return { type: 'transfer', ...transferDetails }

  // 然后尝试解析为修改阈值指令
  const thresholdDetails = parseChangeThresholdInstruction(instruction, programId)
  if (thresholdDetails) return thresholdDetails

  // 尝试解析为添加所有者指令
  const addOwnerDetails = parseAddOwnerInstruction(instruction, programId)
  if (addOwnerDetails) return addOwnerDetails

  // 尝试解析为移除所有者指令
  const removeOwnerDetails = parseRemoveOwnerInstruction(instruction, programId)
  if (removeOwnerDetails) return removeOwnerDetails

  // 尝试解析为添加到白名单指令
  const addToWhitelistDetails = parseAddToWhitelistInstruction(instruction, programId)
  if (addToWhitelistDetails) return addToWhitelistDetails

  // 尝试解析为从白名单移除指令
  const removeFromWhitelistDetails = parseRemoveFromWhitelistInstruction(instruction, programId)
  if (removeFromWhitelistDetails) return removeFromWhitelistDetails

  // 尝试解析为暂停指令
  const pauseDetails = parsePauseInstruction(instruction, programId)
  if (pauseDetails) return pauseDetails

  // 如果所有解析尝试都失败，返回 null
  return null
}

// 创建多签钱包的表单组件
export function MultisigCreate() {
  // 从自定义 Hook 获取创建多签的方法
  const { createMultisig } = useMultisigProgram()
  // 从钱包适配器获取当前连接的钱包公钥
  const { publicKey } = useWallet()
  // 状态：存储其他所有者的公钥字符串数组
  const [owners, setOwners] = useState<string[]>([''])
  // 状态：存储批准所需的阈值
  const [threshold, setThreshold] = useState<number>(1)
  // 状态：存储初始充值金额（SOL）
  const [initialFunding, setInitialFunding] = useState<number>(0)

  // 添加一个新的空所有者输入框
  const handleAddOwner = () => setOwners([...owners, ''])
  // 移除指定索引的所有者输入框
  const handleRemoveOwner = (index: number) => setOwners(owners.filter((_, i) => i !== index))
  // 更新指定索引的所有者公钥
  const handleOwnerChange = (index: number, value: string) => {
    const newOwners = [...owners]
    newOwners[index] = value
    setOwners(newOwners)
  }

  // 处理表单提交
  const handleSubmit = () => {
    // 检查钱包是否已连接
    if (!publicKey) return toast.error('请先连接钱包。')

    // 构建最终的所有者列表（包含当前钱包和其他输入的所有者）
    const finalOwnersStr = [publicKey.toBase58(), ...owners.filter((o) => o.trim() !== '')]

    let ownerPubkeys: PublicKey[]
    try {
      // 将字符串公钥转换为 PublicKey 对象
      ownerPubkeys = finalOwnersStr.map((o) => new PublicKey(o))
    } catch (e) {
      // 处理无效的公钥格式
      return toast.error('检测到无效的 Owner 地址。')
    }

    // 检查是否有重复的公钥
    if (new Set(ownerPubkeys.map((o) => o.toBase58())).size !== ownerPubkeys.length) {
      return toast.error('检测到重复的 Owner 地址。')
    }

    // 验证阈值的有效性
    if (threshold <= 0 || threshold > ownerPubkeys.length) {
      return toast.error('阈值无效。必须大于 0 且小于等于 Owner 数量。')
    }

    // 调用创建多签的 mutation
    createMultisig.mutate({ owners: ownerPubkeys, threshold, initialFunding })
  }

  // 渲染创建多签的表单 UI
  return (
    <Card>
      <CardHeader>
        <CardTitle>创建一个新的多签钱包</CardTitle>
        <CardDescription>您的钱包将自动成为第一个所有者。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>其他所有者 (Additional Owners)</Label>
          {owners.map((owner, index) => (
            <div key={index} className="flex items-center gap-2 mt-1">
              <Input
                placeholder="输入所有者的公钥"
                value={owner}
                onChange={(e) => handleOwnerChange(index, e.target.value)}
              />
              <Button variant="ghost" size="icon" onClick={() => handleRemoveOwner(index)} className="h-8 w-8">
                &times;
              </Button>{' '}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={handleAddOwner} className="mt-2">
            添加 Owner
          </Button>
        </div>
        <div>
          <Label>批准阈值 (Threshold)</Label>
          <Input
            type="number"
            placeholder="例如: 2"
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10) || 1)}
            min={1}
          />
        </div>
        <div>
          <Label>初始充值金额 (SOL)</Label>
          <Input
            type="number"
            placeholder="例如: 1"
            value={initialFunding}
            onChange={(e) => setInitialFunding(parseFloat(e.target.value) || 0)}
            min={0}
          />
        </div>
        <Button onClick={handleSubmit} disabled={createMultisig.isPending}>
          {createMultisig.isPending ? '创建中...' : '创建钱包'}
        </Button>
      </CardContent>
    </Card>
  )
}

// 显示当前用户的多签钱包列表组件
export function MultisigList() {
  // 获取当前用户相关的多签账户
  const { accounts } = useMultisigProgram()

  // 渲染多签钱包列表
  return (
    <div className={'space-y-6 mt-6'}>
      <h2 className="text-2xl font-bold">我的多签钱包</h2>
      {accounts.isLoading ? (
        // 加载状态显示
        <div className="text-center">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : accounts.data?.length ? (
        // 有账户时显示网格列表
        <div className="grid md:grid-cols-2 gap-4">
          {accounts.data?.map((account) => (
            <MultisigCard key={account.publicKey.toString()} account={account.publicKey} />
          ))}
        </div>
      ) : (
        // 无账户时显示空状态
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-900 rounded-md">
          <h3 className={'text-xl'}>未找到多签钱包</h3>
          <p className="text-muted-foreground">请在上方创建一个来开始使用。</p>
        </div>
      )}
    </div>
  )
}

// 显示单个多签钱包详细信息的卡片组件
function MultisigCard({ account }: { account: PublicKey }) {
  // 获取多签程序实例
  const { program } = useMultisigProgram()
  // 获取当前连接的钱包公钥
  const { publicKey } = useWallet()
  // 获取特定多签账户的数据、金库数据、白名单数据和交易列表
  const {
    accountQuery: multisigQuery,
    vaultQuery,
    whitelistQuery,
    transactionsQuery,
  } = useMultisigProgramAccount({ account })

  // 加载状态显示
  if (multisigQuery.isLoading || vaultQuery.isLoading || whitelistQuery.isLoading) {
    return (
      <Card className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg"></span>
      </Card>
    )
  }

  // 获取多签账户数据
  const multisig = multisigQuery.data
  // 获取金库数据
  const vault = vaultQuery.data
  // 获取白名单数据
  const whitelist = whitelistQuery.data

  // 处理数据加载失败的情况
  if (!multisig)
    return (
      <Card>
        <CardHeader>
          <CardTitle>加载账户失败</CardTitle>
        </CardHeader>
      </Card>
    )

  // 检查当前用户是否是此多签的所有者
  const isOwner = publicKey && multisig?.owners.some((o) => o.equals(publicKey))

  // 渲染多签钱包卡片
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>
            多签钱包详情
            {/* 显示暂停状态标签 */}
            {multisig?.paused && (
              <span className="flex items-center gap-1 text-xs font-normal bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                <PauseCircle size={14} /> 已暂停
              </span>
            )}
          </CardTitle>
          {/* 如果是所有者，显示管理按钮 */}
          {isOwner && (
            <ManageMultisigForm
              program={program}
              multisigAccount={account}
              multisigQuery={multisigQuery}
              whitelistQuery={whitelistQuery}
            />
          )}
        </div>
        <CardDescription>
          地址: <ExplorerLink path={`account/${account}`} label={ellipsify(account.toString())} />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 金库信息部分 */}
        {vault && (
          <div className="p-1 rounded-md bg-slate-50 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <p className="font-bold text-sm">金库 (Vault)</p>
              {/* 充值金库的表单组件 */}
              <FundVaultForm multisigAccount={account} />
            </div>
            <div className="text-xs mt-1">
              <p>
                地址: <ExplorerLink path={`account/${vault.publicKey}`} label={ellipsify(vault.publicKey.toBase58())} />
              </p>
              <p>
                余额: <strong>{(vault.balance / LAMPORTS_PER_SOL).toFixed(4)} SOL</strong>
              </p>
            </div>
          </div>
        )}
        {/* 显示批准规则 */}
        <div>
          <strong>批准规则:</strong> {multisig.threshold} / {multisig.owners.length}
        </div>
        {/* 显示所有者列表 */}
        <div>
          <strong>所有者 (Owners):</strong>
          <ul className="list-disc list-inside text-xs space-y-1 mt-1">
            {multisig.owners.map((o) => (
              <li key={o.toBase58()}>
                <ExplorerLink path={`account/${o}`} label={ellipsify(o.toBase58())} />
              </li>
            ))}
          </ul>
        </div>
        {/* 显示程序白名单 */}
        <div>
          <strong>程序白名单 (Whitelist):</strong>
          {whitelist ? (
            <ul className="list-disc list-inside text-xs space-y-1 mt-1">
              {whitelist.programs.map((p: PublicKey) => (
                <li key={p.toBase58()}>
                  <ExplorerLink path={`account/${p}`} label={ellipsify(p.toBase58())} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">加载中...</p>
          )}
        </div>
        {/* 交易提案部分 */}
        <div className="border-t pt-4">
          <h4 className="font-bold mb-2">交易提案</h4>
          {/* 发起新交易提案的表单 */}
          <ProposeTransactionForm program={program} multisigAccount={account} multisigQuery={multisigQuery} />
          {transactionsQuery.isLoading ? (
            // 交易列表加载中
            <div className="text-center py-4">
              <span className="loading loading-spinner"></span>
            </div>
          ) : transactionsQuery.data?.length ? (
            // 显示交易列表
            <div className="space-y-2 mt-4">
              {transactionsQuery.data.map((tx) => (
                <TransactionCard key={tx.publicKey.toBase58()} transactionAccount={tx.publicKey} />
              ))}
            </div>
          ) : (
            // 无交易时的空状态
            <p className="text-sm text-muted-foreground mt-4">暂无提案。</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// 发起交易提案的表单组件（目前仅支持转账）
function ProposeTransactionForm({
  program,
  multisigAccount,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  multisigQuery: any
}) {
  // 获取发起提案的方法
  const { proposeTransaction } = useMultisigProgramAccount({ account: multisigAccount })
  // 状态：接收者地址
  const [recipient, setRecipient] = useState('')
  // 状态：转账金额
  const [amount, setAmount] = useState(0)
  // 状态：控制对话框的打开/关闭
  const [isOpen, setIsOpen] = useState(false)

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      // 验证接收者地址
      const recipientPk = new PublicKey(recipient.trim())
      // 验证金额有效性
      if (amount <= 0) {
        toast.error('转账金额必须大于 0')
        return
      }

      // 查找多签账户的 PDA（Program Derived Address）
      const { vaultPda } = await findPdas(program, multisigAccount)
      // 将 SOL 转换为 Lamports（Solana 的最小单位）
      const amountLamports = new BN(amount * LAMPORTS_PER_SOL)

      // 构建转账指令
      const transferInstruction = {
        programId: SystemProgram.programId,
        accounts: [
          { pubkey: vaultPda, isSigner: true, isWritable: true },
          { pubkey: recipientPk, isSigner: false, isWritable: true },
        ],
        data: SystemProgram.transfer({
          fromPubkey: vaultPda,
          toPubkey: recipientPk,
          lamports: amountLamports.toNumber(),
        }).data,
      }

      // 调用发起提案的 mutation
      proposeTransaction.mutate(
        { instructions: [transferInstruction], autoApprove: true },
        {
          onSuccess: () => {
            // 成功后重置表单和关闭对话框
            setIsOpen(false)
            setRecipient('')
            setAmount(0)
          },
        },
      )
    } catch (e: any) {
      // 处理错误
      toast.error(`提案构建失败: ${e.message}`)
    }
  }

  // 渲染提案表单对话框
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">发起新提案 (转账 SOL)</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建转账提案</DialogTitle>
          <DialogDescription>从多签钱包金库向指定地址转账 SOL。作为提案者，您的批准将自动计入。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="recipient">接收地址</Label>
            <Input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="输入接收者的公钥"
            />
          </div>
          <div>
            <Label htmlFor="amount">转账金额 (SOL)</Label>
            <Input
              id="amount"
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              type="number"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={proposeTransaction.isPending}>
            {proposeTransaction.isPending ? '提交中...' : '提交提案'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 显示单个交易提案的卡片组件
function TransactionCard({ transactionAccount }: { transactionAccount: PublicKey }) {
  // 获取多签程序的 ID
  const { programId } = useMultisigProgram()
  // 获取特定交易账户的数据、多签账户数据以及各种操作函数
  const {
    accountQuery: transactionQuery,
    multisigAccountQuery,
    approveMutation,
    executeMutation,
    revokeMutation,
    cancelMutation,
  } = useTransactionProgramAccount({ transactionAccount })
  // 获取当前连接的钱包公钥
  const { publicKey } = useWallet()

  // 加载状态显示
  if (transactionQuery.isLoading || multisigAccountQuery.isLoading) {
    return (
      <div className="border p-3 rounded-md animate-pulse bg-gray-50 dark:bg-gray-900">
        <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/4"></div>
        <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mt-2"></div>
      </div>
    )
  }

  // 处理数据加载失败的情况
  if (!transactionQuery.data || !multisigAccountQuery.data) {
    return null
  }

  // 获取交易数据和多签数据
  const tx = transactionQuery.data
  const multisig = multisigAccountQuery.data

  // 检查当前用户是否是所有者
  const isOwner = publicKey && multisig.owners.some((o) => o.equals(publicKey))
  // 检查当前用户是否已批准此交易
  const hasApproved = publicKey && tx.approvals.some((a) => a.equals(publicKey))
  // 检查是否已达到执行所需的批准阈值
  const canExecute = tx.approvals.length >= multisig.threshold
  // 检查当前用户是否是此交易的提案者
  const isProposer = publicKey && tx.proposer.equals(publicKey)
  // 解析交易指令的详细信息（只解析第一条指令）
  const instructionDetails = tx.instructions.length === 1 ? parseInstruction(tx.instructions[0], programId) : null

  // 渲染交易卡片
  return (
    <div className="border p-3 rounded-md">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-mono text-xs">提案 ID: {tx.id.toString()}</p>
          <p className="text-xs text-muted-foreground">
            发起人: <ExplorerLink path={`account/${tx.proposer}`} label={ellipsify(tx.proposer.toBase58())} />
          </p>
        </div>
        {/* 根据执行状态显示不同的标签 */}
        <div
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
            tx.executed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
          }`}
        >
          {tx.executed ? <CheckCircle size={14} /> : <Hourglass size={14} />}
          {tx.executed ? '已执行' : '待处理'}
        </div>
      </div>

      {/* 显示指令详情 */}
      <div className="mt-3 text-sm p-2 rounded-md bg-slate-50 dark:bg-slate-800">
        {instructionDetails ? (
          <InstructionDetailsView details={instructionDetails} />
        ) : (
          <p className="text-xs text-muted-foreground">无法解析的复杂交易 (可能包含多个指令)</p>
        )}
      </div>

      {/* 显示批准进度 */}
      <div className="mt-2 text-sm">
        <div className="flex items-center gap-2 mt-1">
          <ShieldCheck size={16} className="text-blue-500" />
          <span>
            批准进度:{' '}
            <strong>
              {tx.approvals.length} / {multisig.threshold}
            </strong>
          </span>
        </div>
      </div>

      {/* 如果交易未执行且当前用户是所有者，显示操作按钮 */}
      {!tx.executed && isOwner && (
        <div className="flex flex-wrap gap-2 mt-3">
          {/* 批准/撤销按钮 */}
          {hasApproved ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => revokeMutation.mutate()}
              disabled={revokeMutation.isPending}
            >
              <Undo2 size={14} className="mr-1" />
              {revokeMutation.isPending ? '撤销中...' : '撤销批准'}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              <CheckCircle size={14} className="mr-1" />
              {approveMutation.isPending ? '批准中...' : '批准'}
            </Button>
          )}

          {/* 执行按钮 */}
          <Button
            size="sm"
            onClick={() => executeMutation.mutate()}
            disabled={!canExecute || executeMutation.isPending}
            className={!canExecute ? 'bg-gray-200 text-gray-500' : ''}
          >
            <Play size={14} className="mr-1" />
            {executeMutation.isPending ? '执行中...' : '执行'}
          </Button>

          {/* 取消提案按钮（仅提案者可见） */}
          {isProposer && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (window.confirm('您确定要取消这个提案吗？此操作不可逆。')) {
                  cancelMutation.mutate()
                }
              }}
              disabled={cancelMutation.isPending}
            >
              <XCircle size={14} className="mr-1" />
              {cancelMutation.isPending ? '取消中...' : '取消提案'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// 辅助函数：查找多签账户相关的 PDA（Program Derived Address）
async function findPdas(program: Program<Multisig>, multisigPda: PublicKey) {
  // 查找金库 PDA
  const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from('vault'), multisigPda.toBuffer()], program.programId)
  // 查找白名单 PDA
  const [whitelistPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), multisigPda.toBuffer()],
    program.programId,
  )
  return { vaultPda, whitelistPda }
}

// 为多签钱包金库充值的表单组件
function FundVaultForm({ multisigAccount }: { multisigAccount: PublicKey }) {
  // 获取充值金库的方法
  const { fundVault } = useMultisigProgramAccount({ account: multisigAccount })
  // 状态：充值金额
  const [amount, setAmount] = useState(0.1)
  // 状态：控制对话框的打开/关闭
  const [isOpen, setIsOpen] = useState(false)

  // 处理表单提交
  const handleSubmit = () => {
    // 验证金额有效性
    if (amount <= 0) {
      toast.error('充值金额必须大于 0')
      return
    }
    // 调用充值金库的 mutation
    fundVault.mutate(amount, {
      onSuccess: () => {
        // 成功後重置表单和关闭对话框
        setIsOpen(false)
        setAmount(0.1)
      },
    })
  }

  // 渲染充值表单对话框
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          充值
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>为金库充值</DialogTitle>
          <DialogDescription>向多签钱包的金库 (Vault) 转入 SOL。此操作将从您的个人钱包扣款。</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="fund-amount">充值金额 (SOL)</Label>
          <Input
            id="fund-amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            min={0.0001}
            step={0.0001}
          />
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={fundVault.isPending}>
            {fundVault.isPending ? '处理中...' : '确认充值'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// 解析转账指令的辅助函数
function parseTransferInstruction(instruction: TransactionAccount['instructions'][0]) {
  // 将指令数据转换为 Buffer
  const dataBuffer = Buffer.from(instruction.data)

  // 调试日志
  console.log('Parsing instruction:', {
    programId: instruction.programId.toBase58(),
    dataLength: dataBuffer.length,
  })

  // 验证是否为 SystemProgram.transfer 指令
  if (
    !instruction.programId.equals(SystemProgram.programId) ||
    instruction.accounts.length !== 2 ||
    dataBuffer.length !== 12
  ) {
    console.log('Parse failed: Pre-check failed.')
    return null
  }

  try {
    // 读取指令索引（SystemProgram.transfer 的索引为 2）
    const instructionIndex = dataBuffer.readUInt32LE(0)
    if (instructionIndex !== 2) {
      console.log(`Parse failed: Expected instruction index 2, got ${instructionIndex}.`)
      return null
    }

    // 提取转账金额（Lamports）
    const lamportsBuffer = dataBuffer.subarray(4, 12)
    const lamports = new BN(lamportsBuffer, 'le')

    // 获取发送方和接收方公钥
    const fromPubkey = instruction.accounts[0].pubkey
    const toPubkey = instruction.accounts[1].pubkey

    console.log('Parse successful!')
    // 返回转账详情
    return {
      from: fromPubkey,
      to: toPubkey,
      amountSol: lamports.toNumber() / LAMPORTS_PER_SOL,
    }
  } catch (error) {
    console.error('Failed to parse transfer instruction buffer:', error)
    return null
  }
}

// 管理多签钱包的表单组件（通过标签页组织不同功能）
function ManageMultisigForm({
  program,
  multisigAccount,
  multisigQuery,
  whitelistQuery,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  multisigQuery: any
  whitelistQuery: any
}) {
  // 获取发起提案的方法
  const { proposeTransaction } = useMultisigProgramAccount({ account: multisigAccount })
  // 状态：控制对话框的打开/关闭
  const [isOpen, setIsOpen] = useState(false)

  // 统一的提案处理函数
  const handlePropose = async (instructionPromise: any) => {
    if (proposeTransaction.isPending) return
    try {
      // 获取指令对象
      const instruction = await instructionPromise.instruction()
      // 查找 PDA
      const { vaultPda } = await findPdas(program, multisigAccount)

      // 添加金库作为签名者
      instruction.keys.push({ pubkey: vaultPda, isSigner: true, isWritable: false })

      // 构建指令数据
      const instructionData = {
        programId: program.programId,
        accounts: instruction.keys.map((key) => ({
          pubkey: key.pubkey,
          isSigner: key.isSigner,
          isWritable: key.isWritable,
        })),
        data: instruction.data,
      }

      // 调用发起提案的 mutation
      proposeTransaction.mutate(
        { instructions: [instructionData], autoApprove: true },
        { onSuccess: () => setIsOpen(false) },
      )
    } catch (error: any) {
      toast.error(`构建提案失败: ${error.message}`)
    }
  }

  // 加载状态显示
  if (multisigQuery.isLoading || whitelistQuery.isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Settings className="h-4 w-4 animate-spin" />
      </Button>
    )
  }

  // 渲染管理表单对话框
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>管理多签钱包</DialogTitle>
          <DialogDescription>
            所有管理操作都将创建一个新的提案，需要获得足够数量的 owner 批准后才能生效。
          </DialogDescription>
        </DialogHeader>
        {/* 标签页导航 */}
        <Tabs defaultValue="threshold">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="threshold">
              <Target className="h-4 w-4 mr-1" />
              阈值
            </TabsTrigger>
            <TabsTrigger value="addOwner">
              <UserPlus className="h-4 w-4 mr-1" />
              添加
            </TabsTrigger>
            <TabsTrigger value="removeOwner">
              <UserX className="h-4 w-4 mr-1" />
              移除
            </TabsTrigger>
            <TabsTrigger value="whitelist">
              <ListChecks className="h-4 w-4 mr-1" />
              白名单
            </TabsTrigger>
            <TabsTrigger value="pause">
              <PauseCircle className="h-4 w-4 mr-1" />
              暂停
            </TabsTrigger>
          </TabsList>

          {/* 修改阈值标签页内容 */}
          <TabsContent value="threshold" className="pt-4">
            <ChangeThresholdForm
              program={program}
              multisigAccount={multisigAccount}
              multisigQuery={multisigQuery}
              onPropose={handlePropose}
              isPending={proposeTransaction.isPending}
            />
          </TabsContent>

          {/* 添加所有者标签页内容 */}
          <TabsContent value="addOwner" className="pt-4">
            <AddOwnerForm
              program={program}
              multisigAccount={multisigAccount}
              onPropose={handlePropose}
              isPending={proposeTransaction.isPending}
            />
          </TabsContent>

          {/* 移除所有者标签页内容 */}
          <TabsContent value="removeOwner" className="pt-4">
            <RemoveOwnerForm
              program={program}
              multisigAccount={multisigAccount}
              multisigQuery={multisigQuery}
              onPropose={handlePropose}
              isPending={proposeTransaction.isPending}
            />
          </TabsContent>

          {/* 白名单管理标签页内容 */}
          <TabsContent value="whitelist" className="pt-4 space-y-6">
            <AddToWhitelistForm
              program={program}
              multisigAccount={multisigAccount}
              onPropose={handlePropose}
              isPending={proposeTransaction.isPending}
            />
            <div className="border-t pt-6">
              <RemoveFromWhitelistForm
                program={program}
                multisigAccount={multisigAccount}
                onPropose={handlePropose}
                whitelistQuery={whitelistQuery}
                isPending={proposeTransaction.isPending}
              />
            </div>
          </TabsContent>

          {/* 暂停/恢复标签页内容 */}
          <TabsContent value="pause" className="pt-4">
            <PauseForm
              program={program}
              multisigAccount={multisigAccount}
              multisigQuery={multisigQuery}
              onPropose={handlePropose}
              isPending={proposeTransaction.isPending}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// 修改批准阈值的表单组件
function ChangeThresholdForm({
  program,
  multisigAccount,
  multisigQuery,
  onPropose,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  multisigQuery: any
  onPropose: (p: any) => void
  isPending: boolean
}) {
  // 状态：新的阈值
  const [newThreshold, setNewThreshold] = useState(multisigQuery.data?.threshold || 1)

  // 处理表单提交
  const handleSubmit = async () => {
    const { vaultPda } = await findPdas(program, multisigAccount)
    // 构建修改阈值的指令
    const instructionPromise = program.methods
      .changeThreshold(newThreshold)
      .accounts({ multisig: multisigAccount, vault: vaultPda })
    // 提交提案
    onPropose(instructionPromise)
  }

  // 渲染修改阈值表单
  return (
    <div className="space-y-4">
      <p className="text-sm">
        当前阈值: <strong>{multisigQuery.data?.threshold}</strong> / {multisigQuery.data?.owners.length}
      </p>
      <div>
        <Label>新阈值</Label>
        <Input
          type="number"
          value={newThreshold}
          onChange={(e) => setNewThreshold(parseInt(e.target.value, 10))}
          min={1}
          max={multisigQuery.data?.owners.length}
        />
      </div>
      <Button onClick={handleSubmit} disabled={isPending}>
        发起提案
      </Button>
    </div>
  )
}

// 添加所有者的表单组件
function AddOwnerForm({
  program,
  multisigAccount,
  onPropose,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  onPropose: (p: any) => void
  isPending: boolean
}) {
  // 状态：新所有者的公钥
  const [newOwner, setNewOwner] = useState('')

  // 处理表单提交
  const handleSubmit = async () => {
    const trimmedOwner = newOwner.trim()
    console.log(`Attempting to create PublicKey from (trimmed): "'${trimmedOwner}'"`)
    console.log(`Length: ${trimmedOwner.length}`)

    try {
      const { vaultPda } = await findPdas(program, multisigAccount)
      // 将字符串公钥转换为 PublicKey 对象
      const newOwnerPk = new PublicKey(trimmedOwner)
      // 构建添加所有者的指令
      const instructionPromise = program.methods
        .addOwner(newOwnerPk)
        .accounts({ multisig: multisigAccount, vault: vaultPda })
      // 提交提案
      onPropose(instructionPromise)
    } catch (e: any) {
      console.error('PublicKey creation failed:', e)
      toast.error(`无效的公钥地址: ${e.message}`)
    }
  }

  // 渲染添加所有者表单
  return (
    <div className="space-y-4">
      <div>
        <Label>新 Owner 的公钥</Label>
        <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="粘贴要添加的地址" />
      </div>
      <Button onClick={handleSubmit} disabled={isPending}>
        发起提案
      </Button>
    </div>
  )
}

// 移除所有者的表单组件
function RemoveOwnerForm({
  program,
  multisigAccount,
  multisigQuery,
  onPropose,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  multisigQuery: any
  onPropose: (p: any) => void
  isPending: boolean
}) {
  // 状态：要移除的所有者的公钥
  const [ownerToRemove, setOwnerToRemove] = useState('')

  // 处理表单提交
  const handleSubmit = async () => {
    const trimmedOwner = ownerToRemove.trim()
    console.log(`Attempting to create PublicKey from (trimmed): "'${trimmedOwner}'"`)
    console.log(`Length: ${trimmedOwner.length}`)

    try {
      const { vaultPda } = await findPdas(program, multisigAccount)
      // 将字符串公钥转换为 PublicKey 对象
      const ownerToRemovePk = new PublicKey(trimmedOwner)
      // 构建移除所有者的指令
      const instructionPromise = program.methods
        .removeOwner(ownerToRemovePk)
        .accounts({ multisig: multisigAccount, vault: vaultPda })
      // 提交提案
      onPropose(instructionPromise)
    } catch (e: any) {
      console.error('PublicKey creation failed:', e)
      toast.error(`无效的公钥地址: ${e.message}`)
    }
  }

  // 渲染移除所有者表单
  return (
    <div className="space-y-4">
      <p className="text-sm">当前 Owners:</p>
      <ul className="text-xs list-disc list-inside">
        {multisigQuery.data?.owners.map((o: PublicKey) => (
          <li key={o.toBase58()}>{ellipsify(o.toBase58())}</li>
        ))}
      </ul>
      <div>
        <Label>要移除的 Owner 公钥</Label>
        <Input
          value={ownerToRemove}
          onChange={(e) => setOwnerToRemove(e.target.value)}
          placeholder="粘贴要移除的地址"
        />
      </div>
      <Button variant="destructive" onClick={handleSubmit} disabled={isPending}>
        发起移除提案
      </Button>
    </div>
  )
}

// 根据指令详情渲染相应UI的组件
function InstructionDetailsView({ details }: { details: any }) {
  // 根据指令类型渲染不同的UI
  switch (details.type) {
    case 'transfer':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <Send size={14} />
            转账操作
          </p>
          <div className="text-xs mt-1 space-y-1">
            <p>
              <strong>接收人:</strong>{' '}
              <ExplorerLink path={`account/${details.to}`} label={ellipsify(details.to.toBase58())} />
            </p>
            <p>
              <strong>金额:</strong> <span className="font-bold text-blue-500">{details.amountSol} SOL</span>
            </p>
          </div>
        </div>
      )
    case 'changeThreshold':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <Target size={14} />
            修改阈值
          </p>
          <div className="text-xs mt-1">
            <p>
              将批准阈值修改为: <strong>{details.newThreshold}</strong>
            </p>
          </div>
        </div>
      )
    case 'addOwner':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <UserPlus size={14} />
            添加 Owner
          </p>
          <div className="text-xs mt-1">
            <p>
              添加新 Owner:{' '}
              <ExplorerLink path={`account/${details.newOwner}`} label={ellipsify(details.newOwner.toBase58())} />
            </p>
          </div>
        </div>
      )
    case 'removeOwner':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <UserX size={14} />
            移除 Owner
          </p>
          <div className="text-xs mt-1">
            <p>
              移除 Owner:{' '}
              <ExplorerLink
                path={`account/${details.ownerToRemove}`}
                label={ellipsify(details.ownerToRemove.toBase58())}
              />
            </p>
          </div>
        </div>
      )
    case 'addToWhitelist':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <ShieldPlus size={14} />
            添加程序到白名单
          </p>
          <div className="text-xs mt-1">
            <p>
              程序 ID:{' '}
              <ExplorerLink
                path={`account/${details.programToAdd}`}
                label={ellipsify(details.programToAdd.toBase58())}
              />
            </p>
          </div>
        </div>
      )
    case 'removeFromWhitelist':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            <ShieldX size={14} />
            从白名单移除程序
          </p>
          <div className="text-xs mt-1">
            <p>
              程序 ID:{' '}
              <ExplorerLink
                path={`account/${details.programToRemove}`}
                label={ellipsify(details.programToRemove.toBase58())}
              />
            </p>
          </div>
        </div>
      )
    case 'pause':
      return (
        <div>
          <p className="font-bold flex items-center gap-1">
            {details.paused ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
            {details.paused ? '暂停钱包' : '恢复钱包'}
          </p>
          <div className="text-xs mt-1">
            <p>
              将钱包状态设置为: <strong>{details.paused ? '已暂停' : '运行中'}</strong>
            </p>
          </div>
        </div>
      )
    default:
      return <p className="text-xs text-muted-foreground">未知操作类型</p>
  }
}

// 解析添加到白名单指令的辅助函数
function parseAddToWhitelistInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  if (!instruction.programId.equals(programId)) return null
  const dataBuffer = Buffer.from(instruction.data)
  if (dataBuffer.length !== 40) return null

  const discriminator = dataBuffer.slice(0, 8)
  if (!discriminator.equals(IX_DISCRIMINATORS.addToWhitelist)) return null

  const programToAdd = new PublicKey(dataBuffer.slice(8))
  return { type: 'addToWhitelist', programToAdd }
}

// 解析从白名单移除指令的辅助函数
function parseRemoveFromWhitelistInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  if (!instruction.programId.equals(programId)) return null
  const dataBuffer = Buffer.from(instruction.data)
  if (dataBuffer.length !== 40) return null

  const discriminator = dataBuffer.slice(0, 8)
  if (!discriminator.equals(IX_DISCRIMINATORS.removeFromWhitelist)) return null

  const programToRemove = new PublicKey(dataBuffer.slice(8))
  return { type: 'removeFromWhitelist', programToRemove }
}

// 添加到白名单的表单组件
function AddToWhitelistForm({
  program,
  multisigAccount,
  onPropose,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  onPropose: (p: any) => void
  isPending: boolean
}) {
  // 状态：要添加到白名单的程序ID
  const [programToAdd, setProgramToAdd] = useState('')

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const { vaultPda, whitelistPda } = await findPdas(program, multisigAccount)
      // 将字符串公钥转换为 PublicKey 对象
      const programToAddPk = new PublicKey(programToAdd.trim())
      // 构建添加到白名单的指令
      const instructionPromise = program.methods.addToWhitelist(programToAddPk).accounts({
        multisig: multisigAccount,
        whitelist: whitelistPda,
        vault: vaultPda,
      })
      // 提交提案
      onPropose(instructionPromise)
    } catch (e) {
      toast.error('无效的程序 ID')
    }
  }

  // 渲染添加到白名单表单
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">添加到白名单</h3>
      <div>
        <Label>程序 ID</Label>
        <Input
          value={programToAdd}
          onChange={(e) => setProgramToAdd(e.target.value)}
          placeholder="粘贴要添加的程序 ID"
        />
      </div>
      <Button onClick={handleSubmit} disabled={isPending}>
        <ShieldPlus className="h-4 w-4 mr-2" />
        发起添加提案
      </Button>
    </div>
  )
}

// 从白名单移除的表单组件
function RemoveFromWhitelistForm({
  program,
  multisigAccount,
  onPropose,
  whitelistQuery,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  onPropose: (p: any) => void
  whitelistQuery: any
  isPending: boolean
}) {
  // 状态：要从白名单移除的程序ID
  const [programToRemove, setProgramToRemove] = useState('')

  // 处理表单提交
  const handleSubmit = async () => {
    try {
      const { vaultPda, whitelistPda } = await findPdas(program, multisigAccount)
      // 将字符串公钥转换为 PublicKey 对象
      const programToRemovePk = new PublicKey(programToRemove.trim())
      // 构建从白名单移除的指令
      const instructionPromise = program.methods.removeFromWhitelist(programToRemovePk).accounts({
        multisig: multisigAccount,
        whitelist: whitelistPda,
        vault: vaultPda,
      })
      // 提交提案
      onPropose(instructionPromise)
    } catch (e) {
      toast.error('无效的程序 ID')
    }
  }

  // 渲染从白名单移除表单
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">从白名单移除</h3>
      <p className="text-sm text-muted-foreground">当前白名单中的非核心程序:</p>
      <ul className="text-xs list-disc list-inside">
        {whitelistQuery.data?.programs
          .filter((p: PublicKey) => !p.equals(SystemProgram.programId) && !p.equals(program.programId))
          .map((p: PublicKey) => (
            <li key={p.toBase58()}>{ellipsify(p.toBase58())}</li>
          ))}
      </ul>
      <div>
        <Label>要移除的程序 ID</Label>
        <Input
          value={programToRemove}
          onChange={(e) => setProgramToRemove(e.target.value)}
          placeholder="粘贴要移除的程序 ID"
        />
      </div>
      <Button variant="destructive" onClick={handleSubmit} disabled={isPending}>
        <ShieldX className="h-4 w-4 mr-2" />
        发起移除提案
      </Button>
    </div>
  )
}

// 解析暂停指令的辅助函数
function parsePauseInstruction(instruction: TransactionAccount['instructions'][0], programId: PublicKey) {
  if (!instruction.programId.equals(programId)) return null
  const dataBuffer = Buffer.from(instruction.data)
  if (dataBuffer.length !== 9) return null

  const discriminator = dataBuffer.slice(0, 8)
  if (!discriminator.equals(IX_DISCRIMINATORS.pause)) return null

  const paused = dataBuffer.readUInt8(8) === 1
  return { type: 'pause', paused }
}

// 暂停/恢复多签钱包的表单组件
function PauseForm({
  program,
  multisigAccount,
  multisigQuery,
  onPropose,
  isPending,
}: {
  program: Program<Multisig>
  multisigAccount: PublicKey
  multisigQuery: any
  onPropose: (p: any) => void
  isPending: boolean
}) {
  // 获取当前暂停状态
  const isCurrentlyPaused = multisigQuery.data?.paused

  // 处理表单提交
  const handleSubmit = async (pauseState: boolean) => {
    try {
      const { vaultPda } = await findPdas(program, multisigAccount)
      // 构建暂停/恢复指令
      const instructionPromise = program.methods
        .pause(pauseState)
        .accounts({ multisig: multisigAccount, vault: vaultPda })
      // 提交提案
      onPropose(instructionPromise)
    } catch (e: any) {
      toast.error(`构建提案失败: ${e.message}`)
    }
  }

  // 渲染暂停/恢复表单
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">暂停/恢复钱包</h3>
      <p className="text-sm text-muted-foreground">
        当前状态:{' '}
        {isCurrentlyPaused ? (
          <span className="font-bold text-orange-600">已暂停</span>
        ) : (
          <span className="font-bold text-green-600">运行中</span>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        {isCurrentlyPaused
          ? '恢复后，钱包将可以正常创建和处理提案。'
          : '暂停后，钱包将无法创建新提案、批准或执行现有提案。'}
      </p>

      {/* 根据当前状态显示不同的按钮 */}
      {isCurrentlyPaused ? (
        <Button onClick={() => handleSubmit(false)} disabled={isPending}>
          <PlayCircle className="h-4 w-4 mr-2" />
          发起恢复提案
        </Button>
      ) : (
        <Button variant="destructive" onClick={() => handleSubmit(true)} disabled={isPending}>
          <PauseCircle className="h-4 w-4 mr-2" />
          发起暂停提案
        </Button>
      )}
    </div>
  )
}
