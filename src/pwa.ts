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
 * @file pwa.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log";
import * as rpcCall from "./rpcCall";
import * as imaBLS from "./bls";
import * as imaUtils from "./utils";

function computeWalkNodeIndices( nNodeNumber, nNodesCount ) {
    if( nNodesCount <= 1 )
        return []; // PWA is N/A
    if( !( nNodeNumber >= 0 && nNodeNumber < nNodesCount ) )
        return []; // PWA is N/A
    let i = nNodeNumber - 1;
    if( i < 0 )
        i = nNodesCount - 1;
    const arrWalkNodeIndices = [];
    for( ; true; ) {
        if( i == nNodeNumber )
            break;
        arrWalkNodeIndices.push( i );
        -- i;
        if( i < 0 )
            i = nNodesCount - 1;
    }
    return arrWalkNodeIndices;
}

export function checkLoopWorkTypeStringIsCorrect( strLoopWorkType ) {
    if( ! strLoopWorkType )
        return false;
    switch ( strLoopWorkType.toString().toLowerCase() ) {
    case "oracle":
    case "m2s":
    case "s2m":
    case "s2s":
        return true;
    }
    return false;
}

function composeEmptyStateForPendingWorkAnalysis() {
    return {
        "oracle": { "isInProgress": false, "ts": 0 },
        "m2s": { "isInProgress": false, "ts": 0 },
        "s2m": { "isInProgress": false, "ts": 0 },
        "s2s": { "mapS2S": { } }
    };
}

function getNodeProgressAndTimestamp( joNode, strLoopWorkType, nIndexS2S ) {
    if( ! ( "pwaState" in joNode ) )
        joNode.pwaState = composeEmptyStateForPendingWorkAnalysis();
    strLoopWorkType = strLoopWorkType.toLowerCase();
    if( ! ( strLoopWorkType in joNode.pwaState ) ) {
        throw new Error( `Specified value ${strLoopWorkType} is not a correct loop work type, ` +
            "cannot access info" );
    }
    if( strLoopWorkType != "s2s" )
        return joNode.pwaState[strLoopWorkType];
    if( ! ( nIndexS2S in joNode.pwaState[strLoopWorkType].mapS2S ) )
        joNode.pwaState[strLoopWorkType].mapS2S[nIndexS2S] = { "isInProgress": false, "ts": 0 };

    return joNode.pwaState[strLoopWorkType].mapS2S[nIndexS2S];
}

