// 导入 Anchor 框架的核心模块，用于 Solana 程序开发
use anchor_lang::prelude::*;

// 导入 invoke_signed 函数，用于调用需要签名的指令
use anchor_lang::solana_program::program::invoke_signed;

// 导入系统程序模块，用于账户创建和转账等操作
use anchor_lang::system_program;

// 导入 HashSet，用于高效检查 owner 列表中的重复公钥
use std::collections::HashSet;
use std::ops::Mul;
// ENHANCEMENT: For efficient owner lookups

// 定义常量：多签账户支持的最大 owner 数量
const MAX_OWNERS: usize = 10;

// 定义常量：单条指令支持的最大账户数量
const MAX_ACCOUNTS_PER_IX: usize = 12;

// 定义常量：单次交易支持的最大指令数量
const MAX_IX_PER_TX: usize = 8;

// 定义常量：单条指令数据的最大长度（字节）
const MAX_IX_DATA_LEN: usize = 256;

// 定义常量：白名单支持的最大程序数量
const MAX_WHITELIST_SIZE: usize = 20;

// 声明程序的唯一 ID，标识此 Solana 程序
declare_id!("FZoTboRWj9fe74mx2E8sKDM8pVSov2n3QNdmRxTLLFEY");

// 定义 Anchor 程序模块
#[program]
pub mod multisig {
    // 引入外部模块的常量和函数
    use super::*;

    // 创建多签账户的指令
    pub fn create_multisig(
        ctx: Context<CreateMultisig>, // 上下文，包含账户信息
        owners: Vec<Pubkey>,          // 多签账户的 owner 公钥列表
        threshold: u8,                // 批准交易所需的签名数量
        nonce: u64,                   // 用于生成 PDA 的随机数
    ) -> Result<()> {
        // 验证 owner 列表不为空
        require!(!owners.is_empty(), MultisigError::InvalidOwners);
        // 验证 owner 数量不超过最大限制
        require!(owners.len() <= MAX_OWNERS, MultisigError::TooManyOwners);
        // 验证 threshold 大于 0 且不超过 owner 数量
        require!(
            threshold > 0 && (threshold as usize) <= owners.len(),
            MultisigError::InvalidThreshold
        );

        // 使用 HashSet 检查 owner 列表中是否有重复公钥
        let unique_owners: HashSet<Pubkey> = owners.iter().cloned().collect();
        require!(
            unique_owners.len() == owners.len(),
            MultisigError::DuplicateOwners
        );

        // 获取并初始化多签账户
        let ms = &mut ctx.accounts.multisig;
        ms.bump = ctx.bumps.multisig; // 设置多签 PDA 的 bump seed
        ms.vault_bump = ctx.bumps.vault; // 设置金库 PDA 的 bump seed
        ms.whitelist_bump = ctx.bumps.whitelist; // 设置白名单 PDA 的 bump seed
        ms.owners = owners; // 设置 owner 列表
        ms.threshold = threshold; // 设置批准阈值
        ms.next_tx_id = 0; // 初始化交易 ID
        ms.paused = false; // 设置账户未暂停
        ms.nonce = nonce; // 设置 nonce 值

        // 初始化白名单账户，包含系统程序和当前程序
        let whitelist = &mut ctx.accounts.whitelist;
        whitelist.programs = vec![system_program::ID, crate::ID];

        // 触发多签创建事件
        emit!(MultisigCreated {
            multisig: ms.key(),
            owners: ms.owners.clone(),
            threshold,
            nonce,
        });

        // 返回成功
        Ok(())
    }

