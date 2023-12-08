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

import * as state from "./state";
import * as imaUtils from "./utils";
import * as log from "./log";
import * as threadInfo from "./threadInfo";

export function findSChainIndexInArrayByName( arrSChains: any[], strSChainName: string ) {
    for( let idxSChain = 0; idxSChain < arrSChains.length; ++ idxSChain ) {
        const joSChain = arrSChains[idxSChain];
        if( joSChain.name.toString() == strSChainName.toString() )
            return idxSChain;
    }
    return -1;
}

let gConnectedChainsData: any = null;

export function autoUpdateLastCachedSChains() : boolean {
    const imaState = state.get();
    if( ! imaState.optsS2S.strNetworkBrowserPath )
        return false;
    const jo: any = imaUtils.jsonFileLoad( imaState.optsS2S.strNetworkBrowserPath, null );
    if( ! ( jo && "schains" in jo && "updatedAt" in jo ) ) {
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

export function getLastCachedSChains() : any[] {
    autoUpdateLastCachedSChains();
    if( ! gConnectedChainsData )
        return [];
    return JSON.parse( JSON.stringify( gConnectedChainsData.schains ) );
}

export function pickRandomSChainNodeIndex( joSChain: any ) : number {
    let min = 0, max = joSChain.nodes.length - 1;
    min = Math.ceil( min );
    max = Math.floor( max );
    const idxNode = Math.floor( Math.random() * ( max - min + 1 ) ) + min;
    return idxNode;
}
export function pickRandomSChainNode( joSChain: any ) : any {
    const idxNode = pickRandomSChainNodeIndex( joSChain );
    return joSChain.nodes[idxNode];
}

export function pickRandomSChainUrl( joSChain: any ) : string {
    const joNode = pickRandomSChainNode( joSChain );
    return "" + joNode.endpoints.ip.http;
}
