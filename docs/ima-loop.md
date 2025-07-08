# IMA Loop [DRAFT]

1. Started with cmd in run.sh:
     node $DIR/../src/build/main.js --loop $BASE_OPTIONS

2. Works in 2 threads:
     - Thread 1: M2S + S2S
     - Thread 2: S2M

```
Thread 0:
  main()
    commandLineTaskLoop()
      runParallelLoops()
        ensureHaveWorkers

        Thread 1:
          ima_loop_server0 (ObserverServer) ->
            runTransferLoop ->
              singleTransferLoopWithRepeat ->
                singleTransferLoop ->

                  singleTransferLoopPartM2S ->
                    doTransfer("M2S") ->
                      doQueryOutgoingMessageCounter ->
                        getOutgoingMessagesCounter()
                        getIncomingMessagesCounter()
                        if getLastOutgoingMessageBlockId available:
                          findOutAllReferenceLogRecords()
                            (until nWalkMsgNumber >= nIncMsgCnt):
                              findOutReferenceLogRecord()
                                safeGetPastEventsProgressive("PreviousMessageReference")
                        else:
                          (until nWalkMsgNumber <= nOutMsgCnt):
                            safeGetPastEventsProgressive("OutgoingMessage")

                      doMainTransferLoopActions ->
                        gatherMessages
                        handleAllMessagesSigning ->
                          doSignMessagesM2S ->
                            doSignMessagesImpl ->
                              prepareSignMessagesImpl
                              (until number of results < threshold):
                                doSignProcessOneImpl
                                  api call skale_imaVerifyAndSign to node_idx
                                  doSignProcessHandleCall
                                    performBlsVerifyI
                                      save result to tmp JSON file
                                      /ima/bls_binaries/verify_bls --t 11 --n 16 --j node_idx --input tmp JSON file
                              gatherSigningStartImpl
                                performBlsGlue
                                performBlsVerify
                                  save glue result to ./glue-result.json
                                  /ima/bls_binaries/verify_bls --t 11 --n 16 --input ./glue-result.json
                          callbackAllMessagesSign
                            computeGasPrice
                            computeGas
                            dryRunCall
                            payedCall

                  singleTransferLoopPartS2S ->
                    doAllS2S
                      (loop through all connected chains):
                        doTransfer("S2S") ->
                          doQueryOutgoingMessageCounter
                          doMainTransferLoopActions ->
                            gatherMessages
                            checkOutgoingMessageEvent ->
                              checkOutgoingMessageEventInOneNode ->
                                safeGetPastEventsProgressive("OutgoingMessage")
                            handleAllMessagesSigning ->
                              doSignMessagesS2S ->
                                doSignMessagesImpl
                              callbackAllMessagesSign


        Thread 2:
          ima_loop_server1 (ObserverServer) ->
            runTransferLoop ->
              singleTransferLoopWithRepeat ->
                singleTransferLoop ->
                  singleTransferLoopPartS2M ->
                    doTransfer("S2M") ->
                      doQueryOutgoingMessageCounter
                      doMainTransferLoopActions ->
                        gatherMessages
                        handleAllMessagesSigning ->
                          doSignMessagesS2M ->
                            doSignMessagesImpl
                          callbackAllMessagesSign
                            ...
                            Checking that there is no PostMessageError in events
```
