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
 * @file constants.ts
 * @copyright SKALE Labs 2023-Present
 */

import { requiredEnv, booleanEnv, secondsEnv, optionalEnvNumber } from './envTools'

// internal

export const PORTS_PER_SCHAIN = 64
export const DEFAULT_PING_DELAY = 10000
export const DEFAULT_PING_ITERATIONS = 50000

export const NETWORKS_WITH_MULTICALL = [
    1n, // mainnet
    3n, // ropsten
    4n, // rinkeby
    5n // goerli
]

// required

export const MAINNET_RPC_URL = requiredEnv('MAINNET_RPC_URL')
export const SCHAIN_RPC_URL = requiredEnv('SCHAIN_RPC_URL')
export const SCHAIN_NAME = requiredEnv('SCHAIN_NAME')

export const SCHAIN_PROXY_PATH = requiredEnv('SCHAIN_PROXY_PATH')
export const MANAGER_ABI_PATH = requiredEnv('MANAGER_ABI_PATH')
export const IMA_NETWORK_BROWSER_DATA_PATH = requiredEnv('IMA_NETWORK_BROWSER_DATA_PATH')

// optional

export const MULTICALL = booleanEnv('MULTICALL', true)
export const CONNECTED_ONLY = booleanEnv('CONNECTED_ONLY', true)

export const POST_ERROR_DELAY = secondsEnv(process.env.POST_ERROR_DELAY, 5)
export const NETWORK_BROWSER_DELAY = secondsEnv(process.env.NETWORK_BROWSER_DELAY, 10800)
export const NETWORK_BROWSER_TIMEOUT = secondsEnv(process.env.NETWORK_BROWSER_TIMEOUT, 1200)

export const LOG_LEVEL = optionalEnvNumber('NETWORK_BROWSER_LOG_LEVEL', 1)
export const LOG_PRETTY = booleanEnv('NETWORK_BROWSER_LOG_PRETTY', false)
