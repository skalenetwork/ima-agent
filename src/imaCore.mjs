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
import * as owaspUtils from "./owaspUtils.mjs";
import * as loop from "./loop.mjs";
import * as pwa from "./pwa.mjs";
import * as state from "./state.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";
import * as imaEventLogScan from "./imaEventLogScan.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as skaleObserver from "./observer.mjs";
import * as threadInfo from "./threadInfo.mjs";

log.enableColorization( false );
log.addStdout();

const perMessageGasForTransfer = 1000000;
const additionalS2MTransferOverhead = 200000;

async function findOutReferenceLogRecord(
    details, strLogPrefix, ethersProvider, joMessageProxy,
    bnBlockId, nMessageNumberToFind, isVerbose
) {
    const bnMessageNumberToFind = owaspUtils.toBN( nMessageNumberToFind.toString() );
    const strEventName = "PreviousMessageReference";
    const arrLogRecords = await imaEventLogScan.safeGetPastEventsProgressive(
        details, strLogPrefix, ethersProvider, 10, joMessageProxy, strEventName,
        bnBlockId, bnBlockId, joMessageProxy.filters[strEventName]() );
    const cntLogRecord = arrLogRecords.length;
    if( isVerbose ) {
        details.debug( "{p}Got {} log record(s) ({}) with data: {}",
            strLogPrefix, cntLogRecord, strEventName, arrLogRecords );
    }
    for( let idxLogRecord = 0; idxLogRecord < cntLogRecord; ++ idxLogRecord ) {
        const joEvent = arrLogRecords[idxLogRecord];
        const ev = {
            "currentMessage": joEvent.args[0],
            "previousOutgoingMessageBlockId": joEvent.args[1]
        };
        const joReferenceLogRecord = {
            "currentMessage": ev.currentMessage,
            "previousOutgoingMessageBlockId": ev.previousOutgoingMessageBlockId,
            "currentBlockId": bnBlockId
        };
        const bnCurrentMessage =
            owaspUtils.toBN( joReferenceLogRecord.currentMessage.toString() );
        if( bnCurrentMessage.eq( bnMessageNumberToFind ) ) {
            if( isVerbose ) {
                details.success( "{p}Found {} log record {} for message {}",
                    strLogPrefix, strEventName, joReferenceLogRecord, nMessageNumberToFind );
            }
            return joReferenceLogRecord;
        }
    }
    if( isVerbose ) {
        details.error( "{p}Failed to find {} log record for message {}", strLogPrefix,
            strEventName, nMessageNumberToFind );
    }
    return null;
}