    // 提出新交易的指令
    pub fn propose(
        ctx: Context<Propose>,              // 上下文，包含账户信息
        instructions: Vec<InstructionData>, // 交易包含的指令列表
        expires_at: Option<i64>,            // 交易过期时间（可选）
        auto_approve: bool,                 // 是否自动批准
    ) -> Result<()> {
        // 获取多签账户
        let ms = &mut ctx.accounts.multisig;
        // 确保多签账户未暂停
        // require!(!ms.paused, MultisigError::Paused);
        let is_resume_proposal =
            instructions.len() == 1 && is_pause_instruction(&instructions[0], &crate::ID, false);
        if !is_resume_proposal && ms.paused {
            return err!(MultisigError::Paused);
        }
        // 验证指令列表不为空且不超过最大限制
        require!(
            !instructions.is_empty() && instructions.len() <= MAX_IX_PER_TX,
            MultisigError::TooManyInstructions
        );

        // 获取提议者公钥
        let proposer_key = ctx.accounts.proposer.key();
        // 确保提议者是 owner 之一
        require!(ms.owners.contains(&proposer_key), MultisigError::NotAnOwner);

        // 验证过期时间（若设置）晚于当前时间
        if let Some(exp) = expires_at {
            let now = Clock::get()?.unix_timestamp;
            require!(exp > now, MultisigError::InvalidExpiration);
        }

        // 获取白名单并验证指令的程序 ID 是否在白名单中
        let whitelist = &ctx.accounts.whitelist;
        for ix in &instructions {
            require!(
                whitelist.programs.contains(&ix.program_id),
                MultisigError::ProgramNotAllowed
            );
            // 验证指令中的 signer 是金库账户
            require!(
                is_signer_allowed(ix, &ctx.accounts.vault.key()),
                MultisigError::SignerNotAllowed
            );
            // 验证指令的账户和数据长度
            validate_ix_bounds(ix)?;
        }

        // 初始化交易账户
        let tx = &mut ctx.accounts.transaction;
        tx.multisig = ms.key(); // 设置关联的多签账户
        tx.id = ms.next_tx_id; // 设置交易 ID
        tx.proposer = proposer_key; // 设置提议者
        tx.instructions = instructions; // 设置指令列表
        tx.approvals = vec![]; // 初始化批准列表
        tx.executed = false; // 设置交易未执行
        tx.expires_at = expires_at; // 设置过期时间

        // 如果启用自动批准，调用批准逻辑
        if auto_approve {
            approve_impl(ms, tx, &proposer_key)?;
        }

        // 更新下一个交易 ID，防止溢出
        ms.next_tx_id = ms
            .next_tx_id
            .checked_add(1)
            .ok_or(MultisigError::Overflow)?;

        // 触发提案创建事件
        emit!(ProposalCreated {
            multisig: ms.key(),
            transaction: tx.key(),
            proposer: proposer_key,
            instruction_count: tx.instructions.len() as u64,
        });

        // 返回成功
        Ok(())
    }

    // 批准交易的指令
    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        // 获取多签和交易账户
        let ms = &ctx.accounts.multisig;
        let tx = &mut ctx.accounts.transaction;
        let owner_key = ctx.accounts.owner.key(); // 获取批准者公钥
                                                  // 确保多签账户未暂停
                                                  // require!(!ms.paused, MultisigError::Paused);
        let is_resume_proposal = tx.instructions.len() == 1
            && is_pause_instruction(&tx.instructions[0], &crate::ID, false);
        if !is_resume_proposal && ms.paused {
            return err!(MultisigError::Paused);
        }
        // 确保交易尚未执行
        require!(!tx.executed, MultisigError::AlreadyExecuted);

        // 验证交易未过期
        if let Some(exp) = tx.expires_at {
            require!(Clock::get()?.unix_timestamp <= exp, MultisigError::Expired);
        }

        // 执行批准逻辑
        approve_impl(ms, tx, &owner_key)?;

        // 触发批准事件
        emit!(ApprovalAdded {
            multisig: ms.key(),
            transaction: tx.key(),
            owner: owner_key,
        });

