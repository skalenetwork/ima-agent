// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * SKALE IMA is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SKALE IMA is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with SKALE IMA.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file index.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as cc from "./cc.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as loop from "./loop.mjs";
import * as pwa from "./pwa.mjs";
import * as state from "./state.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";
import * as imaEventLogScan from "./imaEventLogScan.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as threadInfo from "./threadInfo.mjs";

cc.enable( false );
log.addStdout();

const perMessageGasForTransfer = 1000000;
const additionalS2MTransferOverhead = 200000;

async function findOutReferenceLogRecord(
    details, strLogPrefix,
    ethersProvider, joMessageProxy,
    bnBlockId, nMessageNumberToFind, isVerbose
) {
    const bnMessageNumberToFind = owaspUtils.toBN( nMessageNumberToFind.toString() );
    const strEventName = "PreviousMessageReference";
    const arrLogRecords = await imaEventLogScan.safeGetPastEventsProgressive(
        details, strLogPrefix,
        ethersProvider, 10, joMessageProxy, strEventName,
        bnBlockId, bnBlockId, joMessageProxy.filters[strEventName]()
    );
    const cntLogRecord = arrLogRecords.length;
    if( isVerbose ) {
        details.debug( strLogPrefix, "Got ", cntLogRecord, " log record(s) (",
            log.v( strEventName ), ") with data: ", log.v( arrLogRecords ) );
    }
    for( let idxLogRecord = 0; idxLogRecord < cntLogRecord; ++ idxLogRecord ) {
        const joEvent = arrLogRecords[idxLogRecord];
        const eventValuesByName = {
            "currentMessage": joEvent.args[0],
            "previousOutgoingMessageBlockId": joEvent.args[1]
        };
        const joReferenceLogRecord = {
            "currentMessage": eventValuesByName.currentMessage,
            "previousOutgoingMessageBlockId":
                eventValuesByName.previousOutgoingMessageBlockId,
            "currentBlockId": bnBlockId
        };
        const bnCurrentMessage =
            owaspUtils.toBN( joReferenceLogRecord.currentMessage.toString() );
        if( bnCurrentMessage.eq( bnMessageNumberToFind ) ) {
            if( isVerbose ) {
                details.success( strLogPrefix, "Found ", log.v( strEventName ), " log record ",
                    log.v( joReferenceLogRecord ), " for message ", nMessageNumberToFind );
            }
            return joReferenceLogRecord;
        }
    }
    if( isVerbose ) {
        details.error( strLogPrefix, "Failed to find ", log.v( strEventName ),
            " log record for message ", log.v( nMessageNumberToFind ) );
    }
    return null;
}

async function findOutAllReferenceLogRecords(
    details, strLogPrefix,
    ethersProvider, joMessageProxy,
    bnBlockId, nIncMsgCnt, nOutMsgCnt, isVerbose
) {
    if( isVerbose ) {
        details.debug( strLogPrefix, "Optimized IMA message search algorithm will start at block ",
            log.v( bnBlockId.toString() ), ", will search for outgoing message counter ",
            log.v( nOutMsgCnt.toString() ), " and approach down to incoming message counter ",
            log.v( nIncMsgCnt.toString() ) );
    }
    const arrLogRecordReferences = [];
    const cntExpected = nOutMsgCnt - nIncMsgCnt;
    if( cntExpected <= 0 ) {
        if( isVerbose ) {
            details.success( strLogPrefix,
                "Optimized IMA message search algorithm success, " +
                    "nothing to search, result is empty" );
        }
        return arrLogRecordReferences; // nothing to search
    }
    let nWalkMsgNumber = nOutMsgCnt - 1;
    let nWalkBlockId = bnBlockId;
    for( ; nWalkMsgNumber >= nIncMsgCnt; -- nWalkMsgNumber ) {
        const joReferenceLogRecord =
            await findOutReferenceLogRecord(
                details, strLogPrefix,
                ethersProvider, joMessageProxy,
                nWalkBlockId, nWalkMsgNumber, isVerbose
            );
        if( joReferenceLogRecord == null )
            break;
        nWalkBlockId = owaspUtils.toBN( joReferenceLogRecord.previousOutgoingMessageBlockId );
        arrLogRecordReferences.unshift( joReferenceLogRecord );
    }
    const cntFound = arrLogRecordReferences.length;
    if( cntFound != cntExpected ) {
        if( isVerbose ) {
            details.error( strLogPrefix, "Optimized IMA message search algorithm fail, found ",
                cntFound, " log record(s), expected ", cntExpected,
                " log record(s), found records are: ", log.v( arrLogRecordReferences ) );
        }
    } else {
        if( isVerbose ) {
            details.success( strLogPrefix,
                "Optimized IMA message search algorithm success, found all ", cntFound,
                " log record(s): ", log.v( arrLogRecordReferences ) );
        }
    }
    return arrLogRecordReferences;
}

let gTransferLoopCounter = 0;

