import { unlinkSync, existsSync } from 'node:fs'
import { describe, beforeAll, test, expect, beforeEach } from 'bun:test'
import { Contract, Wallet } from 'ethers'

import { getMainnetProvider } from '../src/contracts'
import { browse } from '../src/browser'
import { getSChain } from '../src/schains'
import { MessageProxyCache, NetworkBrowserData } from '../src/interfaces'
import { MAINNET_RPC_URL, IMA_NETWORK_BROWSER_DATA_PATH } from '../src/constants'

import {
    ETH_PRIVATE_KEY,
    NODES_IN_SCHAIN,
    addAllPermissions,
    generateWallets,
    initDefaultValidator,
    linkNodes,
    registerNodes,
    addTestSchainTypes,
    createSchain,
    randomString,
    readJson,
    getManagerProject
} from './testUtils'

describe('browser module test', () => {
    let nodes: Contract
    let schainsInternal: Contract
    let wallet: Wallet
    const chainName = randomString()

    beforeAll(async () => {
        console.log('initializing provider and contracts')
        const provider = await getMainnetProvider(MAINNET_RPC_URL, false)
        wallet = new Wallet(ETH_PRIVATE_KEY, provider)

        const managerProject = await getManagerProject()

        const manager = (await managerProject.getContract('SkaleManager')) as Contract
        manager.connect(wallet)

        const validators = (await managerProject.getContract('Validators')) as Contract
        validators.connect(wallet)

        const schains = (await managerProject.getContract('Schains')) as Contract
        schains.connect(wallet)

        schainsInternal = (await managerProject.getContract('SchainsInternal')) as Contract
        nodes = (await managerProject.getContract('Nodes')) as Contract

        await addAllPermissions(validators, schainsInternal, schains, wallet)
        await initDefaultValidator(validators)
        const wallets = await generateWallets(provider, wallet, NODES_IN_SCHAIN)
        await linkNodes(validators, wallet, wallets)
        await registerNodes(nodes, wallets)

        await addTestSchainTypes(schainsInternal)
        await createSchain(schains, chainName, wallet.address)
    })

    beforeEach(async () => {
        if (existsSync(IMA_NETWORK_BROWSER_DATA_PATH)) {
            console.log('removing browse results')
            unlinkSync(IMA_NETWORK_BROWSER_DATA_PATH)
        }
    })

    test('browse', async () => {
        const schain = await getSChain(schainsInternal, chainName)
        expect(schain.name).toBe(chainName)
        expect(schain.mainnetOwner).toBe(wallet.address)

        expect(existsSync(IMA_NETWORK_BROWSER_DATA_PATH)).toBeFalse
        const messageProxyCache: MessageProxyCache = {}
        await browse(schainsInternal, nodes, messageProxyCache)
        expect(existsSync(IMA_NETWORK_BROWSER_DATA_PATH)).toBeTrue

        const nbData: NetworkBrowserData = readJson(IMA_NETWORK_BROWSER_DATA_PATH)

        expect(nbData.updatedAt).toBeNumber
        expect(nbData.schains).toBeArray
        expect(nbData.schains[0].name).toBeString
        expect(nbData.schains[0].mainnetOwner).toBeString
        expect(nbData.schains[0].indexInOwnerList).toBeString
        expect(nbData.schains[0].partOfNode).toBeString
        expect(nbData.schains[0].lifetime).toBeString
        expect(nbData.schains[0].startBlock).toBeString
        expect(nbData.schains[0].deposit).toBeString
        expect(nbData.schains[0].index).toBeString
        expect(nbData.schains[0].generation).toBeString
        expect(nbData.schains[0].chainId).toBeNumber
        expect(nbData.schains[0].nodes).toBeArrayOfSize(NODES_IN_SCHAIN)
        if (nbData.schains[0].nodes) {
            expect(nbData.schains[0].nodes[0].endpoints?.domain.https).toBeString
            expect(nbData.schains[0].nodes[0].endpoints?.ip.ws).toBeString
        }
    })
})
