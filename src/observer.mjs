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
 * @file observer.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as path from "path";
import * as url from "url";
import * as networkLayer from "./socket.mjs";
import * as threadInfo from "./threadInfo.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as log from "./log.mjs";
import * as rpcCall from "./rpcCall.mjs";

import { UniversalDispatcherEvent, EventDispatcher }
    from "./eventDispatcher.mjs";

import * as EMC from "ethereum-multicall";
import { clearTimeout } from "timers";

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );

let gIntervalPeriodicCaching = null;
let gFlagHaveParallelResult = false;

const PORTS_PER_SCHAIN = 64;

export const events = new EventDispatcher();

export function getSChainIndexInNode( computedSChainId, arrChainIdsOnNode ) {
    let i = 0;
    for( const chainIdOnNode of arrChainIdsOnNode ) {
        if( computedSChainId == chainIdOnNode )
            return i;
        ++ i;
    }
    throw new Error( "S-Chain " + computedSChainId + " is not found in the list: " +
        JSON.stringify( arrChainIdsOnNode ) + "in " + threadInfo.threadDescription( false ) );
}

export function getSChainBasePortOnNode( computedSChainId, arrChainIdsOnNode, basePortOfNode ) {
    const indexOfSChain = getSChainIndexInNode( computedSChainId, arrChainIdsOnNode );
    return calcSChainBasePort( basePortOfNode, indexOfSChain );
}

export function calcSChainBasePort( basePortOfNode, indexOfSChain ) {
    return parseInt( basePortOfNode ) + parseInt( indexOfSChain ) * PORTS_PER_SCHAIN;
}

export function composeEndPoints( joSChain, nodeDict, strEndPointType ) {
    nodeDict["http_endpoint_" + strEndPointType] =
        "http://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.httpRpcPort;
    nodeDict["https_endpoint_" + strEndPointType] =
        "https://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.httpsRpcPort;
    nodeDict["ws_endpoint_" + strEndPointType] =
        "ws://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.wsRpcPort;
    nodeDict["wss_endpoint_" + strEndPointType] =
        "wss://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.wssRpcPort;
    nodeDict["info_http_endpoint_" + strEndPointType] =
        "http://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.infoHttpRpcPort;
    nodeDict["ima_agent_endpoint_" + strEndPointType] =
        "http://" + nodeDict[strEndPointType] + ":" + joSChain.data.computed.ports.imaAgentRpcPort;
}

export const SkaledPorts = {
    PROPOSAL: 0,
    CATCHUP: 1,
    WS_JSON: 2,
    HTTP_JSON: 3,
    BINARY_CONSENSUS: 4,
    ZMQ_BROADCAST: 5,
    IMA_MONITORING: 6,
    WSS_JSON: 7,
    HTTPS_JSON: 8,
    INFO_HTTP_JSON: 9,
    IMA_AGENT_JSON: 10
};

export function calcPorts( joSChain, basePortOfSChain ) {
    // TO-DO: these temporary port values should be in "node", not in "schain"
    joSChain.data.computed.ports = {
        httpRpcPort: basePortOfSChain + SkaledPorts.HTTP_JSON,
        httpsRpcPort: basePortOfSChain + SkaledPorts.HTTPS_JSON,
        wsRpcPort: basePortOfSChain + SkaledPorts.WS_JSON,
        wssRpcPort: basePortOfSChain + SkaledPorts.WSS_JSON,
        infoHttpRpcPort: basePortOfSChain + SkaledPorts.INFO_HTTP_JSON,
        imaAgentRpcPort: basePortOfSChain + SkaledPorts.IMA_AGENT_JSON
    };
}

const gArrChainIdsSupportedByMulticall = [
    1, // Mainnet
    3, // Kovan
    4, // Rinkeby
    5, // Görli
    10, // Ropsten
    42, // Sepolia
    137, // Optimism
    69, // Optimism Kovan
    100, // Optimism Görli
    420, // Arbitrum
    42161, // Arbitrum Görli
    421611, // Arbitrum Rinkeby
    421613, // Polygon
    80001, // Mumbai
    11155111, // Gnosis Chain (xDai)
    43114, // Avalanche
    43113, // Avalanche Fuji
    4002, // Fantom Testnet
    250, // Fantom Opera
    56, // BNB Smart Chain
    97, // BNB Smart Chain Testnet
    1284, // Moonbeam
    1285, // Moonriver
    1287, // Moonbase Alpha Testnet
    1666600000, // Harmony
    25, // Cronos
    122, // Fuse
    19, // Songbird Canary Network
    16, // Coston Testnet
    288, // Boba
    1313161554, // Aurora
    592, // Astar
    66, // OKC
    128, // Heco Chain
    1088, // Metis
    30, // RSK
    31, // RSK Testnet
    9001, // Evmos
    9000, // Evmos Testnet
    108, // Thundercore
    18, // Thundercore Testnet
    26863, // Oasis
    42220, // Celo
    71402, // Godwoken
    71401, // Godwoken Testnet
    8217, // Klatyn
    2001, // Milkomeda
    321, // KCC
    111 // Etherlite
];

async function isMulticallAvailable( mn ) {
    if( mn && mn.ethersProvider ) {
        const { chainId } = await mn.ethersProvider.getNetwork();
        const bnChainId = owaspUtils.toBN( chainId );
        for( let i = 0; i < gArrChainIdsSupportedByMulticall.length; ++ i ) {
            const walkChainId = gArrChainIdsSupportedByMulticall[i];
            const bnWalkChainId = owaspUtils.toBN( walkChainId );
            if( bnWalkChainId.eq( bnChainId ) )
                return true;
        }
    }
    return false;
}

