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

import * as owaspUtils from "./owaspUtils.mjs";
import * as log from "./log.mjs";
import * as cc from "./cc.mjs";
import * as rpcCall from "./rpcCall.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as skaleObserver from "./observer.mjs";
import * as state from "./state.mjs";
import * as imaUtils from "./utils.mjs";

export function initialSkaleNetworkScanForS2S() {
    const imaState = state.get();
    if( ! imaState.optsS2S.isEnabled )
        return;
    imaState.arrActions.push( {
        "name": "SKALE network scan for S2S",
        "fn": async function() {
            const strLogPrefix = cc.info( "SKALE network scan for S2S:" ) + " ";
            if( imaState.strPathAbiJsonSkaleManager.length === 0 ) {
                log.fatal( cc.fatal( "CRITICAL ERROR:" ),
                    " missing Skale Manager ABI, please specify ",
                    cc.info( "abi-skale-manager" ) );
                process.exit( 153 );
            }
            log.information( strLogPrefix, "Downloading SKALE network information..." );
            log.information( strLogPrefix, "Will init periodic S-Chains caching now..." );
            const opts = {
                imaState: imaState,
                "details": log,
                "bStopNeeded": false,
                "secondsToReDiscoverSkaleNetwork":
                    imaState.optsS2S.secondsToReDiscoverSkaleNetwork,
                "secondsToWaitForSkaleNetworkDiscovered":
                    imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered,
                "chain": imaState.chainProperties.sc,
                "bParallelModeRefreshSNB": ( !!( imaState.optsS2S.bParallelModeRefreshSNB ) ),
                "isForceMultiAttemptsUntilSuccess": true
            };
            await skaleObserver.periodicCachingStart(
                imaState.chainProperties.sc.strChainName,
                opts
            ).then( function() {
                log.success( strLogPrefix, "Done, did started periodic S-Chains caching." );
            } ).catch( function( err ) {
                const strError = owaspUtils.extractErrorMessage( err );
                log.error( cc.fatal( "CRITICAL ERROR:" ),
                    " failed to start periodic S-Chains caching",
                    cc.warning( strError ) );
            } );
            return true;
        }
    } );
};

