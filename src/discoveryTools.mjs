// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file discoveryTools.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as rpcCall from "./rpcCall.mjs";
import * as state from "./state.mjs";
import * as imaUtils from "./utils.mjs";
import * as threadInfo from "./threadInfo.mjs";

export function formatBalanceInfo( bi, strAddress ) {
    let s = "";
    s += log.fmtInformation( "{p}", bi.assetName );
    if( "assetAddress" in bi &&
        typeof bi.assetAddress == "string" && bi.assetAddress.length > 0 )
        s += log.fmtDebug( "/{}", bi.assetAddress );
    if( "idToken" in bi )
        s += log.fmtDebug( " token ID {}", bi.idToken );
    s += log.posNeg( ( bi.assetName == "ERC721" ) ? true : false, " owner is ", " balance is " );
    s += ( bi.assetName == "ERC721" )
        ? log.fmtInformation( "{p}", bi.owner ) : log.fmtInformation( "{p}", bi.balance );
    if( bi.assetName == "ERC721" ) {
        const isSame =
            ( bi.owner.trim().toLowerCase() == strAddress.trim().toLowerCase() );
        s += " " + ( isSame
            ? log.fmtSuccess( "same (as account {} specified in the command line arguments)",
                strAddress )
            : log.fmtError( "different (than account {} specified in the command line arguments)",
                strAddress )
        );
    }
    return s;
}

function getSChainNodesCount( joSChainNetworkInfo ) {
    try {
        if( ! joSChainNetworkInfo )
            return 0;
        const jarrNodes = joSChainNetworkInfo.network;
        const cntNodes = jarrNodes.length;
        return cntNodes;
    } catch ( err ) {
        return 0;
    }
}

export function isSChainNodeFullyDiscovered( joNode ) {
    if( ! joNode )
        return false;
    if( joNode && "imaInfo" in joNode && typeof joNode.imaInfo == "object" &&
        "t" in joNode.imaInfo && typeof joNode.imaInfo.t == "number" &&
        joNode.imaInfo.t > 0 &&
        "n" in joNode.imaInfo && typeof joNode.imaInfo.n == "number" &&
        joNode.imaInfo.n > 0 &&
        "BLSPublicKey0" in joNode.imaInfo &&
        typeof joNode.imaInfo.BLSPublicKey0 == "string" &&
        joNode.imaInfo.BLSPublicKey0.length > 0 &&
        "BLSPublicKey1" in joNode.imaInfo &&
        typeof joNode.imaInfo.BLSPublicKey1 == "string" &&
        joNode.imaInfo.BLSPublicKey1.length > 0 &&
        "BLSPublicKey2" in joNode.imaInfo &&
        typeof joNode.imaInfo.BLSPublicKey2 == "string" &&
        joNode.imaInfo.BLSPublicKey2.length > 0 &&
        "BLSPublicKey3" in joNode.imaInfo &&
        typeof joNode.imaInfo.BLSPublicKey3 == "string" &&
        joNode.imaInfo.BLSPublicKey3.length > 0 &&
        "commonBLSPublicKey0" in joNode.imaInfo &&
        typeof joNode.imaInfo.commonBLSPublicKey0 == "string" &&
        joNode.imaInfo.commonBLSPublicKey0.length > 0 &&
        "commonBLSPublicKey1" in joNode.imaInfo &&
        typeof joNode.imaInfo.commonBLSPublicKey1 == "string" &&
        joNode.imaInfo.commonBLSPublicKey1.length > 0 &&
        "commonBLSPublicKey2" in joNode.imaInfo &&
        typeof joNode.imaInfo.commonBLSPublicKey2 == "string" &&
        joNode.imaInfo.commonBLSPublicKey2.length > 0 &&
        "commonBLSPublicKey3" in joNode.imaInfo &&
        typeof joNode.imaInfo.commonBLSPublicKey3 == "string" &&
        joNode.imaInfo.commonBLSPublicKey3.length > 0
    )
        return true;
    return false;
}