// see https://github.com/skalenetwork/skale-proxy/blob/develop/endpoints.py
export async function loadSChainParts( joSChain, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot load S-Chain parts in observer, no imaState is provided in " +
            threadInfo.threadDescription( false ) );
    }
    let isEMC = false;
    if( opts.imaState.isEnabledMultiCall )
        isEMC = await isMulticallAvailable( opts.imaState.chainProperties.mn );
    joSChain.data.computed = {};
    const computedSChainId = owaspUtils.ethersMod.ethers.utils.id( joSChain.data.name );
    const chainId = owaspUtils.computeChainIdFromSChainName( joSChain.data.name );
    const arrNodeIds =
        await opts.imaState.joSChainsInternal.callStatic.getNodesInGroup( computedSChainId );
    const nodes = [];
    if( isEMC ) {
        const multicall = new EMC.Multicall( {
            ethersProvider: opts.imaState.chainProperties.mn.ethersProvider,
            tryAggregate: true
        } );
        const strRef0 = "Nodes-nodes";
        const strRef1 = "Nodes-getNodeDomainName";
        const strRef2 = "Nodes-isNodeInMaintenance";
        const strRef3 = "SchainsInternal-getSchainHashesForNode";
        const contractCallContext = [ {
            reference: strRef0,
            contractAddress: opts.imaState.joNodes.address,
            abi: opts.imaState.joAbiSkaleManager.nodes_abi,
            calls: [ ]
        }, {
            reference: strRef1,
            contractAddress: opts.imaState.joNodes.address,
            abi: opts.imaState.joAbiSkaleManager.nodes_abi,
            calls: [ ]
        }, {
            reference: strRef2,
            contractAddress: opts.imaState.joNodes.address,
            abi: opts.imaState.joAbiSkaleManager.nodes_abi,
            calls: [ ]
        }, {
            reference: strRef3,
            contractAddress: opts.imaState.joSChainsInternal.address,
            abi: opts.imaState.joAbiSkaleManager.schains_internal_abi,
            calls: [ ]
        } ];
        for( const nodeId of arrNodeIds ) {
            if( opts && opts.bStopNeeded )
                return;
            contractCallContext[0].calls.push(
                {
                    reference: strRef0,
                    methodName: "nodes",
                    methodParameters: [ nodeId ]
                } );
            contractCallContext[1].calls.push(
                {
                    reference: strRef1,
                    methodName: "getNodeDomainName",
                    methodParameters: [ nodeId ]
                } );
            contractCallContext[2].calls.push(
                {
                    reference: strRef2,
                    methodName: "isNodeInMaintenance",
                    methodParameters: [ nodeId ]
                } );
            contractCallContext[3].calls.push(
                {
                    reference: strRef3,
                    methodName: "getSchainHashesForNode",
                    methodParameters: [ nodeId ]
                } );
        }
        const rawResults = await multicall.call( contractCallContext );
        let idxResult = 0;
        for( const nodeId of arrNodeIds ) {
            const values0 =
                rawResults.results[strRef0].callsReturnContext[idxResult].returnValues;
            const values1 =
                rawResults.results[strRef1].callsReturnContext[idxResult].returnValues;
            const values2 =
                rawResults.results[strRef2].callsReturnContext[idxResult].returnValues;
            const values3 =
                rawResults.results[strRef3].callsReturnContext[idxResult].returnValues;
            const nodeDict = {
                "id": nodeId,
                "name": values0[0],
                "ip": owaspUtils.ipFromHex( values0[1] ),
                "basePort": values0[3],
                "domain": values1[0],
                "isMaintenance": values2[0]
            };
            if( opts && opts.bStopNeeded )
                return;
            const arrFetchedSChainIds = values3;
            nodeDict.basePortOfSChain = getSChainBasePortOnNode(
                computedSChainId, arrFetchedSChainIds, nodeDict.basePort );
            calcPorts( joSChain, nodeDict.basePortOfSChain );
            composeEndPoints( joSChain, nodeDict, "ip" );
            composeEndPoints( joSChain, nodeDict, "domain" );
            nodes.push( nodeDict );
            if( opts && opts.bStopNeeded )
                return;
            ++ idxResult;
        }
    } else {
        for( const nodeId of arrNodeIds ) {
            if( opts && opts.bStopNeeded )
                return;
            const node =
                await opts.imaState.joNodes.callStatic.nodes( nodeId );
            const nodeDict = {
                "id": nodeId,
                "name": node[0],
                "ip": owaspUtils.ipFromHex( node[1] ),
                "basePort": node[3],
                "domain": await opts.imaState.joNodes.callStatic.getNodeDomainName( nodeId ),
                "isMaintenance":
                    await opts.imaState.joNodes.callStatic.isNodeInMaintenance( nodeId )
            };
            if( opts && opts.bStopNeeded )
                return;
            const arrFetchedSChainIds =
                await opts.imaState.joSChainsInternal.callStatic.getSchainHashesForNode(
                    nodeId );
            nodeDict.basePortOfSChain =
                getSChainBasePortOnNode(
                    computedSChainId, arrFetchedSChainIds, nodeDict.basePort );
            calcPorts( joSChain, nodeDict.basePortOfSChain );
            composeEndPoints( joSChain, nodeDict, "ip" );
            composeEndPoints( joSChain, nodeDict, "domain" );
            nodes.push( nodeDict );
            if( opts && opts.bStopNeeded )
                return;
        }
    }
    joSChain.data.computed.computedSChainId = computedSChainId;
    joSChain.data.computed.chainId = chainId;
    joSChain.data.computed.nodes = nodes;
}

export async function getSChainsCount( opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot get S-Chains count, no imaState is provided in " +
            threadInfo.threadDescription( false ) );
    }
    const cntSChains = await opts.imaState.joSChainsInternal.callStatic.numberOfSchains();
    return cntSChains;
}

export function removeSChainDescDataNumKeys( joSChain ) {
    const cnt = Object.keys( joSChain ).length;
    for( let i = 0; i < cnt; ++ i ) {
        try {
            delete joSChain[i];
        } catch ( err ) {
        }
    }
}

function process_sc_data( rawData ) {
    // convert needed fields of struct ISchainsInternal.Schain
    const joData = {
        // for debugging we can use here: "rawData": rawData,
        "name": rawData[0],
        "owner": rawData[1]
    };
    // for debugging we can use here: joData = owaspUtils.cloneObjectByRootKeys( joData );
    return joData;
}

