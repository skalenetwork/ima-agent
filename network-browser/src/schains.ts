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
 * @file schains.ts
 * @copyright SKALE Labs 2023-Present
 */

import { type Contract, id } from 'ethers'
import { type SChain, type SChainArray } from './interfaces'
import { getSChainImaAbi, getSChainProvider, messageProxyContract } from './contracts'
import { SCHAIN_RPC_URL } from './constants'

export async function getSChainHashes(schainsInternal: Contract): Promise<string[]> {
    return await schainsInternal.getSchains()
}

export async function getSChain(schainsInternal: Contract, schainName: string): Promise<SChain> {
    const schain: SChainArray = await schainsInternal.schains(nameToHash(schainName))
    return schainStruct(schain)
}

export async function getAllSChains(schainsInternal: Contract): Promise<SChain[]> {
    return await getSChains(schainsInternal, await getSChainHashes(schainsInternal))
}

export async function getSChains(
    schainsInternal: Contract,
    schainsHashes: string[]
): Promise<SChain[]> {
    const schainsArray: SChainArray[] = await Promise.all(
        schainsHashes.map(async (hash) => await schainsInternal.schains(hash))
    )
    return schainsArray.map((schainArray) => schainStruct(schainArray))
}

export async function filterConnectedOnly(schains: SChain[]): Promise<SChain[]> {
    const promiseArray = schains.map(async (schain) => {
        const conditionResult = await isChainConnected(schain.name)
        return { schain, conditionResult }
    })
    const results = await Promise.all(promiseArray)
    return results.filter((result) => result.conditionResult).map((result) => result.schain)
}

export async function getNodeIdsInGroups(
    schainsInternal: Contract,
    schainsHashes: string[]
): Promise<bigint[][]> {
    return await Promise.all(
        schainsHashes.map(async (hash) => await schainsInternal.getNodesInGroup(hash))
    )
}

async function isChainConnected(schainName: string): Promise<boolean> {
    const provider = getSChainProvider(SCHAIN_RPC_URL)
    const messageProxy = messageProxyContract(getSChainImaAbi(), provider)
    return await messageProxy.isConnectedChain(schainName)
}

function nameToHash(schainName: string): string {
    return id(schainName)
}

function schainStruct(schainArray: SChainArray): SChain {
    return {
        name: schainArray[0],
        mainnetOwner: schainArray[1],
        indexInOwnerList: schainArray[2],
        partOfNode: schainArray[3],
        lifetime: schainArray[4],
        startDate: schainArray[5],
        startBlock: schainArray[6],
        deposit: schainArray[7],
        index: schainArray[8],
        generation: schainArray[9],
        originator: schainArray[10]
    }
}