export async function checkOnLoopStart( imaState, strLoopWorkType, nIndexS2S ) {
    try {
        nIndexS2S = nIndexS2S || 0; // convert to number if undefined
        if( ! checkLoopWorkTypeStringIsCorrect( strLoopWorkType ) )
            throw new Error( `Specified value ${strLoopWorkType} is not a correct loop work type` );
        if( ! imaState.isPWA )
            return true; // PWA is N/A
        if( imaState.nNodesCount <= 1 )
            return true; // PWA is N/A
        if( !( imaState.nNodeNumber >= 0 && imaState.nNodeNumber < imaState.nNodesCount ) )
            return true; // PWA is N/A
        if( ! imaState.joSChainNetworkInfo )
            return true; // PWA is N/A
        const jarrNodes = imaState.joSChainNetworkInfo.network;
        if( ! jarrNodes )
            throw new Error( "S-Chain network info is not available yet to PWA" );
        const arrBusyNodeIndices = [];
        const arrWalkNodeIndices =
            computeWalkNodeIndices( imaState.nNodeNumber, imaState.nNodesCount );
        if( imaState.isPrintPWA ) {
            log.debug( "PWA will check loop start condition via node(s) sequence {}...",
                arrBusyNodeIndices );
        }
        const nUtcUnixTimeStamp = Math.floor( ( new Date() ).getTime() / 1000 );
        for( let i = 0; i < arrWalkNodeIndices.length; ++i ) {
            const walk_node_index = arrWalkNodeIndices[i];
            const joNode = jarrNodes[walk_node_index];
            const joProps = getNodeProgressAndTimestamp( joNode, strLoopWorkType, nIndexS2S );
            if( joProps && typeof joProps == "object" &&
                "isInProgress" in joProps && joProps.isInProgress &&
                joProps.ts != 0 && nUtcUnixTimeStamp >= joProps.ts
            ) {
                const d = nUtcUnixTimeStamp - joProps.ts;
                if( d >= imaState.nTimeoutSecondsPWA ) {
                    if( imaState.isPrintPWA ) {
                        log.warning(
                            "PWA busy state timeout for node #{}, old timestamp is {}, current " +
                            "system timestamp is {}, duration {} is greater than conditionally " +
                            "allowed {} and exceeded by {} second(s)", walk_node_index, joProps.ts,
                            nUtcUnixTimeStamp, d, imaState.nTimeoutSecondsPWA,
                            d - imaState.nTimeoutSecondsPWA );
                    };
                    joProps.isInProgress = false;
                    joProps.ts = 0;
                    continue;
                }
                arrBusyNodeIndices.push( walk_node_index );
            }
        }
        if( arrBusyNodeIndices.length > 0 ) {
            if( imaState.isPrintPWA ) {
                log.error( "PWA loop start condition check failed, busy node(s): {}",
                    arrBusyNodeIndices );
            }
            return false;
        }
        if( imaState.isPrintPWA )
            log.success( "PWA loop start condition check passed" );
    } catch ( err ) {
        log.critical( "Exception in PWA check on loop start: {err}, stack is:\n{stack}",
            err, err.stack );
    }
    return true;
}

export async function handleLoopStateArrived(
    imaState, nNodeNumber, strLoopWorkType, nIndexS2S, isStart, ts, signature
) {
    const se = isStart ? "start" : "end";
    let isSuccess = false;
    let joNode = null;
    try {
        if( ! checkLoopWorkTypeStringIsCorrect( strLoopWorkType ) )
            throw new Error( `Specified value ${strLoopWorkType} is not a correct loop work type` );
        if( ! imaState.isPWA )
            return true;
        if( imaState.nNodesCount <= 1 )
            return true; // PWA is N/A
        if( !( imaState.nNodeNumber >= 0 && imaState.nNodeNumber < imaState.nNodesCount ) )
            return true; // PWA is N/A
        if( ! imaState.joSChainNetworkInfo )
            return true; // PWA is N/A
        const jarrNodes = imaState.joSChainNetworkInfo.network;
        if( ! jarrNodes )
            throw new Error( "S-Chain network info is not available yet to PWA" );
        joNode = jarrNodes[nNodeNumber];
        const joProps = getNodeProgressAndTimestamp( joNode, strLoopWorkType, nIndexS2S );
        if( imaState.isPrintPWA ) {
            log.trace( "PWA loop-{} state arrived for node {}, PWA state {}, arrived " +
                "signature is {}", se, nNodeNumber, joNode.pwaState, signature );
        }
        const strMessageHash = imaBLS.keccak256ForPendingWorkAnalysis(
            nNodeNumber, strLoopWorkType, isStart, 0 + ts );
        const isSignatureOK = await imaBLS.doVerifyReadyHash(
            strMessageHash, nNodeNumber, signature, imaState.isPrintPWA );
        if( ! isSignatureOK )
            throw new Error( "BLS verification failed" );
        joProps.isInProgress = ( !!isStart );
        joProps.ts = 0 + ts;
        if( imaState.isPrintPWA ) {
            log.success(
                "PWA loop-{} state successfully verified for node {}, now have PWA state {}, " +
                "arrived signature is {}", se, nNodeNumber, joNode.pwaState, signature );
        }
        isSuccess = true;
    } catch ( err ) {
        isSuccess = false;
        log.critical(
            "Exception in PWA handler for loop-{} for node {}, PWA state {}, arrived signature " +
            "is {}, error is: {err}, stack is:\n{stack}", se, nNodeNumber,
            ( joNode && "pwaState" in joNode ) ? joNode.pwaState : "N/A", signature,
            err, err.stack );
    }
    return isSuccess;
}

