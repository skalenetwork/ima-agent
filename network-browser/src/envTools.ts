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
 * @file envTools.ts
 * @copyright SKALE Labs 2023-Present
 */

import { isValidNumber } from './tools'

const MS_MULTIPLIER = 1000

export function secondsEnv(envValue: string | undefined, defaultSeconds: number): number {
    return (envValue !== undefined ? Number(envValue) : defaultSeconds) * MS_MULTIPLIER
}

export function booleanEnv(envVar: string, defaultValue: boolean): boolean {
    const value = process.env[envVar]
    if (value === undefined) {
        return defaultValue
    }
    return value.toLowerCase() === 'true'
}

export function requiredEnv(name: string): string {
    const value = process.env[name]
    if (value === undefined || value === '') {
        throw new Error(`The required environment variable '${name}' is not set.`)
    }
    return value
}

export function optionalEnv(name: string, defaultValue: string): string {
    const value = process.env[name]
    if (value === undefined) {
        return defaultValue
    }
    return value
}

export function optionalEnvNumber(name: string, defaultValue: number): number {
    const value = process.env[name]
    if (value === undefined || !isValidNumber(value)) {
        return defaultValue
    }
    return Number(value)
}