export async function loadSChain( idxSChain, hash, joData, cntSChains, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot load S-Chain description in observer, no imaState " +
            "is provided in " + threadInfo.threadDescription( false ) );
    }
    if( opts && opts.details ) {
        opts.details.trace( "Loading S-Chain #{} of {} in {}...",
            idxSChain + 1, cntSChains, threadInfo.threadDescription() );
    }
    hash = hash || await opts.imaState.joSChainsInternal.callStatic.schainsAtSystem( idxSChain );
    if( opts && opts.details )
        opts.details.trace( "    Hash {}", hash );
    if( opts && opts.bStopNeeded )
        return null;
    joData = joData ||
        process_sc_data( await opts.imaState.joSChainsInternal.callStatic.schains( hash ) );
    if( opts && opts.details )
        opts.details.trace( "    Data of chain is {}", joData );
    const joSChain = { "data": joData };
    removeSChainDescDataNumKeys( joSChain.data );
    if( opts && opts.bStopNeeded )
        return null;
    await loadSChainParts( joSChain, opts );
    if( opts && opts.details ) {
        opts.details.trace( "    SNB did loaded parts of S-chain {}", joSChain.data );
        opts.details.success( "Done" );
    }
    joSChain.isConnected = false;
    return joSChain;
}

export async function loadSChainsDefault( opts ) {
    // Please notice, we used this long time: return await loadSChains( opts );
    return await loadCachedSChainsSimplified( opts );
}

export async function loadSChains( opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot load S-Chains parts in observer, no imaState is provided in " +
            threadInfo.threadDescription( false ) );
    }
    let isEMC = false;
    if( opts.imaState.isEnabledMultiCall )
        isEMC = await isMulticallAvailable( opts.imaState.chainProperties.mn );
    if( isEMC )
        return await loadSChainsWithEMC( opts );
    return await loadSChainsOptimal( opts );
}

export async function loadSChainsWithEMC( opts ) {
    const cntSChains = await getSChainsCount( opts );
    if( opts && opts.details ) {
        opts.details.trace( "Have {} S-Chain(s) to EMC-load in {}...",
            cntSChains, threadInfo.threadDescription() );
    }
    const isLoadConnectedOnly = ( "isLoadConnectedOnly" in opts )
        ? ( !!opts.isLoadConnectedOnly ) : true;
    const multicall = new EMC.Multicall( {
        ethersProvider: opts.imaState.chainProperties.mn.ethersProvider,
        tryAggregate: true
    } );
    const cntGroupMax = 30, cntLastExtraGroup = cntSChains % cntGroupMax;
    const bHaveExtraGroup = ( cntLastExtraGroup > 0 ) ? true : false;
    const cntGroups = Math.floor( cntSChains / cntGroupMax ) + ( bHaveExtraGroup ? 1 : 0 );
    if( opts && opts.details ) {
        opts.details.trace( "    Have {} multicall group(s), max possible {} call(s) in each",
            cntGroups, cntGroupMax );
        if( bHaveExtraGroup ) {
            opts.details.trace( "    Have last extra multicall group with {} call(s) in it",
                cntLastExtraGroup );
        }
    }
    const arrSChainHashes = [];
    for( let idxGroup = 0; idxGroup < cntGroups; ++ idxGroup ) {
        if( opts && opts.bStopNeeded )
            return null;
        const idxFirstChainInGroup = idxGroup * cntGroupMax;
        const cntInThisGroup = ( idxGroup == ( cntGroups - 1 ) && bHaveExtraGroup )
            ? cntLastExtraGroup : cntGroupMax;
        if( opts && opts.details ) {
            opts.details.trace( "    Processing chain hashes in multicall group #{}" +
                " with {} call(s) in it...", idxGroup, cntInThisGroup );
        }
        const strRef3 = "SchainsInternal-schainsAtSystem";
        const contractCallContext = [ {
            reference: strRef3,
            contractAddress: opts.imaState.joSChainsInternal.address,
            abi: opts.imaState.joAbiSkaleManager.schains_internal_abi,
            calls: [ ]
        } ];
        for( let idxSChain = 0; idxSChain < cntInThisGroup; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                return null;
            contractCallContext[0].calls.push(
                {
                    reference: strRef3,
                    methodName: "schainsAtSystem",
                    methodParameters: [ idxFirstChainInGroup + idxSChain ]
                } );
        }
        const rawResults = await multicall.call( contractCallContext );
        if( opts && opts.bStopNeeded )
            return null;
        for( let idxSChain = 0; idxSChain < cntInThisGroup; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                return null;
            const idxResult = 0 + idxSChain;
            const values3 =
                rawResults.results[strRef3].callsReturnContext[idxResult].returnValues;
            const hash = values3[0];
            if( opts && opts.details ) {
                opts.details.trace( "    Hash of chain #{} is {}",
                    idxFirstChainInGroup + idxSChain, hash );
            }
            arrSChainHashes.push( hash );
        }
        if( opts && opts.bStopNeeded )
            return null;
    }
    if( opts && opts.bStopNeeded )
        return null;
    const arrSChainDataRecords = [];
    for( let idxGroup = 0; idxGroup < cntGroups; ++ idxGroup ) {
        if( opts && opts.bStopNeeded )
            return null;
        const idxFirstChainInGroup = idxGroup * cntGroupMax;
        const cntInThisGroup = ( idxGroup == ( cntGroups - 1 ) && bHaveExtraGroup )
            ? cntLastExtraGroup : cntGroupMax;
        if( opts && opts.details ) {
            opts.details.trace( "    Processing chain data in multicall group #{} with {} " +
                "call(s) in it...", idxGroup, cntInThisGroup );
        }
        const strRef3 = "SchainsInternal-schains";
        const contractCallContext = [ {
            reference: strRef3,
            contractAddress: opts.imaState.joSChainsInternal.address,
            abi: opts.imaState.joAbiSkaleManager.schains_internal_abi,
            calls: [ ]
        } ];
        for( let idxSChain = 0; idxSChain < cntInThisGroup; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                return null;
            const hash = arrSChainHashes[idxFirstChainInGroup + idxSChain];
            contractCallContext[0].calls.push(
                {
                    reference: strRef3,
                    methodName: "schains",
                    methodParameters: [ hash ]
                } );
        }
        const rawResults = await multicall.call( contractCallContext );
        if( opts && opts.bStopNeeded )
            return null;
        for( let idxSChain = 0; idxSChain < cntInThisGroup; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                return null;
            const idxResult = 0 + idxSChain;
            const values3 =
                rawResults.results[strRef3].callsReturnContext[idxResult].returnValues;
            const joData = process_sc_data( values3 );
            if( opts && opts.details ) {
                opts.details.trace( "    Data of chain #{} is {}",
                    idxFirstChainInGroup + idxSChain, joData );
            }
            arrSChainDataRecords.push( joData );
        }
        if( opts && opts.bStopNeeded )
            return null;
    }
    const joMessageProxySChain = isLoadConnectedOnly
        ? new owaspUtils.ethersMod.ethers.Contract(
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
            opts.imaState.chainProperties.sc.ethersProvider
        ) : null;
    const arrSChains = [];
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        if( opts && opts.bStopNeeded )
            break;
        const hash = arrSChainHashes[idxSChain];
        const joData = arrSChainDataRecords[idxSChain];
        const joSChain = await loadSChain( // with hash + joData
            idxSChain, hash, joData, cntSChains, opts );
        if( ! joSChain )
            continue;
        let isConnected = true;
        if( isLoadConnectedOnly ) {
            const strSChainName = joSChain.data.name;
            isConnected = await checkWhetherSChainIsConnected(
                strSChainName, joMessageProxySChain, opts );
            if( ! isConnected )
                continue;
        }
        joSChain.isConnected = isConnected;
        arrSChains.push( joSChain );
    }
    if( opts && opts.details )
        opts.details.success( "All {} S-Chain(s) EMC-loaded:{}", cntSChains, arrSChains );
    return arrSChains;
}