        // 返回成功
        Ok(())
    }

    // 撤销批准的指令
    pub fn revoke(ctx: Context<Approve>) -> Result<()> {
        // 获取多签和交易账户
        let ms = &ctx.accounts.multisig;
        let tx = &mut ctx.accounts.transaction;
        let owner_key = ctx.accounts.owner.key(); // 获取撤销者公钥
                                                  // 确保多签账户未暂停
        require!(!ms.paused, MultisigError::Paused);
        // 确保交易尚未执行
        require!(!tx.executed, MultisigError::AlreadyExecuted);

        // 验证交易未过期
        if let Some(exp) = tx.expires_at {
            require!(Clock::get()?.unix_timestamp <= exp, MultisigError::Expired);
        }

        // 确保撤销者是 owner
        require!(ms.owners.contains(&owner_key), MultisigError::NotAnOwner);

        // 记录批准列表长度
        let old_len = tx.approvals.len();
        // 移除撤销者的批准
        tx.approvals.retain(|k| k != &owner_key);
        // 确保批准被移除
        require!(tx.approvals.len() < old_len, MultisigError::NotApproved);

        // 触发撤销事件
        emit!(ApprovalRevoked {
            multisig: ms.key(),
            transaction: tx.key(),
            owner: owner_key,
        });

        // 返回成功
        Ok(())
    }

    // 取消提案的指令
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        // 获取交易账户
        let tx = &ctx.accounts.transaction;
        // 确保交易尚未执行
        require!(!tx.executed, MultisigError::AlreadyExecuted);
        // 确保提案无批准记录
        // require!(tx.approvals.is_empty(), MultisigError::CannotCancelApprovedProposal);

        // 触发提案取消事件
        emit!(ProposalCancelled {
            multisig: ctx.accounts.multisig.key(),
            transaction: tx.key(),
            canceller: ctx.accounts.proposer.key(),
        });

        // 返回成功
        Ok(())
    }

    // 执行交易的指令
    pub fn execute(ctx: Context<Execute>) -> Result<()> {
        // 获取多签和交易账户
        let ms = &ctx.accounts.multisig;
        let tx = &mut ctx.accounts.transaction;
        // 确保多签账户未暂停
        // require!(!ms.paused, MultisigError::Paused);
        let is_resume_proposal = tx.instructions.len() == 1
            && is_pause_instruction(&tx.instructions[0], &crate::ID, false);
        if !is_resume_proposal && ms.paused {
            return err!(MultisigError::Paused);
        }
        // 确保交易尚未执行
        require!(!tx.executed, MultisigError::AlreadyExecuted);

        // 验证交易未过期
        if let Some(exp) = tx.expires_at {
            require!(Clock::get()?.unix_timestamp <= exp, MultisigError::Expired);
        }
        // 确保批准数量达到阈值
        require!(
            tx.approvals.len() as u8 >= ms.threshold,
            MultisigError::NotEnoughApprovals
        );

        // 获取多签账户公钥
        let multisig_key = ms.key();
        // 设置金库的 PDA seed
        let bump_seed = [ms.vault_bump];
        let seeds = &[b"vault".as_ref(), multisig_key.as_ref(), bump_seed.as_ref()];
        let vault_seeds: &[&[&[u8]]] = &[seeds];

        // 执行交易中的所有指令
        for ix in &tx.instructions {
            let instruction = anchor_lang::solana_program::instruction::Instruction {
                program_id: ix.program_id,
                accounts: to_account_metas(&ix.accounts), // 转换账户元数据
                data: ix.data.clone(),
            };
            // 使用金库签名调用指令
            invoke_signed(&instruction, &ctx.remaining_accounts, vault_seeds)?;
        }

        // 标记交易为已执行
        tx.executed = true;

        // 触发交易执行事件
        emit!(TransactionExecuted {
            multisig: ms.key(),
            transaction: tx.key(),
        });

        // 返回成功
        Ok(())
    }

    // 关闭交易账户的指令
    pub fn close_transaction(_ctx: Context<CloseTransaction>) -> Result<()> {
        // 触发交易关闭事件
        emit!(TransactionClosed {
            multisig: _ctx.accounts.multisig.key(),
            transaction: _ctx.accounts.transaction.key(),
            recipient: _ctx.accounts.recipient.key(),
        });
        // 返回成功
        Ok(())
    }

    // 修改多签阈值的指令
    pub fn change_threshold(ctx: Context<Manage>, new_threshold: u8) -> Result<()> {
        // 获取多签账户
        let ms = &mut ctx.accounts.multisig;
        // 验证新阈值有效
        require!(
            new_threshold > 0 && (new_threshold as usize) <= ms.owners.len(),
            MultisigError::InvalidThreshold
        );
        // 更新阈值
        ms.threshold = new_threshold;
        // 触发阈值变更事件
        emit!(ThresholdChanged {
            multisig: ms.key(),
            new_threshold
        });
        // 返回成功
        Ok(())
    }

    // 添加新 owner 的指令
    pub fn add_owner(ctx: Context<Manage>, new_owner: Pubkey) -> Result<()> {
        // 获取多签账户
        let ms = &mut ctx.accounts.multisig;
        // 确保新 owner 未存在
        require!(!ms.owners.contains(&new_owner), MultisigError::OwnerExists);
        // 确保 owner 数量未超限
        require!(ms.owners.len() < MAX_OWNERS, MultisigError::TooManyOwners);
        // 添加新 owner
        ms.owners.push(new_owner);
        // 触发 owner 添加事件
        emit!(OwnerAdded {
            multisig: ms.key(),
            new_owner
        });
        // 返回成功
        Ok(())
    }

    // 移除 owner 的指令
    pub fn remove_owner(ctx: Context<Manage>, owner: Pubkey) -> Result<()> {
        // 获取多签账户
        let ms = &mut ctx.accounts.multisig;
        // 记录当前 owner 数量
        let old_len = ms.owners.len();
        // 移除指定 owner
        ms.owners.retain(|k| k != &owner);
        // 确保 owner 被移除
        require!(ms.owners.len() < old_len, MultisigError::NotAnOwner);
        // 确保阈值仍然有效
        require!(
            (ms.threshold as usize) <= ms.owners.len(),
            MultisigError::InvalidThresholdAfterRemoval
        );
        // 触发 owner 移除事件
        emit!(OwnerRemoved {
            multisig: ms.key(),
            removed_owner: owner
        });
        // 返回成功
        Ok(())
    }

    // 暂停或恢复多签账户的指令
    pub fn pause(ctx: Context<Manage>, paused: bool) -> Result<()> {
        // 获取多签账户
        let ms = &mut ctx.accounts.multisig;
        // 设置暂停状态
        ms.paused = paused;
        // 触发暂停状态变更事件
        emit!(PauseToggled {
            multisig: ms.key(),
            paused
        });
        // 返回成功
        Ok(())
    }

    // 添加程序到白名单的指令
    pub fn add_to_whitelist(ctx: Context<ManageWhitelist>, program_id: Pubkey) -> Result<()> {
        // 获取白名单账户
        let whitelist = &mut ctx.accounts.whitelist;
        // 确保程序未在白名单中
        require!(
            !whitelist.programs.contains(&program_id),
            MultisigError::ProgramAlreadyWhitelisted
        );
        // 确保白名单未满
        require!(
            whitelist.programs.len() < MAX_WHITELIST_SIZE,
            MultisigError::WhitelistFull
        );
        // 添加程序到白名单
        whitelist.programs.push(program_id);
        // 触发白名单添加事件
        emit!(WhitelistProgramAdded {
            multisig: ctx.accounts.multisig.key(),
            program_id
        });
        // 返回成功
        Ok(())
    }

    // 从白名单移除程序的指令
    pub fn remove_from_whitelist(ctx: Context<ManageWhitelist>, program_id: Pubkey) -> Result<()> {
        // 防止移除核心程序（系统程序和当前程序）
        require!(
            program_id != system_program::ID && program_id != crate::ID,
            MultisigError::CannotRemoveCoreProgram
        );
        // 获取白名单账户
        let whitelist = &mut ctx.accounts.whitelist;
        // 记录当前白名单长度
        let old_len = whitelist.programs.len();
        // 移除指定程序
        whitelist.programs.retain(|p| p != &program_id);
        // 确保程序被移除
        require!(
            whitelist.programs.len() < old_len,
            MultisigError::ProgramNotFoundInWhitelist
        );
        // 触发白名单移除事件
        emit!(WhitelistProgramRemoved {
            multisig: ctx.accounts.multisig.key(),
            program_id
        });
        // 返回成功
        Ok(())
    }
}