// Do real money movement from main-net to S-chain by sniffing events
// 1) main-net.MessageProxyForMainnet.getOutgoingMessagesCounter -> save to nOutMsgCnt
// 2) S-chain.MessageProxySchain.getIncomingMessagesCounter -> save to nIncMsgCnt
// 3) Will transfer all in range from [ nIncMsgCnt ... (nOutMsgCnt-1) ] ...
//    assume current counter index is nIdxCurrentMsg
//
// One transaction transfer is:
// 1) Find events main-net.MessageProxyForMainnet.OutgoingMessage
//    where msgCounter member is in range
// 2) Publish it to S-chain.MessageProxySchain.postIncomingMessages(
//            main-net chain id   // uint64 srcChainID
//            nIdxCurrentMsg // uint64 startingCounter
//            [srcContract]  // address[] memory senders
//            [dstContract]  // address[] memory dstContracts
//            [to]           // address[] memory to
//            [amount]       // uint256[] memory amount / *uint256[2] memory blsSignature* /
//            )
async function doQueryOutgoingMessageCounter( optsTransfer ) {
    let nPossibleIntegerValue = 0;
    optsTransfer.details.debug( optsTransfer.strLogPrefixShort, "SRC MessageProxy address is.....",
        log.v( optsTransfer.joMessageProxySrc.address ) );
    optsTransfer.details.debug( optsTransfer.strLogPrefixShort, "DST MessageProxy address is.....",
        log.v( optsTransfer.joMessageProxyDst.address ) );
    optsTransfer.strActionName = "src-chain.MessageProxy.getOutgoingMessagesCounter()";
    try {
        optsTransfer.details.debug( optsTransfer.strLogPrefix,
            "Will call ", log.v( optsTransfer.strActionName ), "..." );
        nPossibleIntegerValue =
            await optsTransfer.joMessageProxySrc.callStatic.getOutgoingMessagesCounter(
                optsTransfer.chainNameDst,
                { from: optsTransfer.joAccountSrc.address() } );
        if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
            throw new Error(
                "DST chain " + optsTransfer.chainNameDst +
                " returned outgoing message counter " +
                nPossibleIntegerValue + " which is not a valid integer"
            );
        }
        optsTransfer.nOutMsgCnt = owaspUtils.toInteger( nPossibleIntegerValue );
        optsTransfer.details.information( optsTransfer.strLogPrefix,
            "Result of ", log.v( optsTransfer.strActionName ), " call: ",
            log.v( optsTransfer.nOutMsgCnt ) );
    } catch ( err ) {
        optsTransfer.details.critical( "(IMMEDIATE) error caught during ",
            optsTransfer.strActionName, ", error optsTransfer.details: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
        if( log.id != optsTransfer.details.id ) {
            log.critical( "(IMMEDIATE) error caught during ",
                optsTransfer.strActionName, ", error optsTransfer.details: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
    }

    optsTransfer.strActionName = "dst-chain.MessageProxy.getIncomingMessagesCounter()";
    optsTransfer.details.debug( optsTransfer.strLogPrefix,
        "Will call ", log.v( optsTransfer.strActionName ), "..." );
    nPossibleIntegerValue =
        await optsTransfer.joMessageProxyDst.callStatic.getIncomingMessagesCounter(
            optsTransfer.chainNameSrc,
            { from: optsTransfer.joAccountDst.address() } );
    if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
        throw new Error(
            "SRC chain " + optsTransfer.chainNameSrc + " returned incoming message counter " +
            nPossibleIntegerValue + " which is not a valid integer" );
    }
    optsTransfer.nIncMsgCnt = owaspUtils.toInteger( nPossibleIntegerValue );
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "Result of ",
        log.v( optsTransfer.strActionName ), " call: ", log.v( optsTransfer.nIncMsgCnt ) );
    optsTransfer.strActionName = "src-chain.MessageProxy.getIncomingMessagesCounter()";
    nPossibleIntegerValue =
        await optsTransfer.joMessageProxySrc.callStatic.getIncomingMessagesCounter(
            optsTransfer.chainNameDst,
            { from: optsTransfer.joAccountSrc.address() } );
    if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
        throw new Error(
            "DST chain " + optsTransfer.chainNameDst + " returned incoming message counter " +
            nPossibleIntegerValue + " which is not a valid integer" );
    }
    const idxLastToPopNotIncluding = owaspUtils.toInteger( nPossibleIntegerValue );
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "Result of ",
        log.v( optsTransfer.strActionName ), " call: ", log.v( idxLastToPopNotIncluding ) );
    // first, try optimized scanner
    optsTransfer.arrLogRecordReferences = [];
    try {
        optsTransfer.strActionName =
            "in-getOutgoingMessagesCounter()--joMessageProxySrc.getLastOutgoingMessageBlockId()";
        const bnBlockId =
            owaspUtils.toBN(
                await optsTransfer.joMessageProxySrc.callStatic.getLastOutgoingMessageBlockId(
                    optsTransfer.chainNameDst,
                    { from: optsTransfer.joAccountSrc.address() } ) );
        try {
            optsTransfer.strActionName =
                "in-getOutgoingMessagesCounter()--findOutAllReferenceLogRecords()";
            optsTransfer.arrLogRecordReferences =
                await findOutAllReferenceLogRecords(
                    optsTransfer.details, optsTransfer.strLogPrefixShort,
                    optsTransfer.ethersProviderSrc, optsTransfer.joMessageProxySrc,
                    bnBlockId, optsTransfer.nIncMsgCnt, optsTransfer.nOutMsgCnt, true
                );
            return true; // success, finish at this point
        } catch ( err ) {
            optsTransfer.arrLogRecordReferences = [];
            optsTransfer.details.error(
                optsTransfer.strLogPrefix, "Optimized log search is off. Running old IMA smart " +
                    "contracts? Please upgrade, if possible. This message is based on error: " +
                    " Please upgrade, if possible. Error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
    } catch ( err ) {
        optsTransfer.arrLogRecordReferences = [];
        optsTransfer.details.error( optsTransfer.strLogPrefix,
            log.em( "Optimized log search is un-available." ) );
    }
    // second, use classic raw events search
    optsTransfer.strActionName =
        "in-getOutgoingMessagesCounter()--classic-records-scanner";
    const attempts = 10;
    const strEventName = "OutgoingMessage";
    const nBlockFrom = 0;
    const nBlockTo = "latest";
    for( let nWalkMsgNumber = optsTransfer.nIncMsgCnt;
        nWalkMsgNumber < optsTransfer.nOutMsgCnt;
        ++ nWalkMsgNumber
    ) {
        const joFilter = optsTransfer.joMessageProxySrc.filters[strEventName](
            owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainIdDst ), // dstChainHash
            owaspUtils.toBN( nWalkMsgNumber )
        );
        const arrLogRecordReferencesWalk = await imaEventLogScan.safeGetPastEventsProgressive(
            optsTransfer.details, optsTransfer.strLogPrefixShort,
            optsTransfer.ethersProviderSrc, attempts, optsTransfer.joMessageProxySrc,
            strEventName,
            nBlockFrom, nBlockTo, joFilter
        );
        optsTransfer.arrLogRecordReferences =
            optsTransfer.arrLogRecordReferences.concat( arrLogRecordReferencesWalk );
    }

    return true;
}

async function analyzeGatheredRecords( optsTransfer, r ) {
    let joValues = "";
    const strChainHashWeAreLookingFor =
        owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst );
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "Will review ", r.length,
        " found event records(in reverse order, newest to oldest) while looking for hash ",
        log.v( strChainHashWeAreLookingFor ), " of destination chain ",
        log.v( optsTransfer.chainNameDst ) );
    for( let i = r.length - 1; i >= 0; i-- ) {
        const joEvent = r[i];
        optsTransfer.details.debug( optsTransfer.strLogPrefix,
            "Will review found event record ", i, " with data ", log.v( joEvent ) );
        const eventValuesByName = {
            "dstChainHash": joEvent.args[0],
            "msgCounter": joEvent.args[1],
            "srcContract": joEvent.args[2],
            "dstContract": joEvent.args[3],
            "data": joEvent.args[4]
        };
        if( eventValuesByName.dstChainHash == strChainHashWeAreLookingFor ) {
            joValues = eventValuesByName;
            joValues.savedBlockNumberForOptimizations = r[i].blockNumber;
            optsTransfer.details.success( optsTransfer.strLogPrefix,
                "Found event record ", i, " reviewed and ",
                "accepted for processing, found event values are ",
                log.v( joValues ), ", found block number is ",
                log.v( joValues.savedBlockNumberForOptimizations ) );
            break;
        } else {
            optsTransfer.details.debug( optsTransfer.strLogPrefix, "Found event record ", i,
                " reviewed and skipped" );
        }
    }
    if( joValues == "" ) {
        optsTransfer.details.critical( optsTransfer.strLogPrefix,
            "Can't get events from MessageProxy" );
        if( log.id != optsTransfer.details.id ) {
            log.critical( optsTransfer.strLogPrefix,
                "Can't get events from MessageProxy" );
        }
        optsTransfer.details.exposeDetailsTo(
            log, optsTransfer.strGatheredDetailsName, false );
        imaTransferErrorHandling.saveTransferError(
            optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
        optsTransfer.details.close();
        return null; // caller will return false if we return null here
    }
    return joValues;
}