export async function loadSChainsOptimal( opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot un-filtered optimal-load S-Chains in observer, " +
            "no imaState is provided in " + threadInfo.threadDescription( false ) );
    }
    const isLoadConnectedOnly = ( "isLoadConnectedOnly" in opts )
        ? ( !!opts.isLoadConnectedOnly ) : true;
    const cntSChains = await getSChainsCount( opts );
    if( opts && opts.details ) {
        opts.details.trace( "Have {} un-filtered S-Chain(s) to optimal-load in {}...",
            cntSChains, threadInfo.threadDescription() );
    }
    const joMessageProxySChain = isLoadConnectedOnly
        ? new owaspUtils.ethersMod.ethers.Contract(
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
            opts.imaState.chainProperties.sc.ethersProvider
        ) : null;
    const arrSChains = [];
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        if( opts && opts.bStopNeeded )
            break;
        const joSChain = await loadSChain( idxSChain, null, null, cntSChains, opts );
        if( ! joSChain )
            continue;
        let isConnected = true;
        if( isLoadConnectedOnly ) {
            const strSChainName = joSChain.data.name;
            isConnected = await checkWhetherSChainIsConnected(
                strSChainName, joMessageProxySChain, opts );
            if( ! isConnected )
                continue;
        }
        joSChain.isConnected = isConnected;
        arrSChains.push( joSChain );
    }
    if( opts && opts.details ) {
        opts.details.success( "All {} un-filtered S-Chain(s) optimal-loaded in {}: {}",
            cntSChains, threadInfo.threadDescription(), arrSChains );
    }
    return arrSChains;
}

export async function getAllSchainNames( arrSChainHashes, opts ) {
    const arrSChainNames = [];
    const cntSChains = arrSChainHashes.length;
    let isEMC = false;
    if( opts.imaState.isEnabledMultiCall )
        isEMC = await isMulticallAvailable( opts.imaState.chainProperties.mn );
    if( isEMC ) {
        const multicall = new EMC.Multicall( {
            ethersProvider: opts.imaState.chainProperties.mn.ethersProvider,
            tryAggregate: true
        } );
        const strRef3 = "SchainsInternal-getSchainName";
        const contractCallContext = [ {
            reference: strRef3,
            contractAddress: opts.imaState.joSChainsInternal.address,
            abi: opts.imaState.joAbiSkaleManager.schains_internal_abi,
            calls: [ ]
        } ];
        for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                break;
            const strSChainHash = arrSChainHashes[idxSChain];
            contractCallContext[0].calls.push( {
                reference: strRef3,
                methodName: "getSchainName",
                methodParameters: [ strSChainHash ]
            } );
        }
        const rawResults = await multicall.call( contractCallContext );
        let idxResult = 0;
        for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                break;
            const strSChainName =
                rawResults.results[strRef3].callsReturnContext[idxResult].returnValues[0];
            arrSChainNames.push( strSChainName );
            ++ idxResult;
            if( opts && opts.details ) {
                opts.details.trace( "S-Chain {} hash{} corresponds to S-Chain name {}" +
                    "(fetched via EMC)", idxSChain, strSChainHash, strSChainName );
            }
        }
    } else {
        for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
            if( opts && opts.bStopNeeded )
                break;
            const strSChainHash = arrSChainHashes[idxSChain];
            const strSChainName =
                await opts.imaState.joSChainsInternal.callStatic.getSchainName( strSChainHash );
            if( opts && opts.details ) {
                opts.details.trace( "S-Chain {} hash {} corresponds to S-Chain name {}" +
                    "(fetched via single call)", idxSChain, strSChainHash, strSChainName );
            }
            arrSChainNames.push( strSChainName );
        }

    }
    return arrSChainNames;
}

export async function loadCachedSChainsSimplified( opts ) {
    if( ! opts.imaState ) {
        throw new Error( "Cannot simplified-load S-Chains in observer, " +
            "no imaState is provided in " + threadInfo.threadDescription( false ) );
    }
    if( opts && opts.details ) {
        opts.details.trace( "Will request all S-Chain(s) hashes in {}...",
            threadInfo.threadDescription() );
    }
    const isLoadConnectedOnly = ( "isLoadConnectedOnly" in opts )
        ? ( !!opts.isLoadConnectedOnly ) : true;
    const arrSChainHashes =
        await opts.imaState.joSChainsInternal.callStatic.getSchains();
    const cntSChains = arrSChainHashes.length;
    if( opts && opts.details )
        opts.details.trace( "Have all {} S-Chain(s) hashes: {}", cntSChains, arrSChainHashes );

    const joMessageProxySChain = isLoadConnectedOnly
        ? new owaspUtils.ethersMod.ethers.Contract(
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
            opts.imaState.chainProperties.sc.ethersProvider
        ) : null;
    const arrSChains = [], arrSChainNames = await getAllSchainNames( arrSChainHashes, opts );
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        if( opts && opts.bStopNeeded )
            break;
        const strSChainHash = arrSChainHashes[idxSChain];
        const strSChainName = arrSChainNames[idxSChain];
        if( opts && opts.bStopNeeded )
            break;
        let isConnected = true;
        if( isLoadConnectedOnly ) {
            isConnected = await checkWhetherSChainIsConnected(
                strSChainName, joMessageProxySChain, opts );
            if( ! isConnected )
                continue;
        }
        const joSChain = await loadSChain( idxSChain, strSChainHash, null, cntSChains, opts );
        if( ! joSChain )
            continue;
        joSChain.isConnected = isConnected;
        arrSChains.push( joSChain );
    }
    if( opts && opts.details ) {
        opts.details.success( "All {} S-Chain(s) simplified-loaded in {}: {}",
            cntSChains, threadInfo.threadDescription(), arrSChains );
    }
    return arrSChains;
}