// 定义创建多签账户的上下文
#[derive(Accounts)]
#[instruction(owners: Vec<Pubkey>, threshold: u8, nonce: u64)]
pub struct CreateMultisig<'info> {
    // 初始化多签账户，分配空间并设置 PDA
    #[account(init, payer = payer, space = 8 + Multisig::INIT_SPACE, seeds = [b"multisig", payer.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub multisig: Account<'info, Multisig>,
    // 金库账户，使用 PDA，无需数据检查
    #[account(seeds = [b"vault", multisig.key().as_ref()], bump)]
    /// CHECK: Vault is a PDA, no data check needed.
    pub vault: UncheckedAccount<'info>,
    // 初始化白名单账户，分配空间并设置 PDA
    #[account(init, payer = payer, space = 8 + ProgramWhitelist::INIT_SPACE, seeds = [b"whitelist", multisig.key().as_ref()], bump)]
    pub whitelist: Account<'info, ProgramWhitelist>,
    // 支付者账户，需签名
    #[account(mut)]
    pub payer: Signer<'info>,
    // 系统程序，用于账户创建
    pub system_program: Program<'info, System>,
}

// 定义提出交易的上下文
#[derive(Accounts)]
pub struct Propose<'info> {
    // 可变的多签账户
    #[account(mut)]
    pub multisig: Account<'info, Multisig>,
    // 白名单账户，验证程序 ID
    #[account(seeds = [b"whitelist", multisig.key().as_ref()], bump = multisig.whitelist_bump)]
    pub whitelist: Account<'info, ProgramWhitelist>,
    // 金库账户，PDA
    #[account(seeds = [b"vault", multisig.key().as_ref()], bump = multisig.vault_bump)]
    /// CHECK: Vault is a PDA, seed check is enough.
    pub vault: UncheckedAccount<'info>,
    // 初始化交易账户，分配空间并设置 PDA
    #[account(init, payer = proposer, space = 8 + Transaction::INIT_SPACE, seeds = [b"tx", multisig.key().as_ref(), &multisig.next_tx_id.to_le_bytes()], bump)]
    pub transaction: Account<'info, Transaction>,
    // 提议者账户，需签名
    #[account(mut)]
    pub proposer: Signer<'info>,
    // 系统程序
    pub system_program: Program<'info, System>,
}

