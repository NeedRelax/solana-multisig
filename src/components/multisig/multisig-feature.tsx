'use client' // 声明此文件为客户端组件，仅在客户端执行

// 导入 Solana 钱包适配器 Hook，用于获取钱包状态（如公钥）
import { useWallet } from '@solana/wallet-adapter-react'
// 导入 Solana 钱包连接按钮组件
import { WalletButton } from '../solana/solana-provider'
// 导入自定义组件，用于显示 Solana 账户的区块链浏览器链接
import { ExplorerLink } from '../cluster/cluster-ui'
// 导入自定义 Hook，提供多签程序实例和操作（如创建、查询）
import { useMultisigProgram } from './multisig-data-access'
// 导入多签钱包的创建和列表 UI 组件
import { MultisigCreate, MultisigList } from './multisig-ui'
// 导入应用标题组件
import { AppHero } from '../app-hero'
// 导入工具函数，用于截短公钥显示（如 "1234...5678"）
import { ellipsify } from '@/lib/utils'

// 定义多签钱包功能的主 React 组件
export default function MultisigFeature() {
  // 从 useWallet Hook 获取当前钱包的公钥
  const { publicKey } = useWallet()
  // 从 useMultisigProgram Hook 获取多签程序 ID
  const { programId } = useMultisigProgram()

  // 根据钱包连接状态渲染：
  // - 如果钱包已连接（publicKey 存在），显示多签创建和列表界面
  // - 如果钱包未连接，显示连接钱包的提示和按钮
  return publicKey ? (
    // 钱包已连接，渲染多签钱包创建和列表界面
    <div>
      {/* 渲染应用标题和描述 */}
      <AppHero
        title="多签钱包" // 标题：多签钱包
        subtitle="通过指定所有者和批准阈值来创建一个新的多签钱包。钱包中的任何交易都需要多个所有者签名批准后才能执行。" // 副标题：描述多签钱包功能
      >
        {/* 显示多签程序 ID 和区块链浏览器链接 */}
        <p className="mb-6">
          程序 ID: <ExplorerLink path={`account/${programId}`} label={ellipsify(programId.toString())} />
        </p>
        {/* 渲染多签钱包创建组件 */}
        <MultisigCreate />
      </AppHero>
      {/* 渲染多签钱包列表组件 */}
      <MultisigList />
    </div>
  ) : (
    // 钱包未连接，显示连接提示和钱包连接按钮
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center">
          {/* 显示连接钱包提示 */}
          <h2 className="text-2xl font-bold mb-4">请先连接钱包</h2>
          {/* 渲染钱包连接按钮 */}
          <WalletButton />
        </div>
      </div>
    </div>
  )
}
