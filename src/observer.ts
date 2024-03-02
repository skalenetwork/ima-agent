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
 * @file observer.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as state from "./state.js";
import * as imaUtils from "./utils.js";
import * as log from "./log.js";
import * as threadInfo from "./threadInfo.js";

export interface TSChainNode {
    name: string
    ip: string
    publicIP: string
    port: string
    startBlock: string
    lastRewardDate: string
    finishTime: string
    status: string
    validatorId: string
    domainName: string
    schainHashes: string[]
    endpoints: {
        ports: {
            http: string
            https: string
            ws: string
            wss: string
            infoHttp: string
        }
        domain: {
            http: string
            https: string
            ws: string
            wss: string
            infoHttp: string
        }
        ip: {
            http: string
            https: string
            ws: string
            wss: string
            infoHttp: string
        }
    }
}

export interface TSChainInformation {
    name: string
    mainnetOwner: string
    indexInOwnerList: string
    partOfNode: string
    lifetime: string
    startDate: string
    startBlock: string
    deposit: string
    index: string
    generation: string
    originator: string
    chainId: number
    nodes: TSChainNode[]
}

export interface TSChainsInformation {
    updatedAt: number
    schains: TSChainInformation[]
}

export function findSChainIndexInArrayByName(
    arrSChains: TSChainInformation[], strSChainName: string ): number {
    for( let idxSChain = 0; idxSChain < arrSChains.length; ++idxSChain ) {
        const joSChain = arrSChains[idxSChain];
        if( joSChain.name.toString() == strSChainName.toString() )
            return idxSChain;
    }
    return -1;
}

let gConnectedChainsData: TSChainsInformation | null = null;

export function autoUpdateLastCachedSChains(): boolean {
    const imaState: state.TIMAState = state.get();
    if( !imaState.optsS2S.strNetworkBrowserPath )
        return false;
    const jo: TSChainsInformation =
        imaUtils.jsonFileLoad( imaState.optsS2S.strNetworkBrowserPath, null );
    if( !( jo && "schains" in jo && "updatedAt" in jo ) ) {
        log.error(
            "Connected S-chains cache in thread {} was not updated from file {}, bad data format",
            threadInfo.threadDescription(), imaState.optsS2S.strNetworkBrowserPath );
        return false;
    }
    if( gConnectedChainsData && gConnectedChainsData.updatedAt == jo.updatedAt )
        return false; // assume data is same
    gConnectedChainsData = jo;
    log.debug(
        "Connected S-chains cache in thread {} was updated from file {} with data: {}",
        threadInfo.threadDescription(), imaState.optsS2S.strNetworkBrowserPath,
        gConnectedChainsData );
    return true;
}

export function getLastCachedSChains(): TSChainInformation[] {
    autoUpdateLastCachedSChains();
    if( !gConnectedChainsData )
        return [];
    return JSON.parse( JSON.stringify( gConnectedChainsData.schains ) );
}

export function pickRandomSChainNodeIndex( joSChain: TSChainInformation ): number {
    const min = 0; const max = joSChain.nodes.length - 1;
    const idxNode = Math.floor( Math.random() * ( max - min + 1 ) ) + min;
    return idxNode;
}
export function pickRandomSChainNode( joSChain: TSChainInformation ): TSChainNode {
    const idxNode = pickRandomSChainNodeIndex( joSChain );
    return joSChain.nodes[idxNode];
}

export function pickRandomSChainUrl( joSChain: TSChainInformation ): string {
    const joNode: TSChainNode = pickRandomSChainNode( joSChain );
    return joNode.endpoints.ip.http.toString();
}