async function gatherMessages( optsTransfer ) {
    optsTransfer.arrMessageCounters = [];
    optsTransfer.jarrMessages = [];
    optsTransfer.nIdxCurrentMsgBlockStart = 0 + optsTransfer.nIdxCurrentMsg;
    let r;
    optsTransfer.cntAccumulatedForBlock = 0;
    for( let idxInBlock = 0; // inner loop wil create block of transactions
        optsTransfer.nIdxCurrentMsg < optsTransfer.nOutMsgCnt &&
            idxInBlock < optsTransfer.nTransactionsCountInBlock;
        ++optsTransfer.nIdxCurrentMsg, ++idxInBlock, ++optsTransfer.cntAccumulatedForBlock
    ) {
        const idxProcessing = optsTransfer.cntProcessed + idxInBlock;
        if( idxProcessing > optsTransfer.nMaxTransactionsCount )
            break;
        let nBlockFrom = 0, nBlockTo = "latest";
        if( optsTransfer.arrLogRecordReferences.length > 0 ) {
            const joReferenceLogRecord = optsTransfer.arrLogRecordReferences.shift();
            nBlockFrom = joReferenceLogRecord.currentBlockId;
            nBlockTo = joReferenceLogRecord.currentBlockId;
        }
        optsTransfer.strActionName = "src-chain->MessageProxy->scan-past-events()";
        const strEventName = "OutgoingMessage";
        optsTransfer.details.debug( optsTransfer.strLogPrefix, "Will call ",
            log.v( optsTransfer.strActionName ), " for ",
            log.v( strEventName ), " event..." );
        r = await imaEventLogScan.safeGetPastEventsProgressive(
            optsTransfer.details, optsTransfer.strLogPrefixShort, optsTransfer.ethersProviderSrc,
            10, optsTransfer.joMessageProxySrc, strEventName, nBlockFrom, nBlockTo,
            optsTransfer.joMessageProxySrc.filters[strEventName](
                owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst ), // dstChainHash
                owaspUtils.toBN( optsTransfer.nIdxCurrentMsg )
            ) );
        const joValues = await analyzeGatheredRecords( optsTransfer, r );
        if( joValues == null )
            return false;
        if( optsTransfer.nBlockAwaitDepth > 0 ) {
            let bSecurityCheckPassed = true;
            const strActionNameOld = "" + optsTransfer.strActionName;
            optsTransfer.strActionName = "security check: evaluate block depth";
            try {
                const transactionHash = r[0].transactionHash;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Event transactionHash is ", log.v( transactionHash ) );
                const blockNumber = r[0].blockNumber;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Event blockNumber is ", log.v( blockNumber ) );
                const nLatestBlockNumber = await imaHelperAPIs.safeGetBlockNumber(
                    optsTransfer.details, 10, optsTransfer.ethersProviderSrc );
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Latest blockNumber is ", log.v( nLatestBlockNumber ) );
                const nDist = nLatestBlockNumber - blockNumber;
                if( nDist < optsTransfer.nBlockAwaitDepth )
                    bSecurityCheckPassed = false;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Distance by blockNumber is ", log.v( nDist ),
                    ", await check is ",
                    log.posNeg( bSecurityCheckPassed, "PASSED", "FAILED" ) );
            } catch ( err ) {
                bSecurityCheckPassed = false;
                const strError = owaspUtils.extractErrorMessage( err );
                optsTransfer.details.critical( optsTransfer.strLogPrefix,
                    "Exception(evaluate block depth) while " +
                        "getting transaction hash and block number during ",
                    optsTransfer.strActionName, ": ", log.em( strError ),
                    ", stack is: ", "\n", log.s( err.stack ) );
                if( log.id != optsTransfer.details.id ) {
                    log.critical( optsTransfer.strLogPrefix,
                        "Exception(evaluate block depth) while " +
                            "getting transaction hash and block number during ",
                        optsTransfer.strActionName, ": ", log.em( strError ),
                        ", stack is: ", "\n", log.s( err.stack ) );
                }
                optsTransfer.details.exposeDetailsTo(
                    log, optsTransfer.strGatheredDetailsName, false );
                imaTransferErrorHandling.saveTransferError(
                    optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
                optsTransfer.details.close();
                return false;
            }
            optsTransfer.strActionName = "" + strActionNameOld;
            if( !bSecurityCheckPassed ) {
                const s = optsTransfer.strLogPrefix + log.em( "Block depth check was " +
                    "not passed, canceling search for transfer events" );
                optsTransfer.details.warning( s );
                if( log.id != optsTransfer.details.id )
                    log.warning( s );
                break;
            }
        }
        if( optsTransfer.nBlockAge > 0 ) {
            let bSecurityCheckPassed = true;
            const strActionNameOld = "" + optsTransfer.strActionName;
            optsTransfer.strActionName = "security check: evaluate block age";
            try {
                const transactionHash = r[0].transactionHash;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Event transactionHash is ", log.v( transactionHash ) );
                const blockNumber = r[0].blockNumber;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Event blockNumber is ", log.v( blockNumber ) );
                const joBlock = await optsTransfer.ethersProviderSrc.getBlock( blockNumber );
                if( !owaspUtils.validateInteger( joBlock.timestamp ) ) {
                    throw new Error( "Block \"timestamp\" is not a valid integer value: " +
                        joBlock.timestamp );
                }
                const timestampBlock = owaspUtils.toInteger( joBlock.timestamp );
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Block   TS is ", log.v( timestampBlock ) );
                const timestampCurrent = imaHelperAPIs.currentTimestamp();
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Current TS is ", log.v( timestampCurrent ) );
                const tsDiff = timestampCurrent - timestampBlock;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Diff    TS is ", log.v( tsDiff ) );
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Expected diff ", log.v( optsTransfer.nBlockAge ) );
                if( tsDiff < optsTransfer.nBlockAge )
                    bSecurityCheckPassed = false;
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Block age check is ",
                    log.posNeg( bSecurityCheckPassed, "PASSED", "FAILED" ) );
            } catch ( err ) {
                bSecurityCheckPassed = false;
                const strError = owaspUtils.extractErrorMessage( err );
                optsTransfer.details.critical( optsTransfer.strLogPrefix,
                    "Exception(evaluate block age) while " +
                        "getting block number and timestamp during " +
                        optsTransfer.strActionName + ": ", log.em( strError ),
                    ", stack is: ", "\n", log.s( err.stack ) );
                if( log.id != optsTransfer.details.id ) {
                    log.critical( "Exception(evaluate block age) while " +
                        "getting block number and timestamp during " +
                        optsTransfer.strActionName + ": ", log.em( strError ),
                    ", stack is: ", "\n", log.s( err.stack ) );
                }
                optsTransfer.details.exposeDetailsTo(
                    log, optsTransfer.strGatheredDetailsName, false );
                imaTransferErrorHandling.saveTransferError(
                    optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
                optsTransfer.details.close();
                return false;
            }
            optsTransfer.strActionName = "" + strActionNameOld;
            if( !bSecurityCheckPassed ) {
                optsTransfer.details.warning( optsTransfer.strLogPrefix,
                    "Block age check was not passed, canceling search for transfer events" );
                break;
            }
        }
        optsTransfer.details.success( optsTransfer.strLogPrefix, "Got event optsTransfer.details " +
            "from getPastEvents() event invoked with msgCounter set to ",
        log.v( optsTransfer.nIdxCurrentMsg ), " and dstChain set to ",
        log.v( optsTransfer.chainNameDst ), ", event description: ", log.v( joValues ) );
        optsTransfer.details.debug( optsTransfer.strLogPrefix,
            "Will process message counter value ", log.v( optsTransfer.nIdxCurrentMsg ) );
        optsTransfer.arrMessageCounters.push( optsTransfer.nIdxCurrentMsg );
        const joMessage = {
            "sender": joValues.srcContract,
            "destinationContract": joValues.dstContract,
            "to": joValues.to,
            "amount": joValues.amount,
            "data": joValues.data,
            "savedBlockNumberForOptimizations":
                joValues.savedBlockNumberForOptimizations
        };
        optsTransfer.jarrMessages.push( joMessage );
    }
}

