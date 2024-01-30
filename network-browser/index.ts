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
 * @file index.ts
 * @copyright SKALE Labs 2023-Present
 */

import {
    schainsInternalContract,
    nodesContract,
    getMainnetManagerAbi,
    getMainnetProvider
} from './src/contracts'
import { delay, getLoggerConfig, pingUrl, withTimeout } from './src/tools'
import { BrowserTimeoutError } from './src/errors'
import { browse } from './src/browser'
import {
    MAINNET_RPC_URL,
    SCHAIN_NAME,
    NETWORK_BROWSER_TIMEOUT,
    POST_ERROR_DELAY,
    NETWORK_BROWSER_DELAY,
    MULTICALL,
    CONNECTED_ONLY,
    SCHAIN_RPC_URL
} from './src/constants'

import { Logger, type ILogObj } from 'tslog'

const log = new Logger<ILogObj>(getLoggerConfig('loop'))

async function safeNetworkBrowserLoop() {
    log.info(`Running network-browser...`)
    log.info(`SCHAIN_NAME: ${SCHAIN_NAME}`)
    log.info(`POST_ERROR_DELAY: ${POST_ERROR_DELAY}`)
    log.info(`MULTICALL: ${MULTICALL}`)
    log.info(`CONNECTED_ONLY: ${CONNECTED_ONLY}`)
    log.info(`NETWORK_BROWSER_TIMEOUT: ${NETWORK_BROWSER_TIMEOUT}`)
    log.info(`NETWORK_BROWSER_DELAY: ${NETWORK_BROWSER_DELAY}`)

    log.info(`Trying to connect to the sChain RPC: ${SCHAIN_RPC_URL}`)
    await pingUrl(SCHAIN_RPC_URL)
    log.info(`Trying to connect to the mainnet RPC: ${MAINNET_RPC_URL}`)
    await pingUrl(MAINNET_RPC_URL)

    const provider = await getMainnetProvider(MAINNET_RPC_URL, MULTICALL)
    const managerAbi = getMainnetManagerAbi()
    const schainsInternal = schainsInternalContract(managerAbi, provider)
    const nodes = nodesContract(managerAbi, provider)

    while (true) {
        try {
            await withTimeout(browse(schainsInternal, nodes), NETWORK_BROWSER_TIMEOUT)
            await delay(NETWORK_BROWSER_DELAY)
        } catch (error) {
            if (error instanceof BrowserTimeoutError) {
                log.error(
                    `A timeout (${NETWORK_BROWSER_TIMEOUT} ms) error occurred:`,
                    error.message
                )
            } else {
                log.error('An error occurred in browse:', error)
            }
            await delay(POST_ERROR_DELAY)
        }
    }
}

safeNetworkBrowserLoop()