export function getSChainDiscoveredNodesCount( joSChainNetworkInfo ) {
    try {
        if( ! joSChainNetworkInfo )
            return 0;
        if( ! ( "network" in joSChainNetworkInfo && joSChainNetworkInfo.network ) )
            return 0;
        const jarrNodes = joSChainNetworkInfo.network;
        const cntNodes = jarrNodes.length;
        if( cntNodes <= 0 )
            return 0;
        let cntDiscovered = 0;
        for( let i = 0; i < cntNodes; ++ i ) {
            try {
                const joNode = joSChainNetworkInfo.network[i];
                if( isSChainNodeFullyDiscovered( joNode ) )
                    ++ cntDiscovered;
            } catch ( err ) {
                return 0;
            }
        }
        return cntDiscovered;
    } catch ( err ) {
        return 0;
    }
}

export async function waitUntilSChainStarted() {
    const imaState = state.get();
    log.debug( "Checking S-Chain is accessible and sane..." );
    if( ( !imaState.chainProperties.sc.strURL ) ||
        imaState.chainProperties.sc.strURL.length === 0
    ) {
        log.warning( "Skipped, S-Chain URL was not provided." );
        return;
    }
    let bSuccess = false;
    let idxWaitAttempt = 0;
    const isSilentReDiscovery = true; // it must be silent during S-Chain sanity check
    for( ; !bSuccess; ) {
        try {
            log.attention( "This S-Chain discovery will be done for startup pre-requisite" );
            const nCountToWait = -1;
            let isError = false;
            const joSChainNetworkInfo = await discoverSChainNetwork(
                null, isSilentReDiscovery, null, nCountToWait
            ).catch( function( err ) {
                log.critical( "S-Chain network discovery attempt failed: {err}", err );
                isError = true;
            } );
            if( ( !isError ) && joSChainNetworkInfo && typeof joSChainNetworkInfo == "object" ) {
                imaState.joSChainNetworkInfo = joSChainNetworkInfo;
                bSuccess = true;
            }
        } catch ( err ) {
            bSuccess = false;
        }
        if( !bSuccess )
            ++ idxWaitAttempt;
        if( idxWaitAttempt >= imaState.nMaxWaitSChainAttempts ) {
            log.warning( "Incomplete, S-Chain sanity check failed after {} attempts.",
                idxWaitAttempt );
            return;
        }
        await threadInfo.sleep( 1000 );
    }
    log.success( "Done, S-Chain is accessible and sane." );
}

export function isSendImaAgentIndex() {
    return true;
}

let gTimerSChainDiscovery = null;
let gFlagIsInSChainDiscovery = false;

function composeStillUnknownNodesMessage( joSChainNetworkInfo, cntStillUnknown, cntNodesOnChain ) {
    let strMessage = log.fmtSuccess( ", {} of {} still unknown (",
        cntStillUnknown, cntNodesOnChain );
    try {
        const jarrNodes = joSChainNetworkInfo.network;
        let cntBad = 0;
        for( let i = 0; i < jarrNodes.length; ++i ) {
            const joNode = jarrNodes[i];
            try {
                if( isSChainNodeFullyDiscovered( joNode ) )
                    continue;
                if( cntBad > 0 )
                    strMessage += log.fmtSuccess( ", " );
                const strNodeURL = imaUtils.composeSChainNodeUrl( joNode );
                const strNodeDescColorized = log.fmtAttention( "#{}({url})", i, strNodeURL );
                strMessage += strNodeDescColorized;
                ++ cntBad;
            } catch ( err ) { }
        }
    } catch ( err ) { }
    strMessage += log.fmtSuccess( ")" );
    return strMessage;
}