async function preCheckAllMessagesSign( optsTransfer, err, jarrMessages, joGlueResult ) {
    const strDidInvokedSigningCallbackMessage = log.fmtDebug( optsTransfer.strLogPrefix,
        "Did invoked message signing callback, first real message index is: ",
        optsTransfer.nIdxCurrentMsgBlockStart, ", have ", optsTransfer.jarrMessages.length,
        " message(s) to process ", log.v( optsTransfer.jarrMessages ) );
    optsTransfer.details.debug( strDidInvokedSigningCallbackMessage );
    if( log.id != optsTransfer.details.id )
        log.debug( strDidInvokedSigningCallbackMessage );
    if( err ) {
        optsTransfer.bErrorInSigningMessages = true;
        const strError = owaspUtils.extractErrorMessage( err );
        optsTransfer.details.critical( optsTransfer.strLogPrefix,
            "Error signing messages: ", log.em( strError ) );
        if( log.id != optsTransfer.details.id ) {
            log.critical( optsTransfer.strLogPrefix,
                "Error signing messages: ", log.em( strError ) );
        }
        imaTransferErrorHandling.saveTransferError(
            optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
        return false;
    }
    if( ! loop.checkTimeFraming(
        null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts )
    ) {
        const strWarning = optsTransfer.strLogPrefix +
            log.em( "Time framing overflow (after signing messages)" );
        optsTransfer.details.warning( strWarning );
        if( log.id != optsTransfer.details.id )
            log.warning( strWarning );
        imaTransferErrorHandling.saveTransferSuccessAll();
        return false;
    }
    return true;
}

async function callbackAllMessagesSign( optsTransfer, err, jarrMessages, joGlueResult ) {
    if( ! await preCheckAllMessagesSign( optsTransfer, err, jarrMessages, joGlueResult ) )
        return;
    const nBlockSize = optsTransfer.arrMessageCounters.length;
    optsTransfer.strActionName = "dst-chain.MessageProxy.postIncomingMessages()";
    const strWillCallPostIncomingMessagesAction = log.fmtDebug( optsTransfer.strLogPrefix,
        "Will call ", optsTransfer.strActionName, " for block size set to ", log.v( nBlockSize ),
        ", message counters = are ", log.v( optsTransfer.arrMessageCounters ),
        "..." );
    optsTransfer.details.debug( strWillCallPostIncomingMessagesAction );
    if( log.id != optsTransfer.details.id )
        log.debug( strWillCallPostIncomingMessagesAction );
    let signature = joGlueResult ? joGlueResult.signature : null;
    if( !signature )
        signature = { X: "0", Y: "0" };
    let hashPoint = joGlueResult ? joGlueResult.hashPoint : null;
    if( !hashPoint )
        hashPoint = { X: "0", Y: "0" };
    let hint = joGlueResult ? joGlueResult.hint : null;
    if( !hint )
        hint = "0";
    const sign = {
        blsSignature: [ signature.X, signature.Y ], // BLS glue of signatures
        hashA: hashPoint.X, // G1.X from joGlueResult.hashSrc
        hashB: hashPoint.Y, // G1.Y from joGlueResult.hashSrc
        counter: hint
    };
    const arrArgumentsPostIncomingMessages = [
        optsTransfer.chainNameSrc, optsTransfer.nIdxCurrentMsgBlockStart,
        optsTransfer.jarrMessages, sign ];
    const joDebugArgs = [
        optsTransfer.chainNameSrc, optsTransfer.chainNameDst,
        optsTransfer.nIdxCurrentMsgBlockStart,
        optsTransfer.jarrMessages, [ signature.X, signature.Y ], // BLS glue of signatures
        hashPoint.X, // G1.X from joGlueResult.hashSrc
        hashPoint.Y, // G1.Y from joGlueResult.hashSrc
        hint ];
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "....debug args for msgCounter set to ",
        log.v( optsTransfer.nIdxCurrentMsgBlockStart ), ": ", log.v( joDebugArgs ) );
    optsTransfer.strActionName = optsTransfer.strDirection + " - Post incoming messages";
    const weiHowMuchPostIncomingMessages = undefined;
    const gasPrice =
        await optsTransfer.transactionCustomizerDst.computeGasPrice(
            optsTransfer.ethersProviderDst, 200000000000 );
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "Using computed ",
        log.v( "gasPrice" ), "=", log.v( gasPrice ) );
    let estimatedGasPostIncomingMessages =
        await optsTransfer.transactionCustomizerDst.computeGas(
            optsTransfer.details, optsTransfer.ethersProviderDst,
            "MessageProxy", optsTransfer.joMessageProxyDst,
            "postIncomingMessages", arrArgumentsPostIncomingMessages,
            optsTransfer.joAccountDst, optsTransfer.strActionName,
            gasPrice, 10000000, weiHowMuchPostIncomingMessages, null );
    optsTransfer.details.debug( optsTransfer.strLogPrefix, "Using estimated gas=",
        log.v( estimatedGasPostIncomingMessages ) );
    if( optsTransfer.strDirection == "S2M" ) {
        const expectedGasLimit = perMessageGasForTransfer * optsTransfer.jarrMessages.length +
            additionalS2MTransferOverhead;
        estimatedGasPostIncomingMessages =
            Math.max( estimatedGasPostIncomingMessages, expectedGasLimit );
    }
    const isIgnorePostIncomingMessages = false;
    const strErrorOfDryRun =
        await imaTx.dryRunCall(
            optsTransfer.details, optsTransfer.ethersProviderDst,
            "MessageProxy", optsTransfer.joMessageProxyDst,
            "postIncomingMessages", arrArgumentsPostIncomingMessages,
            optsTransfer.joAccountDst, optsTransfer.strActionName,
            isIgnorePostIncomingMessages,
            gasPrice, estimatedGasPostIncomingMessages,
            weiHowMuchPostIncomingMessages, null );
    if( strErrorOfDryRun )
        throw new Error( strErrorOfDryRun );
    const opts = {
        isCheckTransactionToSchain:
            ( optsTransfer.chainNameDst !== "Mainnet" ) ? true : false
    };
    const joReceipt =
        await imaTx.payedCall(
            optsTransfer.details, optsTransfer.ethersProviderDst,
            "MessageProxy", optsTransfer.joMessageProxyDst,
            "postIncomingMessages", arrArgumentsPostIncomingMessages,
            optsTransfer.joAccountDst, optsTransfer.strActionName,
            gasPrice, estimatedGasPostIncomingMessages,
            weiHowMuchPostIncomingMessages, opts );
    if( joReceipt && typeof joReceipt == "object" ) {
        optsTransfer.jarrReceipts.push( {
            "description": "doTransfer/postIncomingMessages()",
            "optsTransfer.detailsString":
                "" + optsTransfer.strGatheredDetailsName,
            "receipt": joReceipt
        } );
        imaGasUsage.printGasUsageReportFromArray( "(intermediate result) TRANSFER " +
            optsTransfer.chainNameSrc + " -> " + optsTransfer.chainNameDst,
        optsTransfer.jarrReceipts, optsTransfer.details );
    }
    optsTransfer.cntProcessed += optsTransfer.cntAccumulatedForBlock;
    optsTransfer.details.information( optsTransfer.strLogPrefix,
        "Validating transfer from ", log.v( optsTransfer.chainNameSrc ), " to ",
        log.v( optsTransfer.chainNameDst ), "..." );
    // check DepositBox -> Error on Mainnet only
    if( optsTransfer.chainNameDst == "Mainnet" ) {
        optsTransfer.details.debug( optsTransfer.strLogPrefix,
            "Validating transfer to Main Net via MessageProxy error absence on Main Net..." );
        if( optsTransfer.joDepositBoxMainNet ) {
            if( joReceipt && "blockNumber" in joReceipt &&
                "transactionHash" in joReceipt ) {
                const strEventName = "PostMessageError";
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Verifying the ", log.v( strEventName ), " event of the ",
                    log.v( "MessageProxy" ), "/",
                    log.v( optsTransfer.joMessageProxyDst.address ),
                    " contract..." );
                const joEvents = await imaEventLogScan.getContractCallEvents(
                    optsTransfer.details, optsTransfer.strLogPrefixShort,
                    optsTransfer.ethersProviderDst,
                    optsTransfer.joMessageProxyDst, strEventName,
                    joReceipt.blockNumber, joReceipt.transactionHash,
                    optsTransfer.joMessageProxyDst.filters[strEventName]() );
                if( joEvents.length == 0 ) {
                    optsTransfer.details.success( optsTransfer.strLogPrefix,
                        "Success, verified the ", log.v( strEventName ), " event of the ",
                        log.v( "MessageProxy" ), "/",
                        log.v( optsTransfer.joMessageProxyDst.address ),
                        " contract, no events found" );
                } else {
                    optsTransfer.details.critical( optsTransfer.strLogPrefix,
                        "Failed verification of the ", log.v( "PostMessageError" ),
                        " event of the ", log.v( "MessageProxy" ), "/",
                        log.v( optsTransfer.joMessageProxyDst.address ),
                        " contract, found event(s): ", log.v( joEvents ) );
                    if( log.id != optsTransfer.details.id ) {
                        log.critical( optsTransfer.strLogPrefix,
                            "Failed verification of the ", log.v( "PostMessageError" ),
                            " event of the ", log.v( "MessageProxy" ), "/",
                            log.v( optsTransfer.joMessageProxyDst.address ),
                            " contract, found event(s): ", log.v( joEvents ) );
                    }
                    imaTransferErrorHandling.saveTransferError(
                        optsTransfer.strTransferErrorCategoryName,
                        optsTransfer.details.toString() );
                    throw new Error( "Verification failed for the \"PostMessageError\" " +
                        "event of the \"MessageProxy\"/" + optsTransfer.joMessageProxyDst.address +
                        " contract, error events found" );
                }
                optsTransfer.details.success( optsTransfer.strLogPrefix, "Done, validated " +
                    "transfer to Main Net via MessageProxy error absence on Main Net" );
            } else {
                optsTransfer.details.warning( optsTransfer.strLogPrefix,
                    " Cannot validate transfer to Main Net via " +
                        "MessageProxy error absence on Main Net, " +
                        "no valid transaction receipt provided" );
            }
        } else {
            optsTransfer.details.warning( optsTransfer.strLogPrefix,
                " Cannot validate transfer to Main Net " +
                    "via MessageProxy error absence on Main Net, no MessageProxy provided" );
        }
    }
}

