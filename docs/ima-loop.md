
# IMA Loop [DRAFT]

1. Started with:
   `node $DIR/../src/build/main.js --loop $BASE_OPTIONS`

2. Threads:
   - Thread 0: Main control
   - Thread 1: M2S + S2S transfers
   - Thread 2: S2M transfers

---

## Thread 0
```
Thread 0:
└── main()
    └── commandLineTaskLoop()
        └── runParallelLoops()
            └── ensureHaveWorkers()
                ├── Thread 1:
                └── Thread 2:
```

## Thread 1
```
Thread 1:
└── ima_loop_server0 (ObserverServer)
    └── runTransferLoop()
        └── singleTransferLoopWithRepeat()
            └── singleTransferLoop()
                ├── singleTransferLoopPartM2S()
                │   └── doTransfer("M2S")
                │       ├── doQueryOutgoingMessageCounter()
                │       │   ├── getOutgoingMessagesCounter()
                │       │   ├── getIncomingMessagesCounter()
                │       │   └── if getLastOutgoingMessageBlockId:
                │       │       └── findOutAllReferenceLogRecords()
                │       │           └── repeat while (nWalkMsgNumber >= nIncMsgCnt)
                │       │               └── findOutReferenceLogRecord()
                │       │                   └── safeGetPastEventsProgressive("PreviousMessageReference")
                │       │   └── else:
                │       │       └── repeat while (nWalkMsgNumber <= nOutMsgCnt)
                │       │           └── safeGetPastEventsProgressive("OutgoingMessage")
                │       └── doMainTransferLoopActions()
                │           ├── gatherMessages()
                │           └── handleAllMessagesSigning()
                │               ├── doSignMessagesM2S()
                │               │   └── doSignMessagesImpl()
                │               │       ├── prepareSignMessagesImpl()
                │               │       └── repeat while (results < threshold)
                │               │           └── doSignProcessOneImpl()
                │               │               ├── API: skale_imaVerifyAndSign
                │               │               └── BLS verify: /ima/bls_binaries/verify_bls
                │               │       └── gatherSigningStartImpl()
                │               │           └── performBlsGlue + performBlsVerify()
                │               └── callbackAllMessagesSign()
                │                   ├── computeGasPrice()
                │                   ├── computeGas()
                │                   ├── dryRunCall()
                │                   └── payedCall()
                └── singleTransferLoopPartS2S()
                    └── doAllS2S()
                        └── for each connected schain:
                            └── doTransfer("S2S")
                                ├── doQueryOutgoingMessageCounter()
                                └── doMainTransferLoopActions()
                                    ├── gatherMessages()
                                    ├── checkOutgoingMessageEvent()
                                    │   └── checkOutgoingMessageEventInOneNode()
                                    │       └── safeGetPastEventsProgressive("OutgoingMessage")
                                    └── handleAllMessagesSigning()
                                        ├── doSignMessagesS2S()
                                        │   └── doSignMessagesImpl()
                                        │       ├── prepareSignMessagesImpl()
                                        │       └── repeat while (results < threshold)
                                        │           └── doSignProcessOneImpl()
                                        │               ├── API call
                                        │               └── BLS verify
                                        │       └── gatherSigningStartImpl()
                                        │           └── performBlsGlue + performBlsVerify()
                                        └── callbackAllMessagesSign()
                                            ├── computeGasPrice()
                                            ├── computeGas()
                                            ├── dryRunCall()
                                            └── payedCall()
```

## Thread 2

```
Thread 2:
└── ima_loop_server1 (ObserverServer)
    └── runTransferLoop()
        └── singleTransferLoopWithRepeat()
            └── singleTransferLoop()
                └── singleTransferLoopPartS2M()
                    └── doTransfer("S2M")
                        ├── doQueryOutgoingMessageCounter()
                        └── doMainTransferLoopActions()
                            ├── gatherMessages()
                            └── handleAllMessagesSigning()
                                ├── doSignMessagesS2M()
                                │   └── doSignMessagesImpl()
                                │       ├── prepareSignMessagesImpl()
                                │       └── repeat while (results < threshold)
                                │           └── doSignProcessOneImpl()
                                │               ├── API call
                                │               └── BLS verify
                                │       └── gatherSigningStartImpl()
                                │           └── performBlsGlue + performBlsVerify()
                                └── callbackAllMessagesSign()
                                    ├── computeGasPrice()
                                    ├── computeGas()
                                    ├── dryRunCall()
                                    ├── payedCall()
                                    └── ensure (PostMessageError not in events)
```
