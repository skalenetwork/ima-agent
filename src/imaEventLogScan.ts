// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * SKALE IMA is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option)  any later version.
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
 * @file imaEventLogScan.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as rpcCall from "./rpcCall.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.js";
import { type TSameAsTransactionReceipt } from "./state.js";

export interface TProgressivePlanAtom {
    nBlockFrom: owaspUtils.ethersMod.BigNumber
    nBlockTo: owaspUtils.ethersMod.BigNumber | string // for "latest"
    type: string
}

export function createProgressiveEventsScanPlan(
    details: log.TLoggerBase, nLatestBlockNumber: owaspUtils.ethersMod.BigNumber
): TProgressivePlanAtom[] {
    // assume Main Net mines 6 blocks per minute
    const blocksInOneMinute = owaspUtils.toBN( 6 );
    const blocksInOneHour = blocksInOneMinute.mul( 60 );
    const blocksInOneDay = blocksInOneHour.mul( 24 );
    const blocksInOneWeek = blocksInOneDay.mul( 7 );
    const blocksInOneMonth = blocksInOneDay.mul( 31 );
    const blocksInOneYear = blocksInOneDay.mul( 366 );
    const blocksInThreeYears = blocksInOneYear.mul( 3 );
    const arrProgressiveEventsScanPlanA: TProgressivePlanAtom[] = [ {
        nBlockFrom:
            nLatestBlockNumber.sub( blocksInOneDay ),
        nBlockTo: "latest",
        type: "1 day"
    }, {
        nBlockFrom:
            nLatestBlockNumber.sub( blocksInOneWeek ),
        nBlockTo: "latest",
        type: "1 week"
    }, {
        nBlockFrom:
            nLatestBlockNumber.sub( blocksInOneMonth ),
        nBlockTo: "latest",
        type: "1 month"
    }, {
        nBlockFrom:
            nLatestBlockNumber.sub( blocksInOneYear ),
        nBlockTo: "latest",
        type: "1 year"
    }, {
        nBlockFrom:
            nLatestBlockNumber.sub( blocksInThreeYears ),
        nBlockTo: "latest",
        type: "3 years"
    } ];
    const arrProgressiveEventsScanPlan: TProgressivePlanAtom[] = [];
    for( let idxPlan = 0; idxPlan < arrProgressiveEventsScanPlanA.length; ++idxPlan ) {
        const joPlan: TProgressivePlanAtom = arrProgressiveEventsScanPlanA[idxPlan];
        if( joPlan.nBlockFrom.lte( owaspUtils.toBN( 0 ) ) )
            arrProgressiveEventsScanPlan.push( joPlan );
    }
    if( arrProgressiveEventsScanPlan.length > 0 ) {
        const joLastPlan =
        arrProgressiveEventsScanPlan[arrProgressiveEventsScanPlan.length - 1];
        if( !( joLastPlan.nBlockFrom.eq( owaspUtils.toBN( 0 ) ) &&
            joLastPlan.nBlockTo == "latest" ) ) {
            arrProgressiveEventsScanPlan.push( {
                nBlockFrom: owaspUtils.toBN( 0 ),
                nBlockTo: "latest",
                type: "entire block range"
            } );
        }
    } else {
        arrProgressiveEventsScanPlan.push( {
            nBlockFrom: owaspUtils.toBN( 0 ),
            nBlockTo: "latest",
            type: "entire block range"
        } );
    }
    return arrProgressiveEventsScanPlan;
}