export function formatBalanceInfo( bi, strAddress ) {
    let s = "";
    s += cc.attention( bi.assetName );
    if( "assetAddress" in bi &&
        typeof bi.assetAddress == "string" && bi.assetAddress.length > 0 )
        s += cc.normal( "/" ) + cc.notice( bi.assetAddress );
    if( "idToken" in bi )
        s += cc.normal( " token ID " ) + cc.notice( bi.idToken );
    s += cc.normal( ( bi.assetName == "ERC721" )
        ? " owner is " : " balance is " );
    s += ( bi.assetName == "ERC721" )
        ? cc.bright( bi.owner ) : cc.sunny( bi.balance );
    if( bi.assetName == "ERC721" ) {
        const isSame =
            ( bi.owner.trim().toLowerCase() == strAddress.trim().toLowerCase() );
        s += " " + ( isSame
            ? cc.success( "same (as account " ) + cc.attention( strAddress ) +
                cc.success( " specified in the command line arguments)" )
            : cc.error( "different (than account " ) + cc.attention( strAddress ) +
                cc.error( " specified in the command line arguments)" ) );
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
    log.debug( "Checking ", cc.info( "S-Chain" ), " is accessible and sane..." );
    if( ( !imaState.chainProperties.sc.strURL ) ||
        imaState.chainProperties.sc.strURL.length === 0
    ) {
        log.warning( "Skipped, ", cc.info( "S-Chain" ), " URL was not provided." );
        return;
    }
    let bSuccess = false;
    let idxWaitAttempt = 0;
    const isSilentReDiscovery = true; // it must be silent during S-Chain sanity check
    for( ; !bSuccess; ) {
        try {
            log.attention( "This S-Chain discovery will be done for ",
                cc.bright( "startup pre-requisite" ) );
            const nCountToWait = -1;
            const joSChainNetworkInfo = await discoverSChainNetwork(
                function( err, joSChainNetworkInfo ) {
                    if( ! err )
                        bSuccess = true;
                }, isSilentReDiscovery, null, nCountToWait ).catch( ( err ) => {
                const strError = owaspUtils.extractErrorMessage( err );
                log.critical( cc.fatal( "CRITICAL ERROR:" ),
                    " S-Chain network discovery failed: ", cc.warning( strError ) );
            } );
            if( ! joSChainNetworkInfo )
                bSuccess = false;
        } catch ( err ) {
            bSuccess = false;
        }
        if( !bSuccess )
            ++ idxWaitAttempt;
        if( idxWaitAttempt >= imaState.nMaxWaitSChainAttempts ) {
            log.warning( "Incomplete, ", cc.info( "S-Chain" ), " sanity check failed after ",
                cc.info( idxWaitAttempt ), " attempts." );
            return;
        }
        await imaHelperAPIs.sleep( 1000 );
    }
    log.success( "Done, ", cc.info( "S-Chain" ), " is accessible and sane." );
}

export function isSendImaAgentIndex() {
    return true;
}

let gTimerSChainDiscovery = null;
let gFlagIsInSChainDiscovery = false;

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
    let cntDiscovered = getSChainDiscoveredNodesCount( imaState.joSChainNetworkInfo );
    if( cntDiscovered >= cntNodesOnChain ) {
        if( ! isSilentReDiscovery ) {
            log.attention( "Everything is discovered about this S-Chain. ",
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
            log.information( "Have ", cntUnDiscoveredYet, " of ", cntNodesOnChain,
                " nodes of this S-Chain not discovered yet  before continuing re-discovery." );
        }
    }
    const fnAsyncHandler = async function() {
        if( gFlagIsInSChainDiscovery ) {
            isInsideAsyncHandler = false;
            log.information( "Notice: long this S-Chain re-discovery is in progress now..." );
            return;
        }
        gFlagIsInSChainDiscovery = true;
        try {
            nCountToWait = ( cntNodesOnChain > 2 )
                ? Math.ceil( cntNodesOnChain * 2 / 3 + 1 )
                : cntNodesOnChain;
            if( nCountToWait > cntNodesOnChain )
                nCountToWait = cntNodesOnChain;
            cntDiscovered = getSChainDiscoveredNodesCount( imaState.joSChainNetworkInfo );
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
                    log.information( "Have ", cntUnDiscoveredYet, " of ", cntNodesOnChain,
                        " nodes of this S-Chain not discovered yet on re-discovery step." );
                }
            }
            if( ! isSilentReDiscovery ) {
                log.information( "This S-Chain discovery will be done for re-discover task" );
                log.information( "Will re-discover ", nCountToWait, "-node S-Chain network, ",
                    cntDiscovered, " node(s) already discovered..." );
            }
            await discoverSChainNetwork( function( err, joSChainNetworkInfo ) {
                if( ! err ) {
                    const cntDiscoveredNow =
                        getSChainDiscoveredNodesCount( joSChainNetworkInfo );
                    const strDiscoveryStatus =
                        cc.info( cntDiscoveredNow ) + cc.success( " nodes known" );
                    let strMessage =
                        cc.success( "S-Chain network was re-discovered, " ) +
                        cc.info( cntDiscoveredNow ) +
                        cc.success( " of " ) + cc.info( nCountToWait ) +
                        cc.success( " node(s) (" ) + strDiscoveryStatus + cc.success( ")" );
                    const cntStillUnknown = cntNodesOnChain - cntDiscoveredNow;
                    if( cntStillUnknown > 0 ) {
                        strMessage += cc.success( ", " ) +
                            cc.info( cntStillUnknown ) +
                            cc.success( " of " ) + cc.info( cntNodesOnChain ) +
                            cc.success( " still unknown (" );
                        try {
                            const jarrNodes = joSChainNetworkInfo.network;
                            let cntBad = 0;
                            for( let i = 0; i < jarrNodes.length; ++i ) {
                                const joNode = jarrNodes[i];
                                try {
                                    if( ! isSChainNodeFullyDiscovered( joNode ) ) {
                                        if( cntBad > 0 )
                                            strMessage += cc.success( ", " );
                                        const strNodeURL =
                                            imaUtils.composeSChainNodeUrl( joNode );
                                        const strNodeDescColorized =
                                            cc.notice( "#" ) + cc.info( i ) +
                                            cc.attention( "(" ) + cc.u( strNodeURL ) +
                                            cc.attention( ")" );
                                        strMessage += strNodeDescColorized;
                                        ++ cntBad;
                                    }
                                } catch ( err ) { }
                            }
                        } catch ( err ) { }
                        strMessage += cc.success( ")" );
                    }
                    if( ! isSilentReDiscovery ) {
                        strMessage +=
                            cc.success( ", complete re-discovered S-Chain network info: " ) +
                            cc.j( joSChainNetworkInfo );
                    }
                    log.information( strMessage );
                    imaState.joSChainNetworkInfo = joSChainNetworkInfo;
                }
                fnAfter();
                continueSChainDiscoveryInBackgroundIfNeeded( isSilentReDiscovery, null );
            }, isSilentReDiscovery, imaState.joSChainNetworkInfo, nCountToWait ).catch( ( err ) => {
                const strError = owaspUtils.extractErrorMessage( err );
                log.critical( cc.fatal( "CRITICAL ERROR:" ),
                    " S-Chain network re-discovery failed: ", cc.warning( strError ) );
            } );
        } catch ( err ) { }
        gFlagIsInSChainDiscovery = false;
        // fnAfter() will be called here inside async call at beginning
        continueSChainDiscoveryInBackgroundIfNeeded( isSilentReDiscovery, fnAfter );
    };
    gTimerSChainDiscovery = setInterval( function() {
        if( gFlagIsInSChainDiscovery )
            return;
        fnAsyncHandler();
    }, imaState.joSChainDiscovery.periodicDiscoveryInterval );
}

