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
 * @file imaEventLogScan.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as rpcCall from "./rpcCall.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";

export function createProgressiveEventsScanPlan( details, nLatestBlockNumber ) {
    // assume Main Net mines 6 blocks per minute
    const blocksInOneMinute = 6;
    const blocksInOneHour = blocksInOneMinute * 60;
    const blocksInOneDay = blocksInOneHour * 24;
    const blocksInOneWeek = blocksInOneDay * 7;
    const blocksInOneMonth = blocksInOneDay * 31;
    const blocksInOneYear = blocksInOneDay * 366;
    const blocksInThreeYears = blocksInOneYear * 3;
    const arrProgressiveEventsScanPlanA = [ {
        "nBlockFrom":
            nLatestBlockNumber - blocksInOneDay,
        "nBlockTo": "latest",
        "type": "1 day"
    }, {
        "nBlockFrom":
            nLatestBlockNumber - blocksInOneWeek,
        "nBlockTo": "latest",
        "type": "1 week"
    }, {
        "nBlockFrom":
            nLatestBlockNumber - blocksInOneMonth,
        "nBlockTo": "latest",
        "type": "1 month"
    }, {
        "nBlockFrom":
            nLatestBlockNumber - blocksInOneYear,
        "nBlockTo": "latest",
        "type": "1 year"
    }, {
        "nBlockFrom":
            nLatestBlockNumber - blocksInThreeYears,
        "nBlockTo": "latest",
        "type": "3 years"
    } ];
    const arrProgressiveEventsScanPlan = [];
    for( let idxPlan = 0; idxPlan < arrProgressiveEventsScanPlanA.length; ++idxPlan ) {
        const joPlan = arrProgressiveEventsScanPlanA[idxPlan];
        if( joPlan.nBlockFrom >= 0 )
            arrProgressiveEventsScanPlan.push( joPlan );
    }
    if( arrProgressiveEventsScanPlan.length > 0 ) {
        const joLastPlan =
        arrProgressiveEventsScanPlan[arrProgressiveEventsScanPlan.length - 1];
        if( ! ( joLastPlan.nBlockFrom == 0 && joLastPlan.nBlockTo == "latest" ) ) {
            arrProgressiveEventsScanPlan.push(
                { "nBlockFrom": 0, "nBlockTo": "latest", "type": "entire block range" } );
        }
    } else {
        arrProgressiveEventsScanPlan.push(
            { "nBlockFrom": 0, "nBlockTo": "latest", "type": "entire block range" } );
    }
    return arrProgressiveEventsScanPlan;
}