async function handlePeriodicDiscoveryAttemptActions( isSilentReDiscovery, fnAfter ) {
    if( gFlagIsInSChainDiscovery ) {
        isInsideAsyncHandler = false;
        log.information( "Notice: long this S-Chain re-discovery is in progress now..." );
        return;
    }
    fnAfter = fnAfter || function() {};
    gFlagIsInSChainDiscovery = true;
    const cntNodesOnChain = getSChainNodesCount( imaState.joSChainNetworkInfo );
    try {
        let nCountToWait = ( cntNodesOnChain > 2 )
            ? Math.ceil( cntNodesOnChain * 2 / 3 + 1 )
            : cntNodesOnChain;
        if( nCountToWait > cntNodesOnChain )
            nCountToWait = cntNodesOnChain;
        const cntDiscovered = getSChainDiscoveredNodesCount( imaState.joSChainNetworkInfo );
        if( cntDiscovered >= cntNodesOnChain ) {
            if( ! isSilentReDiscovery ) {
                log.information( "Everything is discovered about this S-Chain. ",
                    "No re-discovery is needed" );
            }
            if( gTimerSChainDiscovery != null ) {
                clearInterval( gTimerSChainDiscovery );
                gTimerSChainDiscovery = null;
                if( ! isSilentReDiscovery )
                    log.information( "This S-Chain re-discovery stopped" );
            }
            // fnAfter() will be called here inside async call at beginning
            gFlagIsInSChainDiscovery = false;
            return;
        }
        if( cntDiscovered < cntNodesOnChain ) {
            if( ! isSilentReDiscovery ) {
                const cntUnDiscoveredYet = cntNodesOnChain - cntDiscovered;
                log.information( "Have {} of {} nodes of this S-Chain not discovered yet " +
                    "on re-discovery step.", cntUnDiscoveredYet, cntNodesOnChain );
            }
        }
        if( ! isSilentReDiscovery ) {
            log.information( "This S-Chain discovery will be done for re-discover task" );
            log.information( "Will re-discover {}-nodes S-Chain network, {} node(s) already " +
                "discovered...", nCountToWait, cntDiscovered );
        }
        let isError = false;
        const joSChainNetworkInfo = await discoverSChainNetwork(
            null, isSilentReDiscovery, imaState.joSChainNetworkInfo, nCountToWait
        ).catch( function( err ) {
            isError = true;
            log.critical( "S-Chain network re-discovery failed: {err}", err );
        } );
        if( ! isError ) {
            const cntDiscoveredNow = getSChainDiscoveredNodesCount( joSChainNetworkInfo );
            let strMessage =
                log.fmtSuccess( "S-Chain network was re-discovered, {} of {} node(s)" +
                    "({} nodes known)", cntDiscoveredNow, nCountToWait, cntDiscoveredNow );
            const cntStillUnknown = cntNodesOnChain - cntDiscoveredNow;
            if( cntStillUnknown > 0 ) {
                strMessage += composeStillUnknownNodesMessage(
                    joSChainNetworkInfo, cntStillUnknown, cntNodesOnChain );
            }
            if( ! isSilentReDiscovery ) {
                strMessage += log.fmtSuccess( ", complete re-discovered S-Chain " +
                    "network info: {}", joSChainNetworkInfo );
            }
            log.information( strMessage );
            imaState.joSChainNetworkInfo = joSChainNetworkInfo;
        }
        fnAfter();
        continueSChainDiscoveryInBackgroundIfNeeded( isSilentReDiscovery, null );
    } catch ( err ) { }
    gFlagIsInSChainDiscovery = false;
    // fnAfter() will be called here inside async call at beginning
    continueSChainDiscoveryInBackgroundIfNeeded( isSilentReDiscovery, fnAfter );
}

export async function continueSChainDiscoveryInBackgroundIfNeeded( isSilentReDiscovery, fnAfter ) {
    if( gTimerSChainDiscovery != null )
        return;
    fnAfter = fnAfter || function() {};
    const imaState = state.get();
    if( imaState.joSChainDiscovery.repeatIntervalMilliseconds <= 0 ) {
        if( ! isSilentReDiscovery )
            log.information( "This S-Chain re-discovery will not be preformed" );
        fnAfter();
        return; // no S-Chain re-discovery, special mode
    }
    const cntNodesOnChain = getSChainNodesCount( imaState.joSChainNetworkInfo );
    let nCountToWait = ( cntNodesOnChain > 2 )
        ? Math.ceil( cntNodesOnChain * 2 / 3 + 1 )
        : cntNodesOnChain;
    if( nCountToWait > cntNodesOnChain )
        nCountToWait = cntNodesOnChain;
    const cntDiscovered = getSChainDiscoveredNodesCount( imaState.joSChainNetworkInfo );
    if( cntDiscovered >= cntNodesOnChain ) {
        if( ! isSilentReDiscovery ) {
            log.attention( "Everything is discovered about this S-Chain. " +
                "No re-discovery is needed" );
        }
        if( gTimerSChainDiscovery != null ) {
            clearInterval( gTimerSChainDiscovery );
            gTimerSChainDiscovery = null;
            if( ! isSilentReDiscovery )
                log.notice( "This S-Chain re-discovery stopped" );
        }
        fnAfter();
        return;
    }
    if( cntDiscovered < cntNodesOnChain ) {
        if( ! isSilentReDiscovery ) {
            const cntUnDiscoveredYet = cntNodesOnChain - cntDiscovered;
            log.information( "Have {} of {} nodes of this S-Chain not discovered yet before " +
                "continuing re-discovery.", cntUnDiscoveredYet, cntNodesOnChain );
        }
    }
    gTimerSChainDiscovery = setInterval( function() {
        handlePeriodicDiscoveryAttemptActions( isSilentReDiscovery, fnAfter );
    }, imaState.joSChainDiscovery.periodicDiscoveryInterval );
}