async function notifyOnLoopImpl( imaState, strLoopWorkType, nIndexS2S, isStart ) {
    const se = isStart ? "start" : "end";
    try {
        nIndexS2S = nIndexS2S || 0; // convert to number if undefined
        if( ! checkLoopWorkTypeStringIsCorrect( strLoopWorkType ) )
            throw new Error( `Specified value ${strLoopWorkType} is not a correct loop work type` );
        if( ! imaState.isPWA )
            return true;
        if( imaState.nNodesCount <= 1 )
            return true; // PWA is N/A
        if( !( imaState.nNodeNumber >= 0 && imaState.nNodeNumber < imaState.nNodesCount ) )
            return true; // PWA is N/A
        if( ! imaState.joSChainNetworkInfo )
            return true; // PWA is N/A
        const jarrNodes = imaState.joSChainNetworkInfo.network;
        if( ! jarrNodes )
            throw new Error( "S-Chain network info is not available yet to PWA" );
        const nUtcUnixTimeStamp = Math.floor( ( new Date() ).getTime() / 1000 );

        const strMessageHash =
            imaBLS.keccak256ForPendingWorkAnalysis(
                0 + imaState.nNodeNumber, strLoopWorkType, isStart, nUtcUnixTimeStamp );
        const signature = await imaBLS.doSignReadyHash( strMessageHash, imaState.isPrintPWA );
        await handleLoopStateArrived(
            imaState, imaState.nNodeNumber, strLoopWorkType,
            nIndexS2S, isStart, nUtcUnixTimeStamp, signature
        ); // save own started
        for( let i = 0; i < jarrNodes.length; ++i ) {
            const isThisNode = ( i == imaState.nNodeNumber ) ? true : false;
            if( isThisNode )
                continue; // skip this node
            const joNode = jarrNodes[i];
            const strNodeURL = imaUtils.composeImaAgentNodeUrl( joNode, isThisNode );
            const rpcCallOpts = null;
            let joCall = await rpcCall.create( strNodeURL, rpcCallOpts )
                .catch( async function( err ) {
                    log.error(
                        "PWA failed to perform] loop-{} notification RPC call to node #{} with " +
                        "URL {url}, error is: {err}", se, i, strNodeURL, err );
                    if( joCall )
                        await joCall.disconnect();
                    joCall = null;
                } );
            if( ! joCall )
                return false;
            const joIn = {
                "method": "skale_imaNotifyLoopWork",
                "params": {
                    "nNodeNumber": 0 + imaState.nNodeNumber,
                    "strLoopWorkType": "" + strLoopWorkType,
                    "nIndexS2S": 0 + nIndexS2S,
                    "isStart": ( !!isStart ),
                    "ts": nUtcUnixTimeStamp,
                    "signature": signature
                }
            };
            await joCall.call( joIn ); // no return value needed here
            if( imaState.isPrintPWA ) {
                log.success( "Was successfully sent PWA loop-{} notification to " +
                    "node #{} with URL {url}", se, i, strNodeURL );
            }
            await joCall.disconnect();
        }
    } catch ( err ) {
        log.error( "Exception in PWA notify on loop {}: {err}, stack is:\n{stack}", se,
            err, err.stack );
    }
    return true;
}

export async function notifyOnLoopStart( imaState, strLoopWorkType, nIndexS2S ) {
    return await notifyOnLoopImpl( imaState, strLoopWorkType, nIndexS2S, true );
}

export async function notifyOnLoopEnd( imaState, strLoopWorkType, nIndexS2S ) {
    return await notifyOnLoopImpl( imaState, strLoopWorkType, nIndexS2S, false );
}