async function checkWhetherSChainIsConnected( strSChainName, joMessageProxySChain, opts ) {
    let isConnected = false, isQueryPassed = false;
    const cntAttempts = (
        "cntAttemptsCheckConnectedState" in opts &&
        typeof opts.cntAttemptsCheckConnectedState == "number" &&
        opts.cntAttemptsCheckConnectedState > 0 )
        ? opts.cntAttemptsCheckConnectedState : 3;
    for( let idxAttempt = 0; idxAttempt < cntAttempts; ++ idxAttempt ) {
        try {
            isConnected =
                await joMessageProxySChain.callStatic.isConnectedChain( strSChainName );
            isQueryPassed = true;
            break;
        } catch ( err ) {
            isConnected = false;
            if( opts && opts.details ) {
                opts.details.error( "Failed attempt {} of {} to query connected state of {} " +
                    "S-Chain, got error: {err}, stack is:\n{stack}", idxAttempt, cntAttempts,
                strSChainName, err, err.stack );
            }
        }
    }
    if( opts && opts.details ) {
        if( ! isQueryPassed ) {
            opts.details.warning( "Will assume S-Chain {} connected status: {yn}",
                strSChainName, isConnected );
        } else {
            opts.details.trace( "Got S-Chain {} connected status: {yn}",
                strSChainName, isConnected );
        }
    }
    return isConnected;
}

export async function loadSChainsConnectedOnly( strChainNameConnectedTo, opts ) {
    if( ! opts.imaState ) {
        throw new Error( "Cannot load S-Chains in observer, no imaState is provided in {}",
            threadInfo.threadDescription( false ) );
    }
    if( opts && opts.details ) {
        opts.details.trace( "Will request all S-Chain(s) hashes in {}...",
            threadInfo.threadDescription() );
    }
    // NOTICE: we are always check and filter connected status here,
    //         not depending on what is in opts
    const isLoadConnectedOnly = true;
    const arrSChainHashes = await opts.imaState.joSChainsInternal.callStatic.getSchains();
    const cntSChains = arrSChainHashes.length;
    if( opts && opts.details )
        opts.details.trace( "Have all {} S-Chain(s) hashes: {}", cntSChains, arrSChainHashes );
    const joMessageProxySChain =
        new owaspUtils.ethersMod.ethers.Contract(
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
            opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
            opts.imaState.chainProperties.sc.ethersProvider
        );
    const arrSChains = [], arrSChainNames = await getAllSchainNames( arrSChainHashes, opts );
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        try {
            if( opts && opts.bStopNeeded )
                break;
            const strSChainHash = arrSChainHashes[idxSChain];
            const strSChainName = arrSChainNames[idxSChain];
            if( strChainNameConnectedTo == strSChainName ) {
                if( opts && opts.details ) {
                    opts.details.trace( "Skip this S-Chain {} connected status check",
                        strSChainName );
                }
                continue;
            }
            if( opts && opts.details ) {
                opts.details.trace( "Querying(1) connected status between S-Chain {} and " +
                    "S-Chain {}...", strSChainName, strChainNameConnectedTo );
            }
            let isConnected = false;
            if( isLoadConnectedOnly ) {
                isConnected = await checkWhetherSChainIsConnected(
                    strSChainName, joMessageProxySChain, opts );
                if( ! isConnected )
                    continue;
            }
            const joSChain = await loadSChain( idxSChain, strSChainHash, null, cntSChains, opts );
            if( ! joSChain )
                continue;
            joSChain.isConnected = isConnected;
            arrSChains.push( joSChain );
        } catch ( err ) {
            if( opts && opts.details )
                opts.details.error( "Got error: {err}, stack is:\n{stack}", err, err.stack );
        }
    }
    return arrSChains;
}

export async function checkConnectedSChains( strChainNameConnectedTo, arrSChains, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( ! opts.imaState ) {
        throw new Error( "Cannot load S-Chains in observer, no imaState is provided in {}",
            threadInfo.threadDescription( false ) );
    }
    const cntSChains = arrSChains.length;
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        if( opts && opts.bStopNeeded )
            break;
        const joSChain = arrSChains[idxSChain];
        joSChain.isConnected = false;
        if( joSChain.data.name == strChainNameConnectedTo )
            continue;
        try {
            const url = pickRandomSChainUrl( joSChain );
            if( opts && opts.details ) {
                opts.details.trace( "Querying(2) via URL {url} to S-Chain {} whether " +
                    "it's connected to S-Chain {}...", url, joSChain.data.name,
                strChainNameConnectedTo );
            }
            const ethersProvider = owaspUtils.getEthersProviderFromURL( url );
            const joMessageProxySChain = new owaspUtils.ethersMod.ethers.Contract(
                opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
                opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                ethersProvider );
            joSChain.isConnected = await checkWhetherSChainIsConnected(
                strChainNameConnectedTo, joMessageProxySChain, opts );
        } catch ( err ) {
            if( opts && opts.details )
                opts.details.error( "Got error: {err}, stack is:\n{stack}", err, err.stack );
        }
    }
    return arrSChains;
}

export async function filterSChainsMarkedAsConnected( arrSChains, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    const arrConnectedSChains = [];
    const cntSChains = arrSChains.length;
    for( let idxSChain = 0; idxSChain < cntSChains; ++ idxSChain ) {
        if( opts && opts.bStopNeeded )
            break;
        const joSChain = arrSChains[idxSChain];
        if( joSChain.isConnected )
            arrConnectedSChains.push( joSChain );
    }
    return arrConnectedSChains;
}