function handleDiscoverSkaleImaInfoResult(
    optsDiscover, strNodeDescColorized, joNode, joCall, joIn, joOut
) {
    joNode.imaInfo = joOut.result;
    if( isSChainNodeFullyDiscovered( joNode ) )
        ++ optsDiscover.nCountReceivedImaDescriptions;
    if( !optsDiscover.isSilentReDiscovery ) {
        log.success( "{p}OK, got {} node {} IMA information({} of {}).",
            optsDiscover.strLogPrefix, strNodeDescColorized, joNode.nodeID,
            optsDiscover.nCountReceivedImaDescriptions, optsDiscover.cntNodes );
    }
}

async function discoverSChainWalkNodes( optsDiscover ) {
    optsDiscover.cntFailed = 0;
    for( let i = 0; i < optsDiscover.cntNodes; ++ i ) {
        const nCurrentNodeIdx = 0 + i;
        const joNode = optsDiscover.jarrNodes[nCurrentNodeIdx];
        const strNodeURL = imaUtils.composeSChainNodeUrl( joNode );
        const strNodeDescColorized = log.fmtAttention( "#{}({url})", nCurrentNodeIdx, strNodeURL );
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.information( "{p}Will try to discover S-Chain node {}...",
                optsDiscover.strLogPrefix, strNodeDescColorized );
        }
        try {
            if( optsDiscover.joPrevSChainNetworkInfo &&
                "network" in optsDiscover.joPrevSChainNetworkInfo &&
                optsDiscover.joPrevSChainNetworkInfo.network ) {
                const joPrevNode =
                    optsDiscover.joPrevSChainNetworkInfo.network[nCurrentNodeIdx];
                if( isSChainNodeFullyDiscovered( joPrevNode ) ) {
                    joNode.imaInfo = JSON.parse( JSON.stringify( joPrevNode.imaInfo ) );
                    if( ! optsDiscover.isSilentReDiscovery ) {
                        log.information(
                            "{p}OK, in case of {} node {} will use previous discovery result.",
                            optsDiscover.strLogPrefix, strNodeDescColorized, joNode.nodeID );
                    }
                    continue; // skip this node discovery, enrich rest of nodes
                }
            }
        } catch ( err ) { }
        const rpcCallOpts = null;
        let joCall = null;
        try {
            joCall = await rpcCall.create( strNodeURL, rpcCallOpts );
            if( ! joCall )
                throw new Error( `Failed to create JSON RPC call object to ${strNodeURL}` );
            const joIn = { "method": "skale_imaInfo", "params": { } };
            if( isSendImaAgentIndex() )
                joIn.params.fromImaAgentIndex = optsDiscover.imaState.nNodeNumber;
            const joOut = await joCall.call( joIn );
            await handleDiscoverSkaleImaInfoResult(
                optsDiscover, strNodeDescColorized, joNode, joCall, joIn, joOut );
        } catch ( err ) {
            if( ! optsDiscover.isSilentReDiscovery ) {
                log.critical(
                    "{p}JSON RPC call(err) to S-Chain node {} failed: {err}, stack is:\n{stack}",
                    optsDiscover.strLogPrefix, strNodeDescColorized, err, err.stack );
            }
            ++ optsDiscover.cntFailed;
            if( joCall )
                await joCall.disconnect();
        }
    }
}

