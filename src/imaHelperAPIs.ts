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
 * @file imaHelperAPIs.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as rpcCall from "./rpcCall.js";
import * as threadInfo from "./threadInfo.js";

export const longSeparator: string =
    "============================================================" +
    "===========================================================";

let gMillisecondsSleepBeforeFetchOutgoingMessageEvent: number = 5000;
let gMillisecondsSleepBetweenTransactionsOnSChain: number = 0; // example - 5000
let gFlagWaitForNextBlockOnSChain: boolean = false;

export function getMillisecondsSleepBeforeFetchOutgoingMessageEvent(): number {
    return gMillisecondsSleepBeforeFetchOutgoingMessageEvent;
}
export function setMillisecondsSleepBeforeFetchOutgoingMessageEvent( val?: number ): void {
    gMillisecondsSleepBeforeFetchOutgoingMessageEvent = val || 0;
}

export function getSleepBetweenTransactionsOnSChainMilliseconds(): number {
    return gMillisecondsSleepBetweenTransactionsOnSChain;
}
export function setSleepBetweenTransactionsOnSChainMilliseconds( val?: number ): void {
    gMillisecondsSleepBetweenTransactionsOnSChain = val || 0;
}

export function getWaitForNextBlockOnSChain(): boolean {
    return ( !!gFlagWaitForNextBlockOnSChain );
}
export function setWaitForNextBlockOnSChain( val: any ) {
    gFlagWaitForNextBlockOnSChain = ( !!val );
}

export const currentTimestamp = (): number => {
    return Date.now().valueOf() / 1000;
};

export async function safeWaitForNextBlockToAppear(
    details: log.TLogger, ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider ) {
    const nBlockNumber: any =
        owaspUtils.toBN( await safeGetBlockNumber( details, 10, ethersProvider ) );
    details.trace( "Waiting for next block to appear..." );
    details.trace( "    ...have block {}", nBlockNumber.toHexString() );
    for( ; true; ) {
        await threadInfo.sleep( 1000 );
        const nBlockNumber2 =
            owaspUtils.toBN( await safeGetBlockNumber( details, 10, ethersProvider ) );
        details.trace( "    ...have block {}", nBlockNumber2.toHexString() );
        if( nBlockNumber2.gt( nBlockNumber ) )
            break;
    }
}

export async function safeGetBlockNumber(
    details: log.TLogger, cntAttempts: number,
    ethersProvider: owaspUtils.ethersMod.providers.JsonRpcProvider,
    retValOnFail?: any, throwIfServerOffline?: boolean
) {
    const strFnName: string = "getBlockNumber";
    const u: string = owaspUtils.ethersProviderToUrl( ethersProvider );
    const nWaitStepMilliseconds = 10 * 1000;
    if( throwIfServerOffline == null || throwIfServerOffline == undefined )
        throwIfServerOffline = true;
    cntAttempts = ( owaspUtils.parseIntOrHex( cntAttempts ) < 1 )
        ? 1 : owaspUtils.parseIntOrHex( cntAttempts );
    if( retValOnFail == null || retValOnFail == undefined )
        retValOnFail = "";
    let ret = retValOnFail;
    let idxAttempt = 1;
    for( ; idxAttempt <= cntAttempts; ++idxAttempt ) {
        const isOnLine = await rpcCall.checkUrl( u, nWaitStepMilliseconds );
        if( !isOnLine ) {
            ret = retValOnFail;
            if( !throwIfServerOffline )
                return ret;
            details.error( "Cannot call {} via {url} because server is off-line",
                strFnName + "()", u );
            throw new Error( `Cannot ${strFnName}() via ${u} because server is off-line` );
        }
        details.trace( "Repeat call to {} via {url}, attempt {}", strFnName + "()", u, idxAttempt );
        try {
            ret = await ( ethersProvider as any )[strFnName]();
            return ret;
        } catch ( err ) {
            ret = retValOnFail;
            details.error( "Failed call attempt {} to  via {url}, error is: {err}, " +
                "stack is:\n{stack}", idxAttempt, strFnName + "()", u, err, err );
        }
    }
    if( ( idxAttempt + 1 ) > cntAttempts && ret === "" ) {
        details.error( "Failed call to {} via {url} after {} attempts ",
            strFnName + "()", u, cntAttempts );
        throw new Error( `Failed call to ${strFnName}() via ${u} after ${cntAttempts} attempts` );
    }
    return ret;
}

let gCountOfBlocksInIterativeStep: number = 1000;
let gMaxBlockScanIterationsInAllRange: number = 5000;

export function getBlocksCountInInIterativeStepOfEventsScan(): number {
    return gCountOfBlocksInIterativeStep;
}
export function setBlocksCountInInIterativeStepOfEventsScan( n?: number ): void {
    if( !n )
        gCountOfBlocksInIterativeStep = 0;
    else {
        gCountOfBlocksInIterativeStep = owaspUtils.parseIntOrHex( n );
        if( gCountOfBlocksInIterativeStep < 0 )
            gCountOfBlocksInIterativeStep = 0;
    }
}

export function getMaxIterationsInAllRangeEventsScan(): number {
    return gCountOfBlocksInIterativeStep;
}
export function setMaxIterationsInAllRangeEventsScan( n?: number ): void {
    if( !n )
        gMaxBlockScanIterationsInAllRange = 0;
    else {
        gMaxBlockScanIterationsInAllRange = owaspUtils.parseIntOrHex( n );
        if( gMaxBlockScanIterationsInAllRange < 0 )
            gMaxBlockScanIterationsInAllRange = 0;
    }
}

// default S<->S transfer mode for "--s2s-transfer" is "forward"
let gFlagIsForwardS2S: boolean = true;

export function getS2STransferModeDescription(): string {
    return gFlagIsForwardS2S ? "forward" : "reverse";
}

export function getS2STransferModeDescriptionColorized(): string {
    return log.posNeg( gFlagIsForwardS2S, "forward", "reverse" );
}

export function isForwardS2S(): boolean {
    return ( !!gFlagIsForwardS2S );
}

export function isReverseS2S(): boolean {
    return ( !!gFlagIsForwardS2S );
}

export function setForwardS2S( b?: boolean ): void {
    if( b == null || b == undefined )
        b = true;
    gFlagIsForwardS2S = ( !!b );
}

export function setReverseS2S( b?: boolean ): void {
    if( b == null || b == undefined )
        b = true;
    gFlagIsForwardS2S = !b;
}