async function handleAllMessagesSigning( optsTransfer ) {
    try {
        const promiseComplete = new Promise( function( resolve, reject ) {
            const doHandlingWorkForAllMessagesSigning = async function() {
                await optsTransfer.fnSignMessages(
                    optsTransfer.nTransferLoopCounter,
                    optsTransfer.jarrMessages, optsTransfer.nIdxCurrentMsgBlockStart,
                    optsTransfer.chainNameSrc,
                    optsTransfer.joExtraSignOpts,
                    async function( err, jarrMessages, joGlueResult ) {
                        await callbackAllMessagesSign(
                            optsTransfer, err, jarrMessages, joGlueResult );
                        resolve( true );
                    } ).catch( ( err ) => {
                    // callback fn as argument of optsTransfer.fnSignMessages
                    optsTransfer.bErrorInSigningMessages = true;
                    const strError = owaspUtils.extractErrorMessage( err );
                    optsTransfer.details.error( optsTransfer.strLogPrefix,
                        "Problem in transfer handler(in signer): ", log.em( strError ) );
                    if( log.id != optsTransfer.details.id ) {
                        log.error( optsTransfer.strLogPrefix,
                            "Problem in transfer handler(in signer): ", log.em( strError ) );
                    }
                    imaTransferErrorHandling.saveTransferError(
                        optsTransfer.strTransferErrorCategoryName,
                        optsTransfer.details.toString() );
                    reject( err );
                } );
            };
            doHandlingWorkForAllMessagesSigning();
        } );
        await Promise.all( [ promiseComplete ] );
        return true;
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        optsTransfer.details.error( optsTransfer.strLogPrefix,
            "Problem in transfer handler(general): ", log.em( strError ) );
        if( log.id != optsTransfer.details.id ) {
            log.error( optsTransfer.strLogPrefix,
                "Problem in transfer handler(general): ", log.em( strError ) );
        }
        imaTransferErrorHandling.saveTransferError(
            optsTransfer.strTransferErrorCategoryName,
            optsTransfer.details.toString() );
        return false;
    }
}

async function checkOutgoingMessageEvent( optsTransfer, joSChain ) {
    const cntNodes = joSChain.data.computed.nodes.length;
    const cntMessages = optsTransfer.jarrMessages.length;
    for( let idxMessage = 0; idxMessage < cntMessages; ++ idxMessage ) {
        const idxImaMessage = optsTransfer.arrMessageCounters[idxMessage];
        const joMessage = optsTransfer.jarrMessages[idxMessage];
        optsTransfer.details.trace( optsTransfer.strLogPrefix,
            log.v( optsTransfer.strDirection ),
            " message analysis for message ", log.v( idxMessage + 1 ), " of ",
            log.v( cntMessages ), " with IMA message index ", log.v( idxImaMessage ),
            " and message envelope data:", log.v( joMessage ) );
        let cntPassedNodes = 0, cntFailedNodes = 0, joNode = null;
        try {
            for( let idxNode = 0; idxNode < cntNodes; ++ idxNode ) {
                joNode = joSChain.data.computed.nodes[idxNode];
                // eslint-disable-next-line dot-notation
                const strUrlHttp = joNode["http_endpoint_ip"];
                optsTransfer.details.trace( optsTransfer.strLogPrefix, "Validating ",
                    log.v( optsTransfer.strDirection ), " message ", log.v( idxMessage + 1 ),
                    " on node ", log.v( joNode.name ), " using URL ", log.u( strUrlHttp ),
                    "..." );
                let bEventIsFound = false;
                try {
                    // eslint-disable-next-line dot-notation
                    const ethersProviderNode =
                        owaspUtils.getEthersProviderFromURL( strUrlHttp );
                    const joMessageProxyNode =
                        new owaspUtils.ethersMod.ethers.Contract(
                            optsTransfer.imaState.chainProperties.sc
                                .joAbiIMA.message_proxy_chain_address,
                            optsTransfer.imaState.chainProperties.sc
                                .joAbiIMA.message_proxy_chain_abi,
                            ethersProviderNode
                        );
                    const strEventName = "OutgoingMessage";
                    const node_r = await imaEventLogScan.safeGetPastEventsProgressive(
                        optsTransfer.details, optsTransfer.strLogPrefixShort,
                        ethersProviderNode, 10, joMessageProxyNode, strEventName,
                        joMessage.savedBlockNumberForOptimizations,
                        joMessage.savedBlockNumberForOptimizations,
                        joMessageProxyNode.filters[strEventName](
                            owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst ),
                            owaspUtils.toBN( idxImaMessage )
                        )
                    );
                    const cntEvents = node_r.length;
                    optsTransfer.details.trace( optsTransfer.strLogPrefix, "Got ",
                        cntEvents, " event(s) (", log.v( strEventName ), ") on node ",
                        log.v( joNode.name ), " with data: ", log.v( node_r ) );
                    for( let idxEvent = 0; idxEvent < cntEvents; ++ idxEvent ) {
                        const joEvent = node_r[idxEvent];
                        const eventValuesByName = {
                            "dstChainHash": joEvent.args[0],
                            "msgCounter": joEvent.args[1],
                            "srcContract": joEvent.args[2],
                            "dstContract": joEvent.args[3],
                            "data": joEvent.args[4]
                        };
                        if( owaspUtils.ensureStartsWith0x(
                            joMessage.sender ).toLowerCase() ==
                            owaspUtils.ensureStartsWith0x(
                                eventValuesByName.srcContract ).toLowerCase() &&
                            owaspUtils.ensureStartsWith0x(
                                joMessage.destinationContract ).toLowerCase() ==
                            owaspUtils.ensureStartsWith0x(
                                eventValuesByName.dstContract ).toLowerCase()
                        ) {
                            bEventIsFound = true;
                            break;
                        }
                    }
                } catch ( err ) {
                    ++ cntFailedNodes;
                    optsTransfer.details.error( optsTransfer.strLogPrefix,
                        log.v( optsTransfer.strDirection ), " message analysis error: " +
                        "Failed to scan events on node ", log.v( joNode.name ),
                        ", error is: ", log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", detailed node description is: ", log.v( joNode ),
                        ", stack is: ", "\n", log.s( err.stack ) );
                    if( log.id != optsTransfer.details.id ) {
                        log.error( optsTransfer.strLogPrefix,
                            log.v( optsTransfer.strDirection ), " message analysis error: " +
                            "Failed to scan events on node ", log.v( joNode.name ),
                            ", error is: ", log.em( owaspUtils.extractErrorMessage( err ) ),
                            ", detailed node description is: ", log.v( joNode ),
                            ", stack is: ", "\n", log.s( err.stack ) );
                    }
                    continue;
                }
                if( bEventIsFound ) {
                    ++ cntPassedNodes;
                    optsTransfer.details.success( optsTransfer.strLogPrefix,
                        log.v( optsTransfer.strDirection ), " message ",
                        log.v( idxMessage + 1 ), " validation on node ",
                        log.v( joNode.name ), " using URL ",
                        log.u( strUrlHttp ), " is passed" );
                } else {
                    ++ cntFailedNodes;
                    // eslint-disable-next-line dot-notation
                    optsTransfer.details.error( optsTransfer.strLogPrefix,
                        log.v( optsTransfer.strDirection ), " message ",
                        log.v( idxMessage + 1 ), " validation on node ",
                        log.v( joNode.name ), " using URL ",
                        log.u( strUrlHttp ), " is failed" );
                    if( log.id != optsTransfer.details.id ) {
                        log.error( optsTransfer.strLogPrefix,
                            log.v( optsTransfer.strDirection ), " message ",
                            log.v( idxMessage + 1 ), " validation on node ",
                            log.v( joNode.name ), " using URL ",
                            log.u( strUrlHttp ), " is failed" );
                    }
                }
                if( cntFailedNodes > optsTransfer.cntNodesMayFail )
                    break;
                if( cntPassedNodes >= optsTransfer.cntNodesShouldPass ) {
                    // eslint-disable-next-line dot-notation
                    optsTransfer.details.information( optsTransfer.strLogPrefix,
                        log.v( optsTransfer.strDirection ), " message ",
                        log.v( idxMessage + 1 ), " validation on node ",
                        log.v( joNode.name ), " using URL ",
                        log.u( strUrlHttp ), " is passed" );
                    break;
                }
            }
        } catch ( err ) {
            // eslint-disable-next-line dot-notation
            const strUrlHttp = joNode ? joNode["http_endpoint_ip"] : "";
            optsTransfer.details.critical( optsTransfer.strLogPrefix,
                log.v( optsTransfer.strDirection ),
                " message analysis error: Failed to process events for ",
                log.v( optsTransfer.strDirection ), " message ",
                log.v( idxMessage + 1 ), " on node ",
                log.posNeg( joNode, log.v( joNode.name ), "<<unknown node name>>" ),
                " using URL ",
                log.posNeg( joNode, log.u( strUrlHttp ), "<<unknown node endpoint>>" ),
                ", error is: ", log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            if( log.id != optsTransfer.details.id ) {
                log.critical( optsTransfer.strLogPrefix,
                    log.v( optsTransfer.strDirection ),
                    " message analysis error: Failed to process events for ",
                    log.v( optsTransfer.strDirection ), " message ",
                    log.v( idxMessage + 1 ), " on node ",
                    log.posNeg( joNode, log.v( joNode.name ), "<<unknown node name>>" ),
                    " using URL ",
                    log.posNeg( joNode, log.u( strUrlHttp ), "<<unknown node endpoint>>" ),
                    ", error is: ", log.em( owaspUtils.extractErrorMessage( err ) ),
                    ", stack is: ", "\n", log.s( err.stack ) );
            }
        }
        if( cntFailedNodes > optsTransfer.cntNodesMayFail ) {
            optsTransfer.details.critical( optsTransfer.strLogPrefix,
                "Error validating ", log.v( optsTransfer.strDirection ),
                " messages, failed node count ", cntFailedNodes,
                " is greater then allowed to fail ", optsTransfer.cntNodesMayFail );
            if( log.id != optsTransfer.details.id ) {
                log.critical( optsTransfer.strLogPrefix,
                    "Error validating ", log.v( optsTransfer.strDirection ),
                    " messages, failed node count ", cntFailedNodes,
                    " is greater then allowed to fail ", optsTransfer.cntNodesMayFail );
            }
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, false );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName,
                optsTransfer.details.toString() );
            optsTransfer.details.close();
            return false;
        }
        if( ! ( cntPassedNodes >= optsTransfer.cntNodesShouldPass ) ) {
            optsTransfer.details.critical( optsTransfer.strLogPrefix,
                "Error validating ", log.v( optsTransfer.strDirection ),
                " messages, passed node count ", cntFailedNodes,
                " is less then needed count ", optsTransfer.cntNodesShouldPass );
            if( log.id != optsTransfer.details.id ) {
                log.critical( optsTransfer.strLogPrefix,
                    "Error validating ", log.v( optsTransfer.strDirection ),
                    " messages, passed node count ", cntFailedNodes,
                    " is less then needed count ", optsTransfer.cntNodesShouldPass );
            }
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, false );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
            optsTransfer.details.close();
            return false;
        }
    }
    return true;
}

