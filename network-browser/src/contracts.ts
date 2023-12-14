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

import { JsonRpcProvider, type Provider, Contract, type Network } from 'ethers'
import mc from 'ethers-multicall-provider'
import { type SkaleManagerAbi, type SChainImaAbi } from './interfaces'
import { readJson } from './tools'

import { SCHAIN_PROXY_PATH, MANAGER_ABI_PATH, NETWORKS_WITH_MULTICALL } from './constants'

export function getSChainImaAbi(): SChainImaAbi {
    return readJson(SCHAIN_PROXY_PATH)
}

export function getMainnetManagerAbi(): SkaleManagerAbi {
    return readJson(MANAGER_ABI_PATH)
}

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

export function schainsInternalContract(abi: SkaleManagerAbi, provider: Provider): Contract {
    return new Contract(abi.schains_internal_address, abi.schains_internal_abi, provider)
}

export function messageProxyContract(abi: SChainImaAbi, provider: Provider): Contract {
    return new Contract(abi.message_proxy_chain_address, abi.message_proxy_chain_abi, provider)
}

export function nodesContract(abi: SkaleManagerAbi, provider: Provider): Contract {
    return new Contract(abi.nodes_address, abi.nodes_abi, provider)
}