async function findOutAllReferenceLogRecords(
    details, strLogPrefix, ethersProvider, joMessageProxy,
    bnBlockId, nIncMsgCnt, nOutMsgCnt, isVerbose
) {
    if( isVerbose ) {
        details.debug(
            "{p}Optimized IMA message search algorithm will start at block {}" +
            ", will search for outgoing message counter {} and approach down to incoming " +
            "message counter {}", strLogPrefix, bnBlockId.toString(),
            nOutMsgCnt.toString(), nIncMsgCnt.toString() );
    }
    const arrLogRecordReferences = [];
    const cntExpected = nOutMsgCnt - nIncMsgCnt;
    if( cntExpected <= 0 ) {
        if( isVerbose ) {
            details.success( "{p}Optimized IMA message search algorithm success, " +
                "nothing to search, result is empty", strLogPrefix );
        }
        return arrLogRecordReferences; // nothing to search
    }
    let nWalkMsgNumber = nOutMsgCnt - 1;
    let nWalkBlockId = bnBlockId;
    for( ; nWalkMsgNumber >= nIncMsgCnt; -- nWalkMsgNumber ) {
        const joReferenceLogRecord = await findOutReferenceLogRecord( details, strLogPrefix,
            ethersProvider, joMessageProxy, nWalkBlockId, nWalkMsgNumber, isVerbose );
        if( joReferenceLogRecord == null )
            break;
        nWalkBlockId = owaspUtils.toBN( joReferenceLogRecord.previousOutgoingMessageBlockId );
        arrLogRecordReferences.unshift( joReferenceLogRecord );
    }
    const cntFound = arrLogRecordReferences.length;
    if( cntFound != cntExpected ) {
        if( isVerbose ) {
            details.error(
                "{p}Optimized IMA message search algorithm fail, found {} log " +
                "record(s), expected {} log record(s), found records are: {}",
                strLogPrefix, cntFound, cntExpected, arrLogRecordReferences );
        }
    } else {
        if( isVerbose ) {
            details.success( "{p}Optimized IMA message search algorithm success, found all {}" +
                " log record(s): {}", strLogPrefix, cntFound, arrLogRecordReferences );
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
    optsTransfer.details.debug( "{p}SRC MessageProxy address is.....{}",
        optsTransfer.strLogPrefixShort,optsTransfer.joMessageProxySrc.address );
    optsTransfer.details.debug( "{p}DST MessageProxy address is.....",
        optsTransfer.strLogPrefixShort, optsTransfer.joMessageProxyDst.address );
    optsTransfer.strActionName = "src-chain.MessageProxy.getOutgoingMessagesCounter()";
    try {
        optsTransfer.details.debug( "{p}Will call {bright}...",
            optsTransfer.strLogPrefix, optsTransfer.strActionName );
        nPossibleIntegerValue =
            await optsTransfer.joMessageProxySrc.callStatic.getOutgoingMessagesCounter(
                optsTransfer.chainNameDst,
                { from: optsTransfer.joAccountSrc.address() } );
        if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
            throw new Error( `DST chain ${optsTransfer.chainNameDst} returned outgoing ` +
                `message counter ${nPossibleIntegerValue} which is not a valid integer` );
        }
        optsTransfer.nOutMsgCnt = owaspUtils.toInteger( nPossibleIntegerValue );
        optsTransfer.details.information( "{p}Result of {bright} call: {}",
            optsTransfer.strLogPrefix, optsTransfer.strActionName, optsTransfer.nOutMsgCnt );
    } catch ( err ) {
        optsTransfer.details.critical(
            "(IMMEDIATE) error caught during {bright}, error details: {err}, stack is:\n{stack}",
            optsTransfer.strActionName, err, err.stack );
    }

    optsTransfer.strActionName = "dst-chain.MessageProxy.getIncomingMessagesCounter()";
    optsTransfer.details.debug( "{p}Will call {bright}...",
        optsTransfer.strLogPrefix, optsTransfer.strActionName );
    nPossibleIntegerValue =
        await optsTransfer.joMessageProxyDst.callStatic.getIncomingMessagesCounter(
            optsTransfer.chainNameSrc, { from: optsTransfer.joAccountDst.address() } );
    if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
        throw new Error( `SRC chain ${optsTransfer.chainNameSrc} returned incoming message ` +
            `counter ${nPossibleIntegerValue} which is not a valid integer` );
    }
    optsTransfer.nIncMsgCnt = owaspUtils.toInteger( nPossibleIntegerValue );
    optsTransfer.details.debug( "{p}Result of {bright} call: {}",
        optsTransfer.strLogPrefix, optsTransfer.strActionName, optsTransfer.nIncMsgCnt );
    optsTransfer.strActionName = "src-chain.MessageProxy.getIncomingMessagesCounter()";
    nPossibleIntegerValue =
        await optsTransfer.joMessageProxySrc.callStatic.getIncomingMessagesCounter(
            optsTransfer.chainNameDst, { from: optsTransfer.joAccountSrc.address() } );
    if( !owaspUtils.validateInteger( nPossibleIntegerValue ) ) {
        throw new Error( `DST chain ${optsTransfer.chainNameDst} returned incoming ` +
            `message counter ${nPossibleIntegerValue} + which is not a valid integer` );
    }
    const idxLastToPopNotIncluding = owaspUtils.toInteger( nPossibleIntegerValue );
    optsTransfer.details.debug( "{p}Result of {bright} call: {}",
        optsTransfer.strLogPrefix, optsTransfer.strActionName, idxLastToPopNotIncluding );
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
            if( bnBlockId ) {
                optsTransfer.strActionName =
                    "in-getOutgoingMessagesCounter()--findOutAllReferenceLogRecords()";
                optsTransfer.arrLogRecordReferences =
                    await findOutAllReferenceLogRecords( optsTransfer.details,
                        optsTransfer.strLogPrefixShort, optsTransfer.ethersProviderSrc,
                        optsTransfer.joMessageProxySrc, bnBlockId, optsTransfer.nIncMsgCnt,
                        optsTransfer.nOutMsgCnt, true );
                return true; // success, finish at this point
            }
        } catch ( err ) {
            optsTransfer.arrLogRecordReferences = [];
            optsTransfer.details.error(
                "{p}Optimized log search is off. Running old IMA smart contracts? " +
                "Please upgrade, if possible. Error is: {err}, stack is:\n{stack}",
                optsTransfer.strLogPrefix, err, err.stack );
        }
    } catch ( err ) {
        optsTransfer.arrLogRecordReferences = [];
        optsTransfer.details.error( "{p}Optimized log search is un-available.",
            optsTransfer.strLogPrefix );
    }
    // second, use classic raw events search
    optsTransfer.strActionName = "in-getOutgoingMessagesCounter()--classic-records-scanner";
    const attempts = 10;
    const strEventName = "OutgoingMessage";
    const nBlockFrom = 0;
    const nBlockTo = "latest";
    for( let nWalkMsgNumber = optsTransfer.nIncMsgCnt;
        nWalkMsgNumber < optsTransfer.nOutMsgCnt;
        ++ nWalkMsgNumber
    ) {
        const joFilter = optsTransfer.joMessageProxySrc.filters[strEventName](
            owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst ),
            owaspUtils.toBN( nWalkMsgNumber ) );
        const arrLogRecordReferencesWalk =
            await imaEventLogScan.safeGetPastEventsProgressive( optsTransfer.details,
                optsTransfer.strLogPrefixShort, optsTransfer.ethersProviderSrc, attempts,
                optsTransfer.joMessageProxySrc, strEventName, nBlockFrom, nBlockTo, joFilter );
        optsTransfer.arrLogRecordReferences =
            optsTransfer.arrLogRecordReferences.concat( arrLogRecordReferencesWalk );
    }

    return true;
}

