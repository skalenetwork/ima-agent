// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file oracle.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as rpcCall from "./rpcCall.js";
import * as threadInfo from "./threadInfo.js";
import * as owaspUtils from "./owaspUtils.js";
import * as sha3Module from "sha3";
import type * as rpcCallFormats from "./rpcCallFormats.js";
import type * as state from "./state.js";

const Keccak: any = sha3Module.Keccak;

export interface TOracleOptions {
    url: string
    callOpts: rpcCall.TRPCCallOpts | null
    nMillisecondsSleepBefore: number
    nMillisecondsSleepPeriod: number
    cntAttempts: number
    isVerbose: boolean
    isVerboseTraceDetails: boolean
}

export const gConstMinPowResultLimit: number = 10000;
export const gConstMaxPowResultLimit: number = 100000;

const gBigNumMinPowResult: owaspUtils.ethersMod.BigNumber =
    owaspUtils.toBN( gConstMinPowResultLimit );
const gBigNum1: owaspUtils.ethersMod.BigNumber = owaspUtils.toBN( 1 );
const gBigNum2: owaspUtils.ethersMod.BigNumber = owaspUtils.toBN( 2 );
const gBigNum256: owaspUtils.ethersMod.BigNumber = owaspUtils.toBN( 256 );
const gBigNumUpperPart: owaspUtils.ethersMod.BigNumber =
    gBigNum2.pow( gBigNum256 ).sub( gBigNum1 );

function getUtcTimestampString( aDate?: Date ): string {
    aDate = aDate ?? new Date(); // use now time if aDate is not specified
    const nUtcUnixTimeStampWithMilliseconds = aDate.getTime();
    const t = nUtcUnixTimeStampWithMilliseconds.toString();
    return t;
}

export function findPowNumber(
    strRequestPart: string, details: log.TLoggerBase, isVerbose?: boolean ): string {
    details = details || log;
    if( isVerbose )
        details.debug( "source part of request to find PoW number is {}", strRequestPart );

    const t = getUtcTimestampString();
    let i = 0; let n = 0; let s = "";
    if( isVerbose )
        details.debug( "source t={}, this is UTC timestamp", t );
    for( ; i < gConstMaxPowResultLimit; ++i ) {
        n = owaspUtils.toInteger( i );
        s = "{" + strRequestPart + ",\"time\":" + t + ",\"pow\":" + n + "}";

        const hash = new Keccak( 256 );
        hash.update( s );
        let strHash = hash.digest( "hex" );
        strHash = owaspUtils.ensureStartsWith0x( strHash );

        const f = owaspUtils.toBN( strHash );
        const r = gBigNumUpperPart.div( f );
        if( r.gt( gBigNumMinPowResult ) ) {
            if( isVerbose ) {
                details.debug( "computed n={}, this is resulting PoW number", i );
                details.debug( "computed f={}={}", f.toString(),
                    owaspUtils.ensureStartsWith0x( f.toHexString() ) );
                details.debug( "computed r={}={}={}", "(2**256-1)/f", r.toString(),
                    owaspUtils.ensureStartsWith0x( r.toHexString() ) );
                details.debug( "computed s={}", s );
            }
            break;
        }
    }
    return s;
}

async function handleOracleCheckResultResult(
    oracleOpts: TOracleOptions, details: log.TLoggerBase, isVerboseTraceDetails: boolean,
    joCall: rpcCall.TRPCCall, joIn: state.TLoadedJSON, joOut: state.TLoadedJSON
): Promise< owaspUtils.ethersMod.BigNumber > {
    if( isVerboseTraceDetails )
        details.debug( "RPC call(oracle_checkResult) result is: {}", joOut );
    if( !( "result" in joOut && typeof joOut.result === "string" &&
        joOut.result.length > 0 ) ) {
        if( isVerboseTraceDetails )
            details.error( "Bad unexpected result in oracle_checkResult" );
        await joCall.disconnect();
        return owaspUtils.toBN( 0 );
    }
    const joResult: state.TLoadedJSON = JSON.parse( joOut.result );
    if( isVerboseTraceDetails )
        details.debug( "RPC call(oracle_checkResult) parsed result field is: {}", joResult );
    const gp: owaspUtils.ethersMod.BigNumber = owaspUtils.toBN( joResult.rslts[0] );
    if( isVerboseTraceDetails ) {
        details.success( "success, computed Gas Price={}={}",
            gp.toString(), owaspUtils.ensureStartsWith0x( gp.toHexString() ) );
    }
    await joCall.disconnect();
    return gp;
}