export async function safeGetPastEventsProgressive(
    details: log.TLoggerBase, strLogPrefix: string,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    attempts: number, joContract: owaspUtils.ethersMod.ethers.Contract, strEventName: string,
    nBlockFrom: owaspUtils.ethersMod.BigNumber,
    nBlockTo: owaspUtils.ethersMod.BigNumber | string,
    joFilter: owaspUtils.ethersMod.EventFilter
): Promise< owaspUtils.ethersMod.Event[] > {
    const strURL = owaspUtils.ethersProviderToUrl( ethersProvider );
    details.information( "{p}Will run progressive logs search for event {} via URL {url}, " +
        "from block {}, to block...", strLogPrefix, strEventName, strURL, nBlockFrom, nBlockTo );
    if( !imaTransferErrorHandling.getEnabledProgressiveEventsScan() ) {
        details.warning(
            "{p}IMPORTANT NOTICE: Will skip progressive events scan in block range from {} to {} " +
            "because it's {}", strLogPrefix, nBlockFrom, nBlockTo, log.fmtError( "DISABLED" ) );
        return await safeGetPastEvents( details, strLogPrefix, ethersProvider, attempts,
            joContract, strEventName, nBlockFrom, nBlockTo, joFilter );
    }
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    let isLastLatest = false;
    if( nBlockTo == "latest" ) {
        isLastLatest = true;
        nBlockTo = nLatestBlockNumberPlus1;
        details.trace( "{p}Progressive event log records scan up to latest block #{} " +
            "assumed instead of {}", strLogPrefix, nBlockTo.toHexString(), "latest" );
    } else {
        nBlockTo = owaspUtils.toBN( nBlockTo );
        if( nBlockTo.gte( nLatestBlockNumber ) )
            isLastLatest = true;
    }
    nBlockFrom = owaspUtils.toBN( nBlockFrom );
    const nBlockZero = owaspUtils.toBN( 0 );
    const isFirstZero = !!( nBlockFrom.eq( nBlockZero ) );
    if( !( isFirstZero && isLastLatest ) ) {
        details.trace( "{p}Will skip progressive event log records scan and use scan in block " +
            "range from {} to {}", strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString() );
        return await safeGetPastEvents(
            details, strLogPrefix,
            ethersProvider, attempts, joContract, strEventName,
            nBlockFrom, nBlockTo, joFilter
        );
    }
    details.trace( "{p}Current latest block number is {}",
        strLogPrefix, nLatestBlockNumber.toHexString() );
    const arrProgressiveEventsScanPlan: TProgressivePlanAtom[] =
        createProgressiveEventsScanPlan( details, nLatestBlockNumberPlus1 );
    details.trace( "Composed progressive event log records scan plan is: {}",
        arrProgressiveEventsScanPlan );
    let joLastPlan: TProgressivePlanAtom = {
        nBlockFrom: owaspUtils.toBN( 0 ),
        nBlockTo: "latest",
        type: "entire block range"
    };
    for( let idxPlan = 0; idxPlan < arrProgressiveEventsScanPlan.length; ++idxPlan ) {
        const joPlan = arrProgressiveEventsScanPlan[idxPlan];
        if( joPlan.nBlockFrom.lt( owaspUtils.toBN( 0 ) ) )
            continue;
        joLastPlan = joPlan;
        details.trace(
            "{p}Progressive event log records scan of {} event, from block {}, to block {}, " +
            "plan type is {} via URL {url}...",
            strLogPrefix, strEventName, joPlan.nBlockFrom, joPlan.nBlockTo, joPlan.type, strURL );
        try {
            const joAllEventsInBlock = await safeGetPastEventsIterative( details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                joPlan.nBlockFrom, joPlan.nBlockTo, joFilter );
            if( joAllEventsInBlock && joAllEventsInBlock.length > 0 ) {
                details.success(
                    "{p}Progressive event log records scan of log event {}, from block {}, " +
                    "to block {}, block range is {}, via URL {url}, found {} event(s)",
                    strLogPrefix, strEventName, joPlan.nBlockFrom, joPlan.nBlockTo, joPlan.type,
                    strURL, joAllEventsInBlock.length );
                return joAllEventsInBlock;
            }
        } catch ( err ) {}
    }
    details.error(
        "{p}Was not found(progressive) event log record for event {}, from block {}" +
        ", to block {}, block range is {}, via URL {url}, using progressive event log records scan",
        strLogPrefix, strEventName, joLastPlan.nBlockFrom, joLastPlan.nBlockTo, joLastPlan.type,
        strURL );
    return [];
}