async function analyzeGatheredRecords( optsTransfer, r ) {
    let joValues = "";
    const strChainHashWeAreLookingFor =
        owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst );
    optsTransfer.details.debug(
        "{p}Will review {} found event records(in reverse order, newest to oldest) while looking " +
        "for hash {} of destination chain {}", optsTransfer.strLogPrefix, r.length,
        strChainHashWeAreLookingFor, optsTransfer.chainNameDst );
    for( let i = r.length - 1; i >= 0; i-- ) {
        const joEvent = r[i];
        optsTransfer.details.debug( "{p}Will review found event record {} with data {}",
            optsTransfer.strLogPrefix, i, joEvent );
        const ev = {
            "dstChainHash": joEvent.args[0],
            "msgCounter": joEvent.args[1],
            "srcContract": joEvent.args[2],
            "dstContract": joEvent.args[3],
            "data": joEvent.args[4]
        };
        if( ev.dstChainHash == strChainHashWeAreLookingFor ) {
            joValues = ev;
            joValues.savedBlockNumberForOptimizations = r[i].blockNumber;
            optsTransfer.details.success(
                "{p}Found event record {} reviewed and accepted for processing, found event " +
                "values are {}, found block number is {}", optsTransfer.strLogPrefix, i, joValues,
                joValues.savedBlockNumberForOptimizations );
            break;
        } else {
            optsTransfer.details.debug( "{p}Found event record {} reviewed and skipped",
                optsTransfer.strLogPrefix, i );
        }
    }
    if( joValues == "" ) {
        optsTransfer.details.critical( "{p}Can't get events from MessageProxy",
            optsTransfer.strLogPrefix );
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
            if( joReferenceLogRecord && "currentBlockId" in joReferenceLogRecord &&
                joReferenceLogRecord.currentBlockId ) {
                nBlockFrom = joReferenceLogRecord.currentBlockId;
                nBlockTo = joReferenceLogRecord.currentBlockId;
            }
        }
        optsTransfer.strActionName = "src-chain->MessageProxy->scan-past-events()";
        const strEventName = "OutgoingMessage";
        optsTransfer.details.debug( "{p}Will call {bright} for {} event...",
            optsTransfer.strLogPrefix, optsTransfer.strActionName, strEventName );
        r = await imaEventLogScan.safeGetPastEventsProgressive( optsTransfer.details,
            optsTransfer.strLogPrefixShort, optsTransfer.ethersProviderSrc, 10,
            optsTransfer.joMessageProxySrc, strEventName, nBlockFrom, nBlockTo,
            optsTransfer.joMessageProxySrc.filters[strEventName](
                owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst ),
                owaspUtils.toBN( optsTransfer.nIdxCurrentMsg ) ) );
        const joValues = await analyzeGatheredRecords( optsTransfer, r );
        if( joValues == null )
            return false;
        if( optsTransfer.nBlockAwaitDepth > 0 ) {
            let bSecurityCheckPassed = true;
            const strActionNameOld = "" + optsTransfer.strActionName;
            optsTransfer.strActionName = "security check: evaluate block depth";
            try {
                const transactionHash = r[0].transactionHash;
                optsTransfer.details.debug( "{p}Event transactionHash is {}",
                    optsTransfer.strLogPrefix, transactionHash );
                const blockNumber = r[0].blockNumber;
                optsTransfer.details.debug( "{p}Event blockNumber is {}",
                    optsTransfer.strLogPrefix, blockNumber );
                const nLatestBlockNumber = await imaHelperAPIs.safeGetBlockNumber(
                    optsTransfer.details, 10, optsTransfer.ethersProviderSrc );
                optsTransfer.details.debug( "{p}Latest blockNumber is {}",
                    optsTransfer.strLogPrefix, nLatestBlockNumber );
                const nDist = nLatestBlockNumber - blockNumber;
                if( nDist < optsTransfer.nBlockAwaitDepth )
                    bSecurityCheckPassed = false;
                optsTransfer.details.debug( "{p}Distance by blockNumber is {}, await check is {}",
                    optsTransfer.strLogPrefix, nDist,
                    log.posNeg( bSecurityCheckPassed, "PASSED", "FAILED" ) );
            } catch ( err ) {
                bSecurityCheckPassed = false;
                optsTransfer.details.critical(
                    "{p}Exception(evaluate block depth) while getting transaction hash and " +
                    "block number during {bright}: {err}, stack is:\n{stack}",
                    optsTransfer.strLogPrefix, optsTransfer.strActionName, err, err.stack );
                optsTransfer.details.exposeDetailsTo(
                    log, optsTransfer.strGatheredDetailsName, false );
                imaTransferErrorHandling.saveTransferError(
                    optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
                optsTransfer.details.close();
                return false;
            }
            optsTransfer.strActionName = "" + strActionNameOld;
            if( !bSecurityCheckPassed ) {
                optsTransfer.details.warning( "{p}Block depth check was not passed, canceling " +
                    "search for transfer events", optsTransfer.strLogPrefix );
                break;
            }
        }
        if( optsTransfer.nBlockAge > 0 ) {
            let bSecurityCheckPassed = true;
            const strActionNameOld = "" + optsTransfer.strActionName;
            optsTransfer.strActionName = "security check: evaluate block age";
            try {
                const transactionHash = r[0].transactionHash;
                optsTransfer.details.debug( "{p}Event transactionHash is {}",
                    optsTransfer.strLogPrefix, transactionHash );
                const blockNumber = r[0].blockNumber;
                optsTransfer.details.debug( "{p}Event blockNumber is {}",
                    optsTransfer.strLogPrefix, blockNumber );
                const joBlock = await optsTransfer.ethersProviderSrc.getBlock( blockNumber );
                if( !owaspUtils.validateInteger( joBlock.timestamp ) ) {
                    throw new Error( "Block timestamp is not a valid " +
                        `integer value: ${joBlock.timestamp}` );
                }
                const timestampBlock = owaspUtils.toInteger( joBlock.timestamp );
                optsTransfer.details.debug( "{p}Block   TS is {}",
                    optsTransfer.strLogPrefix, timestampBlock );
                const timestampCurrent = imaHelperAPIs.currentTimestamp();
                optsTransfer.details.debug( "{p}Current TS is {}",
                    optsTransfer.strLogPrefix, timestampCurrent );
                const tsDiff = timestampCurrent - timestampBlock;
                optsTransfer.details.debug( "{p}Diff    TS is {}",
                    optsTransfer.strLogPrefix, tsDiff );
                optsTransfer.details.debug( "{p}Expected diff {}",
                    optsTransfer.strLogPrefix, optsTransfer.nBlockAge );
                if( tsDiff < optsTransfer.nBlockAge )
                    bSecurityCheckPassed = false;
                optsTransfer.details.debug( "{p}Block age check is {}",
                    optsTransfer.strLogPrefix,
                    log.posNeg( bSecurityCheckPassed, "PASSED", "FAILED" ) );
            } catch ( err ) {
                bSecurityCheckPassed = false;
                optsTransfer.details.critical(
                    "{p}Exception(evaluate block age) while getting block number and timestamp " +
                    "during {bright}: {err}, stack is:\n{stack}", optsTransfer.strLogPrefix,
                    optsTransfer.strActionName, err, err.stack );
                optsTransfer.details.exposeDetailsTo(
                    log, optsTransfer.strGatheredDetailsName, false );
                imaTransferErrorHandling.saveTransferError(
                    optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
                optsTransfer.details.close();
                return false;
            }
            optsTransfer.strActionName = "" + strActionNameOld;
            if( !bSecurityCheckPassed ) {
                optsTransfer.details.warning( "{p}Block age check was not passed, " +
                    "canceling search for transfer events", optsTransfer.strLogPrefix );
                break;
            }
        }
        optsTransfer.details.success(
            "{p}Got event details from getPastEvents() event invoked with msgCounter set to {} " +
            "and dstChain set to {}, event description: ", optsTransfer.strLogPrefix,
            optsTransfer.nIdxCurrentMsg, optsTransfer.chainNameDst, joValues );
        optsTransfer.details.debug( "{p}Will process message counter value {}",
            optsTransfer.strLogPrefix, optsTransfer.nIdxCurrentMsg );
        optsTransfer.arrMessageCounters.push( optsTransfer.nIdxCurrentMsg );
        const joMessage = {
            "sender": joValues.srcContract,
            "destinationContract": joValues.dstContract,
            "to": joValues.to,
            "amount": joValues.amount,
            "data": joValues.data,
            "savedBlockNumberForOptimizations": joValues.savedBlockNumberForOptimizations
        };
        optsTransfer.jarrMessages.push( joMessage );
    }
}