export function findSChainIndexInArrayByName( arrSChains, strSChainName ) {
    for( let idxSChain = 0; idxSChain < arrSChains.length; ++ idxSChain ) {
        const joSChain = arrSChains[idxSChain];
        if( joSChain.data.name.toString() == strSChainName.toString() )
            return idxSChain;
    }
    return -1;
}

export function mergeSChainsArrayFromTo( arrSrc, arrDst, arrNew, arrOld, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    arrNew.splice( 0, arrNew.length );
    arrOld.splice( 0, arrOld.length );
    let i, j, cnt;
    cnt = arrSrc.length;
    if( opts && opts.details )
        opts.details.trace( "Before merging, have {} S-Chain(s) to review", cnt );
    for( i = 0; i < cnt; ++ i ) {
        const joSChain = arrSrc[i];
        j = findSChainIndexInArrayByName( arrDst, joSChain.data.name );
        if( j < 0 ) {
            if( opts && opts.details )
                opts.details.trace( "Found new #{} S-Chain {}", i + 1, joSChain );
            arrNew.push( joSChain );
        }
    }
    if( opts && opts.details )
        opts.details.trace( "Summary, found new {} S-Chain(s)", arrNew.length );
    cnt = arrDst.length;
    for( i = 0; i < cnt; ++ i ) {
        const joSChain = arrDst[i];
        j = findSChainIndexInArrayByName( arrSrc, joSChain.data.name );
        if( j < 0 ) {
            if( opts && opts.details )
                opts.details.trace( "Found old S-Chain #{} {}", i + 1, joSChain );
            arrOld.push( joSChain );
        }
    }
    if( opts && opts.details )
        opts.details.trace( "Summary, found old {} S-Chain(s)", arrOld.length );
    if( arrNew.length > 0 ) {
        opts.details.trace( "Merging new {} S-Chain(s)", arrNew.length );
        for( i = 0; i < arrNew.length; ++ i ) {
            const joSChain = arrNew[i];
            arrDst.push( joSChain );
        }
        if( opts && opts.details )
            opts.details.success( "Done" );
    }
    if( arrOld.length > 0 ) {
        opts.details.trace( "Removing old {} S-Chain(s)", arrOld.length );
        for( i = 0; i < arrOld.length; ++ i ) {
            const joSChain = arrOld[i];
            j = findSChainIndexInArrayByName( arrDst, joSChain.data.name );
            arrDst.splice( j, 1 );
        }
        if( opts && opts.details )
            opts.details.success( "Done" );
    }
    if( opts && opts.details )
        opts.details.success( "Finally, have {} S-Chain(s)", arrDst.length );
}

let gArrSChainsCached = [];
const gArrCacheHistory = [];
let nMaxSizeOfArrCacheHistory = 20;

export async function cacheSChains( strChainNameConnectedTo, opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    let strError = null;
    try {
        const arrSChains = await loadSChainsDefault( opts );
        if( strChainNameConnectedTo &&
            ( typeof strChainNameConnectedTo == "string" ) &&
            strChainNameConnectedTo.length > 0
        ) {
            await checkConnectedSChains(
                strChainNameConnectedTo,
                arrSChains,
                opts
            );
            gArrSChainsCached = await filterSChainsMarkedAsConnected(
                arrSChains,
                opts
            );
        } else
            gArrSChainsCached = arrSChains;
        if( opts && opts.details ) {
            opts.details.trace( "Connected S-Chains cache was updated in {}: {}",
                threadInfo.threadDescription(), gArrSChainsCached );
        }
        if( opts && opts.details ) {
            opts.details.trace( "Will dispatch inThread-arrSChainsCached event in {}",
                threadInfo.threadDescription() );
        }
        events.dispatchEvent(
            new UniversalDispatcherEvent(
                "inThread-arrSChainsCached",
                { "detail": { "arrSChainsCached": arrSChains } } ) );
        if( opts && opts.details ) {
            opts.details.trace( "Did dispatched inThread-arrSChainsCached event in {}",
                threadInfo.threadDescription() );
        }
        if( opts.fnCacheChanged )
            opts.fnCacheChanged( gArrSChainsCached, null ); // null - no error
    } catch ( err ) {
        strError = owaspUtils.extractErrorMessage( err );
        if( ! strError ) {
            strError = "unknown exception during S-Chains download in " +
                threadInfo.threadDescription( false );
        }
        if( opts.fnCacheChanged )
            opts.fnCacheChanged( gArrSChainsCached, strError );
        if( opts && opts.details )
            opts.details.error( "Failed to cache: {err}, stack is:\n{stack}", err, err.stack );
    }
    return strError; // null on success
}

export function getLastCachedSChains() {
    return JSON.parse( JSON.stringify( gArrSChainsCached ) );
}

export function setLastCachedSChains( arrSChainsCached ) {
    log.debug( "Will set arrSChainsCached in {}...", threadInfo.threadDescription() );
    log.debug( "Value of arrSChainsCached in {} is: {}", threadInfo.threadDescription(),
        arrSChainsCached );
    if( arrSChainsCached && typeof arrSChainsCached == "object" ) {
        gArrSChainsCached = JSON.parse( JSON.stringify( arrSChainsCached ) );
        gArrCacheHistory.push( {
            "ts": "" + log.generateTimestampString( null, false ),
            "arrSChainsCached": JSON.parse( JSON.stringify( arrSChainsCached ) )
        } );
        const nMaxSize = getLastCachedHistoryMaxSize();
        while( gArrCacheHistory.length > nMaxSize )
            gArrCacheHistory.shift();
        log.debug( "Will dispatch arrSChainsCached event in {}...",
            threadInfo.threadDescription() );
        events.dispatchEvent(
            new UniversalDispatcherEvent(
                "chainsCacheChanged",
                { "detail": { "arrSChainsCached": getLastCachedSChains() } } ) );
    } else {
        log.error( "Cannot dispatch arrSChainsCached event with bad object {} in {}",
            arrSChainsCached, threadInfo.threadDescription() );
    }
}

export function getLastCachedHistory() {
    return gArrCacheHistory;
}

export function getLastCachedHistoryMaxSize() {
    return 0 + nMaxSizeOfArrCacheHistory;
}
export function setLastCachedHistoryMaxSize( m ) {
    nMaxSizeOfArrCacheHistory = 0 + n;
    if( nMaxSizeOfArrCacheHistory < 0 )
        nMaxSizeOfArrCacheHistory = 0;
}