export async function safeGetPastEventsProgressive(
    details, strLogPrefix,
    ethersProvider, attempts, joContract, strEventName,
    nBlockFrom, nBlockTo, joFilter
) {
    const strURL = owaspUtils.ethersProviderToUrl( ethersProvider );
    details.information( "{p}Will run progressive logs search for event {} via URL {url}, " +
        "from block {}, to block...", strLogPrefix, strEventName, strURL, nBlockFrom, nBlockTo );
    if( ! imaTransferErrorHandling.getEnabledProgressiveEventsScan() ) {
        details.warning( "{p}IMPORTANT NOTICE: Will skip progressive events scan " +
                "in block range from {} to {} because it's {}",
        strLogPrefix, nBlockFrom, nBlockTo, log.fmtError( "DISABLED" ) );
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
    const isFirstZero = ( nBlockFrom.eq( nBlockZero ) ) ? true : false;
    if( ! ( isFirstZero && isLastLatest ) ) {
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
    const arrProgressiveEventsScanPlan =
        createProgressiveEventsScanPlan( details, nLatestBlockNumberPlus1 );
    details.trace( "Composed progressive event log records scan plan is: {}",
        arrProgressiveEventsScanPlan );
    let joLastPlan = { "nBlockFrom": 0, "nBlockTo": "latest", "type": "entire block range" };
    for( let idxPlan = 0; idxPlan < arrProgressiveEventsScanPlan.length; ++idxPlan ) {
        const joPlan = arrProgressiveEventsScanPlan[idxPlan];
        if( joPlan.nBlockFrom < 0 )
            continue;
        joLastPlan = joPlan;
        details.trace( "{p}Progressive event log records scan of {} event, from block {}" +
                ", to block {}, block range is {} via URL {url}...", strLogPrefix, strEventName,
        joPlan.nBlockFrom, joPlan.nBlockTo, joPlan.type, strURL );
        try {
            const joAllEventsInBlock = await safeGetPastEventsIterative( details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                joPlan.nBlockFrom, joPlan.nBlockTo, joFilter );
            if( joAllEventsInBlock && joAllEventsInBlock.length > 0 ) {
                details.success( "{p}Progressive event log records scan of log event {}" +
                        ", from block {}, to block {}, block range is {}, via URL {url}" +
                        ", found {} event(s)", strLogPrefix, strEventName, joPlan.nBlockFrom,
                joPlan.nBlockTo, joPlan.type, strURL, joAllEventsInBlock.length );
                return joAllEventsInBlock;
            }
        } catch ( err ) {}
    }
    details.error( "{p}Was not found(progressive) event log record for event {}, from block {}" +
        ", to block {}, block range is {}, via URL {url}, using progressive " +
        "event log records scan", strLogPrefix, strEventName, joLastPlan.nBlockFrom,
    joLastPlan.nBlockTo, joLastPlan.type, strURL );
    return [];
}

export async function getContractCallEvents(
    details, strLogPrefix,
    ethersProvider, joContract, strEventName,
    nBlockNumber, strTxHash, joFilter
) {
    joFilter = joFilter || {};
    nBlockNumber = owaspUtils.toBN( nBlockNumber );
    const n10 = owaspUtils.toBN( 10 );
    let nBlockFrom = nBlockNumber.sub( n10 ), nBlockTo = nBlockNumber.add( n10 );
    const nBlockZero = owaspUtils.toBN( 0 );
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    if( nBlockFrom.lt( nBlockZero ) )
        nBlockFrom = nBlockZero;
    if( nBlockTo.gte( nLatestBlockNumber ) )
        nBlockTo = nLatestBlockNumberPlus1;
    const joAllEventsInBlock =
        await safeGetPastEventsIterative(
            details, strLogPrefix, ethersProvider, 10, joContract, strEventName,
            nBlockFrom, nBlockTo, joFilter );
    const joAllTransactionEvents = []; let i;
    for( i = 0; i < joAllEventsInBlock.length; ++i ) {
        const joEvent = joAllEventsInBlock[i];
        if( "transactionHash" in joEvent && joEvent.transactionHash == strTxHash )
            joAllTransactionEvents.push( joEvent );
    }
    return joAllTransactionEvents;
}

export async function safeGetTransactionCount(
    details, cntAttempts, ethersProvider, address, param, retValOnFail, throwIfServerOffline
) {
    const strFnName = "getTransactionCount";
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts =
        owaspUtils.parseIntOrHex( cntAttempts ) < 1
            ? 1
            : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = "";
    let ret = retValOnFail;
    let idxAttempt = 1;
    try {
        ret = await ethersProvider[strFnName]( address, param );
        return ret;
    } catch ( err ) {
        ret = retValOnFail;
        details.error( "Failed call attempt {} to {} via {url}, error is: {err}, " +
            "stack is:\n{stack}", idxAttempt, strFnName + "()", u, err, err.stack );
    }
    ++ idxAttempt;
    while( ret === "" && idxAttempt <= cntAttempts ) {
        const isOnLine = rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( ! isOnLine ) {
            ret = retValOnFail;
            if( ! throwIfServerOffline )
                return ret;
            details.error( "Cannot call {} via {url} because server is off-line",
                strFnName + "()", u );
            throw new Error( `Cannot ${strFnName}() via ${u} because server is off-line` );
        }
        details.trace( "Repeat call to {} via {url}, attempt {}", strFnName + "()", u, idxAttempt );
        try {
            ret = await ethersProvider[strFnName]( address, param );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt {} to {} via {url}, error is: {err}, " +
                "stack is:\n{stack}", idxAttempt, strFnName + "()", u, err, err.stack );
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) > cntAttempts && ret === "" ) {
        details.error( "Failed call to {} via {url} after {} attempts",
            strFnName + "()", u, cntAttempts );
        throw new Error( `Failed call to ${strFnName}() via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetTransactionReceipt(
    details, cntAttempts, ethersProvider, txHash, retValOnFail, throwIfServerOffline
) {
    const strFnName = "getTransactionReceipt";
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts =
        owaspUtils.parseIntOrHex( cntAttempts ) < 1
            ? 1
            : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = "";
    let ret = retValOnFail;
    let idxAttempt = 1;
    try {
        ret = await ethersProvider[strFnName]( txHash );
        return ret;
    } catch ( err ) {
        ret = retValOnFail;
        details.error( "Failed call attempt {} to {} via {url}, error is: {err}, " +
            "stack is:\n{stack}", idxAttempt, strFnName + "()", u, err, err.stack );
    }
    ++ idxAttempt;
    while( txReceipt === "" && idxAttempt <= cntAttempts ) {
        const isOnLine = rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( ! isOnLine ) {
            ret = retValOnFail;
            if( ! throwIfServerOffline )
                return ret;
            details.error( "Cannot call {} via {url} because server is off-line",
                strFnName + "()", u );
            throw new Error( `Cannot ${strFnName}() via ${u} because server is off-line` );
        }
        details.trace( "Repeat call to {} via {url}, attempt {}", strFnName + "()", u, idxAttempt );
        try {
            ret = await ethersProvider[strFnName]( txHash );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt {} to {} via {url}, error is: {err}, " +
                "stack is:\n{stack}", idxAttempt, strFnName + "()", u, err, err.stack );
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) > cntAttempts && ( txReceipt === "" || txReceipt === undefined ) ) {
        details.error( "Failed call to {} via {url} after {} attempts",
            strFnName + "()", u, cntAttempts );
        throw new Error( `Failed call to ${strFnName}() via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetPastEvents(
    details, strLogPrefix,
    ethersProvider, cntAttempts, joContract, strEventName,
    nBlockFrom, nBlockTo, joFilter, retValOnFail, throwIfServerOffline
) {
    const u = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts =
        owaspUtils.parseIntOrHex( cntAttempts ) < 1
            ? 1
            : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = "";
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
    try {
        details.trace( "{p}First time, will query filter {} on contract {} from block {} to " +
            "block {} while current latest block number on chain is {}",
        strLogPrefix, joFilter, joContract.address, nBlockFrom.toHexString(),
        nBlockTo.toHexString(), nLatestBlockNumber.toHexString() );
        ret =
            await joContract.queryFilter(
                joFilter,
                nBlockFrom.toHexString(),
                nBlockTo.toHexString()
            );
        return ret;
    } catch ( err ) {
        ret = retValOnFail;
        details.error( "{p}Failed filtering attempt {} for event {} via {url}, from block {}" +
            ", to block {}, error is: {err}, stack is:\n{stack}", strLogPrefix, idxAttempt,
        strEventName, u, nBlockFrom.toHexString(), nBlockTo.toHexString(),
        err, err.stack );
        if( owaspUtils.extractErrorMessage( err )
            .indexOf( strErrorTextAboutNotExistingEvent ) >= 0 ) {
            details.error( "{p}Did stopped filtering of {} event because no such event exist " +
                "in smart contract ", strLogPrefix, strEventName );
            return ret;
        }
    }
    ++ idxAttempt;
    while( ret === "" && idxAttempt <= cntAttempts ) {
        const isOnLine = rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( ! isOnLine ) {
            ret = retValOnFail;
            if( ! throwIfServerOffline )
                return ret;
            details.error( "{p}Cannot do {} event filtering via {url} because server is off-line",
                strLogPrefix, strEventName, u );
            throw new Error( `Cannot do ${strEventName} event filtering, ` +
                `from block ${nBlockFrom.toHexString()} , to block ${nBlockTo.toHexString()} ` +
                `via ${u} because server is off-line` );
        }
        details.trace( "{p}Repeat {} event filtering via {url}, attempt {}",
            strLogPrefix, strEventName, u, idxAttempt );
        try {
            details.trace( "{p}Attempt {}, will query filter {} on contract {} from block {}" +
                " to block {}", strLogPrefix, idxAttempt, joFilter, joContract.address,
            nBlockFrom.toHexString(), nBlockTo.toHexString() );
            ret = await joContract.queryFilter( joFilter,
                nBlockFrom.toHexString(), nBlockTo.toHexString() );
            return ret;

        } catch ( err ) {
            ret = retValOnFail;
            details.error( "{p}Failed filtering attempt {} for event {} via {url}, from block {}" +
                ", to block{}, error is: {err}, stack is:\n{stack}", strLogPrefix, idxAttempt,
            strEventName, u, nBlockFrom.toHexString(), nBlockTo.toHexString(),
            err, err.stack );
            if( owaspUtils.extractErrorMessage( err )
                .indexOf( strErrorTextAboutNotExistingEvent ) >= 0
            ) {
                details.error( "{p}Did stopped {} event filtering because no such event exist " +
                    "in smart contract ", strLogPrefix, strEventName );
                return ret;
            }
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) === cntAttempts && ret === "" ) {
        details.error( "{p}Failed filtering attempt for {} event via {url}, from block {}, " +
            "to block {} after {} attempts", strLogPrefix, strEventName, u,
        nBlockFrom.toHexString(), nBlockTo.toHexString(), cntAttempts );
        throw new Error( `Failed filtering attempt for ${strEventName} event, ` +
            `from block ${nBlockFrom.toHexString()}, to block ${nBlockTo.toHexString()} ` +
            `via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

export async function safeGetPastEventsIterative(
    details, strLogPrefix,
    ethersProvider, attempts, joContract, strEventName,
    nBlockFrom, nBlockTo, joFilter
) {
    if( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() <= 0 ||
        imaHelperAPIs.getMaxIterationsInAllRangeEventsScan() <= 0 ) {
        details.warning( "{p}IMPORTANT NOTICE: Will skip iterative events scan " +
            "in block range from {} to {} because it's {}",
        strLogPrefix, nBlockFrom, nBlockTo, log.fmtError( "DISABLED" ) );
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
    const isFirstZero = ( nBlockFrom.eq( nBlockZero ) ) ? true : false;
    if( isFirstZero && isLastLatest ) {
        if( nLatestBlockNumber.div(
            owaspUtils.toBN( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() )
        ).gt( owaspUtils.toBN( imaHelperAPIs.getMaxIterationsInAllRangeEventsScan() ) )
        ) {
            details.warning( "{p}IMPORTANT NOTICE: Will skip iterative scan and " +
                "use scan in block range from {} to {}",
            strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString() );
            return await safeGetPastEvents(
                details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                nBlockFrom, nBlockTo, joFilter
            );
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
            if( joAllEventsInBlock && joAllEventsInBlock != "" && joAllEventsInBlock.length > 0 ) {
                details.success( "{p}Result of iterative scan in {}/{} block range is {}",
                    strLogPrefix, nBlockFrom.toHexString(), nBlockTo.toHexString(),
                    joAllEventsInBlock );
                return joAllEventsInBlock;
            }
        } catch ( err ) {
            details.critical( "{p}Got scan error during interactive scan of {}/{} " +
                "block sub-range in {}/{} block range, error is: {err}, stack is:\n{stack}",
            strLogPrefix, idxBlockSubRangeFrom.toHexString(), idxBlockSubRangeTo.toHexString(),
            nBlockFrom.toHexString(), nBlockTo.toHexString(), err, err.stack );
        }
        idxBlockSubRangeTo = idxBlockSubRangeFrom;
        if( idxBlockSubRangeTo.lte( nBlockFrom ) )
            break;
    }
    details.debug( "{p}Result of iterative scan in {}/{} is {}", strLogPrefix,
        nBlockFrom.toHexString(), nBlockTo.toHexString(), "empty block range" );
    return "";
}
