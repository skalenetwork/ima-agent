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

import * as childProcessModule from "child_process";
import * as path from "path";
import * as url from "url";

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );

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

export function extractEventArg( arg ) {
    if( arg && typeof arg == "object" && "type" in arg && typeof arg.type == "string" &&
        arg.type == "BigNumber" && "hex" in arg && typeof arg.hex == "string" )
        return owaspUtils.toBN( arg.hex );
    return arg;
}

function generateWhileTransferringLogMessageSuffix( optsChainPair ) {
    if( ! optsChainPair )
        return "";
    if( ! optsChainPair.strDirection )
        return "";
    if( optsChainPair.strDirection == "S2S" ) {
        return log.fmtDebug( " (while performing ", log.fmtAttention( optsChainPair.strDirection ),
            " transfer with external S-Chain ",
            log.fmtInformation( optsChainPair.optsSpecificS2S.joSChain.data.name ), " / ",
            log.fmtNotice( optsChainPair.optsSpecificS2S.joSChain.data.computed.chainId ),
            " node ", optsChainPair.optsSpecificS2S.idxNode, ")" );
    }
    return log.fmtDebug( " (while performing ", log.fmtAttention( optsChainPair.strDirection ),
        " transfer)" );
}

export async function safeGetPastEventsProgressiveExternal(
    details, strLogPrefix, ethersProvider, attempts,
    joContract, joABI, strEventName,
    nBlockFrom, nBlockTo, joFilter, optsChainPair
) {
    if( joABI && typeof joABI == "object" ) {
        const joArg = {
            "url": owaspUtils.ethersProviderToUrl( ethersProvider ),
            "attempts": attempts,
            "strEventName": strEventName,
            "nBlockFrom": nBlockFrom,
            "nBlockTo": nBlockTo,
            "joFilter": joFilter,
            "address": joContract.address,
            "abi": joABI
        };
        const cmd = "node " + path.join( __dirname, "imaExternalLogScan.mjs" ) + " " +
            owaspUtils.escapeShell( JSON.stringify( joArg ) );
        details.information( strLogPrefix,
            "Will run external command to search logs for event ",
            log.v( strEventName ), " via URL ", log.u( joArg.url ),
            generateWhileTransferringLogMessageSuffix( optsChainPair ), "..." );
        const res = childProcessModule.execSync( cmd );
        if( "error" in res && res.error ) {
            details.error( strLogPrefix,
                "Got error from external command to search logs for event ",
                log.v( strEventName ), " via URL ", log.u( joArg.url ),
                generateWhileTransferringLogMessageSuffix( optsChainPair ),
                ":", owaspUtils.extractErrorMessage( err ) );
            throw new Error( res.error );
        }
        details.information( strLogPrefix,
            "Done running external command to search logs for event ",
            log.v( strEventName ), " via URL ", log.u( joArg.url ),
            generateWhileTransferringLogMessageSuffix( optsChainPair ), "." );
        return JSON.parse( res ).result;
    }
    return await safeGetPastEventsProgressive(
        details, strLogPrefix, ethersProvider, attempts,
        joContract, strEventName,
        nBlockFrom, nBlockTo, joFilter );
}

