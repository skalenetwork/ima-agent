import { describe, beforeAll, test, expect } from 'bun:test'
import { Contract, Wallet, id } from 'ethers'

import {
    getMainnetProvider,
    nodesContract,
    getMainnetManagerAbi,
    schainsInternalContract
} from '../src/contracts'
import { getNodes } from '../src/nodes'
import { getNodeIdsInGroups } from '../src/schains'
import { MAINNET_RPC_URL } from '../src/constants'
import { Node } from '../src/interfaces'

import {
    ETH_PRIVATE_KEY,
    NODES_IN_SCHAIN,
    validatorsContract,
    managerContract,
    schainsContract,
    addAllPermissions,
    generateWallets,
    initDefaultValidator,
    linkNodes,
    registerNodes,
    addTestSchainTypes,
    createSchain,
    randomString,
    nodeNamesToIds
} from './testUtils'

describe('nodes module test', () => {
    let nodes: Contract
    let schainsInternal: Contract
    let wallet: Wallet
    let nodeNames: string[]
    let nodeIds: number[]
    const chainName = randomString()

    beforeAll(async () => {
        console.log('initializing provider and contracts')
        const provider = await getMainnetProvider(MAINNET_RPC_URL, false)
        wallet = new Wallet(ETH_PRIVATE_KEY, provider)

        const managerAbi = getMainnetManagerAbi()
        const validators = validatorsContract(managerAbi, wallet)
        schainsInternal = schainsInternalContract(managerAbi, wallet)
        const schains = schainsContract(managerAbi, wallet)
        const manager = managerContract(managerAbi, wallet)

        nodes = nodesContract(managerAbi, provider)

        await addAllPermissions(validators, schainsInternal, schains, wallet)
        await initDefaultValidator(validators)
        const wallets = await generateWallets(provider, wallet, NODES_IN_SCHAIN)
        await linkNodes(validators, wallet, wallets)
        nodeNames = await registerNodes(nodes, wallets)

        nodeIds = await nodeNamesToIds(nodes, nodeNames)

        await addTestSchainTypes(schainsInternal)
        await createSchain(schains, chainName, wallet.address)
    })
    test('getNodes', async () => {
        const chainHash = id(chainName)
        const nodeIds = await getNodeIdsInGroups(schainsInternal, [chainHash])
        const nodesRes: Node[] = await getNodes(nodes, schainsInternal, nodeIds[0], chainHash)

        expect(nodesRes).toBeArrayOfSize(NODES_IN_SCHAIN)

        expect(nodesRes[0].endpoints).toBeDefined
        expect(nodesRes[0].endpoints?.domain.http).toBeString
        expect(nodesRes[0].endpoints?.domain.https).toBeString
        expect(nodesRes[0].endpoints?.domain.ws).toBeString
        expect(nodesRes[0].endpoints?.domain.wss).toBeString

        expect(nodesRes[0].endpoints?.ip.http).toBeString
        expect(nodesRes[0].endpoints?.ip.https).toBeString
        expect(nodesRes[0].endpoints?.ip.ws).toBeString
        expect(nodesRes[0].endpoints?.ip.wss).toBeString
    })
})
