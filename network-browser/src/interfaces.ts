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
 * @file interfaces.ts
 * @copyright SKALE Labs 2023-Present
 */

import { type Contract } from 'ethers'

export enum SkaleProject {
    MANAGER = 'skale-manager',
    ALLOCATOR = 'skale-allocator',
    MAINNET_IMA = 'mainnet-ima',
    SCHAIN_IMA = 'schain-ima'
}

export enum SkaleContract {
    SCHAINS_INTERNAL = 'SchainsInternal',
    NODES = 'Nodes',
    MESSAGE_PROXY = 'MessageProxyForSchain'
}

export type AddressType = `0x${string}`

export type NodeArray = [string, string, string, bigint, bigint, bigint, bigint, number, bigint]

export interface Node {
    name: string
    ip: string
    publicIP: string
    port: bigint
    startBlock: bigint
    lastRewardDate: bigint
    finishTime: bigint
    status: number
    validatorId: bigint
    domainName: string
    endpoints?: NodeEndpoints
    schainHashes?: string[]
}

export type PortProtocols = 'http' | 'https' | 'ws' | 'wss' | 'infoHttp'
export type SChainPorts = { [protocol in PortProtocols]: number }
export type EndpointsSet = { [protocol in PortProtocols]: string }

export interface NodeEndpoints {
    ports: { [protocol in PortProtocols]: number }
    domain: EndpointsSet
    ip: EndpointsSet
}

export type SChainArray = [
    string,
    string,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    string
]

export interface SChain {
    name: string
    mainnetOwner: string
    indexInOwnerList: bigint
    partOfNode: bigint
    lifetime: bigint
    startDate: bigint
    startBlock: bigint
    deposit: bigint
    index: bigint
    generation: bigint
    originator: string
    nodes?: Node[]
    chainId?: number
}

export type MessageProxyCache = Record<string, Contract>

export interface NetworkBrowserData {
    schains: SChain[]
    updatedAt: number
}
