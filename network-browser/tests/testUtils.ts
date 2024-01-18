import {
    type Provider,
    Contract,
    Wallet,
    TransactionReceipt,
    parseEther,
    Signer,
    getBytes,
    solidityPackedKeccak256,
    BytesLike,
    hexlify,
    id,
    zeroPadValue,
    TransactionResponse
} from 'ethers'
import { ec } from 'elliptic'

import { getMainnetManagerAbi } from '../src/contracts'

const secp256k1EC = new ec('secp256k1')

import { type SkaleManagerAbi } from '../src/interfaces'

export const ETH_PRIVATE_KEY = process.env.ETH_PRIVATE_KEY!

export const NODES_IN_SCHAIN = 16
export const TEST_VALIDATOR_NAME = 'test_val'
const TEST_VALIDATOR_ID = 1n
const ETH_TRANSFER_AMOUNT = '0.1'
const CONFIRMATION_BLOCKS = 2
const GAS_MULTIPLIER = 1.2

export function validatorsContract(abi: SkaleManagerAbi, wallet: Wallet): Contract {
    return new Contract(abi.validator_service_address, abi.validator_service_abi, wallet)
}

export function schainsContract(abi: SkaleManagerAbi, wallet: Wallet): Contract {
    return new Contract(abi.schains_address, abi.schains_abi, wallet)
}

export function managerContract(abi: SkaleManagerAbi, wallet: Wallet): Contract {
    return new Contract(abi.skale_manager_address, abi.skale_manager_abi, wallet)
}

export async function addAllPermissions(
    validators: Contract,
    schainsInternal: Contract,
    schains: Contract,
    wallet: Wallet
): Promise<void> {
    const VALIDATOR_MANAGER_ROLE = await validators.VALIDATOR_MANAGER_ROLE()
    let hasRole = await validators.hasRole(VALIDATOR_MANAGER_ROLE, wallet.address)
    if (!hasRole) {
        console.log('granting ROLE: VALIDATOR_MANAGER_ROLE')
        await sendTx(validators.grantRole, [VALIDATOR_MANAGER_ROLE, wallet.address])
    }
    const SCHAIN_TYPE_MANAGER_ROLE = await schainsInternal.SCHAIN_TYPE_MANAGER_ROLE()
    hasRole = await schainsInternal.hasRole(SCHAIN_TYPE_MANAGER_ROLE, wallet.address)
    if (!hasRole) {
        console.log('granting ROLE: SCHAIN_TYPE_MANAGER_ROLE')
        await sendTx(schainsInternal.grantRole, [SCHAIN_TYPE_MANAGER_ROLE, wallet.address])
    }
    const SCHAIN_CREATOR_ROLE = await schains.SCHAIN_CREATOR_ROLE()
    hasRole = await schains.hasRole(SCHAIN_CREATOR_ROLE, wallet.address)
    if (!hasRole) {
        console.log('granting ROLE: SCHAIN_CREATOR_ROLE')
        await sendTx(schains.grantRole, [SCHAIN_CREATOR_ROLE, wallet.address])
    }
    console.log('all roles granted')
}

export async function initDefaultValidator(validators: Contract): Promise<void> {
    let number = await validators.numberOfValidators()
    if (number === 0n) {
        console.log('going to register validator')
        await sendTx(validators.registerValidator, [TEST_VALIDATOR_NAME, '', 10, 0])

        number = await validators.numberOfValidators()
        console.log(`number of active validators: ${number}`)

        console.log('going to enable validator')
        await sendTx(validators.enableValidator, [1])
        console.log('validator registered and enabled')
    } else {
        console.log('validator  already exist, skipping')
    }
}

export async function generateWallets(
    provider: Provider,
    adminWallet: Wallet,
    num: number
): Promise<Wallet[]> {
    const wallets: Promise<Wallet>[] = []
    const baseNonce = await adminWallet.getNonce()
    for (let i = 0; i < num; i++) {
        console.log(`${i + 1}/${num} generating new wallet...`)
        wallets.push(generateWallet(provider, adminWallet, baseNonce + i))
    }
    return await Promise.all(wallets)
}

export async function generateWallet(
    provider: Provider,
    adminWallet: Wallet,
    nonce?: number
): Promise<Wallet> {
    const wallet = Wallet.createRandom()
    wallet.connect(provider)
    await sendEth(adminWallet, wallet.address, ETH_TRANSFER_AMOUNT, provider, nonce)
    console.log(`new wallet generated: ${wallet.address}, eth transferred: ${ETH_TRANSFER_AMOUNT}`)
    return new Wallet(wallet.privateKey, provider)
}