// 定义批准或撤销交易的上下文
#[derive(Accounts)]
pub struct Approve<'info> {
    // 多签账户
    pub multisig: Account<'info, Multisig>,
    // 可变的交易账户，需关联多签账户
    #[account(mut, has_one = multisig)]
    pub transaction: Account<'info, Transaction>,
    // 批准者账户，需是 owner 之一
    #[account(constraint = multisig.owners.contains(&owner.key()) @ MultisigError::NotAnOwner)]
    pub owner: Signer<'info>,
}

// 定义执行交易的上下文
#[derive(Accounts)]
pub struct Execute<'info> {
    // 多签账户
    pub multisig: Account<'info, Multisig>,
    // 可变的交易账户，需关联多签账户
    #[account(mut, has_one = multisig)]
    pub transaction: Account<'info, Transaction>,
}

// 定义管理多签账户的上下文
#[derive(Accounts)]
pub struct Manage<'info> {
    // 可变的多签账户
    #[account(mut)]
    pub multisig: Account<'info, Multisig>,
    // 金库账户，需签名
    #[account(seeds = [b"vault", multisig.key().as_ref()], bump = multisig.vault_bump)]
    pub vault: Signer<'info>,
}

// 定义管理白名单的上下文
#[derive(Accounts)]
pub struct ManageWhitelist<'info> {
    // 多签账户
    pub multisig: Account<'info, Multisig>,
    // 可变的白名单账户
    #[account(mut, seeds = [b"whitelist", multisig.key().as_ref()], bump = multisig.whitelist_bump)]
    pub whitelist: Account<'info, ProgramWhitelist>,
    // 金库账户，需签名
    #[account(seeds = [b"vault", multisig.key().as_ref()], bump = multisig.vault_bump)]
    pub vault: Signer<'info>,
}