async function preCheckAllMessagesSign( optsTransfer, err, jarrMessages, joGlueResult ) {
    const strDidInvokedSigningCallbackMessage = log.fmtDebug(
        "{p}Did invoked message signing callback, first real message index is: {}, have {} " +
        "message(s) to process {}", optsTransfer.strLogPrefix,
        optsTransfer.nIdxCurrentMsgBlockStart, optsTransfer.jarrMessages.length,
        optsTransfer.jarrMessages );
    optsTransfer.details.debug( strDidInvokedSigningCallbackMessage );
    if( err ) {
        optsTransfer.bErrorInSigningMessages = true;
        optsTransfer.details.critical( "{p}Error signing messages: {err}",
            optsTransfer.strLogPrefix, err );
        imaTransferErrorHandling.saveTransferError(
            optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
        return false;
    }
    if( ! loop.checkTimeFraming( null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts ) ) {
        optsTransfer.details.warning( "{p}Time framing overflow (after signing messages)",
            optsTransfer.strLogPrefix );
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
    const strWillCallPostIncomingMessagesAction = log.fmtDebug(
        "{p}Will call {bright} for block size set to {}, message counters = are {}...",
        optsTransfer.strLogPrefix, optsTransfer.strActionName,
        nBlockSize, optsTransfer.arrMessageCounters );
    optsTransfer.details.debug( strWillCallPostIncomingMessagesAction );
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
    optsTransfer.details.debug( "{p}....debug args for msgCounter set to {}: {}",
        optsTransfer.strLogPrefix, optsTransfer.nIdxCurrentMsgBlockStart, joDebugArgs );
    optsTransfer.strActionName = optsTransfer.strDirection + " - Post incoming messages";
    const weiHowMuchPostIncomingMessages = undefined;
    const gasPrice =
        await optsTransfer.transactionCustomizerDst.computeGasPrice(
            optsTransfer.ethersProviderDst, 200000000000 );
    optsTransfer.details.debug( "{p}Using computed gasPrice {}={}",
        optsTransfer.strLogPrefix, gasPrice );
    let estimatedGasPostIncomingMessages =
        await optsTransfer.transactionCustomizerDst.computeGas(
            optsTransfer.details, optsTransfer.ethersProviderDst,
            "MessageProxy", optsTransfer.joMessageProxyDst,
            "postIncomingMessages", arrArgumentsPostIncomingMessages,
            optsTransfer.joAccountDst, optsTransfer.strActionName,
            gasPrice, 10000000, weiHowMuchPostIncomingMessages, null );
    optsTransfer.details.debug( "{p}Using estimated gas={}",
        optsTransfer.strLogPrefix, estimatedGasPostIncomingMessages );
    if( optsTransfer.strDirection == "S2M" ) {
        const expectedGasLimit = perMessageGasForTransfer * optsTransfer.jarrMessages.length +
            additionalS2MTransferOverhead;
        estimatedGasPostIncomingMessages =
            Math.max( estimatedGasPostIncomingMessages, expectedGasLimit );
    }
    const isIgnorePostIncomingMessages = false;
    const strErrorOfDryRun = await imaTx.dryRunCall(
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
    const joReceipt = await imaTx.payedCall(
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
    optsTransfer.details.information( "{p}Validating transfer from {} to {}...",
        optsTransfer.strLogPrefix, optsTransfer.chainNameSrc, optsTransfer.chainNameDst );
    // check DepositBox -> Error on Mainnet only
    if( optsTransfer.chainNameDst == "Mainnet" ) {
        optsTransfer.details.debug( "{p}Validating transfer to Main Net via MessageProxy error " +
            "absence on Main Net...", optsTransfer.strLogPrefix );
        if( optsTransfer.joDepositBoxMainNet ) {
            if( joReceipt && "blockNumber" in joReceipt &&
                "transactionHash" in joReceipt ) {
                const strEventName = "PostMessageError";
                optsTransfer.details.debug(
                    "{p}Verifying the {} event of the MessageProxy/{} contract...",
                    optsTransfer.strLogPrefix, strEventName,
                    optsTransfer.joMessageProxyDst.address );
                const joEvents = await imaEventLogScan.getContractCallEvents(
                    optsTransfer.details, optsTransfer.strLogPrefixShort,
                    optsTransfer.ethersProviderDst, optsTransfer.joMessageProxyDst, strEventName,
                    joReceipt.blockNumber, joReceipt.transactionHash,
                    optsTransfer.joMessageProxyDst.filters[strEventName]() );
                if( joEvents.length == 0 ) {
                    optsTransfer.details.success(
                        "{p}Success, verified the {} event of the MessageProxy/{} contract, " +
                        "no events found", optsTransfer.strLogPrefix, strEventName,
                        optsTransfer.joMessageProxyDst.address );
                } else {
                    optsTransfer.details.critical(
                        "{p}Failed verification of the PostMessageError event of the " +
                        "MessageProxy/{} contract, found event(s): {}", optsTransfer.strLogPrefix,
                        optsTransfer.joMessageProxyDst.address, joEvents );
                    imaTransferErrorHandling.saveTransferError(
                        optsTransfer.strTransferErrorCategoryName,
                        optsTransfer.details.toString() );
                    throw new Error( "Verification failed for the PostMessageError event " +
                            `of the MessageProxy ${optsTransfer.joMessageProxyDst.address}  ` +
                            "contract, error events found" );
                }
                optsTransfer.details.success( "{p}Done, validated transfer to Main Net via " +
                    "MessageProxy error absence on Main Net", optsTransfer.strLogPrefix );
            } else {
                optsTransfer.details.warning( "{p}Cannot validate transfer to Main Net via " +
                    "MessageProxy error absence on Main Net, no valid transaction receipt provided",
                optsTransfer.strLogPrefix );
            }
        } else {
            optsTransfer.details.warning( "{p}Cannot validate transfer to Main Net via " +
                "MessageProxy error absence on Main Net, no MessageProxy provided",
            optsTransfer.strLogPrefix );
        }
    }
}

async function handleAllMessagesSigning( optsTransfer ) {
    try {
        let errFinal = null;
        await optsTransfer.fnSignMessages( optsTransfer.nTransferLoopCounter,
            optsTransfer.jarrMessages, optsTransfer.nIdxCurrentMsgBlockStart,
            optsTransfer.chainNameSrc, optsTransfer.joExtraSignOpts,
            async function( err, jarrMessages, joGlueResult ) {
                await callbackAllMessagesSign( optsTransfer, err, jarrMessages, joGlueResult );
                return;
            } ).catch( function( err ) {
            // callback fn as argument of optsTransfer.fnSignMessages
            optsTransfer.bErrorInSigningMessages = true;
            optsTransfer.details.error( "{p}Problem in transfer handler(in signer): {err}",
                optsTransfer.strLogPrefix, err );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
            errFinal = err;
        } );
        if( errFinal )
            throw errFinal;
        return true;
    } catch ( err ) {
        optsTransfer.details.error( "{p}Problem in transfer handler(general): {err}",
            optsTransfer.strLogPrefix, err );
        imaTransferErrorHandling.saveTransferError( optsTransfer.strTransferErrorCategoryName,
            optsTransfer.details.toString() );
        return false;
    }
}

async function checkOutgoingMessageEventInOneNode( optsTransfer, optsOutgoingMessageAnalysis ) {
    const sc = optsTransfer.imaState.chainProperties.sc;
    const strUrlHttp = optsOutgoingMessageAnalysis.joNode.endpoints.ip.http;
    optsTransfer.details.trace(
        "{p}Validating {bright} message {} on node {} using URL {url}...",
        optsTransfer.strLogPrefix, optsTransfer.strDirection,
        optsOutgoingMessageAnalysis.idxMessage + 1,
        optsOutgoingMessageAnalysis.joNode.name, strUrlHttp );
    const joMessage = optsOutgoingMessageAnalysis.joMessage;
    let bEventIsFound = false;
    try {
        const ethersProviderNode = owaspUtils.getEthersProviderFromURL( strUrlHttp );
        const joMessageProxyNode = new owaspUtils.ethersMod.ethers.Contract(
            sc.joAbiIMA.message_proxy_chain_address,
            sc.joAbiIMA.message_proxy_chain_abi,
            ethersProviderNode );
        const strEventName = "OutgoingMessage";
        const node_r = await imaEventLogScan.safeGetPastEventsProgressive(
            optsTransfer.details, optsTransfer.strLogPrefixShort, ethersProviderNode,
            10, joMessageProxyNode, strEventName,
            joMessage.savedBlockNumberForOptimizations,
            joMessage.savedBlockNumberForOptimizations,
            joMessageProxyNode.filters[strEventName](
                owaspUtils.ethersMod.ethers.utils.id( optsTransfer.chainNameDst ),
                owaspUtils.toBN( optsOutgoingMessageAnalysis.idxImaMessage ) ) );
        const cntEvents = node_r.length;
        optsTransfer.details.trace(
            "{p}Got {} event(s) ({}) on node {} with data: {}",
            optsTransfer.strLogPrefix, cntEvents, strEventName,
            optsOutgoingMessageAnalysis.joNode.name, node_r );
        for( let idxEvent = 0; idxEvent < cntEvents; ++ idxEvent ) {
            const joEvent = node_r[idxEvent];
            const eventValuesByName = {
                "dstChainHash": joEvent.args[0],
                "msgCounter": joEvent.args[1],
                "srcContract": joEvent.args[2],
                "dstContract": joEvent.args[3],
                "data": joEvent.args[4]
            };
            if( owaspUtils.ensureStartsWith0x( joMessage.sender ).toLowerCase() ==
                    owaspUtils.ensureStartsWith0x( eventValuesByName.srcContract ).toLowerCase() &&
                owaspUtils.ensureStartsWith0x( joMessage.destinationContract ).toLowerCase() ==
                    owaspUtils.ensureStartsWith0x( eventValuesByName.dstContract ).toLowerCase()
            ) {
                bEventIsFound = true;
                break;
            }
        }
    } catch ( err ) {
        ++ optsOutgoingMessageAnalysis.cntFailedNodes;
        optsTransfer.details.error(
            "{p}{bright} message analysis error: Failed to scan events on node {}, " +
            "detailed node description is: {}, error is: {err}, stack is: ",
            optsTransfer.strLogPrefix, optsTransfer.strDirection,
            optsOutgoingMessageAnalysis.joNode.name, optsOutgoingMessageAnalysis.joNode,
            err, err.stack );
        return true; // continue nodes analysis
    }
    if( bEventIsFound ) {
        ++ optsOutgoingMessageAnalysis.cntPassedNodes;
        optsTransfer.details.success(
            "{p}{bright} message {} validation on node {} using URL {url} is passed",
            optsTransfer.strLogPrefix, optsTransfer.strDirection,
            optsOutgoingMessageAnalysis.idxMessage + 1,
            optsOutgoingMessageAnalysis.joNode.name, strUrlHttp );
    } else {
        ++ optsOutgoingMessageAnalysis.cntFailedNodes;
        optsTransfer.details.error(
            "{p}{bright} message {} validation on node {} using URL {url} is failed",
            optsTransfer.strLogPrefix, optsTransfer.strDirection,
            optsOutgoingMessageAnalysis.idxMessage + 1,
            optsOutgoingMessageAnalysis.joNode.name, strUrlHttp );
    }
    if( optsOutgoingMessageAnalysis.cntFailedNodes > optsTransfer.cntNodesMayFail )
        return false;
    if( optsOutgoingMessageAnalysis.cntPassedNodes >= optsTransfer.cntNodesShouldPass ) {
        optsTransfer.details.information(
            "{p}{bright} message {} validation on node {} using URL {url} is passed",
            optsTransfer.strLogPrefix, optsTransfer.strDirection,
            optsOutgoingMessageAnalysis.idxMessage + 1,
            optsOutgoingMessageAnalysis.joNode.name, strUrlHttp );
        return false;
    }
    return true;
}

async function checkOutgoingMessageEvent( optsTransfer, joSChain ) {
    const cntNodes = joSChain.nodes.length;
    const cntMessages = optsTransfer.jarrMessages.length;
    for( let idxMessage = 0; idxMessage < cntMessages; ++ idxMessage ) {
        const idxImaMessage = optsTransfer.arrMessageCounters[idxMessage];
        const joMessage = optsTransfer.jarrMessages[idxMessage];
        optsTransfer.details.trace(
            "{p}{bright} message analysis for message {} of {} with IMA message index {} and " +
            "message envelope data: {}", optsTransfer.strLogPrefix, optsTransfer.strDirection,
            idxMessage + 1, cntMessages, idxImaMessage, joMessage );
        const optsOutgoingMessageAnalysis = {
            idxMessage: idxMessage,
            idxImaMessage: idxImaMessage,
            joMessage: joMessage,
            joNode: null,
            idxNode: 0,
            cntNodes: cntNodes,
            cntPassedNodes: 0,
            cntFailedNodes: 0
        };
        try {
            for( optsOutgoingMessageAnalysis.idxNode = 0;
                optsOutgoingMessageAnalysis.idxNode < cntNodes;
                ++ optsOutgoingMessageAnalysis.idxNode
            ) {
                optsOutgoingMessageAnalysis.joNode = joSChain.nodes[
                    optsOutgoingMessageAnalysis.idxNode];
                const isContinueNodesAnalysis = await checkOutgoingMessageEventInOneNode(
                    optsTransfer, optsOutgoingMessageAnalysis );
                if( ! isContinueNodesAnalysis )
                    break;
            }
        } catch ( err ) {
            const strUrlHttp = optsOutgoingMessageAnalysis.joNode
                ? optsOutgoingMessageAnalysis.joNode.endpoints.ip.http : "";
            const strNodeName = optsOutgoingMessageAnalysis.joNode
                ? log.fmtInformation( optsOutgoingMessageAnalysis.joNode.name )
                : log.fmtError( "<<unknown node name>>" );
            optsTransfer.details.critical(
                "{p}{bright} message analysis error: Failed to process events for {} message {} " +
                "on node {} using URL {}, error is: {err}, stack is:\n{stack}",
                optsTransfer.strLogPrefix, optsTransfer.strDirection, optsTransfer.strDirection,
                idxMessage + 1, strNodeName,
                log.posNeg( optsOutgoingMessageAnalysis.joNode,
                    log.u( strUrlHttp ), "<<unknown node endpoint>>" ),
                err, err.stack );
        }
        if( optsOutgoingMessageAnalysis.cntFailedNodes > optsTransfer.cntNodesMayFail ) {
            optsTransfer.details.critical(
                "{p}Error validating {bright} messages, failed node count {} is greater then " +
                "allowed to fail {}", optsTransfer.strLogPrefix, optsTransfer.strDirection,
                optsOutgoingMessageAnalysis.cntFailedNodes, optsTransfer.cntNodesMayFail );
            optsTransfer.details.exposeDetailsTo(
                log, optsTransfer.strGatheredDetailsName, false );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName,
                optsTransfer.details.toString() );
            optsTransfer.details.close();
            return false;
        }
        if( ! ( optsOutgoingMessageAnalysis.cntPassedNodes >= optsTransfer.cntNodesShouldPass ) ) {
            optsTransfer.details.critical(
                "{p}Error validating {bright} messages, passed node count {} is less then " +
                "needed count {}", optsTransfer.strLogPrefix, optsTransfer.strDirection,
                optsOutgoingMessageAnalysis.cntFailedNodes, optsTransfer.cntNodesShouldPass );
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
            optsTransfer.details.warning( "{p}Transfer step count overflow",
                optsTransfer.strLogPrefix );
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        optsTransfer.details.trace(
            "{p}Entering block former iteration with message counter set to {}, transfer step " +
            "number is {}, can transfer up to {} message(s) per step, can perform up to {} " +
            "transfer step(s)", optsTransfer.strLogPrefix, optsTransfer.nIdxCurrentMsg,
            optsTransfer.nStepsDone, optsTransfer.nMaxTransactionsCount,
            optsTransfer.nTransferSteps );
        if( ! loop.checkTimeFraming(
            null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts ) ) {
            optsTransfer.details.warning( "{p}WARNING: Time framing overflow" +
                "(after entering block former iteration loop)", optsTransfer.strLogPrefix );
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        await gatherMessages( optsTransfer );
        if( optsTransfer.cntAccumulatedForBlock == 0 )
            break;
        if( ! loop.checkTimeFraming(
            null, optsTransfer.strDirection, optsTransfer.joRuntimeOpts ) ) {
            optsTransfer.details.warning( "{p}Time framing overflow" +
                "(after forming block of messages)", optsTransfer.strLogPrefix );
            optsTransfer.details.close();
            imaTransferErrorHandling.saveTransferSuccessAll();
            return false;
        }
        if( optsTransfer.strDirection == "S2S" ) {
            optsTransfer.strActionName = "S2S message analysis";
            if( ! optsTransfer.joExtraSignOpts ) {
                throw new Error( "Could not validate S2S messages, " +
                    "no extra options provided to transfer algorithm" );
            }
            const arrSChainsCached = skaleObserver.getLastCachedSChains();
            if( ( !arrSChainsCached ) || arrSChainsCached.length == 0 ) {
                throw new Error( "Could not validate S2S messages, " +
                    "no S-Chains in SKALE NETWORK observer cached yet, try again later" );
            }
            const idxSChain = skaleObserver.findSChainIndexInArrayByName(
                arrSChainsCached, optsTransfer.chainNameSrc );
            if( idxSChain < 0 ) {
                throw new Error( "Could not validate S2S messages, source " +
                    `S-Chain ${optsTransfer.chainNameSrc} is not in SKALE NETWORK observer ` +
                        `cache yet or it's not connected to this ${optsTransfer.chainNameDst} ` +
                        "S-Chain yet, try again later" );
            }
            const cntMessages = optsTransfer.jarrMessages.length;
            const joSChain = arrSChainsCached[idxSChain];
            const cntNodes = joSChain.nodes.length;
            optsTransfer.cntNodesShouldPass = Math.ceil( ( cntNodes * 2 ) / 3 );
            optsTransfer.cntNodesMayFail = cntNodes - optsTransfer.cntNodesShouldPass;
            optsTransfer.details.trace(
                "{p}{bright} message analysis will be performed on S-Chain {} with {} node(s), " +
                "{} node(s) should have same message(s), {} node(s) allowed to fail message(s) " +
                "comparison, {} message(s) to check...", optsTransfer.strLogPrefix,
                optsTransfer.strDirection, optsTransfer.chainNameSrc, cntNodes,
                optsTransfer.cntNodesShouldPass, optsTransfer.cntNodesMayFail, cntMessages );
            if( ! ( await checkOutgoingMessageEvent( optsTransfer, joSChain ) ) )
                return false;
        }

        optsTransfer.strActionName = "sign messages";
        const strWillInvokeSigningCallbackMessage = log.fmtDebug(
            "{p}Will invoke message signing callback, first real message index is: {}, have {} " +
            "message(s) to process {}", optsTransfer.strLogPrefix,
            optsTransfer.nIdxCurrentMsgBlockStart, optsTransfer.jarrMessages.length,
            optsTransfer.jarrMessages );
        optsTransfer.details.information( strWillInvokeSigningCallbackMessage );
        // will re-open optsTransfer.details B log here for next step,
        // it can be delayed so we will flush accumulated optsTransfer.details A now
        if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo )
            optsTransfer.details.exposeDetailsTo( log, optsTransfer.strGatheredDetailsName, true );

        optsTransfer.details.close();
        optsTransfer.details = optsTransfer.imaState.isDynamicLogInDoTransfer
            ? log : log.createMemoryStream( true );
        optsTransfer.strGatheredDetailsName = `${optsTransfer.strDirection}/#` +
            `${optsTransfer.nTransferLoopCounter}-doTransfer-B-${optsTransfer.chainNameSrc}` +
            `-->${optsTransfer.chainNameDst}`;
        try {
            if( ! ( await handleAllMessagesSigning( optsTransfer ) ) )
                return false;
        } catch ( err ) {
            optsTransfer.details.critical(
                "{p}Exception from signing messages function: {err}, stack is:\n{stack}",
                optsTransfer.strLogPrefix, err, err.stack );
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
    optsTransfer.strGatheredDetailsName =
        `${optsTransfer.strDirection}/#${optsTransfer.nTransferLoopCounter}-doTransfer-A-` +
        `${optsTransfer.chainNameSrc}-->${optsTransfer.chainNameDst}`;
    optsTransfer.details = optsTransfer.imaState.isDynamicLogInDoTransfer
        ? log : log.createMemoryStream( true );
    optsTransfer.strLogPrefixShort =
        `${optsTransfer.strDirection}/#${optsTransfer.nTransferLoopCounter} `;
    optsTransfer.strLogPrefix = `${optsTransfer.strLogPrefixShort}transfer loop from ` +
        `${optsTransfer.chainNameSrc} to ${optsTransfer.chainNameDst}: `;
    if( gIsOneTransferInProgressInThisThread ) {
        optsTransfer.details.warning( "{p}Transfer loop step is skipped because previous one " +
            "is still in progress", optsTransfer.strLogPrefix );
        if( log.exposeDetailsGet() && optsTransfer.details.exposeDetailsTo )
            optsTransfer.details.exposeDetailsTo( log, optsTransfer.strGatheredDetailsName, true );

        optsTransfer.details.close();
        return false;
    }
    try {
        gIsOneTransferInProgressInThisThread = true;
        optsTransfer.details.debug( "{p}Message signing is {oo}",
            optsTransfer.strLogPrefix, optsTransfer.imaState.bSignMessages );
        if( optsTransfer.fnSignMessages == null || optsTransfer.fnSignMessages == undefined ||
            ( ! optsTransfer.imaState.bSignMessages )
        ) {
            optsTransfer.details.debug( "{p}Using internal signing stub function",
                optsTransfer.strLogPrefix );
            optsTransfer.fnSignMessages = async function(
                nTransferLoopCounter, jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
                joExtraSignOpts, fnAfter
            ) {
                optsTransfer.details.debug(
                    "{p}Message signing callback was not provided to IMA, first real message " +
                    "index is: {}, have {} message(s) to process {}", optsTransfer.strLogPrefix,
                    nIdxCurrentMsgBlockStart, optsTransfer.jarrMessages.length,
                    optsTransfer.jarrMessages );
                await fnAfter( null, jarrMessages ); // null - no error, null - no signatures
            };
        } else {
            optsTransfer.details.debug( "{p}Using externally provided signing function",
                optsTransfer.strLogPrefix );
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
            optsTransfer.details.critical( "{p}Error in {} during {bright}: {err}, " +
                "stack is:\n{stack}", optsTransfer.strLogPrefix,
            optsTransfer.strGatheredDetailsName, optsTransfer.strActionName,err, err.stack );
            optsTransfer.details.exposeDetailsTo( log,
                optsTransfer.strGatheredDetailsName, false );
            imaTransferErrorHandling.saveTransferError(
                optsTransfer.strTransferErrorCategoryName, optsTransfer.details.toString() );
            optsTransfer.details.close();
            gIsOneTransferInProgressInThisThread = false;
            return false;
        }
        imaGasUsage.printGasUsageReportFromArray( "TRANSFER " + optsTransfer.chainNameSrc +
            " to " + optsTransfer.chainNameDst, optsTransfer.jarrReceipts, optsTransfer.details );
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
        optsTransfer.details.error(
            "{p}Transfer loop step failed with error: {err} in {}, stack is:\n{stack}",
            optsTransfer.strLogPrefix, err, threadInfo.threadDescription(), err.stack );
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
    const sc = imaState.chainProperties.sc;
    const strDirection = "S2S";
    const arrSChainsCached = skaleObserver.getLastCachedSChains();
    const cntSChains = arrSChainsCached.length;
    log.information( "Have {} S-Chain(s) connected to this S-Chain for performing " +
        "S2S transfers in {}.", cntSChains, threadInfo.threadDescription() );
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        const joSChain = arrSChainsCached[idxSChain];
        const urlSrc = skaleObserver.pickRandomSChainUrl( joSChain );
        const ethersProviderSrc = owaspUtils.getEthersProviderFromURL( urlSrc );
        const joAccountSrc = joAccountDst; // ???
        const chainNameSrc = "" + joSChain.name;
        const chainIdSrc = "" + skaleObserver.chainNameToChainId( joSChain.name );
        log.information( "S2S transfer walk trough {}/{} S-Chain in {}...",
            chainNameSrc, chainIdSrc, threadInfo.threadDescription() );
        let bOK = false;
        try {
            nIndexS2S = idxSChain;
            if( ! await pwa.checkOnLoopStart( imaState, "s2s", nIndexS2S ) ) {
                imaState.loopState.s2s.wasInProgress = false;
                log.notice( "Skipped(s2s) due to cancel mode reported from PWA in {}",
                    threadInfo.threadDescription() );
            } else {
                if( loop.checkTimeFraming( null, "s2s", joRuntimeOpts ) ) {
                    // ??? assuming all S-Chains have same ABIs here
                    const joMessageProxySrc = new owaspUtils.ethersMod.ethers.Contract(
                        sc.joAbiIMA.message_proxy_chain_address,
                        sc.joAbiIMA.message_proxy_chain_abi,
                        ethersProviderSrc );
                    const joDepositBoxSrc = new owaspUtils.ethersMod.ethers.Contract(
                        sc.joAbiIMA.message_proxy_chain_address,
                        sc.joAbiIMA.message_proxy_chain_abi,
                        ethersProviderSrc );
                    const joExtraSignOpts = {
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

                    bOK = await doTransfer(
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
                    log.notice( "Skipped(s2s) in {} due to time framing check",
                        strLogPrefix, threadInfo.threadDescription() );
                }
            }
        } catch ( err ) {
            bOK = false;
            log.error( "S2S step error from S-Chain {}, error is: {err} in {}, stack is:\n{stack}",
                chainNameSrc, err, threadInfo.threadDescription(), err.stack );
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
        let s = log.fmtDebug( "Stats for S2S steps in {}: ", threadInfo.threadDescription() );
        if( cntOK > 0 ) {
            s += " " + log.fmtInformation( "{p}", cntOK ) + " " +
                log.fmtSuccess( "S-Chain(s) processed OKay" ) + log.fmtDebug( ", " );
        }
        if( cntFail > 0 ) {
            s += " " + log.fmtInformation( "{p}", cntFail ) + " " +
                log.fmtError( "S-Chain(s) failed" );
        }
        log.debug( s );
    }
    return ( cntFail == 0 ) ? true : false;
}
