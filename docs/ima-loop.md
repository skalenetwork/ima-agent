# IMA Loop [DRAFT]

1. Started with cmd in run.sh: `node $DIR/../src/build/main.js --loop $BASE_OPTIONS`
2. Works in 2 threads: thread 1 - m2s + s2s, thread 2 - s2m


 

thread 0: 
main.js -> main.ts::main() -> commandLineTaskLoop -> runParallelLoops -> ensureHaveWorkers 
                                      ->  thread 1: ima_loop_server0 (ObserverServer) -> runTransferLoop -> singleTransferLoopWithRepeat -> singleTransferLoop -> 
singleTransferLoopPartM2S -> doTransfer("M2S") -> doQueryOutgoingMessageCounter -> 
                                                          getOutgoingMessagesCounter()
                                                          getIncomingMessagesCounter()
                                                          if getLastOutgoingMessageBlockId available: findOutAllReferenceLogRecords -> (until nWalkMsgNumber >= nIncMsgCnt): findOutReferenceLogRecord -> safeGetPastEventsProgressive("PreviousMessageReference") 
                                                          else: safeGetPastEventsProgressive("OutgoingMessage")

singleTransferLoopPartS2S
                                      ->  thread 2: ima_loop_server1 (ObserverServer) -> runTransferLoop -> singleTransferLoopWithRepeat -> singleTransferLoop -> singleTransferLoopPartS2M