// 定义取消提案的上下文
#[derive(Accounts)]
pub struct CancelProposal<'info> {
    // 多签账户
    pub multisig: Account<'info, Multisig>,
    // 可变的交易账户，需关联多签和提议者，关闭后租金返还
    #[account(
        mut,
        has_one = multisig,
        has_one = proposer, // 签名者需是原提议者
        close = proposer // 关闭账户，租金返还给提议者
    )]
    pub transaction: Account<'info, Transaction>,
    // 提议者账户，需签名
    #[account(mut)]
    pub proposer: Signer<'info>,
    // 系统程序（注释掉，未使用）
    // pub system_program: Program<'info, System>,
}

// 定义关闭交易账户的上下文
#[derive(Accounts)]
pub struct CloseTransaction<'info> {
    // 多签账户
    pub multisig: Account<'info, Multisig>,
    // 可变的交易账户，需已执行或过期，关闭后租金返还
    #[account(
        mut,
        has_one = multisig,
        constraint = transaction.executed || transaction.is_expired() @ MultisigError::TransactionNotClosable,
        close = recipient
    )]
    pub transaction: Account<'info, Transaction>,
    // 租金接收者账户，需签名
    #[account(mut)]
    pub recipient: Signer<'info>,
    // 验证关闭权限，需是 owner 或提议者
    #[account(
        constraint = multisig.owners.contains(&recipient.key()) || transaction.proposer == recipient.key()
        @ MultisigError::ClosePermissionDenied
    )]
    /// CHECK: This is the signer who is authorized to close the transaction.
    pub authorized_closer: UncheckedAccount<'info>,
}

// 定义多签账户的数据结构
#[account]
#[derive(InitSpace)]
pub struct Multisig {
    pub bump: u8,           // 多签 PDA 的 bump seed
    pub vault_bump: u8,     // 金库 PDA 的 bump seed
    pub whitelist_bump: u8, // 白名单 PDA 的 bump seed
    #[max_len(MAX_OWNERS)]
    pub owners: Vec<Pubkey>, // owner 公钥列表
    pub threshold: u8,      // 批准阈值
    pub next_tx_id: u64,    // 下一个交易 ID
    pub paused: bool,       // 暂停状态
    pub nonce: u64,         // PDA 随机数
}

// 定义交易账户的数据结构
#[account]
#[derive(InitSpace)]
pub struct Transaction {
    pub multisig: Pubkey, // 关联的多签账户
    pub id: u64,          // 交易 ID
    pub proposer: Pubkey, // 提议者公钥
    #[max_len(MAX_IX_PER_TX, InstructionData::INIT_SPACE)]
    pub instructions: Vec<InstructionData>, // 指令列表
    #[max_len(MAX_OWNERS)]
    pub approvals: Vec<Pubkey>, // 批准者列表
    pub executed: bool,   // 是否已执行
    pub expires_at: Option<i64>, // 过期时间
}

// 实现交易账户的辅助方法
impl Transaction {
    // 检查交易是否过期
    pub fn is_expired(&self) -> bool {
        self.expires_at
            .map_or(false, |exp| Clock::get().unwrap().unix_timestamp > exp)
    }
}

// 定义白名单账户的数据结构
#[account]
#[derive(InitSpace)]
pub struct ProgramWhitelist {
    #[max_len(MAX_WHITELIST_SIZE)]
    pub programs: Vec<Pubkey>, // 白名单程序列表
}

// 定义账户元数据结构
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct AccountMetaData {
    pub pubkey: Pubkey,    // 账户公钥
    pub is_signer: bool,   // 是否为签名者
    pub is_writable: bool, // 是否可写
}

