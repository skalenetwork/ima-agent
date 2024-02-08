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
 * @file tools.ts
 * @copyright SKALE Labs 2023-Present
 */

import { JsonRpcProvider, id, toBeHex } from 'ethers'
import { Logger, type ILogObj } from 'tslog'

import { readFileSync, writeFileSync, renameSync } from 'fs'
import { BrowserTimeoutError } from './errors'
import {
    DEFAULT_PING_DELAY,
    DEFAULT_PING_ITERATIONS,
    LOG_FORMAT,
    LOG_LEVEL,
    LOG_PRETTY
} from './constants'

const log = new Logger<ILogObj>(getLoggerConfig('tools'))

export function getLoggerConfig(moduleName: string): any {
    return {
        prettyLogTemplate: LOG_FORMAT,
        minLevel: LOG_LEVEL,
        stylePrettyLogs: LOG_PRETTY,
        name: `snb::${moduleName}`
    }
}

export function stringifyBigInt(obj: any): string {
    return JSON.stringify(
        obj,
        (_, value) => (typeof value === 'bigint' ? value.toString() : value),
        4
    )
}

export async function delay(ms: number): Promise<any> {
    return await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withTimeout(promise: Promise<any>, ms: number): Promise<any> {
    const timeout = new Promise((_resolve, reject) => {
        setTimeout(() => {
            reject(new BrowserTimeoutError('Operation timed out'))
        }, ms)
    })
    return await Promise.race([promise, timeout])
}

export function hexToIp(hexString: string): string {
    const hex = hexString.startsWith('0x') ? hexString.slice(2) : hexString
    const paddedHex = hex.padStart(8, '0')
    return [
        parseInt(paddedHex.substring(0, 2), 16),
        parseInt(paddedHex.substring(2, 4), 16),
        parseInt(paddedHex.substring(4, 6), 16),
        parseInt(paddedHex.substring(6, 8), 16)
    ].join('.')
}

export function currentTimestamp(): number {
    return Math.floor(Date.now() / 1000)
}

export function readJson(filepath: string): any {
    const data = readFileSync(filepath, 'utf8')
    return JSON.parse(data)
}

export function writeJson(filepath: string, data: any): void {
    log.info(`Going to save data to file: ${filepath}`)
    const tmpFilepath = `${filepath}.tmp`
    writeFileSync(tmpFilepath, stringifyBigInt(data), 'utf8')
    moveFile(tmpFilepath, filepath)
}

function moveFile(source: string, destination: string): void {
    renameSync(source, destination)
    log.info(`Successfully moved the file from ${source} to ${destination}`)
}

export async function checkEndpoint(
    url: string,
    maxAttempts: number = DEFAULT_PING_ITERATIONS,
    delay: number = DEFAULT_PING_DELAY
): Promise<void> {
    let attempt = 0
    const provider = new JsonRpcProvider(url)
    while (attempt < maxAttempts) {
        try {
            const bn = await provider.getBlockNumber()
            if (bn > 0) {
                log.info(`URL is available, block number: ${bn}`)
                return
            } else {
                log.error(`Attempt ${attempt + 1} to connect failed`)
            }
        } catch (error) {
            log.error(
                `Connection failed - ${attempt + 1}/${maxAttempts}, retrying in ${
                    delay / 1000
                } seconds...`
            )
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
        attempt++
    }
    log.error('Max attempts reached, URL is not available.')
}

export function chainIdHex(schainName: string): string {
    return toBeHex(id(schainName).substring(0, 15))
}

export function chainIdInt(schainName: string): number {
    return parseInt(chainIdHex(schainName))
}