export async function getContractCallEvents(
    details: log.TLoggerBase, strLogPrefix: string,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joContract: owaspUtils.ethersMod.ethers.Contract, strEventName: string,
    nBlockNumber: owaspUtils.ethersMod.BigNumber,
    strTxHash: string, joFilter: owaspUtils.ethersMod.EventFilter
): Promise< owaspUtils.ethersMod.Event[] > {
    joFilter = joFilter || {};
    nBlockNumber = owaspUtils.toBN( nBlockNumber );
    const n10 = owaspUtils.toBN( 10 );
    let nBlockFrom = nBlockNumber.sub( n10 ); let nBlockTo = nBlockNumber.add( n10 );
    const nBlockZero = owaspUtils.toBN( 0 );
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    if( nBlockFrom.lt( nBlockZero ) )
        nBlockFrom = nBlockZero;
    if( nBlockTo.gte( nLatestBlockNumber ) )
        nBlockTo = nLatestBlockNumberPlus1;
    const joAllEventsInBlock = await safeGetPastEventsIterative(
        details, strLogPrefix, ethersProvider, 10, joContract, strEventName,
        nBlockFrom, nBlockTo, joFilter );
    const joAllTransactionEvents: owaspUtils.ethersMod.Event[] = [];
    let i: number;
    for( i = 0; i < joAllEventsInBlock.length; ++i ) {
        const joEvent = joAllEventsInBlock[i];
        if( "transactionHash" in joEvent && joEvent.transactionHash == strTxHash )
            joAllTransactionEvents.push( joEvent );
    }
    return joAllTransactionEvents;
}