// 定义指令数据结构
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct InstructionData {
    pub program_id: Pubkey, // 程序 ID
    #[max_len(MAX_ACCOUNTS_PER_IX)]
    pub accounts: Vec<AccountMetaData>, // 账户列表
    #[max_len(MAX_IX_DATA_LEN)]
    pub data: Vec<u8>, // 指令数据
}

// 定义多签创建事件
#[event]
pub struct MultisigCreated {
    pub multisig: Pubkey,    // 多签账户公钥
    pub owners: Vec<Pubkey>, // owner 列表
    pub threshold: u8,       // 批准阈值
    pub nonce: u64,          // 随机数
}

// 定义提案创建事件
#[event]
pub struct ProposalCreated {
    pub multisig: Pubkey,       // 多签账户公钥
    pub transaction: Pubkey,    // 交易账户公钥
    pub proposer: Pubkey,       // 提议者公钥
    pub instruction_count: u64, // 指令数量
}

// 定义批准添加事件
#[event]
pub struct ApprovalAdded {
    pub multisig: Pubkey,    // 多签账户公钥
    pub transaction: Pubkey, // 交易账户公钥
    pub owner: Pubkey,       // 批准者公钥
}

// 定义批准撤销事件
#[event]
pub struct ApprovalRevoked {
    pub multisig: Pubkey,    // 多签账户公钥
    pub transaction: Pubkey, // 交易账户公钥
    pub owner: Pubkey,       // 撤销者公钥
}

// 定义提案取消事件
#[event]
pub struct ProposalCancelled {
    pub multisig: Pubkey,    // 多签账户公钥
    pub transaction: Pubkey, // 交易账户公钥
    pub canceller: Pubkey,   // 取消者公钥
}

// 定义交易执行事件
#[event]
pub struct TransactionExecuted {
    pub multisig: Pubkey,    // 多签账户公钥
    pub transaction: Pubkey, // 交易账户公钥
}

// 定义交易关闭事件
#[event]
pub struct TransactionClosed {
    pub multisig: Pubkey,    // 多签账户公钥
    pub transaction: Pubkey, // 交易账户公钥
    pub recipient: Pubkey,   // 租金接收者公钥
}

// 定义阈值变更事件
#[event]
pub struct ThresholdChanged {
    pub multisig: Pubkey,  // 多签账户公钥
    pub new_threshold: u8, // 新阈值
}

// 定义 owner 添加事件
#[event]
pub struct OwnerAdded {
    pub multisig: Pubkey,  // 多签账户公钥
    pub new_owner: Pubkey, // 新 owner 公钥
}

// 定义 owner 移除事件
#[event]
pub struct OwnerRemoved {
    pub multisig: Pubkey,      // 多签账户公钥
    pub removed_owner: Pubkey, // 被移除的 owner 公钥
}

// 定义暂停状态变更事件
#[event]
pub struct PauseToggled {
    pub multisig: Pubkey, // 多签账户公钥
    pub paused: bool,     // 暂停状态
}

// 定义白名单程序添加事件
#[event]
pub struct WhitelistProgramAdded {
    pub multisig: Pubkey,   // 多签账户公钥
    pub program_id: Pubkey, // 添加的程序 ID
}

// 定义白名单程序移除事件
#[event]
pub struct WhitelistProgramRemoved {
    pub multisig: Pubkey,   // 多签账户公钥
    pub program_id: Pubkey, // 移除的程序 ID
}

// 批准交易的辅助函数
fn approve_impl(
    ms: &Account<Multisig>,
    tx: &mut Account<Transaction>,
    owner: &Pubkey,
) -> Result<()> {
    // 确保批准者是 owner
    require!(ms.owners.contains(owner), MultisigError::NotAnOwner);
    // 确保未重复批准
    require!(
        !tx.approvals.contains(owner),
        MultisigError::AlreadyApproved
    );
    // 添加批准者到批准列表
    tx.approvals.push(*owner);
    // 返回成功
    Ok(())
}