async function discoverSChainWait( optsDiscover ) {
    if( ! optsDiscover.isSilentReDiscovery ) {
        log.debug( "{p}Waiting for response from at least {} node(s)...",
            optsDiscover.strLogPrefix, optsDiscover.nCountToWait );
    }
    let nWaitAttempt = 0;
    const nWaitStepMilliseconds = 1 * 1000; // step can be small here
    let cntWaitAttempts = Math.floor(
        optsDiscover.imaState.joSChainDiscovery.repeatIntervalMilliseconds /
        nWaitStepMilliseconds ) - 3;
    if( cntWaitAttempts < 1 )
        cntWaitAttempts = 1;
    const iv = setInterval( function() {
        optsDiscover.nCountAvailable =
            optsDiscover.cntNodes - optsDiscover.cntFailed;
        // notice, below provided up-to-date count of available and fully discovered nodes:
        optsDiscover.nCountReceivedImaDescriptions =
            getSChainDiscoveredNodesCount( optsDiscover.joSChainNetworkInfo );
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.debug(
                "Waiting (S-Chain discovery) attempt {} of {} for S-Chain nodes, " +
                "total {}, available {}, expected at least {}, discovered {}",
                nWaitAttempt, cntWaitAttempts, optsDiscover.cntNodes, optsDiscover.nCountAvailable,
                optsDiscover.nCountToWait, optsDiscover.nCountReceivedImaDescriptions );
        }
        if( !optsDiscover.isSilentReDiscovery ) {
            log.information( "{p}Have S-Chain description response about {} of {} node(s).",
                optsDiscover.strLogPrefix, optsDiscover.nCountReceivedImaDescriptions,
                optsDiscover.cntNodes );
        }
        if( optsDiscover.nCountReceivedImaDescriptions >= optsDiscover.nCountToWait ) {
            if( !optsDiscover.isSilentReDiscovery ) {
                log.success(
                    "{p}This S-Chain discovery will finish with {} of {} node(s) discovered.",
                    optsDiscover.strLogPrefix, optsDiscover.nCountReceivedImaDescriptions,
                    optsDiscover.cntNodes );
            }
            clearInterval( iv );
            if( optsDiscover.fnAfter )
                optsDiscover.fnAfter( null, optsDiscover.joSChainNetworkInfo );
            return;
        }
        ++ nWaitAttempt;
        if( nWaitAttempt >= cntWaitAttempts ) {
            clearInterval( iv );
            const strErrorDescription = "S-Chain network discovery wait timeout, " +
                "network will be re-discovered later";
            if( ! optsDiscover.isSilentReDiscovery ) {
                log.warning( "{p}This S-Chain discovery will finish due to: {err}",
                    optsDiscover.strLogPrefix, strErrorDescription );
            }
            if( getSChainDiscoveredNodesCount( optsDiscover.joSChainNetworkInfo ) > 0 ) {
                if( optsDiscover.fnAfter )
                    optsDiscover.fnAfter( null, optsDiscover.joSChainNetworkInfo );
            } else {
                if( optsDiscover.fnAfter )
                    optsDiscover.fnAfter( new Error( strErrorDescription ), null );
            }
            return;
        }
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.debug( "{p}S-Chain discovery waiting attempt {} of {} for {} node answer(s)",
                optsDiscover.strLogPrefix, nWaitAttempt, cntWaitAttempts,
                ( optsDiscover.nCountToWait - optsDiscover.nCountReceivedImaDescriptions ) );
        }
    }, nWaitStepMilliseconds );
}