export async function safeGetTransactionCount(
    details: log.TLoggerBase, cntAttempts: number,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    address: string, param: any,
    retValOnFail: owaspUtils.ethersMod.BigNumber | null,
    throwIfServerOffline: boolean
): Promise< owaspUtils.ethersMod.BigNumber | null > {
    const strFnName = "getTransactionCount";
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts = ( owaspUtils.parseIntOrHex( cntAttempts ) < 1 )
        ? 1
        : owaspUtils.parseIntOrHex( cntAttempts );
    let ret: owaspUtils.ethersMod.BigNumber = retValOnFail ?? owaspUtils.toBN( 0 );
    let idxAttempt = 1;
    for( ; idxAttempt <= cntAttempts; ++idxAttempt ) {
        const isOnLine = await rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( !isOnLine ) {
            ret = retValOnFail ?? owaspUtils.toBN( 0 );
            if( !throwIfServerOffline )
                return ret;
            details.error( "Cannot call {} via {url} because server is off-line, attempt {} of {}",
                strFnName + "()", u, idxAttempt, cntAttempts );
            throw new Error( `Cannot ${strFnName}() via ${u} because server is off-line` );
        }
        details.trace( "Call to {} via {url}, attempt {} of {}",
            strFnName + "()", u, idxAttempt, cntAttempts );
        try {
            ret = owaspUtils.toBN( await ethersProvider[strFnName]( address, param ) );
            return ret;
        } catch ( err ) {
            ret = retValOnFail ?? owaspUtils.toBN( 0 );
            details.error( "Failed call attempt {} of {} to {} via {url}, error is: {err}, " +
                "stack is:\n{stack}", idxAttempt, cntAttempts, strFnName + "()", u, err, err );
        }
    }
    if( ( idxAttempt + 1 ) > cntAttempts && !ret ) {
        details.error( "Failed call to {} via {url} after {} attempts",
            strFnName + "()", u, cntAttempts );
        throw new Error( `Failed call to ${strFnName}() via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetTransactionReceipt(
    details: log.TLoggerBase, cntAttempts: number,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    txHash: string, retValOnFail?: TSameAsTransactionReceipt | null,
    throwIfServerOffline?: boolean
): Promise< TSameAsTransactionReceipt | null > {
    const strFnName = "getTransactionReceipt";
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts = ( owaspUtils.parseIntOrHex( cntAttempts ) < 1 )
        ? 1
        : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = null;
    let ret: TSameAsTransactionReceipt | null = retValOnFail;
    let idxAttempt = 1;
    for( ; idxAttempt <= cntAttempts; ++idxAttempt ) {
        const isOnLine = await rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( !isOnLine ) {
            ret = retValOnFail;
            if( !throwIfServerOffline )
                return ret;
            details.error( "Cannot call {} via {url} because server is off-line, attempt {} of {}",
                strFnName + "()", u, idxAttempt, cntAttempts );
            throw new Error( `Cannot ${strFnName}() via ${u} because server is off-line` );
        }
        details.trace( "Call to {} via {url}, attempt {} of {}",
            strFnName + "()", u, idxAttempt, cntAttempts );
        try {
            ret = await ethersProvider[strFnName]( txHash );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt {} of {} to {} via {url}, error is: {err}, " +
                "stack is:\n{stack}", idxAttempt, cntAttempts, strFnName + "()", u, err, err );
        }
    }
    if( ( idxAttempt + 1 ) > cntAttempts ) {
        details.error( "Failed call to {} via {url} after {} attempts",
            strFnName + "()", u, cntAttempts );
        throw new Error( `Failed call to ${strFnName}() via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetPastEvents(
    details: log.TLoggerBase, strLogPrefix: string,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    cntAttempts: number, joContract: owaspUtils.ethersMod.ethers.Contract, strEventName: string,
    nBlockFrom: owaspUtils.ethersMod.BigNumber,
    nBlockTo: owaspUtils.ethersMod.BigNumber | string,
    joFilter: owaspUtils.ethersMod.EventFilter,
    retValOnFail?: owaspUtils.ethersMod.Event[], throwIfServerOffline?: boolean
): Promise< owaspUtils.ethersMod.Event[] > {
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts = ( owaspUtils.parseIntOrHex( cntAttempts ) < 1 )
        ? 1
        : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = [];
    let ret = retValOnFail;
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    let idxAttempt = 1;
    const strErrorTextAboutNotExistingEvent =
        "Event \"" + strEventName + "\" doesn't exist in this contract";
    if( nBlockTo == "latest" ) {
        const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
        nBlockTo = nLatestBlockNumberPlus1;
    } else
        nBlockTo = owaspUtils.toBN( nBlockTo );
    nBlockFrom = owaspUtils.toBN( nBlockFrom );
    for( ; idxAttempt <= cntAttempts; ++idxAttempt ) {
        const isOnLine = await rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( !isOnLine ) {
            ret = retValOnFail;
            if( !throwIfServerOffline )
                return ret;
            details.error(
                "{p}Cannot do {} event filtering via {url} because server is off-line, " +
                "attempt {} of {}", strLogPrefix, strEventName, u, idxAttempt, cntAttempts );
            throw new Error( `Cannot do ${strEventName} event filtering, ` +
                `from block ${nBlockFrom.toHexString()} , to block ${nBlockTo.toHexString()} ` +
                `via ${u} because server is off-line` );
        }
        details.trace( "{p}Repeat {} event filtering via {url}, attempt {} of {}",
            strLogPrefix, strEventName, u, idxAttempt, cntAttempts );
        try {
            details.trace(
                "{p}Attempt {} of, will query filter {} on contract {} from block {} to block {}",
                strLogPrefix, idxAttempt, cntAttempts, joFilter, joContract.address,
                nBlockFrom.toHexString(), nBlockTo.toHexString() );
            ret = await joContract.queryFilter( joFilter,
                nBlockFrom.toHexString(), nBlockTo.toHexString() );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error(
                "{p}Failed filtering attempt {} of {} for event {} via {url}, from block {}" +
                ", to block{}, error is: {err}, stack is:\n{stack}", strLogPrefix,
                idxAttempt, cntAttempts, strEventName, u,
                nBlockFrom.toHexString(), nBlockTo.toHexString(), err, err );
            if( owaspUtils.extractErrorMessage( err )
                .includes( strErrorTextAboutNotExistingEvent )
            ) {
                details.error( "{p}Did stopped {} event filtering because no such event exist " +
                    "in smart contract", strLogPrefix, strEventName );
                return ret;
            }
        }
    }
    if( ( idxAttempt + 1 ) === cntAttempts && !ret ) {
        details.error(
            "{p}Failed filtering attempt for {} event via {url}, from block {}, to block {} " +
            "after {} attempts", strLogPrefix, strEventName, u, nBlockFrom.toHexString(),
            nBlockTo.toHexString(), cntAttempts );
        throw new Error( `Failed filtering attempt for ${strEventName} event, ` +
            `from block ${nBlockFrom.toHexString()}, to block ${nBlockTo.toHexString()} ` +
            `via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetPastEventsIterative(
    details: log.TLoggerBase, strLogPrefix: string,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    attempts: number, joContract: owaspUtils.ethersMod.ethers.Contract, strEventName: string,
    nBlockFrom: owaspUtils.ethersMod.BigNumber,
    nBlockTo: owaspUtils.ethersMod.BigNumber | string,
    joFilter: owaspUtils.ethersMod.EventFilter
): Promise< owaspUtils.ethersMod.Event[] > {
    if( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() <= 0 ||
        imaHelperAPIs.getMaxIterationsInAllRangeEventsScan() <= 0 ) {
        details.warning(
            "{p}IMPORTANT NOTICE: Will skip iterative events scan in block range from {} to {} " +
            "because it's {}", strLogPrefix, nBlockFrom, nBlockTo, log.fmtError( "DISABLED" ) );
        return await safeGetPastEvents( details, strLogPrefix, ethersProvider, attempts,
            joContract, strEventName, nBlockFrom, nBlockTo, joFilter );
    }
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    let isLastLatest = false;
    if( nBlockTo == "latest" ) {
        isLastLatest = true;
        nBlockTo = nLatestBlockNumberPlus1;
        details.trace( "{p}Iterative scan up to latest block #{} assumed instead of {}",
            strLogPrefix, nBlockTo.toHexString(), "latest" );
    } else {
        nBlockTo = owaspUtils.toBN( nBlockTo );
        if( nBlockTo.gte( nLatestBlockNumber ) )
            isLastLatest = true;
    }
    nBlockFrom = owaspUtils.toBN( nBlockFrom );
    const nBlockZero = owaspUtils.toBN( 0 );
    const isFirstZero = !!( nBlockFrom.eq( nBlockZero ) );
    if( isFirstZero && isLastLatest ) {
        if( nLatestBlockNumber.div(
            owaspUtils.toBN( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() )
        ).gt( owaspUtils.toBN( imaHelperAPIs.getMaxIterationsInAllRangeEventsScan() ) )
        ) {
            details.warning(
                "{p}IMPORTANT NOTICE: Will skip iterative scan and use scan in block range " +
                "from {} to {}", strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString() );
            return await safeGetPastEvents( details, strLogPrefix, ethersProvider, attempts,
                joContract, strEventName, nBlockFrom, nBlockTo, joFilter );
        }
    }
    details.trace( "{p}Iterative scan in {}/{} block range...",
        strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString() );
    let idxBlockSubRangeTo = nBlockTo;
    for( ; true; ) {
        let idxBlockSubRangeFrom = idxBlockSubRangeTo.sub(
            owaspUtils.toBN( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() ) );
        if( idxBlockSubRangeFrom.lt( nBlockFrom ) )
            idxBlockSubRangeFrom = nBlockFrom;
        try {
            details.trace( "{p}Iterative scan of {}/{} block sub-range in {}/{} block range...",
                strLogPrefix, idxBlockSubRangeFrom.toHexString(), idxBlockSubRangeTo.toHexString(),
                nBlockFrom.toHexString(), nBlockTo.toHexString() );
            const joAllEventsInBlock = await safeGetPastEvents( details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                idxBlockSubRangeFrom, idxBlockSubRangeTo, joFilter );
            if( joAllEventsInBlock && joAllEventsInBlock && joAllEventsInBlock.length > 0 ) {
                details.success( "{p}Result of iterative scan in {}/{} block range is {}",
                    strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString(),
                    joAllEventsInBlock );
                return joAllEventsInBlock;
            }
        } catch ( err ) {
            details.critical(
                "{p}Got scan error during interactive scan of {}/{} block sub-range in {}/{} " +
                "block range, error is: {err}, stack is:\n{stack}", strLogPrefix,
                idxBlockSubRangeFrom.toHexString(), idxBlockSubRangeTo.toHexString(),
                nBlockFrom.toHexString(), nBlockTo.toHexString(), err, err );
        }
        idxBlockSubRangeTo = idxBlockSubRangeFrom;
        if( idxBlockSubRangeTo.lte( nBlockFrom ) )
            break;
    }
    details.debug( "{p}Result of iterative scan in {}/{} is {}", strLogPrefix,
        nBlockFrom.toHexString(), nBlockTo.toHexString(), "empty block range" );
    return [];
}
