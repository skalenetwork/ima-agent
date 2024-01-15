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
 * @file endpoints.ts
 * @copyright SKALE Labs 2023-Present
 */

import { PORTS_PER_SCHAIN } from './constants'
import {
    type Node,
    type NodeEndpoints,
    type SChainPorts,
    type EndpointsSet,
    type PortProtocols
} from './interfaces'
import { SkaledPorts } from './dataclasses'

const URL_PREFIXES: EndpointsSet = {
    http: 'http://',
    https: 'https://',
    ws: 'ws://',
    wss: 'wss://',
    infoHttp: 'http://'
}

function getSChainIndexInNode(schainHash: string, schainHashes: string[]): number {
    const index = schainHashes.findIndex((hash) => hash === schainHash)
    if (index === -1) {
        throw new Error(
            `sChain ${schainHash} is not found in the list: ${JSON.stringify(schainHashes)}`
        )
    }
    return index
}

function calcSChainBasePort(basePortOfNode: bigint, sChainIndex: number): bigint {
    return basePortOfNode + BigInt(sChainIndex * PORTS_PER_SCHAIN)
}

function calcPorts(schainBasePort: number): SChainPorts {
    return {
        http: schainBasePort + SkaledPorts.HTTP_JSON,
        https: schainBasePort + SkaledPorts.HTTPS_JSON,
        ws: schainBasePort + SkaledPorts.WS_JSON,
        wss: schainBasePort + SkaledPorts.WSS_JSON,
        infoHttp: schainBasePort + SkaledPorts.INFO_HTTP_JSON
    }
}

function composeEndpoints(
    node: Node,
    ports: SChainPorts,
    endpointType: 'domainName' | 'publicIP'
): EndpointsSet {
    const endpoints: Record<string, string> = {}
    for (const prefixName in URL_PREFIXES) {
        const protocol = prefixName as PortProtocols
        endpoints[prefixName] = `${URL_PREFIXES[protocol]}${node[endpointType]}:${ports[protocol]}`
    }
    return endpoints as EndpointsSet
}

export function calcEndpoints(node: Node, schainHash: string): NodeEndpoints {
    if (node.schainHashes === undefined) throw new Error('schainHashes is not found in node')
    const sChainIndex = getSChainIndexInNode(schainHash, node.schainHashes)
    const basePort = calcSChainBasePort(node.port, sChainIndex)
    const ports = calcPorts(Number(basePort))
    return {
        ports,
        domain: composeEndpoints(node, ports, 'domainName'),
        ip: composeEndpoints(node, ports, 'publicIP')
    }
}