async function handleOracleSubmitRequestResult(
    oracleOpts: TOracleOptions, details: log.TLoggerBase, isVerboseTraceDetails: boolean,
    joCall: rpcCall.TRPCCall, joIn: state.TLoadedJSON, joOut: state.TLoadedJSON
): Promise<owaspUtils.ethersMod.BigNumber> {
    const nMillisecondsSleepBefore = "nMillisecondsSleepBefore" in oracleOpts
        ? oracleOpts.nMillisecondsSleepBefore
        : 1000;
    const nMillisecondsSleepPeriod = "nMillisecondsSleepPeriod" in oracleOpts
        ? oracleOpts.nMillisecondsSleepPeriod
        : 3000;
    let cntAttempts = "cntAttempts" in oracleOpts ? oracleOpts.cntAttempts : 40;
    if( cntAttempts < 1 )
        cntAttempts = 1;
    if( isVerboseTraceDetails )
        details.debug( "RPC call(oracle_submitRequest) result is: {}", joOut );
    if( !( "result" in joOut && typeof joOut.result === "string" &&
        joOut.result.length > 0 ) ) {
        await joCall.disconnect();
        details.error( "Bad unexpected result(oracle_submitRequest), malformed " +
            "non-successful result is {}", joOut );
        throw new Error( "ORACLE ERROR: Bad unexpected result(oracle_submitRequest)" );
    }
    let gp: owaspUtils.ethersMod.BigNumber | null = null;
    for( let idxAttempt = 0; idxAttempt < cntAttempts; ++idxAttempt ) {
        const nMillisecondsToSleep = ( !idxAttempt )
            ? nMillisecondsSleepBefore
            : nMillisecondsSleepPeriod;
        if( nMillisecondsToSleep > 0 )
            await threadInfo.sleep( nMillisecondsToSleep );
        try {
            const joIn: rpcCallFormats.TRPCInputBasicFieldsWithArray =
                { method: "oracle_checkResult", params: [ joOut.result ] };
            if( isVerboseTraceDetails ) {
                details.debug( "RPC call oracle_checkResult attempt {} " +
                    "of {}...", idxAttempt, cntAttempts );
                details.debug( "RPC call(oracle_checkResult) is {}", joIn );
            }
            gp = owaspUtils.toBN( 0 );
            joOut = await joCall.call( joIn );
            gp = await handleOracleCheckResultResult(
                oracleOpts, details, isVerboseTraceDetails, joCall, joIn, joOut );
            if( gp )
                return gp;
        } catch ( err ) {
            details.critical(
                "RPC call {} exception is: {err},stack is:\n{stack}",
                "oracle_checkResult", err, err );
            await joCall.disconnect();
            throw err;
        }
    }
    await joCall.disconnect();
    details.error( "RPC call(oracle_checkResult) all attempts timed out" );
    throw new Error( "RPC call(oracle_checkResult) all attempts timed out" );
}

export async function oracleGetGasPrice(
    oracleOpts: TOracleOptions, details: log.TLoggerBase
): Promise< owaspUtils.ethersMod.BigNumber > {
    details = details || log;
    const url: string = oracleOpts.url;
    let gp: owaspUtils.ethersMod.BigNumber | null = null;
    let joCall: rpcCall.TRPCCall | null = null;
    try {
        const isVerbose = "isVerbose" in oracleOpts ? oracleOpts.isVerbose : false;
        let isVerboseTraceDetails = "isVerboseTraceDetails" in oracleOpts
            ? oracleOpts.isVerboseTraceDetails
            : false;
        if( !( log.verboseGet() >= log.verboseName2Number( "trace" ) ) )
            isVerboseTraceDetails = false;
        const callOpts = "callOpts" in oracleOpts ? oracleOpts.callOpts : { };
        joCall = await rpcCall.create( url, callOpts ?? { } );
        if( !joCall )
            throw new Error( `Failed to create JSON RPC call object to ${url}` );
        const s = findPowNumber(
            "\"cid\":1000,\"uri\":\"geth://\",\"jsps\":[\"/result\"]," +
            "\"post\":\"{\\\"jsonrpc\\\":\\\"2.0\\\"," +
            "\\\"method\\\":\\\"eth_gasPrice\\\",\\\"params\\\":[],\\\"id\\\":1}\"",
            details, isVerbose );
        const joIn: rpcCallFormats.TRPCInputBasicFieldsWithArray =
            { method: "oracle_submitRequest", params: [ s ] };
        if( isVerboseTraceDetails )
            details.debug( "RPC call {} is {}", "oracle_submitRequest", joIn );
        const joOut = await joCall.call( joIn );
        gp = await handleOracleSubmitRequestResult(
            oracleOpts, details, isVerboseTraceDetails, joCall, joIn, joOut );
        await joCall.disconnect();
        if( gp )
            return gp;
    } catch ( err ) {
        details.error( "ORACLE RPC call problem for URL {url}, error description: {err}",
            url, err );
        if( joCall )
            await joCall.disconnect();
        throw new Error( `ORACLE ERROR: RPC connection problem for url ${url}, ` +
            `error description: ${owaspUtils.extractErrorMessage( err )}` );
    }
    return owaspUtils.toBN( 0 );
}