async function handleDiscoverSkaleNodesRpcInfoResult( optsDiscover, scURL, joCall, joIn, joOut ) {
    if( ! optsDiscover.isSilentReDiscovery ) {
        log.trace( "{p}OK, got (own) S-Chain network information: {}",
            optsDiscover.strLogPrefix, joOut.result );
        log.success( "{p}OK, got S-Chain {url} network information.",
            optsDiscover.strLogPrefix, scURL );
    }
    optsDiscover.nCountReceivedImaDescriptions = 0;
    optsDiscover.joSChainNetworkInfo = joOut.result;
    if( ! optsDiscover.joSChainNetworkInfo ) {
        const err2 = new Error(
            "Got wrong response, network information description was not detected" );
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.critical( "{p}Network was not detected via call to {url}: {err}",
                optsDiscover.strLogPrefix, scURL, err2 );
        }
        if( optsDiscover.fnAfter )
            optsDiscover.fnAfter( err2, null );
        await joCall.disconnect();
        throw err2;
    }
    optsDiscover.jarrNodes = optsDiscover.joSChainNetworkInfo.network;
    optsDiscover.cntNodes = optsDiscover.jarrNodes.length;
    if( optsDiscover.nCountToWait <= 0 || optsDiscover.nCountToWait >= optsDiscover.cntNodes ) {
        optsDiscover.nCountToWait = ( optsDiscover.cntNodes > 2 )
            ? Math.ceil( optsDiscover.cntNodes * 2 / 3 )
            : optsDiscover.cntNodes;
    }
    if( optsDiscover.nCountToWait > optsDiscover.cntNodes )
        optsDiscover.nCountToWait = optsDiscover.cntNodes;
    if( ! optsDiscover.isSilentReDiscovery ) {
        log.information( "{p}Will gather details of {} of {} node(s)...",
            optsDiscover.strLogPrefix, optsDiscover.nCountToWait, optsDiscover.cntNodes );
    }
    await discoverSChainWalkNodes( optsDiscover );
    optsDiscover.nCountAvailable = optsDiscover.cntNodes - optsDiscover.cntFailed;
    if( ! optsDiscover.isSilentReDiscovery ) {
        log.debug( "Waiting for S-Chain nodes, total {}, available {}, expected at least {}",
            optsDiscover.cntNodes, optsDiscover.nCountAvailable, optsDiscover.nCountToWait );
    }
    if( optsDiscover.nCountAvailable < optsDiscover.nCountToWait ) {
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.critical(
                "{p}Not enough nodes available on S-Chain, total {}, " +
                "available {}, expected at least {}",
                optsDiscover.strLogPrefix, optsDiscover.cntNodes,
                optsDiscover.nCountAvailable, optsDiscover.nCountToWait );
        }
        const err = new Error( "Not enough nodes available on S-Chain, " +
            `total ${optsDiscover.cntNodes}, available ${optsDiscover.nCountAvailable}, ` +
            `expected at least ${optsDiscover.nCountToWait}` );
        if( optsDiscover.fnAfter )
            optsDiscover.fnAfter( err, null );
        throw err;
    }
    let rv = false;
    await discoverSChainWait( optsDiscover ).then( function() {
        if( optsDiscover.fnAfter )
            optsDiscover.fnAfter( null, optsDiscover.joSChainNetworkInfo );
        rv = true;
    } ).catch( function( err ) {
        if( optsDiscover.fnAfter )
            optsDiscover.fnAfter( err, null );
    } );
    return rv;
}

export async function discoverSChainNetwork(
    fnAfter, isSilentReDiscovery, joPrevSChainNetworkInfo, nCountToWait ) {
    const optsDiscover = {
        fnAfter: fnAfter,
        isSilentReDiscovery: ( !!isSilentReDiscovery ),
        joPrevSChainNetworkInfo: joPrevSChainNetworkInfo || null,
        nCountToWait: nCountToWait,
        imaState: state.get(),
        strLogPrefix: "S-Chain network discovery: ",
        joSChainNetworkInfo: null,
        jarrNodes: [],
        cntNodes: 0,
        cntFailed: 0,
        nCountReceivedImaDescriptions: 0,
        nCountAvailable: 0
    };
    if( optsDiscover.nCountToWait == null ||
        optsDiscover.nCountToWait == undefined ||
        optsDiscover.nCountToWait < 0 )
        optsDiscover.nCountToWait = 0;
    if( !optsDiscover.isSilentReDiscovery )
        log.information( "{p}This S-Chain discovery will start...", optsDiscover.strLogPrefix );
    let joCall = null;
    try {
        const scURL = optsDiscover.imaState.chainProperties.sc.strURL;
        const rpcCallOpts = null;
        joCall = await rpcCall.create( scURL, rpcCallOpts );
        if( ! joCall )
            throw new Error( `Failed to create JSON RPC call object to ${scURL}` );
        const joIn = { "method": "skale_nodesRpcInfo", "params": { } };
        if( isSendImaAgentIndex() )
            joIn.params.fromImaAgentIndex = optsDiscover.imaState.nNodeNumber;
        const joOut = await joCall.call( joIn );
        await handleDiscoverSkaleNodesRpcInfoResult(
            optsDiscover, scURL, joCall, joIn, joOut
        ).catch( function( err ) {
            log.critical(
                "{p}JSON RPC call(in discoverSChainNetwork) error: {err}, stack is:\n{stack}",
                optsDiscover.strLogPrefix, err, err.stack );
        } );
    } catch ( err ) {
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.critical(
                "{p}JSON RPC call(discoverSChainNetwork) to S-Chain failed: " +
                "{err}, stack is:\n{stack}", optsDiscover.strLogPrefix,
                err, err.stack );
        }
        optsDiscover.joSChainNetworkInfo = null;
        if( optsDiscover.fnAfter )
            optsDiscover.fnAfter( err, null );
        if( joCall )
            await joCall.disconnect();
        throw err;
    }
    return optsDiscover.joSChainNetworkInfo;
}

