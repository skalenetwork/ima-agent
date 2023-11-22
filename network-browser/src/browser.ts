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
 * @file browser.ts
 * @copyright SKALE Labs 2023-Present
 */

import { type Contract } from 'ethers'
import { Logger, type ILogObj } from 'tslog'

import { type SChain, type NetworkBrowserData } from './interfaces'
import { getSChainHashes, getSChains, filterConnectedOnly, getNodeIdsInGroups } from './schains'
import { getNodesGroups } from './nodes'
import { CONNECTED_ONLY, SCHAINS_DATA_PATH } from './constants'
import { writeJson, currentTimestamp } from './tools'

const log = new Logger<ILogObj>()

export async function browse(schainsInternal: Contract, nodes: Contract): Promise<void> {
    const start = performance.now()

    const schainsHashes = await getSChainHashes(schainsInternal)
    let schains: SChain[] = await getSChains(schainsInternal, schainsHashes)
    if (CONNECTED_ONLY) schains = await filterConnectedOnly(schains)
    log.info(`Going to gather information about ${schains.length} chains`)

    const nodesInGroups = await getNodeIdsInGroups(schainsInternal, schainsHashes)
    const nodesInfo = await getNodesGroups(nodes, schainsInternal, nodesInGroups, schainsHashes)
    schains.forEach((schain, index) => {
        schain.nodes = nodesInfo[index]
    })

    const networkBrowserData: NetworkBrowserData = {
        updatedAt: currentTimestamp(),
        schains
    }
    writeJson(SCHAINS_DATA_PATH, networkBrowserData)
    const execTime = performance.now() - start
    log.info(
        `Browse execution time: ${execTime} ms (${execTime / 1000} s) for ${schains.length} chains`
    )
}