async function sendEth(
    senderWallet: Wallet,
    recipientAddress: string,
    amountEth: string, // Amount in ETH, e.g., "0.1" for 0.1 ETH
    provider: Provider,
    nonce?: number
): Promise<TransactionReceipt | null> {
    senderWallet = senderWallet.connect(provider)
    const amountWei = parseEther(amountEth)
    const tx = {
        to: recipientAddress,
        value: amountWei,
        nonce: nonce
    }
    const txResponse = await senderWallet.sendTransaction(tx)
    return provider.waitForTransaction(txResponse.hash)
}

async function getValidatorIdSignature(validatorId: bigint, signer: Signer) {
    return await signer.signMessage(getBytes(solidityPackedKeccak256(['uint'], [validatorId])))
}

export async function linkNodes(
    validators: Contract,
    adminWallet: Wallet,
    wallets: Wallet[]
): Promise<void> {
    const baseNonce = await adminWallet.getNonce()
    const promises = wallets.map(async (wallet, i) => {
        console.log(`linking node address: ${wallet.address}`)
        const signature = await getValidatorIdSignature(TEST_VALIDATOR_ID, wallet)
        await validators.linkNodeAddress(wallet.address, signature, { nonce: baseNonce + i })
        console.log(`linked node address: ${wallet.address}`)
    })
    await Promise.all(promises)
}

export async function registerNodes(nodes: Contract, wallets: Wallet[]): Promise<string[]> {
    const promises = wallets.map(async (wallet, i) => {
        console.log(`${i + 1}/${wallets.length} registering node for: ${wallet.address}`)
        const managerAbi = getMainnetManagerAbi()
        const manager = managerContract(managerAbi, wallet)

        const { ip, port, name, domainName, publicIp } = generateNodeInfo(wallet.address, i)

        const skaleNonce = randNum(0, 10000)
        const pkPartsBytes = getPublicKey(wallet)

        await sendTx(manager.createNode, [
            port,
            skaleNonce,
            ipToHex(ip),
            ipToHex(publicIp),
            pkPartsBytes,
            name,
            domainName
        ])
        console.log(`new node created: ${ip}:${port} - ${name} - ${domainName}`)
        return name
    })
    return await Promise.all(promises)
}

export async function nodeNamesToIds(nodes: Contract, nodeNames: string[]): Promise<number[]> {
    const promises = nodeNames.map(async (name, i) => {
        return await nodes.nodesNameToIndex(id(name))
    })
    return await Promise.all(promises)
}

export async function addTestSchainTypes(schains: Contract): Promise<void> {
    await sendTx(schains.addSchainType, [8, NODES_IN_SCHAIN])
    await sendTx(schains.addSchainType, [8, NODES_IN_SCHAIN])
}

export async function createSchain(schains: Contract, name: string, owner: string): Promise<void> {
    console.log(`creating new schain: ${name}, owner: ${owner}`)
    await sendTx(schains.addSchainByFoundation, [1000, 1, 10, name, owner, owner, []])
    console.log(`schain created: ${name}`)
}

function generateNodeInfo(address: string, seed: number): any {
    return {
        ip: getRandomIp(),
        port: 10000 + seed * randNum(1, 10),
        name: `node-${address}`,
        domainName: `nd.${address}.com`,
        publicIp: getRandomIp()
    }
}

function getRandomIp(): string {
    return `${randNum(0, 255)}.${randNum(0, 255)}.${randNum(0, 255)}.${randNum(0, 255)}`
}

function randNum(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function getPublicKey(wallet: Wallet): [BytesLike, BytesLike] {
    const publicKey = secp256k1EC.keyFromPrivate(wallet.privateKey.slice(2)).getPublic()
    const pubA = zeroPadValue(hexlify(publicKey.getX().toBuffer()), 32)
    const pubB = zeroPadValue(hexlify(publicKey.getY().toBuffer()), 32)
    return [pubA, pubB]
}

function ipToHex(ip: string): string {
    const parts = ip.split('.')
    const hexParts = parts.map((part) => parseInt(part).toString(16).padStart(2, '0')).join('')
    const hexIp = `0x${hexParts}`
    return hexIp
}

export async function sendTx(func: any, args: any[]): Promise<TransactionReceipt | null> {
    const estimatedGas = await func.estimateGas(...args)
    const response: TransactionResponse = await func(...args, {
        gasLimit: BigInt(Math.round(Number(estimatedGas) * GAS_MULTIPLIER))
    })
    return await response.wait(CONFIRMATION_BLOCKS)
}

export function randomString(): string {
    return (Math.random() + 1).toString(36).substring(7)
}