// 检查指令中的签名者是否为金库账户
fn is_signer_allowed(ix: &InstructionData, vault_key: &Pubkey) -> bool {
    ix.accounts
        .iter()
        .filter(|acc| acc.is_signer)
        .all(|acc| acc.pubkey == *vault_key)
}

// 验证指令的账户和数据长度
fn validate_ix_bounds(ix: &InstructionData) -> Result<()> {
    // 验证账户数量不超过最大限制
    require!(
        ix.accounts.len() <= MAX_ACCOUNTS_PER_IX,
        MultisigError::TooManyAccounts
    );
    // 验证指令数据长度不超过最大限制
    require!(
        ix.data.len() <= MAX_IX_DATA_LEN,
        MultisigError::InstructionDataTooLarge
    );
    // 返回成功
    Ok(())
}

// 将 AccountMetaData 转换为 Solana 的 AccountMeta
fn to_account_metas(
    accounts: &[AccountMetaData],
) -> Vec<anchor_lang::solana_program::instruction::AccountMeta> {
    accounts
        .iter()
        .map(
            |acc| anchor_lang::solana_program::instruction::AccountMeta {
                pubkey: acc.pubkey,
                is_signer: acc.is_signer,
                is_writable: acc.is_writable,
            },
        )
        .collect()
}

// 定义错误代码
#[error_code]
pub enum MultisigError {
    InvalidOwners,                // owner 列表无效
    TooManyOwners,                // owner 数量过多
    InvalidThreshold,             // 阈值无效
    Paused,                       // 多签账户已暂停
    TooManyInstructions,          // 指令数量过多
    ProgramNotAllowed,            // 程序不在白名单
    SignerNotAllowed,             // 签名者不合法
    Overflow,                     // 数值溢出
    Expired,                      // 交易已过期
    NotEnoughApprovals,           // 批准数量不足
    AlreadyExecuted,              // 交易已执行
    NotAnOwner,                   // 非 owner
    OwnerExists,                  // owner 已存在
    AlreadyApproved,              // 已批准
    TooManyAccounts,              // 账户数量过多
    InstructionDataTooLarge,      // 指令数据过大
    DuplicateOwners,              // owner 重复
    InvalidAmount,                // 金额无效
    InvalidExpiration,            // 过期时间无效
    NotApproved,                  // 未批准
    TransactionNotClosable,       // 交易不可关闭
    InvalidThresholdAfterRemoval, // 移除 owner 后阈值无效
    InvalidVault,                 // 金库无效
    WhitelistFull,                // 白名单已满
    ProgramAlreadyWhitelisted,    // 程序已在白名单
    ProgramNotFoundInWhitelist,   // 程序不在白名单
    CannotRemoveCoreProgram,      // 无法移除核心程序
    #[msg("Cannot cancel a proposal that has already been approved.")]
    CannotCancelApprovedProposal, // 无法取消已批准的提案
    #[msg("Only an owner or the original proposer can close this transaction.")]
    ClosePermissionDenied, // 关闭权限被拒绝
}

// (把它放在 lib.rs 文件的底部，`to_account_metas` 函数之后)
fn is_pause_instruction(
    ix: &InstructionData,
    program_id: &Pubkey,
    expected_pause_state: bool,
) -> bool {
    if ix.program_id != *program_id {
        return false;
    }
    // Anchor 指令数据格式: 8字节 discriminator + 参数
    if ix.data.len() != 9 {
        return false;
    }
    // 手动计算或从 IDL 中获取 pause 指令的 discriminator
    // 假设我们已经知道它的 discriminator
    const PAUSE_IX_DISCRIMINATOR: [u8; 8] = [211, 22, 221, 251, 74, 121, 193, 47];

    let discriminator = &ix.data[0..8];
    let pause_state_byte = ix.data[8];

    discriminator == PAUSE_IX_DISCRIMINATOR && pause_state_byte == (expected_pause_state as u8)
}