async function discoverSChainWalkNodes( optsDiscover ) {
    optsDiscover.cntFailed = 0;
    for( let i = 0; i < optsDiscover.cntNodes; ++ i ) {
        const nCurrentNodeIdx = 0 + i;
        const joNode = optsDiscover.jarrNodes[nCurrentNodeIdx];
        const strNodeURL = imaUtils.composeSChainNodeUrl( joNode );
        const strNodeDescColorized =
            cc.notice( "#" ) + cc.info( nCurrentNodeIdx ) +
            cc.attention( "(" ) + cc.u( strNodeURL ) + cc.attention( ")" );
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.information( optsDiscover.strLogPrefix,
                "Will try to discover S-Chain node ", strNodeDescColorized, "..." );
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
                        log.information( optsDiscover.strLogPrefix, "OK, in case of ",
                            strNodeDescColorized, " node ", cc.info( joNode.nodeID ),
                            " will use previous discovery result." );
                    }
                    continue; // skip this node discovery, enrich rest of nodes
                }
            }
        } catch ( err ) { }
        const rpcCallOpts = null;
        try {
            await rpcCall.create( strNodeURL, rpcCallOpts,
                async function( joCall, err ) {
                    if( err ) {
                        if( ! optsDiscover.isSilentReDiscovery ) {
                            log.critical( optsDiscover.strLogPrefix, cc.fatal( "CRITICAL ERROR:" ),
                                " JSON RPC call(creation) to S-Chain node ",
                                strNodeDescColorized, " failed" );
                        }
                        ++ optsDiscover.cntFailed;
                        if( joCall )
                            await joCall.disconnect();
                        return;
                    }
                    const joDataIn = {
                        "method": "skale_imaInfo",
                        "params": { }
                    };
                    if( isSendImaAgentIndex() )
                        joDataIn.params.fromImaAgentIndex = optsDiscover.imaState.nNodeNumber;
                    joCall.call( joDataIn, function( joIn, joOut, err ) {
                        if( err ) {
                            const strError = owaspUtils.extractErrorMessage( err );
                            if( ! optsDiscover.isSilentReDiscovery ) {
                                log.critical( optsDiscover.strLogPrefix,
                                    cc.fatal( "CRITICAL ERROR:" ),
                                    " JSON RPC call(network) to S-Chain node ",
                                    strNodeDescColorized, " failed, error: ",
                                    cc.warning( strError ) );
                            }
                            ++ optsDiscover.cntFailed;
                            return;
                        }
                        joNode.imaInfo = joOut.result;
                        if( isSChainNodeFullyDiscovered( joNode ) )
                            ++ optsDiscover.nCountReceivedImaDescriptions;
                        if( !optsDiscover.isSilentReDiscovery ) {
                            log.success( optsDiscover.strLogPrefix, "OK, got ",
                                strNodeDescColorized, " node ", cc.info( joNode.nodeID ),
                                " IMA information(", optsDiscover.nCountReceivedImaDescriptions,
                                " of ", optsDiscover.cntNodes, ")." );
                        }
                    } );
                } );
        } catch ( err ) {
            if( ! optsDiscover.isSilentReDiscovery ) {
                const strError = owaspUtils.extractErrorMessage( err );
                log.critical( optsDiscover.strLogPrefix, cc.fatal( "CRITICAL ERROR:" ),
                    " JSON RPC call(err) to S-Chain node ", strNodeDescColorized,
                    " was not created: ", cc.warning( strError ), ", stack is: ", "\n",
                    cc.stack( err.stack ) );
            }
            ++ optsDiscover.cntFailed;
        }
    }
}

