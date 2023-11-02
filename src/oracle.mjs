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
 * @file oracle.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as rpcCall from "./rpcCall.mjs";
import numberToBN from "number-to-bn";
import * as sha3Module from "sha3";
const Keccak = sha3Module.Keccak;
export const gConstMinPowResultLimit = 10000;
export const gConstMaxPowResultLimit = 100000;

const gBigNumMinPowResult = numberToBN( gConstMinPowResultLimit );
const gBigNum1 = numberToBN( 1 );
const gBigNum2 = numberToBN( 2 );
const gBigNum256 = numberToBN( 256 );
const gBigNumUpperPart = gBigNum2.pow( gBigNum256 ).sub( gBigNum1 );

const sleep = ( milliseconds ) => {
    return new Promise( resolve => setTimeout( resolve, milliseconds ) );
};

function getUtcTimestampString( d ) {
    d = d || new Date(); // use now time if d is not specified
    const nUtcUnixTimeStampWithMilliseconds = d.getTime();
    const t = "" + nUtcUnixTimeStampWithMilliseconds;
    return t;
}

export function findPowNumber( strRequestPart, details, isVerbose ) {
    details = details || log;
    if( isVerbose )
        details.debug( "source part of request to find PoW number is {}", strRequestPart );

    const t = getUtcTimestampString();
    let i = 0, n = 0, s = "";
    if( isVerbose )
        details.debug( "source t={}, this is UTC timestamp", t );
    for( ; i < gConstMaxPowResultLimit; ++ i ) {
        n = "" + i;
        s = "{" + strRequestPart + ",\"time\":" + t + ",\"pow\":" + n + "}";

        const hash = new Keccak( 256 );
        hash.update( s );
        let strHash = hash.digest( "hex" );
        strHash = owaspUtils.ensureStartsWith0x( strHash );

        const f = numberToBN( strHash );
        const r = gBigNumUpperPart.div( f );
        if( r.gt( gBigNumMinPowResult ) ) {
            if( isVerbose ) {
                details.debug( "computed n={}, this is resulting PoW number", i );
                details.debug( "computed f={}={}", f.toString(),
                    owaspUtils.ensureStartsWith0x( f.toString( 16 ) ) );
                details.debug( "computed r={}={}={}", "(2**256-1)/f", r.toString(),
                    owaspUtils.ensureStartsWith0x( r.toString( 16 ) ) );
                details.debug( "computed s={}", s );
            }
            break;
        }
    }
    return s;
}

