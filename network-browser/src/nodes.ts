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
 * @file nodes.ts
 * @copyright SKALE Labs 2023-Present
 */

import { type Contract } from 'ethers'
import { type Node, type NodeArray } from './interfaces'
import { calcEndpoints } from './endpoints'
import { hexToIp } from './tools'

export async function getNodesGroups(
    nodes: Contract,
    schainsInternal: Contract,
    nodeIdsArrays: bigint[][] | number[][],
    schainsHashes: string[]
): Promise<Node[][]> {
    return await Promise.all(
        nodeIdsArrays.map(
            async (nodeIds, index) =>
                await getNodes(nodes, schainsInternal, nodeIds, schainsHashes[index])
        )
    )
}

export async function getNodes(
    nodes: Contract,
    schainsInternal: Contract,
    nodeIds: bigint[] | number[],
    schainHash: string
): Promise<Node[]> {
    const rawNodes: Array<NodeArray | string> = await getNodesRaw(nodes, schainsInternal, nodeIds)
    const nodesData: Node[] = []
    for (let i = 0; i < rawNodes.length; i += 3) {
        nodesData.push(
            nodeStruct(
                rawNodes[i] as NodeArray,
                rawNodes[i + 1] as string,
                schainHash,
                rawNodes[i + 2] as string[],
                true
            )
        )
    }
    return nodesData
}

async function getNodesRaw(
    nodes: Contract,
    schainsInternal: Contract,
    nodeIds: bigint[] | number[]
): Promise<Array<NodeArray | string>> {
    return await Promise.all(
        nodeIds
            .map((nodeId) => [
                nodes.nodes(nodeId),
                nodes.getNodeDomainName(nodeId),
                schainsInternal.getSchainHashesForNode(nodeId)
            ])
            .flat()
    )
}

export function nodeStruct(
    nodeArray: NodeArray,
    domainName: string,
    schainHash?: string,
    schainHashes?: string[],
    endpoints?: boolean
): Node {
    const node: Node = {
        name: nodeArray[0],
        ip: hexToIp(nodeArray[1]),
        publicIP: hexToIp(nodeArray[2]),
        port: nodeArray[3],
        startBlock: nodeArray[4],
        lastRewardDate: nodeArray[5],
        finishTime: nodeArray[6],
        status: nodeArray[7],
        validatorId: nodeArray[8],
        domainName
    }
    if (schainHashes !== undefined) node.schainHashes = schainHashes
    if (endpoints !== undefined && endpoints && schainHash !== undefined) {
        node.endpoints = calcEndpoints(node, schainHash)
    }
    return node
}
