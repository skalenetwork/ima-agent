# IMA Loop [DRAFT]

1. Started with cmd in run.sh: `node $DIR/../src/build/main.js --loop $BASE_OPTIONS`
2. Works in 2 threads: thread 1 - m2s + s2s, thread 2 - s2m


 

thread 0: 
main.js -> main.ts::main() -> commandLineTaskLoop -> runParallelLoops -> ensureHaveWorkers 
                                      ->  thread 1: ima_loop_server0 (ObserverServer) -> runTransferLoop -> singleTransferLoopWithRepeat -> singleTransferLoop -> 
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
                                      api call skale_imaVerifyAndSign to node node_idx
                                      doSignProcessHandleCall
                                         performBlsVerifyI
                                           save result to tmp json file 
                                           /ima/bls_binaries/verify_bls --t 11 --n 16 --j node_idx --input tmp json file
                                    gatherSigningStartImpl
                                      performBlsGlue
                                      performBlsVerify
                                         save glue result to tmp json file ./glue-result.json
                                         /ima/bls_binaries/verify_bls --t 11 --n 16 --input ./glue-result.json
                             callbackAllMessagesSign
                               computeGasPrice
                               computeGas
                               dryRunCall
                               payedCall
                                                 
                                                          

             singleTransferLoopPartS2S
                doAllS2S
                  (loop through all connected chains):
                     doTransfer("S2S")
                       doQueryOutgoingMessageCounter
                       doMainTransferLoopActions
                          gatherMessages
                          checkOutgoingMessageEvent
                             checkOutgoingMessageEventInOneNode 
                                safeGetPastEventsProgressive("OutgoingMessage")
                          handleAllMessagesSigning
                             doSignMessagesS2S
                                doSignMessagesImpl
                             callbackAllMessagesSign
                           
                       



                                      ->  thread 2: ima_loop_server1 (ObserverServer) -> runTransferLoop -> singleTransferLoopWithRepeat -> singleTransferLoop -> singleTransferLoopPartS2M


