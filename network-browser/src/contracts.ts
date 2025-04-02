/**
 * @license
 * SKALE network-browser
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file contracts.ts
 * @copyright SKALE Labs 2023-Present
 */

import { JsonRpcProvider, type Provider, type Network } from 'ethers'
import mc from 'ethers-multicall-provider'

import { NETWORKS_WITH_MULTICALL } from './constants'

function hasMulticall(network: Network): boolean {
    return NETWORKS_WITH_MULTICALL.includes(network.chainId)
}

export async function getMainnetProvider(endpoint: string, multicall: boolean): Promise<Provider> {
    const nativeProvider = new JsonRpcProvider(endpoint)
    const network = await nativeProvider.getNetwork()
    return multicall && hasMulticall(network)
        ? mc.MulticallWrapper.wrap(nativeProvider)
        : nativeProvider
}

export function getSChainProvider(endpoint: string): Provider {
    return new JsonRpcProvider(endpoint)
}