export async function refreshNowSNB( opts ) {
    const strChainNameConnectedTo = opts.imaState.chainProperties.sc.strChainName;
    await cacheSChains( strChainNameConnectedTo, opts );
}

let gWorker = null;
let gClient = null;

export async function ensureHaveWorker( opts ) {
    owaspUtils.ensureObserverOptionsInitialized( opts );
    if( gWorker )
        return gWorker;
    const url = "skale_observer_worker_server";
    gWorker =
        new threadInfo.Worker(
            path.join( __dirname, "observerWorker.mjs" ),
            { "type": "module" }
        );
    gWorker.on( "message", jo => {
        if( networkLayer.outOfWorkerAPIs.onMessage( gWorker, jo ) )
            return;
    } );
    gClient = new networkLayer.OutOfWorkerSocketClientPipe( url, gWorker );
    gClient.logicalInitComplete = false;
    gClient.errorLogicalInit = null;
    gClient.on( "message", function( eventData ) {
        const joMessage = eventData.message;
        switch ( joMessage.method ) {
        case "init":
            if( ! joMessage.error ) {
                gClient.logicalInitComplete = true;
                break;
            }
            gClient.errorLogicalInit = joMessage.error;
            opts.details.critical( "SNB worker thread reported/returned init error: {err}",
                joMessage.error );
            break;
        case "periodicCachingDoNow":
            opts.details.debug( "Parallel periodic SNB caching result did arrived to {}",
                threadInfo.threadDescription() );
            setLastCachedSChains( joMessage.message );
            gFlagHaveParallelResult = true;
            if( opts && opts.details ) {
                opts.details.trace( "Connected S-Chains cache was updated using data arrived " +
                    "from SNB worker in {}: {}", threadInfo.threadDescription(),
                gArrSChainsCached );
            }
            break;
        case "log":
            log.attention( "SNB WORKER {}", joMessage.message );
            break;
        } // switch ( joMessage.method )
    } );
    const jo = {
        "method": "init",
        "message": {
            "opts": {
                "imaState": {
                    "verbose_": log.verboseGet(),
                    "expose_details_": log.exposeDetailsGet(),
                    "bNoWaitSChainStarted": opts.imaState.bNoWaitSChainStarted,
                    "nMaxWaitSChainAttempts": opts.imaState.nMaxWaitSChainAttempts,
                    "nNodeNumber": opts.imaState.nNodeNumber,
                    "nNodesCount": opts.imaState.nNodesCount,
                    "nTimeFrameSeconds": opts.imaState.nTimeFrameSeconds,
                    "nNextFrameGap": opts.imaState.nNextFrameGap,
                    "chainProperties": {
                        "mn": {
                            "joAccount": {
                                "privateKey": opts.imaState.chainProperties.mn.joAccount.privateKey,
                                "strTransactionManagerURL":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strTransactionManagerURL,
                                "nTmPriority":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.nTmPriority,
                                "strSgxURL":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strSgxURL,
                                "strSgxKeyName":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strSgxKeyName,
                                "strPathSslKey":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strPathSslKey,
                                "strPathSslCert":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strPathSslCert,
                                "strBlsKeyName":
                                    opts.imaState.chainProperties.mn
                                        .joAccount.strBlsKeyName
                            },
                            "strURL": opts.imaState.chainProperties.mn.strURL,
                            "strChainName": opts.imaState.chainProperties.mn.strChainName,
                            "chainId": opts.imaState.chainProperties.mn.chainId,
                            "joAbiIMA": opts.imaState.chainProperties.mn.joAbiIMA,
                            "bHaveAbiIMA": opts.imaState.chainProperties.mn.bHaveAbiIMA
                        },
                        "sc": {
                            "joAccount": {
                                "privateKey":
                                    opts.imaState.chainProperties.sc.joAccount.privateKey,
                                "strTransactionManagerURL":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strTransactionManagerURL,
                                "nTmPriority":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.nTmPriority,
                                "strSgxURL":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strSgxURL,
                                "strSgxKeyName":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strSgxKeyName,
                                "strPathSslKey":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strPathSslKey,
                                "strPathSslCert":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strPathSslCert,
                                "strBlsKeyName":
                                    opts.imaState.chainProperties.sc
                                        .joAccount.strBlsKeyName
                            },
                            "strURL": opts.imaState.chainProperties.sc.strURL,
                            "strChainName": opts.imaState.chainProperties.sc.strChainName,
                            "chainId": opts.imaState.chainProperties.sc.chainId,
                            "joAbiIMA": opts.imaState.chainProperties.sc.joAbiIMA,
                            "bHaveAbiIMA": opts.imaState.chainProperties.sc.bHaveAbiIMA
                        }
                    },
                    "joAbiSkaleManager": opts.imaState.joAbiSkaleManager,
                    "bHaveSkaleManagerABI": opts.imaState.bHaveSkaleManagerABI,
                    "joSChainDiscovery": {
                        "isSilentReDiscovery":
                            opts.imaState.joSChainDiscovery.isSilentReDiscovery,
                        "repeatIntervalMilliseconds":
                            opts.imaState.joSChainDiscovery.repeatIntervalMilliseconds,
                        "periodicDiscoveryInterval":
                            opts.imaState.joSChainDiscovery.periodicDiscoveryInterval
                    }
                }
            },
            "colorization": {
                "isEnabled": log.isEnabledColorization()
            }
        }
    };
    while( ! gClient.logicalInitComplete ) {
        log.debug( "SNB server is not initialized yet..." );
        await threadInfo.sleep( 1000 );
        gClient.send( jo );
    }
}

async function inThreadPeriodicCachingStart( strChainNameConnectedTo, opts ) {
    if( gIntervalPeriodicCaching != null )
        return;
    try {
        const fnDoCachingNow = async function() {
            await cacheSChains( strChainNameConnectedTo, opts );
        };
        gIntervalPeriodicCaching =
            setInterval(
                fnDoCachingNow,
                parseInt( opts.secondsToReDiscoverSkaleNetwork ) * 1000 );
        await fnDoCachingNow();
        return true;
    } catch ( err ) {
        log.error( "Failed to start in-thread periodic SNB refresh in {}, error is: {err}" +
            ", stack is:\n{stack}", threadInfo.threadDescription(), err, err.stack );
    }
    return false;
}