export function oracleGetGasPrice( oracleOpts, details ) {
    details = details || log;
    const promiseComplete = new Promise( ( resolve, reject ) => {
        try {
            const url = oracleOpts.url;
            const isVerbose = "isVerbose" in oracleOpts ? oracleOpts.isVerbose : false;
            let isVerboseTraceDetails = "isVerboseTraceDetails" in oracleOpts
                ? oracleOpts.isVerboseTraceDetails : false;
            if( ! ( log.verboseGet() >= log.verboseReversed().trace ) )
                isVerboseTraceDetails = false;
            const callOpts = "callOpts" in oracleOpts ? oracleOpts.callOpts : { };
            const nMillisecondsSleepBefore = "nMillisecondsSleepBefore" in oracleOpts
                ? oracleOpts.nMillisecondsSleepBefore : 1000;
            const nMillisecondsSleepPeriod = "nMillisecondsSleepPeriod" in oracleOpts
                ? oracleOpts.nMillisecondsSleepPeriod : 3000;
            let cntAttempts = "cntAttempts" in oracleOpts ? oracleOpts.cntAttempts : 40;
            if( cntAttempts < 1 )
                cntAttempts = 1;
            rpcCall.create( url, callOpts || { }, async function( joCall, err ) {
                if( err ) {
                    details.error( "RPC connection problem for URL {url}, error description: {err}",
                        url, err );
                    if( joCall )
                        await joCall.disconnect();
                    reject( new Error( "CRITICAL ORACLE ERROR: RPC connection problem for url \"" +
                        url + "\", error description: " + owaspUtils.extractErrorMessage( err ) ) );
                    return;
                }
                try {
                    const s = findPowNumber(
                        "\"cid\":1000,\"uri\":\"geth://\",\"jsps\":[\"/result\"]," +
                        "\"post\":\"{\\\"jsonrpc\\\":\\\"2.0\\\"," +
                        "\\\"method\\\":\\\"eth_gasPrice\\\",\\\"params\\\":[],\\\"id\\\":1}\"",
                        details,
                        isVerbose
                    );
                    const joIn = { "method": "oracle_submitRequest", "params": [ s ] };
                    if( isVerboseTraceDetails )
                        details.debug( "RPC call {} is {}", "oracle_submitRequest",joIn );
                    await joCall.call( joIn, async function( joIn, joOut, err ) {
                        if( err ) {
                            if( isVerboseTraceDetails ) {
                                details.error( "JSON RPC call(oracle_submitRequest) failed, " +
                                    "error: {err}", err );
                            }
                            await joCall.disconnect();
                            reject( new Error( "JSON RPC call(oracle_submitRequest) failed, " +
                                "error: " + owaspUtils.extractErrorMessage( err ) ) );
                            return;
                        }
                        if( isVerboseTraceDetails )
                            details.debug( "RPC call(oracle_submitRequest) result is: {}", joOut );
                        if( !( "result" in joOut && typeof joOut.result == "string" &&
                            joOut.result.length > 0 ) ) {
                            details.error( "Bad unexpected result(oracle_submitRequest), error " +
                                "description is {}", owaspUtils.extractErrorMessage( err ) );
                            await joCall.disconnect();
                            reject( new Error( "ORACLE ERROR: " +
                                "Bad unexpected result(oracle_submitRequest)" ) );
                            return;
                        }
                        for( let idxAttempt = 0; idxAttempt < cntAttempts; ++idxAttempt ) {
                            const nMillisecondsToSleep = ( ! idxAttempt )
                                ? nMillisecondsSleepBefore : nMillisecondsSleepPeriod;
                            if( nMillisecondsToSleep > 0 )
                                await sleep( nMillisecondsToSleep );
                            try {
                                joIn = {
                                    "method": "oracle_checkResult", "params": [ joOut.result ]
                                };
                                if( isVerboseTraceDetails ) {
                                    details.debug( "RPC call oracle_checkResult attempt {} " +
                                        "of {}...", idxAttempt, cntAttempts );
                                    details.debug( "RPC call(oracle_checkResult) is {}", joIn );
                                }
                                await joCall.call( joIn, async function( joIn, joOut, err ) {
                                    if( err ) {
                                        if( isVerboseTraceDetails ) {
                                            details.error( "JSON RPC call(oracle_checkResult) " +
                                                "failed, error: {err}", err );
                                        }
                                        await joCall.disconnect();
                                        return;
                                    }
                                    if( isVerboseTraceDetails ) {
                                        details.debug( "RPC call(oracle_checkResult) result " +
                                            "is: {}", joOut );
                                    }
                                    if( !( "result" in joOut && typeof joOut.result == "string" &&
                                        joOut.result.length > 0 ) ) {
                                        if( isVerboseTraceDetails ) {
                                            details.error( "Bad unexpected result in " +
                                                "oracle_checkResult" );
                                        }
                                        await joCall.disconnect();
                                        return;
                                    }
                                    const joResult = JSON.parse( joOut.result );
                                    if( isVerboseTraceDetails ) {
                                        details.debug( "RPC call(oracle_checkResult) parsed " +
                                            "result field is: {}", joResult );
                                    }
                                    const gp = numberToBN( joResult.rslts[0] );
                                    if( isVerbose ) {
                                        details.success( "success, computed Gas Price={}={}",
                                            gp.toString(),
                                            owaspUtils.ensureStartsWith0x( gp.toString( 16 ) ) );
                                    }
                                    resolve( gp );
                                    await joCall.disconnect();
                                    return;
                                } );
                            } catch ( err ) {
                                details.critical( "RPC call {} exception is: {err}, " +
                                    "stack is:{}{stack}", "oracle_checkResult",
                                err, "\n", err.stack );
                                reject( err );
                                await joCall.disconnect();
                                return;
                            }
                        }
                        details.error( "RPC call(oracle_checkResult) all attempts timed out" );
                        reject( new Error(
                            "RPC call(oracle_checkResult) all attempts timed out" ) );
                        await joCall.disconnect();
                        return;
                    } );
                } catch ( err ) {
                    details.critical( "RPC call{} exception is: {err}, stack is:{}{stack}",
                        "oracle_submitRequest", err, "\n", err.stack );
                    reject( err );
                }
                await joCall.disconnect();
            } );
        } catch ( err ) {
            details.error( "RPC call object creation failed, error is: {err}, stack is:{}{stack}",
                err, "\n", err.stack );
            reject( err );
            return;
        }
    } );
    return promiseComplete;
}