let gIntervalPeriodicDiscovery = null;

function checkPeriodicDiscoveryNoLongerNeeded( joSChainNetworkInfo, isSilentReDiscovery ) {
    if( ! joSChainNetworkInfo )
        return false;
    const imaState = state.get();
    const cntNodesOnChain = getSChainNodesCount( imaState.joSChainNetworkInfo );
    const cntAlreadyDiscovered = getSChainDiscoveredNodesCount( joSChainNetworkInfo );
    if( ! isSilentReDiscovery ) {
        log.notice( "Periodic S-Chain re-discovery already have {} of {} node(s) discovered",
            cntAlreadyDiscovered, cntNodesOnChain );
    }
    if( cntAlreadyDiscovered >= cntNodesOnChain ) {
        if( gIntervalPeriodicDiscovery ) {
            clearInterval( gIntervalPeriodicDiscovery );
            gIntervalPeriodicDiscovery = null;
        }
        return true;
    }
    return false;
}

export async function doPeriodicSChainNetworkDiscoveryIfNeeded(
    isSilentReDiscovery, fnAfterRediscover
) {
    if( gIntervalPeriodicDiscovery )
        return; // already started
    const imaState = state.get();
    let joPrevSChainNetworkInfo = imaState.joSChainNetworkInfo;
    if( checkPeriodicDiscoveryNoLongerNeeded(
        joPrevSChainNetworkInfo, isSilentReDiscovery ) ) {
        if( ! isSilentReDiscovery )
            log.success( "Periodic S-Chain re-discovery is not needed right from startup" );
        return; // not needed right from very beginning
    }
    const cntNodesOnChain = getSChainNodesCount( imaState.joSChainNetworkInfo );
    let periodicDiscoveryInterval = imaState.joSChainDiscovery.periodicDiscoveryInterval;
    if( periodicDiscoveryInterval <= 0 )
        periodicDiscoveryInterval = 5 * 60 * 1000;
    if( ! isSilentReDiscovery ) {
        log.debug( "Periodic S-Chain re-discovery will be done with {} interval...",
            periodicDiscoveryInterval );
    }
    fnAfterRediscover = fnAfterRediscover || function() { };
    gIntervalPeriodicDiscovery = setInterval( async function() {
        let nCountToWait = ( cntNodesOnChain > 2 )
            ? Math.ceil( cntNodesOnChain * 2 / 3 )
            : cntNodesOnChain;
        if( nCountToWait > cntNodesOnChain )
            nCountToWait = cntNodesOnChain;
        if( !isSilentReDiscovery )
            log.information( "This S-Chain discovery will be done for periodic discovery update" );
        await discoverSChainNetwork(
            null, isSilentReDiscovery, joPrevSChainNetworkInfo, nCountToWait );
        joPrevSChainNetworkInfo = imaState.joSChainNetworkInfo;
        imaState.joSChainNetworkInfo = joSChainNetworkInfo;
        if( checkPeriodicDiscoveryNoLongerNeeded(
            joPrevSChainNetworkInfo, isSilentReDiscovery ) ) {
            if( ! isSilentReDiscovery )
                log.information( "Final periodic S-Chain re-discovery done" );
            fnAfterRediscover( true );
            return; // not needed anymore, all nodes completely discovered
        }
        if( ! isSilentReDiscovery )
            log.information( "Partial periodic S-Chain re-discovery done" );

        fnAfterRediscover( false );
    }, periodicDiscoveryInterval );
    if( ! isSilentReDiscovery ) {
        log.information( "Periodic S-Chain re-discovery was started with interval {}" +
            " millisecond(s)", periodicDiscoveryInterval );
    }
}
