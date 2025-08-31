/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/multisig.json`.
 */
export type Multisig = {
  "address": "FZoTboRWj9fe74mx2E8sKDM8pVSov2n3QNdmRxTLLFEY",
  "metadata": {
    "name": "multisig",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "addOwner",
      "discriminator": [
        211,
        140,
        15,
        161,
        64,
        48,
        232,
        184
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "addToWhitelist",
      "discriminator": [
        157,
        211,
        52,
        54,
        144,
        81,
        5,
        55
      ],
      "accounts": [
        {
          "name": "multisig"
        },
        {
          "name": "whitelist",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "programId",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "approve",
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "transaction",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "cancelProposal",
      "discriminator": [
        106,
        74,
        128,
        146,
        19,
        65,
        39,
        23
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "transaction",
          "writable": true
        },
        {
          "name": "proposer",
          "writable": true,
          "signer": true,
          "relations": [
            "transaction"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "changeThreshold",
      "discriminator": [
        146,
        151,
        213,
        63,
        121,
        79,
        9,
        29
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newThreshold",
          "type": "u8"
        }
      ]
    },
    {
      "name": "closeTransaction",
      "discriminator": [
        97,
        46,
        152,
        170,
        42,
        215,
        192,
        218
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "transaction",
          "writable": true
        },
        {
          "name": "recipient",
          "writable": true,
          "signer": true
        },
        {
          "name": "authorizedCloser"
        }
      ],
      "args": []
    },
    {
      "name": "createMultisig",
      "discriminator": [
        148,
        146,
        240,
        10,
        226,
        215,
        167,
        174
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  117,
                  108,
                  116,
                  105,
                  115,
                  105,
                  103
                ]
              },
              {
                "kind": "account",
                "path": "payer"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "whitelist",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owners",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "threshold",
          "type": "u8"
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "execute",
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "transaction",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "propose",
      "discriminator": [
        93,
        253,
        82,
        168,
        118,
        33,
        102,
        90
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true
        },
        {
          "name": "whitelist",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "transaction",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  120
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              },
              {
                "kind": "account",
                "path": "multisig.next_tx_id",
                "account": "multisig"
              }
            ]
          }
        },
        {
          "name": "proposer",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "instructions",
          "type": {
            "vec": {
              "defined": {
                "name": "instructionData"
              }
            }
          }
        },
        {
          "name": "expiresAt",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "autoApprove",
          "type": "bool"
        }
      ]
    },
    {
      "name": "removeFromWhitelist",
      "discriminator": [
        7,
        144,
        216,
        239,
        243,
        236,
        193,
        235
      ],
      "accounts": [
        {
          "name": "multisig"
        },
        {
          "name": "whitelist",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  119,
                  104,
                  105,
                  116,
                  101,
                  108,
                  105,
                  115,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "programId",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "removeOwner",
      "discriminator": [
        153,
        251,
        84,
        208,
        33,
        62,
        15,
        247
      ],
      "accounts": [
        {
          "name": "multisig",
          "writable": true
        },
        {
          "name": "vault",
          "signer": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "multisig"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "revoke",
      "discriminator": [
        170,
        23,
        31,
        34,
        133,
        173,
        93,
        242
      ],
      "accounts": [
        {
          "name": "multisig",
          "relations": [
            "transaction"
          ]
        },
        {
          "name": "transaction",
          "writable": true
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "multisig",
      "discriminator": [
        224,
        116,
        121,
        186,
        68,
        161,
        79,
        236
      ]
    },
    {
      "name": "programWhitelist",
      "discriminator": [
        84,
        184,
        157,
        146,
        47,
        19,
        126,
        47
      ]
    },
    {
      "name": "transaction",
      "discriminator": [
        11,
        24,
        174,
        129,
        203,
        117,
        242,
        23
      ]
    }
  ],
  "events": [
    {
      "name": "approvalAdded",
      "discriminator": [
        53,
        147,
        53,
        104,
        133,
        171,
        246,
        248
      ]
    },
    {
      "name": "approvalRevoked",
      "discriminator": [
        0,
        143,
        189,
        167,
        179,
        12,
        235,
        123
      ]
    },
    {
      "name": "multisigCreated",
      "discriminator": [
        94,
        25,
        238,
        110,
        95,
        40,
        251,
        66
      ]
    },
    {
      "name": "ownerAdded",
      "discriminator": [
        69,
        11,
        43,
        140,
        68,
        4,
        210,
        84
      ]
    },
    {
      "name": "ownerRemoved",
      "discriminator": [
        51,
        48,
        128,
        81,
        254,
        51,
        187,
        150
      ]
    },
    {
      "name": "pauseToggled",
      "discriminator": [
        105,
        215,
        89,
        53,
        198,
        232,
        136,
        161
      ]
    },
    {
      "name": "proposalCancelled",
      "discriminator": [
        253,
        59,
        104,
        46,
        129,
        78,
        9,
        14
      ]
    },
    {
      "name": "proposalCreated",
      "discriminator": [
        186,
        8,
        160,
        108,
        81,
        13,
        51,
        206
      ]
    },
    {
      "name": "thresholdChanged",
      "discriminator": [
        212,
        208,
        6,
        73,
        92,
        65,
        97,
        229
      ]
    },
    {
      "name": "transactionClosed",
      "discriminator": [
        124,
        24,
        172,
        130,
        209,
        129,
        62,
        176
      ]
    },
    {
      "name": "transactionExecuted",
      "discriminator": [
        211,
        227,
        168,
        14,
        32,
        111,
        189,
        210
      ]
    },
    {
      "name": "whitelistProgramAdded",
      "discriminator": [
        214,
        249,
        212,
        7,
        146,
        35,
        175,
        214
      ]
    },
    {
      "name": "whitelistProgramRemoved",
      "discriminator": [
        143,
        180,
        234,
        132,
        23,
        16,
        126,
        189
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidOwners"
    },
    {
      "code": 6001,
      "name": "tooManyOwners"
    },
    {
      "code": 6002,
      "name": "invalidThreshold"
    },
    {
      "code": 6003,
      "name": "paused"
    },
    {
      "code": 6004,
      "name": "tooManyInstructions"
    },
    {
      "code": 6005,
      "name": "programNotAllowed"
    },
    {
      "code": 6006,
      "name": "signerNotAllowed"
    },
    {
      "code": 6007,
      "name": "overflow"
    },
    {
      "code": 6008,
      "name": "expired"
    },
    {
      "code": 6009,
      "name": "notEnoughApprovals"
    },
    {
      "code": 6010,
      "name": "alreadyExecuted"
    },
    {
      "code": 6011,
      "name": "notAnOwner"
    },
    {
      "code": 6012,
      "name": "ownerExists"
    },
    {
      "code": 6013,
      "name": "alreadyApproved"
    },
    {
      "code": 6014,
      "name": "tooManyAccounts"
    },
    {
      "code": 6015,
      "name": "instructionDataTooLarge"
    },
    {
      "code": 6016,
      "name": "duplicateOwners"
    },
    {
      "code": 6017,
      "name": "invalidAmount"
    },
    {
      "code": 6018,
      "name": "invalidExpiration"
    },
    {
      "code": 6019,
      "name": "notApproved"
    },
    {
      "code": 6020,
      "name": "transactionNotClosable"
    },
    {
      "code": 6021,
      "name": "invalidThresholdAfterRemoval"
    },
    {
      "code": 6022,
      "name": "invalidVault"
    },
    {
      "code": 6023,
      "name": "whitelistFull"
    },
    {
      "code": 6024,
      "name": "programAlreadyWhitelisted"
    },
    {
      "code": 6025,
      "name": "programNotFoundInWhitelist"
    },
    {
      "code": 6026,
      "name": "cannotRemoveCoreProgram"
    },
    {
      "code": 6027,
      "name": "cannotCancelApprovedProposal",
      "msg": "Cannot cancel a proposal that has already been approved."
    },
    {
      "code": 6028,
      "name": "closePermissionDenied",
      "msg": "Only an owner or the original proposer can close this transaction."
    }
  ],
  "types": [
    {
      "name": "accountMetaData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey",
            "type": "pubkey"
          },
          {
            "name": "isSigner",
            "type": "bool"
          },
          {
            "name": "isWritable",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "approvalAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "approvalRevoked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "instructionData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "programId",
            "type": "pubkey"
          },
          {
            "name": "accounts",
            "type": {
              "vec": {
                "defined": {
                  "name": "accountMetaData"
                }
              }
            }
          },
          {
            "name": "data",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "multisig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          },
          {
            "name": "whitelistBump",
            "type": "u8"
          },
          {
            "name": "owners",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "nextTxId",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "nonce",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "multisigCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "owners",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "threshold",
            "type": "u8"
          },
          {
            "name": "nonce",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "ownerAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "newOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "ownerRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "removedOwner",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "pauseToggled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "programWhitelist",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "programs",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "proposalCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          },
          {
            "name": "canceller",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "proposalCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "instructionCount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "thresholdChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "newThreshold",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "transaction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "id",
            "type": "u64"
          },
          {
            "name": "proposer",
            "type": "pubkey"
          },
          {
            "name": "instructions",
            "type": {
              "vec": {
                "defined": {
                  "name": "instructionData"
                }
              }
            }
          },
          {
            "name": "approvals",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "executed",
            "type": "bool"
          },
          {
            "name": "expiresAt",
            "type": {
              "option": "i64"
            }
          }
        ]
      }
    },
    {
      "name": "transactionClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          },
          {
            "name": "recipient",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "transactionExecuted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "transaction",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "whitelistProgramAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "programId",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "whitelistProgramRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "multisig",
            "type": "pubkey"
          },
          {
            "name": "programId",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
