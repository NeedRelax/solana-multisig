# 替换成你自己的 Program ID
PROGRAM_ID="FZoTboRWj9fe74mx2E8sKDM8pVSov2n3QNdmRxTLLFEY"

# 获取各个参与者的公钥
PAYER=$(solana address)
OWNER_A=$(solana-keygen pubkey ~/.config/solana/ownerA.json)
OWNER_B=$(solana-keygen pubkey ~/.config/solana/ownerB.json)
OWNER_C=$(solana-keygen pubkey ~/.config/solana/ownerC.json)

# 打印出来确认一下
echo "Program ID: $PROGRAM_ID"
echo "Payer: $PAYER"
echo "Owner A: $OWNER_A"
echo "Owner B: $OWNER_B"
echo "Owner C: $OWNER_C"