async function parallelPeriodicCachingStart( strChainNameConnectedTo, opts ) {
    gFlagHaveParallelResult = false;
    try {
        const nSecondsToWaitParallel = ( opts.secondsToWaitForSkaleNetworkDiscovered > 0 )
            ? opts.secondsToWaitForSkaleNetworkDiscovered : ( 2 * 60 );
        owaspUtils.ensureObserverOptionsInitialized( opts );
        await ensureHaveWorker( opts );
        await threadInfo.sleep( 5 * 1000 );
        let iv = null;
        iv = setTimeout( function() {
            if( iv ) {
                clearTimeout( iv );
                iv = null;
            }
            if( gFlagHaveParallelResult )
                return;
            log.error( "Failed to start parallel periodic SNB refresh in {}, error is: " +
                "timeout of {} reached, will restart periodic SNB refresh in non-parallel mode",
            threadInfo.threadDescription(), nSecondsToWaitParallel );
            periodicCachingStop();
            inThreadPeriodicCachingStart( strChainNameConnectedTo, opts );
        }, nSecondsToWaitParallel * 1000 );
        log.debug( "{} will inform worker thread to start periodic SNB refresh each {} seconds...",
            threadInfo.threadDescription(), opts.secondsToReDiscoverSkaleNetwork );
        const jo = {
            "method": "periodicCachingStart",
            "message": {
                "secondsToReDiscoverSkaleNetwork":
                    parseInt( opts.secondsToReDiscoverSkaleNetwork ),
                "secondsToWaitForSkaleNetworkDiscovered":
                    parseInt( opts.secondsToWaitForSkaleNetworkDiscovered ),
                "strChainNameConnectedTo": strChainNameConnectedTo,
                "isForceMultiAttemptsUntilSuccess":
                    ( "isForceMultiAttemptsUntilSuccess" in opts &&
                    opts.isForceMultiAttemptsUntilSuccess )
                        ? true : false
            }
        };
        gClient.send( jo );
        log.debug( "{} did informed worker thread to start periodic SNB refresh each {} second(s)",
            threadInfo.threadDescription(),opts.secondsToReDiscoverSkaleNetwork );
        return true;
    } catch ( err ) {
        log.error( "Failed to start parallel periodic SNB refresh in {}, error is: {err}" +
            ", stack is:\n{stack}", threadInfo.threadDescription(), err, err.stack );
    }
    return false;
}

export async function periodicCachingStart( strChainNameConnectedTo, opts ) {
    gFlagHaveParallelResult = false;
    const bParallelModeRefreshSNB =
        ( opts && "bParallelModeRefreshSNB" in opts &&
        typeof opts.bParallelModeRefreshSNB != "undefined" &&
        opts.bParallelModeRefreshSNB )
            ? true : false;
    let wasStarted = false;
    if( bParallelModeRefreshSNB ) {
        wasStarted = await
        parallelPeriodicCachingStart( strChainNameConnectedTo, opts );
    }
    if( wasStarted )
        return;
    await inThreadPeriodicCachingStart( strChainNameConnectedTo, opts );
}

export async function periodicCachingStop() {
    if( gWorker && gClient ) {
        try {
            log.debug( "{} will inform worker thread to stop periodic SNB refresh...",
                threadInfo.threadDescription() );
            const jo = { "method": "periodicCachingStop", "message": { } };
            const refClient = gClient;
            const refWorker = gWorker;
            gClient = null;
            gWorker = null;
            refClient.send( jo );
            await threadInfo.sleep( 100 );
            refClient.dispose();
            await refWorker.terminate();
        } catch ( err ) {
            log.error( "Failed to stop parallel periodic SNB refresh in {}, error is: {err}, " +
                "stack is:\n{stack}", threadInfo.threadDescription(), err, err.stack );
        }
    }
    if( gIntervalPeriodicCaching ) {
        try {
            log.debug( "{} will stop periodic SNB refresh...", threadInfo.threadDescription() );
            clearInterval( gIntervalPeriodicCaching );
            gIntervalPeriodicCaching = null;
        } catch ( err ) {
            log.error( "Failed to stop in-thread periodic SNB refresh in {}, error is: {err}, " +
                "stack is:\n{stack}", threadInfo.threadDescription(), err, err.stack );
            gIntervalPeriodicCaching = null; // clear it anyway
        }
    }
    gFlagHaveParallelResult = false;
}

export function pickRandomSChainNodeIndex( joSChain ) {
    let min = 0, max = joSChain.data.computed.nodes.length - 1;
    min = Math.ceil( min );
    max = Math.floor( max );
    const idxNode = Math.floor( Math.random() * ( max - min + 1 ) ) + min;
    return idxNode;
}
export function pickRandomSChainNode( joSChain ) {
    const idxNode = pickRandomSChainNodeIndex( joSChain );
    return joSChain.data.computed.nodes[idxNode];
}

export function pickRandomSChainUrl( joSChain ) {
    const joNode = pickRandomSChainNode( joSChain );
    // eslint-disable-next-line dot-notation
    return "" + joNode["http_endpoint_ip"];
}

export function pickRandomSChainIndexAndNodeAndUrl( joSChain ) {
    const idxNode = pickRandomSChainNodeIndex( joSChain );
    const joNode = joSChain.data.computed.nodes[idxNode];
    // eslint-disable-next-line dot-notation
    const strURL = "" + joNode["http_endpoint_ip"];
    const joPickResult = {
        "strURL": strURL,
        "joNode": joNode,
        "idxNode": idxNode
    };
    return joPickResult;
}

export async function discoverChainId( strURL ) {
    let ret = null;
    const rpcCallOpts = null;
    await rpcCall.create( strURL, rpcCallOpts, async function( joCall, err ) {
        if( err ) {
            if( joCall )
                await joCall.disconnect();
            return;
        }
        const joIn = { "method": "eth_chainId", "params": [] };
        await joCall.call( joIn, async function( joIn, joOut, err ) {
            if( err ) {
                await joCall.disconnect();
                return;
            }
            if( ! ( "result" in joOut && joOut.result ) ) {
                await joCall.disconnect();
                return;
            }
            ret = joOut.result;
            await joCall.disconnect();
        } );
    } );
    return ret;
}
