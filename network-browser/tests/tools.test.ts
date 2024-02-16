import { describe, expect, test } from 'bun:test'

import {
    stringifyBigInt,
    hexToIp,
    currentTimestamp,
    delay,
    withTimeout,
    chainIdHex,
    chainIdInt
} from '../src/tools'
import { isValidNumber } from '../src/envTools'
import { BrowserTimeoutError } from '../src/errors'

describe('tools module test', () => {
    test('stringifyBigInt', () => {
        const res = stringifyBigInt({ a: 1000n })
        expect(res).toBe('{\n    "a": "1000"\n}')
    })
    test('hexToIp', () => {
        expect(hexToIp('0x5E0C3880')).toBe('94.12.56.128')
        expect(hexToIp('01010101')).toBe('1.1.1.1')
        expect(hexToIp('0xFFFFFFFF')).toBe('255.255.255.255')
        expect(hexToIp('0xFFFFFFFFFFFFFFFF')).toBe('255.255.255.255')
    })
    test('currentTimestamp', () => {
        const ts = currentTimestamp()
        expect(typeof ts).toBe('number')
        expect(ts.toString()).toHaveLength(10)
    })

    test('delay', () => {
        expect(delay(10)).resolves
    })

    test('withTimeout', async () => {
        expect(withTimeout(delay(10), 100)).resolves.toBe(undefined)
        expect(withTimeout(delay(1000), 100)).rejects.toThrow(
            new BrowserTimeoutError('Operation timed out')
        )
    })

    test('chainId', () => {
        expect(chainIdHex('elated-tan-skat')).toBe('0x79f99296')
        expect(chainIdInt('elated-tan-skat')).toBe(2046399126)
    })

    test('isValidNumber', () => {
        expect(isValidNumber('123')).toBeTrue
        expect(isValidNumber('12.34')).toBeTrue
        expect(isValidNumber('-123')).toBeTrue
        expect(isValidNumber('abc')).toBeFalse
        expect(isValidNumber('123abc')).toBeFalse
        expect(isValidNumber('')).toBeFalse
    })
})
