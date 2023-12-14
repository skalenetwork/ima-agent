import { describe, beforeAll, test, expect } from 'bun:test'
import { Contract, Wallet } from 'ethers'

import {
    getMainnetProvider,
    nodesContract,
    getMainnetManagerAbi,
    schainsInternalContract
} from '../src/contracts'
import { getSChain } from '../src/schains'
import { MAINNET_RPC_URL } from '../src/constants'

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
    addTestSchainType,
    createSchain
} from './testUtils'

describe('nodes module test', () => {
    let nodes: Contract
    let schainsInternal: Contract
    let wallet: Wallet

    beforeAll(async () => {
        const provider = getMainnetProvider(MAINNET_RPC_URL, false)
        wallet = new Wallet(ETH_PRIVATE_KEY, provider)

        const managerAbi = getMainnetManagerAbi()
        const validators = validatorsContract(managerAbi, wallet)
        schainsInternal = schainsInternalContract(managerAbi, wallet)
        const schains = schainsContract(managerAbi, wallet)
        const manager = managerContract(managerAbi, wallet)

        nodes = nodesContract(managerAbi, provider)

        await addAllPermissions(validators, schainsInternal, schains, wallet)
        await initDefaultValidator(validators)
        const wallets = await generateWallets(provider, wallet, NODES_IN_SCHAIN * 3)
        await linkNodes(validators, wallet, wallets)
        await registerNodes(nodes, wallets)

        await addTestSchainType(schainsInternal)
        await createSchain(schains, 'test1', wallet.address)
    })
    test('module', async () => {
        const schain = await getSChain(schainsInternal, 'test1')
        expect(schain.name).toBe('test1')
        expect(schain.mainnetOwner).toBe(wallet.address)
    })
})