async function doMainTransferLoopActions( optsTransfer ) {
    // classic scanner with optional usage of optimized IMA messages search algorithm
    // outer loop is block former/creator, then transfer
    optsTransfer.nIdxCurrentMsg = optsTransfer.nIncMsgCnt;
    while( optsTransfer.nIdxCurrentMsg < optsTransfer.nOutMsgCnt ) {
        if( optsTransfer.nStepsDone > optsTransfer.nTransferSteps ) {
            optsTransfer.details.warning( optsTransfer.strLogPrefix,
                "Transfer step count overflow" );
            if( log.id != optsTransfer.details.id ) {
                log.warning( optsTransfer.strLogPrefix,
                    "Transfer step count overflow" );
            }
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        optsTransfer.details.trace( optsTransfer.strLogPrefix,
            "Entering block former iteration with message counter set to ",
            log.v( optsTransfer.nIdxCurrentMsg ), ", transfer step number is ",
            log.v( optsTransfer.nStepsDone ), ", can transfer up to ",
            log.v( optsTransfer.nMaxTransactionsCount ), " message(s) per step",
            ", can perform up to ", log.v( optsTransfer.nTransferSteps ),
            " transfer step(s)" );
        if( ! loop.checkTimeFraming(
            null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts ) ) {
            const strWarning = optsTransfer.strLogPrefix + log.em( "WARNING:" ) + " " +
            log.em( "Time framing overflow (after entering block former iteration loop)" );
            optsTransfer.details.warning( strWarning );
            if( log.id != optsTransfer.details.id )
                log.warning( strWarning );
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        await gatherMessages( optsTransfer );
        if( optsTransfer.cntAccumulatedForBlock == 0 )
            break;
        if( ! loop.checkTimeFraming(
            null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts )
        ) {
            optsTransfer.details.warning( optsTransfer.strLogPrefix,
                "Time framing overflow (after forming block of messages)" );
            if( log.id != optsTransfer.details.id ) {
                log.warning( optsTransfer.strLogPrefix,
                    "Time framing overflow (after forming block of messages)" );
            }
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        if( optsTransfer.strDirection == "S2S" ) {
            optsTransfer.strActionName = "S2S message analysis";
            if( ! optsTransfer.joExtraSignOpts ) {
                throw new Error(
                    "Could not validate S2S messages, " +
                        "no extra options provided to transfer algorithm" );
            }
            if( ! optsTransfer.joExtraSignOpts.skaleObserver ) {
                throw new Error(
                    "Could not validate S2S messages, " +
                        "no SKALE NETWORK observer provided to transfer algorithm" );
            }
            const arrSChainsCached =
                optsTransfer.joExtraSignOpts.skaleObserver.getLastCachedSChains();
            if( ( !arrSChainsCached ) || arrSChainsCached.length == 0 ) {
                throw new Error(
                    "Could not validate S2S messages, " +
                        "no S-Chains in SKALE NETWORK observer cached yet, try again later" );
            }
            const idxSChain =
                optsTransfer.joExtraSignOpts.skaleObserver.findSChainIndexInArrayByName(
                    arrSChainsCached, optsTransfer.chainNameSrc );
            if( idxSChain < 0 ) {
                throw new Error(
                    "Could not validate S2S messages, source S-Chain \"" +
                    optsTransfer.chainNameSrc +
                    "\" is not in SKALE NETWORK observer " +
                    "cache yet or it's not connected to this \"" + optsTransfer.chainNameDst +
                    "\" S-Chain yet, try again later" );
            }
            const cntMessages = optsTransfer.jarrMessages.length;
            const joSChain = arrSChainsCached[idxSChain];
            const cntNodes = joSChain.data.computed.nodes.length;
            optsTransfer.cntNodesShouldPass =
                ( cntNodes == 16 )
                    ? 11
                    : (
                        ( cntNodes == 4 )
                            ? 3
                            : (
                                ( cntNodes == 2 || cntNodes == 1 )
                                    ? ( 0 + cntNodes )
                                    : parseInt( ( cntNodes * 2 ) / 3 )
                            )
                    );
            optsTransfer.cntNodesMayFail = cntNodes - optsTransfer.cntNodesShouldPass;
            optsTransfer.details.trace( optsTransfer.strLogPrefix,
                log.v( optsTransfer.strDirection ),
                " message analysis will be performed o S-Chain ",
                log.v( optsTransfer.chainNameSrc ), " with ",
                log.v( cntNodes ), " node(s), ",
                log.v( optsTransfer.cntNodesShouldPass ),
                " node(s) should have same message(s), ",
                log.v( optsTransfer.cntNodesMayFail ) +
                " node(s) allowed to fail message(s) comparison, ",
                log.v( cntMessages ), " message(s) to check..." );
            if( ! ( await checkOutgoingMessageEvent( optsTransfer, joSChain ) ) )
                return false;
        }

        optsTransfer.strActionName = "sign messages";
        const strWillInvokeSigningCallbackMessage = log.fmtDebug( optsTransfer.strLogPrefix,
            "Will invoke message signing callback, first real message index is: ",
            optsTransfer.nIdxCurrentMsgBlockStart, ", have ", optsTransfer.jarrMessages.length,
            " message(s) to process ", optsTransfer.jarrMessages );
        optsTransfer.details.information( strWillInvokeSigningCallbackMessage );
        if( log.id != optsTransfer.details.id )
            log.information( strWillInvokeSigningCallbackMessage );
        // will re-open optsTransfer.details B log here for next step,
        // it can be delayed so we will flush accumulated optsTransfer.details A now
        if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo ) {
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, true );
        }
        optsTransfer.details.close();
        optsTransfer.details = optsTransfer.imaState.isDynamicLogInDoTransfer
            ? log : log.createMemoryStream( true );
        optsTransfer.strGatheredDetailsName =
            optsTransfer.strDirection + "/#" + optsTransfer.nTransferLoopCounter + "-" +
            "doTransfer-B-" + optsTransfer.chainNameSrc + "-->" + optsTransfer.chainNameDst;
        try {
            if( ! ( await handleAllMessagesSigning( optsTransfer ) ) )
                return false;
        } catch ( err ) {
            optsTransfer.details.critical( optsTransfer.strLogPrefix,
                "Exception from signing messages function: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            if( log.id != optsTransfer.details.id ) {
                log.critical( optsTransfer.strLogPrefix,
                    "Exception from signing messages function: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ),
                    ", stack is: ", "\n", log.s( err.stack ) );
            }
        }
        if( optsTransfer.bErrorInSigningMessages )
            break;
        ++ optsTransfer.nStepsDone;
    }
    return true;
}

let gIsOneTransferInProgressInThisThread = false;

export async function doTransfer(
    strDirection, joRuntimeOpts,
    ethersProviderSrc, joMessageProxySrc, joAccountSrc,
    ethersProviderDst, joMessageProxyDst, joAccountDst,
    chainNameSrc, chainNameDst, chainIdSrc, chainIdDst,
    joDepositBoxMainNet, // for logs validation on mainnet
    joTokenManagerSChain, // for logs validation on s-chain
    nTransactionsCountInBlock,
    nTransferSteps, nMaxTransactionsCount, nBlockAwaitDepth, nBlockAge,
    fnSignMessages, joExtraSignOpts, transactionCustomizerDst
) {
    const optsTransfer = {
        strDirection: strDirection,
        joRuntimeOpts: joRuntimeOpts,
        ethersProviderSrc: ethersProviderSrc,
        joMessageProxySrc: joMessageProxySrc,
        joAccountSrc: joAccountSrc,
        ethersProviderDst: ethersProviderDst,
        joMessageProxyDst: joMessageProxyDst,
        joAccountDst: joAccountDst,
        chainNameSrc: chainNameSrc,
        chainNameDst: chainNameDst,
        chainIdSrc: chainIdSrc,
        chainIdDst: chainIdDst,
        joDepositBoxMainNet: joDepositBoxMainNet, // for logs validation on mainnet
        joTokenManagerSChain: joTokenManagerSChain, // for logs validation on s-chain
        nTransactionsCountInBlock: nTransactionsCountInBlock,
        nTransferSteps: nTransferSteps,
        nMaxTransactionsCount: nMaxTransactionsCount,
        nBlockAwaitDepth: nBlockAwaitDepth,
        nBlockAge: nBlockAge,
        fnSignMessages: fnSignMessages,
        joExtraSignOpts: joExtraSignOpts,
        transactionCustomizerDst: transactionCustomizerDst,
        imaState: state.get(),
        nTransferLoopCounter: 0 + gTransferLoopCounter,
        strTransferErrorCategoryName: "loop-" + strDirection,
        strGatheredDetailsName: "",
        details: null,
        jarrReceipts: [],
        bErrorInSigningMessages: false,
        strLogPrefixShort: "",
        strLogPrefix: "",
        nStepsDone: 0,
        strActionName: "",
        nIdxCurrentMsg: 0,
        nOutMsgCnt: 0,
        nIncMsgCnt: 0,
        cntProcessed: 0,
        arrMessageCounters: [],
        jarrMessages: [],
        nIdxCurrentMsgBlockStart: 0,
        cntAccumulatedForBlock: 0,
        arrLogRecordReferences: []
    };
    ++ gTransferLoopCounter;
    optsTransfer.strGatheredDetailsName = optsTransfer.strDirection + "/#" +
        optsTransfer.nTransferLoopCounter + "-" + "doTransfer-A" + "-" +
        optsTransfer.chainNameSrc + "-->" + optsTransfer.chainNameDst;
    optsTransfer.details = optsTransfer.imaState.isDynamicLogInDoTransfer
        ? log : log.createMemoryStream( true );
    optsTransfer.strLogPrefixShort = optsTransfer.strDirection + "/#" +
        optsTransfer.nTransferLoopCounter + " ";
    optsTransfer.strLogPrefix = optsTransfer.strLogPrefixShort + "transfer loop from " +
        optsTransfer.chainNameSrc + " to " + optsTransfer.chainNameDst + ": ";
    if( gIsOneTransferInProgressInThisThread ) {
        optsTransfer.details.warning( optsTransfer.strLogPrefix,
            "Transfer loop step is skipped because previous one is still in progress" );
        if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo ) {
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, true );
        }
        optsTransfer.details.close();
        return false;
    }
    try {
        gIsOneTransferInProgressInThisThread = true;
        optsTransfer.details.debug( optsTransfer.strLogPrefix, "Message signing is ",
            log.onOff( optsTransfer.imaState.bSignMessages ) );
        if( optsTransfer.fnSignMessages == null || optsTransfer.fnSignMessages == undefined ||
            ( ! optsTransfer.imaState.bSignMessages )
        ) {
            optsTransfer.details.debug( optsTransfer.strLogPrefix,
                "Using internal signing stub function" );
            optsTransfer.fnSignMessages = async function(
                nTransferLoopCounter, jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
                joExtraSignOpts, fnAfter
            ) {
                optsTransfer.details.debug( optsTransfer.strLogPrefix,
                    "Message signing callback was not provided to IMA, " +
                    "first real message index is:", log.v( nIdxCurrentMsgBlockStart ), ", have ",
                    log.v( optsTransfer.jarrMessages.length ), " message(s) to process ",
                    log.v( optsTransfer.jarrMessages ) );
                await fnAfter( null, jarrMessages, null ); // null - no error, null - no signatures
            };
        } else {
            optsTransfer.details.debug( optsTransfer.strLogPrefix +
                "Using externally provided signing function" );
        }
        optsTransfer.nTransactionsCountInBlock = optsTransfer.nTransactionsCountInBlock || 5;
        optsTransfer.nTransferSteps = optsTransfer.nTransferSteps || Number.MAX_SAFE_INTEGER;
        optsTransfer.nMaxTransactionsCount =
            optsTransfer.nMaxTransactionsCount || Number.MAX_SAFE_INTEGER;
        if( optsTransfer.nTransactionsCountInBlock < 1 )
            optsTransfer.nTransactionsCountInBlock = 1;
        if( optsTransfer.nBlockAwaitDepth < 0 )
            optsTransfer.nBlockAwaitDepth = 0;
        if( optsTransfer.nBlockAge < 0 )
            optsTransfer.nBlockAge = 0;
        try {
            if( ! ( await doQueryOutgoingMessageCounter( optsTransfer ) ) ) {
                gIsOneTransferInProgressInThisThread = false;
                return false;
            }
            if( ! ( await doMainTransferLoopActions( optsTransfer ) ) ) {
                gIsOneTransferInProgressInThisThread = false;
                return false;
            }
        } catch ( err ) {
            optsTransfer.details.critical( optsTransfer.strLogPrefix,
                "Error in ", optsTransfer.strGatheredDetailsName,
                " during ", optsTransfer.strActionName, ": ",
                log.em( owaspUtils.extractErrorMessage( err ) ) +
                ", stack is: ", "\n", log.s( err.stack ) );
            if( log.id != optsTransfer.details.id ) {
                log.critical( optsTransfer.strLogPrefix,
                    "Error in ", optsTransfer.strGatheredDetailsNam,
                    " during ", optsTransfer.strActionName, ": ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) +
                    ", stack is: ", "\n", log.s( err.stack ) );
            }
            optsTransfer.details.exposeDetailsTo( log,
                optsTransfer.strGatheredDetailsName, false );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
            optsTransfer.details.close();
            gIsOneTransferInProgressInThisThread = false;
            return false;
        }
        imaGasUsage.printGasUsageReportFromArray( "TRANSFER " + optsTransfer.chainNameSrc +
            " -> " + optsTransfer.chainNameDst, optsTransfer.jarrReceipts, optsTransfer.details );
        if( optsTransfer.details ) {
            if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo ) {
                optsTransfer.details.exposeDetailsTo(
                    log, optsTransfer.strGatheredDetailsName, true );
            }
            optsTransfer.details.close();
        }
        if( ! optsTransfer.bErrorInSigningMessages ) {
            imaTransferErrorHandling.saveTransferSuccess(
                optsTransfer.strTransferErrorCategoryName );
        }
        gIsOneTransferInProgressInThisThread = false;
        return true;
    } catch ( err ) {
        gIsOneTransferInProgressInThisThread = false;
        const strError = owaspUtils.extractErrorMessage( err );
        optsTransfer.details.error( optsTransfer.strLogPrefix,
            "Transfer loop step failed with error: ", log.em( strError ),
            " in ", threadInfo.threadDescription(), ", stack is: ", "\n", log.s( err.stack ) );
        if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo ) {
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, true );
        }
        optsTransfer.details.close();
        return false;
    }
}