async function discoverSChainWait( optsDiscover ) {
    if( ! optsDiscover.isSilentReDiscovery ) {
        log.debug( optsDiscover.strLogPrefix, "Waiting for response from at least ",
            optsDiscover.nCountToWait, " node(s)..." );
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
            log.debug( "Waiting (S-Chain discovery) attempt ", nWaitAttempt, " of ",
                cntWaitAttempts, " for S-Chain nodes, total ", optsDiscover.cntNodes,
                ", available ", optsDiscover.nCountAvailable, ", expected at least ",
                optsDiscover.nCountToWait, ", discovered ",
                optsDiscover.nCountReceivedImaDescriptions );
        }
        if( !optsDiscover.isSilentReDiscovery ) {
            log.information( optsDiscover.strLogPrefix, "Have S-Chain description response about ",
                optsDiscover.nCountReceivedImaDescriptions, " of ", optsDiscover.cntNodes,
                " node(s)." );
        }
        if( optsDiscover.nCountReceivedImaDescriptions >= optsDiscover.nCountToWait ) {
            if( !optsDiscover.isSilentReDiscovery ) {
                log.success( optsDiscover.strLogPrefix, "This S-Chain discovery will finish with ",
                    optsDiscover.nCountReceivedImaDescriptions, " of ", optsDiscover.cntNodes,
                    " node(s) discovered." );
            }
            clearInterval( iv );
            optsDiscover.fnAfter( null, optsDiscover.joSChainNetworkInfo );
            return;
        }
        ++ nWaitAttempt;
        if( nWaitAttempt >= cntWaitAttempts ) {
            clearInterval( iv );
            const strErrorDescription =
                "S-Chain network discovery wait timeout, network will be re-discovered later";
            if( ! optsDiscover.isSilentReDiscovery ) {
                log.warning( optsDiscover.strLogPrefix,
                    "WARNING: This S-Chain discovery will finish due to: ",
                    cc.error( strErrorDescription ) );
            }
            if( getSChainDiscoveredNodesCount(
                optsDiscover.joSChainNetworkInfo ) > 0 )
                optsDiscover.fnAfter( null, optsDiscover.joSChainNetworkInfo );
            else
                optsDiscover.fnAfter( new Error( strErrorDescription ), null );
            return;
        }
        if( ! optsDiscover.isSilentReDiscovery ) {
            log.debug( optsDiscover.strLogPrefix, "S-Chain discovery waiting attempt ",
                nWaitAttempt, " of ", cntWaitAttempts, " for ",
                ( optsDiscover.nCountToWait - optsDiscover.nCountReceivedImaDescriptions ),
                " node answer(s)" );
        }
    }, nWaitStepMilliseconds );
}