export async function safeGetPastEventsProgressive(
    details, strLogPrefix,
    ethersProvider, attempts, joContract, strEventName,
    nBlockFrom, nBlockTo, joFilter
) {
    if( ! imaTransferErrorHandling.getEnabledProgressiveEventsScan() ) {
        details.warning( strLogPrefix, "IMPORTANT NOTICE: Will skip progressive events scan " +
            "in block range from ", log.v( nBlockFrom ), " to ", log.v( nBlockTo ),
        " because it's ", log.fmtError( "DISABLED" ) );
        return await safeGetPastEvents(
            details, strLogPrefix,
            ethersProvider, attempts, joContract, strEventName,
            nBlockFrom, nBlockTo, joFilter
        );
    }
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    let isLastLatest = false;
    if( nBlockTo == "latest" ) {
        isLastLatest = true;
        nBlockTo = nLatestBlockNumberPlus1;
        details.trace( strLogPrefix, "Iterative scan up to latest block #",
            log.v( nBlockTo.toHexString() ), " assumed instead of ", log.v( "latest" ) );
    } else {
        nBlockTo = owaspUtils.toBN( nBlockTo );
        if( nBlockTo.gte( nLatestBlockNumber ) )
            isLastLatest = true;
    }
    nBlockFrom = owaspUtils.toBN( nBlockFrom );
    const nBlockZero = owaspUtils.toBN( 0 );
    const isFirstZero = ( nBlockFrom.eq( nBlockZero ) ) ? true : false;
    if( ! ( isFirstZero && isLastLatest ) ) {
        details.trace( strLogPrefix, "Will skip ", log.v( "progressive" ),
            " scan and use scan in block range from ", log.v( nBlockFrom.toHexString() ),
            " to ", log.v( nBlockTo.toHexString() ) );
        return await safeGetPastEvents(
            details, strLogPrefix,
            ethersProvider, attempts, joContract, strEventName,
            nBlockFrom, nBlockTo, joFilter
        );
    }
    details.trace( strLogPrefix, "Will run ", log.v( "progressive" ), " scan..." );
    details.trace( strLogPrefix, "Current latest block number is ",
        log.v( nLatestBlockNumber.toHexString() ) );
    const arrProgressiveEventsScanPlan =
        createProgressiveEventsScanPlan( details, nLatestBlockNumberPlus1 );
    details.trace( "Composed ", log.v( "progressive" ),
        " scan plan is: ", log.v( arrProgressiveEventsScanPlan ) );
    let joLastPlan = { "nBlockFrom": 0, "nBlockTo": "latest", "type": "entire block range" };
    for( let idxPlan = 0; idxPlan < arrProgressiveEventsScanPlan.length; ++idxPlan ) {
        const joPlan = arrProgressiveEventsScanPlan[idxPlan];
        if( joPlan.nBlockFrom < 0 )
            continue;
        joLastPlan = joPlan;
        details.trace( strLogPrefix, "Progressive scan of ", log.v( "getPastEvents" ),
            "/", log.v( strEventName ), ", from block ", log.v( joPlan.nBlockFrom ),
            ", to block ", log.v( joPlan.nBlockTo ), ", block range is ", log.v( joPlan.type ),
            "..." );
        try {
            const joAllEventsInBlock =
                await safeGetPastEventsIterative(
                    details, strLogPrefix,
                    ethersProvider, attempts, joContract, strEventName,
                    joPlan.nBlockFrom, joPlan.nBlockTo, joFilter
                );
            if( joAllEventsInBlock && joAllEventsInBlock.length > 0 ) {
                details.success( strLogPrefix, "Progressive scan of ",
                    log.v( "getPastEvents" ), "/", log.v( strEventName ),
                    ", from block ", log.v( joPlan.nBlockFrom ), ", to block ",
                    log.v( joPlan.nBlockTo ), ", block range is ", log.v( joPlan.type ),
                    ", found ", log.v( joAllEventsInBlock.length ), " event(s)" );
                return joAllEventsInBlock;
            }
        } catch ( err ) {}
    }
    details.error( strLogPrefix, "Could not get Event \"", log.v( strEventName ),
        "\", from block ", log.v( joLastPlan.nBlockFrom ), ", to block ",
        log.v( joLastPlan.nBlockTo ), ", block range is ", log.v( joLastPlan.type ),
        ", using ", log.v( "progressive" ), " event scan" );
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
        details.error( "Failed call attempt ", idxAttempt,
            " to ", strFnName + "()", " via ",
            log.u( u ), ", error is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
    }
    ++ idxAttempt;
    while( ret === "" && idxAttempt <= cntAttempts ) {
        const isOnLine = rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( ! isOnLine ) {
            ret = retValOnFail;
            if( ! throwIfServerOffline )
                return ret;
            details.error( "Cannot call ", strFnName + "()",
                " via ", log.u( u ), " because server is off-line" );
            throw new Error(
                "Cannot " + strFnName + "() via " + u.toString() +
                " because server is off-line" );
        }
        details.trace( "Repeat call to ", strFnName + "()",
            " via ", log.u( u ), ", attempt ", idxAttempt );
        try {
            ret = await ethersProvider[strFnName]( address, param );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt ", idxAttempt,
                " to ", strFnName + "()", " via ",
                log.u( u ), ", error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) > cntAttempts && ret === "" ) {
        details.error( "Failed call to ", log.v( strFnName + "()" ),
            " via ", log.u( u ), " after ", cntAttempts, " attempts " );
        throw new Error( "Failed call to " + strFnName + "() via " + u.toString() +
            " after " + cntAttempts + " attempts" );
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
        details.error( "Failed call attempt ", idxAttempt, " to ", strFnName + "()",
            " via ", log.u( u ), ", error is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
    }
    ++ idxAttempt;
    while( txReceipt === "" && idxAttempt <= cntAttempts ) {
        const isOnLine = rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( ! isOnLine ) {
            ret = retValOnFail;
            if( ! throwIfServerOffline )
                return ret;
            details.error( "Cannot call ", strFnName + "()",
                " via ", log.u( u ), log.em( " because server is off-line" ) );
            throw new Error( "Cannot " + strFnName + "() via " + u.toString() +
                " because server is off-line" );
        }
        details.trace( "Repeat call to ", strFnName + "()", " via ", log.u( u ),
            ", attempt ", idxAttempt );
        try {
            ret = await ethersProvider[strFnName]( txHash );
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt ", idxAttempt,
                " to ", strFnName + "()", " via ",
                log.u( u ),", error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) > cntAttempts && ( txReceipt === "" || txReceipt === undefined ) ) {
        details.error( "Failed call to ", strFnName + "()",
            " via ", log.u( u ), " after ", cntAttempts, " attempts " );
        throw new Error( "Failed call to " + strFnName + "() via " + u.toString() +
            " after " + cntAttempts + " attempts" );
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
        details.trace( strLogPrefix, "First time, will query filter ", log.v( joFilter ),
            " on contract ", log.v( joContract.address ), " from block ",
            log.v( nBlockFrom.toHexString() ), " to block ", log.v( nBlockTo.toHexString() ),
            " while current latest block number on chain is ",
            log.v( nLatestBlockNumber.toHexString() ) );
        ret =
            await joContract.queryFilter(
                joFilter,
                nBlockFrom.toHexString(),
                nBlockTo.toHexString()
            );
        return ret;
    } catch ( err ) {
        ret = retValOnFail;
        details.error( strLogPrefix, "Failed filtering attempt ", idxAttempt, " for event ",
            log.v( strEventName ), " via ", log.u( u ), ", from block ",
            log.v( nBlockFrom.toHexString() ), ", to block ",
            log.v( nBlockTo.toHexString() ) + ", error is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
        if( owaspUtils.extractErrorMessage( err )
            .indexOf( strErrorTextAboutNotExistingEvent ) >= 0
        ) {
            details.error( strLogPrefix, "Did stopped filtering of ", log.v( strEventName ),
                " event because no such event exist in smart contract " );
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
            details.error( strLogPrefix, "Cannot do ", log.v( strEventName ),
                " event filtering via ", log.u( u ), " because server is off-line" );
            throw new Error(
                "Cannot do " + strEventName + " event filtering, from block " +
                nBlockFrom.toHexString() + ", to block " + nBlockTo.toHexString() +
                " via " + u.toString() + " because server is off-line"
            );
        }
        details.trace( strLogPrefix, "Repeat ", log.v( strEventName ),
            " event filtering via ", log.u( u ), ", attempt ", idxAttempt );
        try {
            details.trace( strLogPrefix, "Attempt ", idxAttempt,
                ", will query filter ", log.v( joFilter ),
                " on contract ", log.v( joContract.address ),
                " from block ", log.v( nBlockFrom.toHexString() ),
                " to block ", log.v( nBlockTo.toHexString() ) );
            ret =
                await joContract.queryFilter(
                    joFilter,
                    nBlockFrom.toHexString(),
                    nBlockTo.toHexString()
                );
            return ret;

        } catch ( err ) {
            ret = retValOnFail;
            details.error( strLogPrefix, "Failed filtering attempt ",
                idxAttempt, " for event ", log.v( strEventName ),
                " via ", log.u( u ), ", from block ",
                log.v( nBlockFrom.toHexString() ), ", to block ",
                log.v( nBlockTo.toHexString() ), ", error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            if( owaspUtils.extractErrorMessage( err )
                .indexOf( strErrorTextAboutNotExistingEvent ) >= 0
            ) {
                details.error( strLogPrefix, "Did stopped ",
                    log.v( strEventName ), " event filtering because " +
                    "no such event exist in smart contract " );
                return ret;
            }
        }
        ++ idxAttempt;
    }
    if( ( idxAttempt + 1 ) === cntAttempts && ret === "" ) {
        details.error( strLogPrefix, "Failed filtering attempt for ", log.v( strEventName ),
            " event via ", log.u( u ), ", from block ", log.v( nBlockFrom.toHexString() ),
            ", to block ", log.v( nBlockTo.toHexString() ), " after ", cntAttempts,
            " attempts " );
        throw new Error( "Failed filtering attempt for " + strEventName + " event, from block " +
            nBlockFrom.toHexString() + ", to block " + nBlockTo.toHexString() +
            " via " + u.toString() + " after " + cntAttempts + " attempts"
        );
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
        details.warning( strLogPrefix, "IMPORTANT NOTICE: Will skip iterative events scan " +
            "in block range from ", log.v( nBlockFrom ), " to ", log.v( nBlockTo ),
        " because it's ", log.fmtError( "DISABLED" ) );
        return await safeGetPastEvents(
            details, strLogPrefix,
            ethersProvider, attempts, joContract,
            strEventName, nBlockFrom, nBlockTo, joFilter
        );
    }
    const nLatestBlockNumber = owaspUtils.toBN(
        await imaHelperAPIs.safeGetBlockNumber( details, 10, ethersProvider ) );
    const nLatestBlockNumberPlus1 = nLatestBlockNumber.add( owaspUtils.toBN( 1 ) );
    let isLastLatest = false;
    if( nBlockTo == "latest" ) {
        isLastLatest = true;
        nBlockTo = nLatestBlockNumberPlus1;
        details.trace( strLogPrefix, "Iterative scan up to latest block #",
            log.v( nBlockTo.toHexString() ),
            " assumed instead of ", log.v( "latest" ) );
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
            details.warning( strLogPrefix, "IMPORTANT NOTICE: Will skip iterative scan and " +
                "use scan in block range from ", log.v( nBlockFrom.toHexString() ), " to ",
            log.v( nBlockTo.toHexString() ) );
            return await safeGetPastEvents(
                details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                nBlockFrom, nBlockTo, joFilter
            );
        }
    }
    details.trace( strLogPrefix, "Iterative scan in ", log.v( nBlockFrom.toHexString() ), "/",
        log.v( nBlockTo.toHexString() ), " block range..." );
    let idxBlockSubRangeTo = nBlockTo;
    for( ; true; ) {
        let idxBlockSubRangeFrom = idxBlockSubRangeTo.sub(
            owaspUtils.toBN( imaHelperAPIs.getBlocksCountInInIterativeStepOfEventsScan() ) );
        if( idxBlockSubRangeFrom.lt( nBlockFrom ) )
            idxBlockSubRangeFrom = nBlockFrom;
        try {
            details.trace( strLogPrefix, "Iterative scan of ",
                log.v( idxBlockSubRangeFrom.toHexString() ), "/",
                log.v( idxBlockSubRangeTo.toHexString() ),
                " block sub-range in ",
                log.v( nBlockFrom.toHexString() ), "/",
                log.v( nBlockTo.toHexString() ), " block range..." );
            const joAllEventsInBlock = await safeGetPastEvents(
                details, strLogPrefix,
                ethersProvider, attempts, joContract, strEventName,
                idxBlockSubRangeFrom, idxBlockSubRangeTo, joFilter
            );
            if( joAllEventsInBlock && joAllEventsInBlock != "" && joAllEventsInBlock.length > 0 ) {
                details.success( strLogPrefix, "Result of ", log.v( "iterative" ),
                    " scan in ", log.v( nBlockFrom.toHexString() ), "/",
                    log.v( nBlockTo.toHexString() ), " block range is ",
                    log.v( joAllEventsInBlock ) );
                return joAllEventsInBlock;
            }
        } catch ( err ) {
            details.critical( strLogPrefix, "Got scan error during interactive scan of ",
                log.v( idxBlockSubRangeFrom.toHexString() ), "/",
                log.v( idxBlockSubRangeTo.toHexString() ),
                " block sub-range in ", log.v( nBlockFrom.toHexString() ),
                "/", log.v( nBlockTo.toHexString() ),
                " block range, error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n" + log.s( err.stack ) );
        }
        idxBlockSubRangeTo = idxBlockSubRangeFrom;
        if( idxBlockSubRangeTo.lte( nBlockFrom ) )
            break;
    }
    details.debug( strLogPrefix, "Result of ", log.v( "iterative" ), " scan in ",
        log.v( nBlockFrom.toHexString() ), "/", log.v( nBlockTo.toHexString() ),
        " block range is empty" );
    return "";
}