export async function doAllS2S( // s-chain --> s-chain
    joRuntimeOpts,
    imaState,
    skaleObserver,
    ethersProviderDst,
    joMessageProxyDst,
    joAccountDst,
    chainNameDst,
    chainIdDst,
    joTokenManagerSChain, // for logs validation on s-chain
    nTransactionsCountInBlock,
    nTransferSteps,
    nMaxTransactionsCount,
    nBlockAwaitDepth,
    nBlockAge,
    fnSignMessages,
    transactionCustomizerDst
) {
    let cntOK = 0, cntFail = 0, nIndexS2S = 0;
    const strDirection = "S2S";
    const arrSChainsCached = skaleObserver.getLastCachedSChains();
    const cntSChains = arrSChainsCached.length;
    log.information( "Have ", cntSChains,
        " S-Chain(s) connected to this S-Chain for performing S2S transfers in ",
        threadInfo.threadDescription(), "." );
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        const joSChain = arrSChainsCached[idxSChain];
        const urlSrc = skaleObserver.pickRandomSChainUrl( joSChain );
        const ethersProviderSrc = owaspUtils.getEthersProviderFromURL( urlSrc );
        const joAccountSrc = joAccountDst; // ???
        const chainNameSrc = "" + joSChain.data.name;
        const chainIdSrc = "" + joSChain.data.computed.chainId;
        log.information( "S2S transfer walk trough ", log.v( chainNameSrc ),
            "/", log.v( chainIdSrc ), " S-Chain in ",
            threadInfo.threadDescription(), "..." );
        let bOK = false;
        try {
            nIndexS2S = idxSChain;
            if( ! await pwa.checkOnLoopStart( imaState, "s2s", nIndexS2S ) ) {
                imaState.loopState.s2s.wasInProgress = false;
                log.notice( "Skipped(s2s) due to cancel mode reported from PWA in ",
                    threadInfo.threadDescription() );
            } else {
                if( loop.checkTimeFraming( null, "s2s", joRuntimeOpts ) ) {
                    // ??? assuming all S-Chains have same ABIs here
                    const joMessageProxySrc =
                        new owaspUtils.ethersMod.ethers.Contract(
                            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
                            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                            ethersProviderSrc
                        );
                    const joDepositBoxSrc =
                        new owaspUtils.ethersMod.ethers.Contract(
                            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
                            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                            ethersProviderSrc
                        );
                    const joExtraSignOpts = {
                        skaleObserver: skaleObserver,
                        chainNameSrc: chainNameSrc,
                        chainIdSrc: chainIdSrc,
                        chainNameDst: chainNameDst,
                        chainIdDst: chainIdDst,
                        joAccountSrc: joAccountSrc,
                        joAccountDst: joAccountDst,
                        ethersProviderSrc: ethersProviderSrc,
                        ethersProviderDst: ethersProviderDst
                    };
                    joRuntimeOpts.idxChainKnownForS2S = idxSChain;
                    joRuntimeOpts.cntChainsKnownForS2S = cntSChains;
                    joRuntimeOpts.joExtraSignOpts = joExtraSignOpts;

                    imaState.loopState.s2s.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "s2s", nIndexS2S );

                    bOK =
                    await doTransfer(
                        strDirection,
                        joRuntimeOpts,
                        ethersProviderSrc,
                        joMessageProxySrc,
                        joAccountSrc,
                        ethersProviderDst,
                        joMessageProxyDst,
                        joAccountDst,
                        chainNameSrc,
                        chainNameDst,
                        chainIdSrc,
                        chainIdDst,
                        joDepositBoxSrc, // for logs validation on mainnet or source S-Chain
                        joTokenManagerSChain, // for logs validation on s-chain
                        nTransactionsCountInBlock,
                        nTransferSteps,
                        nMaxTransactionsCount,
                        nBlockAwaitDepth,
                        nBlockAge,
                        fnSignMessages,
                        joExtraSignOpts,
                        transactionCustomizerDst
                    );
                    imaState.loopState.s2s.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "s2s", nIndexS2S );
                } else {
                    bOK = true;
                    const strLogPrefix = "S2S Loop: ";
                    log.notice( strLogPrefix, "Skipped(s2s) in ",
                        threadInfo.threadDescription(), " due to time framing check" );
                }
            }
        } catch ( err ) {
            bOK = false;
            const strError = owaspUtils.extractErrorMessage( err );
            log.error( "S2S step error from S-Chain ", log.v( chainNameSrc ),
                ", error is: ", log.em( strError ), " in ", threadInfo.threadDescription(),
                ", stack is: ", "\n", log.s( err.stack ) );
            imaState.loopState.s2s.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "s2s", nIndexS2S );
        }
        if( bOK )
            ++ cntOK;
        else
            ++ cntFail;
    }
    joRuntimeOpts.idxChainKnownForS2S = 0; // reset/clear
    joRuntimeOpts.cntChainsKnownForS2S = 0; // reset/clear
    if( "joExtraSignOpts" in joRuntimeOpts )
        delete joRuntimeOpts.joExtraSignOpts; // reset/clear
    if( cntOK > 0 || cntFail > 0 ) {
        let s = log.fmtDebug( "Stats for S2S steps in ", threadInfo.threadDescription(), ": " );
        if( cntOK > 0 ) {
            s += " " + log.v( cntOK ) + " " +
                log.fmtSuccess( "S-Chain(s) processed OKay" ) + log.fmtDebug( ", " );
        }
        if( cntFail > 0 ) {
            s += " " + log.v( cntFail ) + " " +
                log.fmtError( "S-Chain(s) failed" );
        }
        log.debug( s );
    }
    return ( cntFail == 0 ) ? true : false;
}
