# Solana 高级多重签名钱包 (DAO & 团队金库解决方案)

[![License: MIT](https://imgshields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Powered by Anchor](https://imgshields.io/badge/Powered%20by-Anchor-blue.svg)](https://www.anchor-lang.com/) [![Frontend: React & Next.js](https://imgshields.io/badge/Frontend-React%20%26%20Next.js-cyan.svg)](https://nextjs.org/)

这是一个基于 Solana 和 Anchor 框架构建的企业级全栈多重签名钱包 dApp。它为
DAO、开发团队和任何需要去中心化资产管理的组织提供了一个安全、灵活且功能丰富的解决方案。项目核心是一个健壮的 Anchor
智能合约，通过程序派生地址 (PDA) 实现对金库的安全控制，并支持通过多签投票进行自我治理。配套的 React 前端界面提供了直观、无缝的交互体验。

## ✨ 核心功能

- **创建与配置**:
    - **动态 Owner 列表**: 支持创建拥有多个所有者 (Owner) 的多签钱包。
    - **自定义批准阈值**: 灵活设置执行任何交易所需的最少批准签名数量。
- **安全金库管理**:
    - **PDA 金库**: 所有资产存储在一个由程序控制的 PDA 金库中，无私钥泄露风险。
    - **SOL 与 SPL 资产**: 金库可安全保管 SOL 及未来可扩展支持的 SPL 代币。
- **完整的交易生命周期**:
    - **提案**: 任何 Owner 都可以发起交易提案，如转账、与其它 dApp 交互等。
    - **审批与撤销**: Owners 可以对提案进行批准或撤销自己的批准。
    - **安全执行**: 只有在达到批准阈值后，提案才能被执行。
    - **提案取消与清理**: 提案者可以取消未被批准的提案，已完成或过期的提案账户可以被关闭以回收租金。
- **强大的自我治理能力**:
    - **动态成员管理**: 通过多签投票，可以安全地添加或移除 Owner。
    - **规则变更**: 支持通过投票修改批准阈值。
    - **程序白名单**: 限制金库只能与预先批准的智能合约进行交互，防止恶意提案攻击。
    - **安全开关**: 支持通过投票暂停或恢复整个多签钱包的操作。
- **人性化的前端界面**:
    - **直观的仪表盘**: 集中展示钱包配置、金库余额、所有者列表和交易提案。
    - **人类可读的提案**: 自动解析链上指令数据，将复杂的交易以清晰易懂的方式呈现给用户。
    - **实时的状态反馈**: 利用 `TanStack Query` 和 toast 通知，为用户的每一步操作提供即时、清晰的状态更新。

## 🛠️ 技术栈

- **智能合约**: Rust, **Anchor Framework v0.29+**
- **区块链**: Solana
- **前端框架**: **React**, **Next.js**
- **UI**: **Shadcn/UI**, Tailwind CSS, Lucide Icons
- **异步状态管理**: **TanStack Query (React Query)**
- **钱包集成**: Solana Wallet Adapter
- **测试**: TypeScript, Mocha, Chai, Anchor Tests
- **核心概念**: 程序派生地址 (PDA), 跨程序调用 (CPI), 账户约束, 事件驱动

## 📂 项目结构

```
.
├── anchor/                  # Anchor 项目
│   ├── programs/multisig/   # 多签智能合约源码 (lib.rs)
│   └── tests/multisig.ts    # 集成测试脚本
├── app/                     # Next.js 前端应用
│   ├── components/multisig/
│   │   ├── multisig-data-access.ts  # 核心数据访问层 (React Hooks)
│   │   └── multisig-ui.tsx          # 所有 UI 组件
│   └── app/multisig/page.tsx        # 功能主页/容器组件
├── package.json
└── README.md
```

## 🚀 快速开始

### 先决条件

- [Node.js v18 或更高版本](https://nodejs.org/en/)
- [Rust 工具链](https://www.rust-lang.org/tools/install)
- [Solana CLI v1.17 或更高版本](https://docs.solana.com/cli/install)
- [Anchor CLI v0.29 或更高版本](https://www.anchor-lang.com/docs/installation)

### 安装与部署

1. **克隆仓库**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-directory>
   ```

2. **安装前端依赖**
   ```bash
   npm install
   ```

3. **构建并部署智能合约**
   ```bash
   # 启动本地 Solana 测试验证器
   solana-test-validator

   # 在另一个终端窗口中，构建并部署合约
   anchor build && anchor deploy
   ```
   部署成功后，复制输出的程序 ID，并更新前端代码中的相应位置（通常在 `anchor/src/multisig-exports.ts` 或类似文件中）。

4. **运行前端开发服务器**
   ```bash
   npm run dev
   ```
   在浏览器中打开 `http://localhost:3000` 即可访问 dApp。

## ✅ 运行测试

我们拥有覆盖率极高的集成测试套件，用于验证合约的所有功能和安全边界。

```bash
anchor test
```

该命令将自动启动测试验证器，部署合约，并执行 `tests/multisig.ts` 中的所有测试用例。

## 📜 智能合约深度解析

智能合约 (`programs/multisig/src/lib.rs`) 是本项目的安全基石。

- **核心架构**:
    - **`Multisig` 账户**: 存储配置信息，如 Owners, 阈值, 以及关联 PDA 的 `bump` seeds。
    - **`Vault` PDA**: 金库账户，由种子 `b"vault"` 和 `Multisig` 地址派生，确保只有本程序能代表其签名。
    - **`Transaction` 账户**: 存储每一个提案的详细信息，包括待执行的指令、批准列表和执行状态。
    - **`ProgramWhitelist` 账户**: 安全层，存储允许金库与之交互的程序地址列表。

- **自我治理机制**:
  合约的一个关键设计是其**自我治理**能力。任何对 `Multisig` 配置的修改（如添加 Owner、修改阈值）都必须通过标准的 **提案 ->
  批准 -> 执行** 流程来完成。这是通过在管理指令的 `Accounts` 结构体中要求 `vault` PDA 作为 `Signer` 实现的，强制这些操作也需要多签授权。

- **安全性**:
    - **严格的账户约束**: 大量使用 Anchor 的 `#[account(...)]` 约束，如 `has_one`, `seeds`, `constraint`，在指令执行前进行严格的账户验证。
    - **常量边界**: 为所有动态数组（如 Owners, 指令列表）设置了最大长度常量，防止资源滥用。
    - **事件驱动**: 所有关键状态变更都会发出事件 (`#[event]`)，便于链下服务（如前端、索引器）进行追踪。

## 🖥️ 前端架构深度解析

前端应用采用了现代化的分层架构，实现了逻辑与视图的高度分离。

- **数据访问层 (`multisig-data-access.ts`)**:
    - **自定义 Hooks**: 封装了所有与 Solana 链的交互逻辑。
        - `useMultisigProgram`: 提供应用级功能，如创建钱包和查询用户的所有钱包。
        - `useMultisigProgramAccount`: 负责管理**单个**多签钱包的所有数据和操作。
        - `useTransactionProgramAccount`: 负责管理**单个**交易提案的所有操作。
    - **强大的状态管理**: 深度整合 **`TanStack Query`**，自动处理链上数据的获取、缓存、依赖刷新和后台更新。例如，当一个提案被批准后，会自动
      `refetch` 相关的交易和多签账户数据，确保 UI 实时同步。

- **UI 组件层 (`multisig-ui.tsx`)**:
    - **指令解析**: 实现了强大的**指令数据解析器**。通过匹配指令的 `discriminator` 和数据结构，将链上存储的二进制数据转换为人类可读的信息（例如，“转账
      0.5 SOL 到地址 X”），极大地提升了用户体验。
    - **组件化与原子化**:
        - `MultisigCreate`: 创建钱包的表单。
        - `MultisigList` & `MultisigCard`: 钱包列表与详情卡片。
        - `TransactionCard`: 动态显示提案详情和上下文相关的操作按钮。
        - **`ManageMultisigForm`**: 使用标签页 (`Tabs`) 和对话框 (`Dialog`) 优雅地组织了所有复杂的管理功能。

- **功能主页 (`multisig-feature.tsx`)**:
    - 作为**容器组件**，负责组合数据 Hooks 和 UI 组件，并处理页面级别的逻辑，如钱包连接状态的条件渲染。

## 📄 许可证

本项目采用 [MIT 许可证](https://opensource.org/licenses/MIT)。