export async function discoverSChainNetwork(
    fnAfter, isSilentReDiscovery, joPrevSChainNetworkInfo, nCountToWait ) {
    const optsDiscover = {
        fnAfter: fnAfter,
        isSilentReDiscovery: ( !!isSilentReDiscovery ),
        joPrevSChainNetworkInfo: joPrevSChainNetworkInfo || null,
        nCountToWait: nCountToWait,
        imaState: state.get(),
        strLogPrefix: cc.info( "S-Chain network discovery:" ) + " ",
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
    optsDiscover.fnAfter = optsDiscover.fnAfter || function() {};
    if( !optsDiscover.isSilentReDiscovery )
        log.information( optsDiscover.strLogPrefix, "This S-Chain discovery will start..." );
    const promiseComplete = new Promise( function( resolve, reject ) {
        const doCompoundSChainDiscoveryWork = async function() {
            const rpcCallOpts = null;
            try {
                const scURL = optsDiscover.imaState.chainProperties.sc.strURL;
                await rpcCall.create( scURL, rpcCallOpts,
                    async function( joCall, err ) {
                        if( err ) {
                            const strError = owaspUtils.extractErrorMessage( err );
                            if( ! optsDiscover.isSilentReDiscovery ) {
                                log.critical( optsDiscover.strLogPrefix,
                                    cc.fatal( "CRITICAL ERROR:" ),
                                    " JSON RPC call to (own) S-Chain ", cc.u( scURL ),
                                    " failed: ", cc.warning( strError ) );
                            }
                            optsDiscover.fnAfter( err, null );
                            if( joCall )
                                await joCall.disconnect();
                            reject( err );
                            return;
                        }
                        const joDataIn = {
                            "method": "skale_nodesRpcInfo",
                            "params": { }
                        };
                        if( isSendImaAgentIndex() )
                            joDataIn.params.fromImaAgentIndex = optsDiscover.imaState.nNodeNumber;
                        await joCall.call( joDataIn, async function( joIn, joOut, err ) {
                            if( err ) {
                                if( ! optsDiscover.isSilentReDiscovery ) {
                                    const strError = owaspUtils.extractErrorMessage( err );
                                    log.critical( optsDiscover.strLogPrefix,
                                        cc.fatal( "CRITICAL ERROR:" ),
                                        " JSON RPC call to (own) S-Chain ", cc.u( scURL ),
                                        " failed, error: ", cc.warning( strError ) );
                                }
                                optsDiscover.fnAfter( err, null );
                                await joCall.disconnect();
                                reject( err );
                                return;
                            }
                            if( ! optsDiscover.isSilentReDiscovery ) {
                                log.trace( optsDiscover.strLogPrefix,
                                    "OK, got (own) S-Chain network information: ",
                                    cc.j( joOut.result ) );
                                log.success( optsDiscover.strLogPrefix, "OK, got S-Chain ",
                                    cc.u( scURL ), " network information." );
                            }
                            optsDiscover.nCountReceivedImaDescriptions = 0;
                            optsDiscover.joSChainNetworkInfo = joOut.result;
                            if( ! optsDiscover.joSChainNetworkInfo ) {
                                if( ! optsDiscover.isSilentReDiscovery ) {
                                    const err2 = new Error( "Got wrong response, " +
                                        "network information description was not detected" );
                                    log.critical( optsDiscover.strLogPrefix,
                                        cc.fatal( "CRITICAL ERROR:" ),
                                        " Network was not detected via call to ",
                                        cc.u( scURL ), ": ", cc.warning( err2 ) );
                                }
                                optsDiscover.fnAfter( err2, null );
                                await joCall.disconnect();
                                reject( err2 );
                                return;
                            }
                            optsDiscover.jarrNodes = optsDiscover.joSChainNetworkInfo.network;
                            optsDiscover.cntNodes = optsDiscover.jarrNodes.length;
                            if( optsDiscover.nCountToWait <= 0 ||
                                optsDiscover.nCountToWait >= optsDiscover.cntNodes
                            ) {
                                optsDiscover.nCountToWait = ( optsDiscover.cntNodes > 2 )
                                    ? Math.ceil( optsDiscover.cntNodes * 2 / 3 )
                                    : optsDiscover.cntNodes;
                            }
                            if( optsDiscover.nCountToWait > optsDiscover.cntNodes )
                                optsDiscover.nCountToWait = optsDiscover.cntNodes;
                            if( ! optsDiscover.isSilentReDiscovery ) {
                                log.information( optsDiscover.strLogPrefix,
                                    "Will gather details of ", optsDiscover.nCountToWait,
                                    " of ", optsDiscover.cntNodes, " node(s)..." );
                            }
                            await discoverSChainWalkNodes( optsDiscover );
                            optsDiscover.nCountAvailable =
                                optsDiscover.cntNodes - optsDiscover.cntFailed;
                            if( ! optsDiscover.isSilentReDiscovery ) {
                                log.debug( "Waiting for S-Chain nodes, total ",
                                    optsDiscover.cntNodes, ", available ",
                                    optsDiscover.nCountAvailable, ", expected at least ",
                                    optsDiscover.nCountToWait );
                            }
                            if( optsDiscover.nCountAvailable < optsDiscover.nCountToWait ) {
                                if( ! optsDiscover.isSilentReDiscovery ) {
                                    log.critical( optsDiscover.strLogPrefix,
                                        cc.fatal( "CRITICAL ERROR:" ),
                                        " Not enough nodes available on S-Chain, total ",
                                        optsDiscover.cntNodes, ", available ",
                                        optsDiscover.nCountAvailable, ", expected at least ",
                                        optsDiscover.nCountToWait );
                                }
                                const err = new Error(
                                    "Not enough nodes available on S-Chain, total " +
                                    optsDiscover.cntNodes + ", available " +
                                    optsDiscover.nCountAvailable + ", expected at least " +
                                    optsDiscover.nCountToWait );
                                optsDiscover.fnAfter( err, null );
                                reject( err );
                                return;
                            }
                            await discoverSChainWait( optsDiscover ).then( () => {
                                resolve( true );
                            } ).catch( ( err ) => {
                                reject( err );
                            } );
                        } );
                    } );
            } catch ( err ) {
                if( ! optsDiscover.isSilentReDiscovery ) {
                    const strError = owaspUtils.extractErrorMessage( err );
                    log.critical( optsDiscover.strLogPrefix, cc.fatal( "CRITICAL ERROR:" ),
                        " JSON RPC call(discoverSChainNetwork) to S-Chain was not created: ",
                        cc.warning( strError ), ", stack is: ", "\n",
                        cc.stack( err.stack ) );
                }
                optsDiscover.joSChainNetworkInfo = null;
                optsDiscover.fnAfter( err, null );
                reject( err );
            }
        };
        doCompoundSChainDiscoveryWork();
    } );
    await Promise.all( [ promiseComplete ] );
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
        log.notice( "Periodic S-Chain re-discovery already have ",
            cntAlreadyDiscovered, " of ", cntNodesOnChain, " node(s) discovered" );
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
        log.debug( "Periodic S-Chain re-discovery will be done with ",
            periodicDiscoveryInterval, " interval..." );
    }
    fnAfterRediscover = fnAfterRediscover || function() { };
    gIntervalPeriodicDiscovery = setInterval( async function() {
        let nCountToWait = ( cntNodesOnChain > 2 )
            ? Math.ceil( cntNodesOnChain * 2 / 3 )
            : cntNodesOnChain;
        if( nCountToWait > cntNodesOnChain )
            nCountToWait = cntNodesOnChain;
        if( !isSilentReDiscovery ) {
            log.information( "This S-Chain discovery will be done for ",
                cc.bright( "periodic discovery update" ) );
        }
        await discoverSChainNetwork(
            null, isSilentReDiscovery, joPrevSChainNetworkInfo, nCountToWait );
        joPrevSChainNetworkInfo = imaState.joSChainNetworkInfo;
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
        log.information( "Periodic S-Chain re-discovery was started with interval ",
            periodicDiscoveryInterval, " millisecond(s)" );
    }
}
