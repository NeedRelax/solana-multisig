# 1. 定义程序 ID 和参数
PROGRAM_ID="FZoTboRWj9fe74mx2E8sKDM8pVSov2n3QNdmRxTLLFEY" # 替换成你的 Program ID
THRESHOLD=2
NONCE=0 # u64 nonce

# 3. 运行脚本并获取 PDA 地址 (记得替换文件中的 ID 和公钥)
# node find_pdas.js
# 假设输出为:
MULTISIG_PDA="5ddUAFhJ4smjVKbvWVr4aXF3CanCnhaDAcgxvD5vTrn8"
VAULT_PDA="EZAWCmV38MmmKHABez2ZC3NGTbHtEhe5fXo6wpW1nyK8"
WHITELIST_PDA="Guhd9YHJEfQFyQ4tzGkGgY1jwXoVrhNkoyLkPFjgEBeS"

# 4. 调用 create_multisig 指令
anchor invoke $PROGRAM_ID \
  --program-id $PROGRAM_ID \
  --rpc-url localhost \
  create_multisig "[$OWNER_A_PK, $OWNER_B_PK, $OWNER_C_PK]" $THRESHOLD $NONCE \
  --account multisig=$MULTISIG_PDA \
  --account vault=$VAULT_PDA \
  --account whitelist=$WHITELIST_PDA \
  --account payer=$PAYER_PK \
  --account system_program=11111111111111111111111111111111

# 5. 验证状态 (可选，但推荐)
anchor account $MULTISIG_PDA
# 你应该能看到 owners, threshold 等字段被正确设置了。

# 6. 给 Vault 充值，用于后续交易
solana transfer $VAULT_PDA 1 --from $PAYER_PK --allow-unfunded-recipient