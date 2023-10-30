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
        details.debug( "source part of request to find PoW number is ", log.v( strRequestPart ) );

    const t = getUtcTimestampString();
    let i = 0, n = 0, s = "";
    if( isVerbose )
        details.debug( "source t=", log.v( t ), ", this is UTC timestamp" );
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
                details.debug( "computed n=", i, ", this is resulting PoW number" );
                details.debug( "computed f=", log.v( f.toString() ), "=",
                    log.v( owaspUtils.ensureStartsWith0x( f.toString( 16 ) ) ) );
                details.debug( "computed r=", log.v( "(2**256-1)/f" ), "=",
                    log.v( r.toString() ), "=",
                    log.v( owaspUtils.ensureStartsWith0x( r.toString( 16 ) ) ) );
                details.debug( "computed s=", log.v( s ) );
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
                    details.error( "RPC connection problem for url ", log.u( url ),
                        ", error description: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    if( joCall )
                        await joCall.disconnect();
                    reject( new Error(
                        "CRITICAL ORACLE ERROR: RPC connection problem for url \"" +
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
                    if( isVerboseTraceDetails ) {
                        details.debug( "RPC call", log.v( "oracle_submitRequest" ), " is ",
                            log.v( joIn ) );
                    }
                    await joCall.call( joIn, async function( joIn, joOut, err ) {
                        if( err ) {
                            if( isVerboseTraceDetails ) {
                                details.error( "JSON RPC call(oracle_submitRequest) ",
                                    log.v( "oracle_submitRequest" ), " failed, error: ",
                                    log.em( owaspUtils.extractErrorMessage( err ) ) );
                            }
                            await joCall.disconnect();
                            reject( new Error(
                                "JSON RPC call(oracle_submitRequest) failed, error: " +
                                owaspUtils.extractErrorMessage( err ) ) );
                            return;
                        }
                        if( isVerboseTraceDetails ) {
                            details.debug( "RPC call(", log.v( "oracle_submitRequest" ),
                                ") result is: ", log.v( joOut ) );
                        }
                        if( !( "result" in joOut && typeof joOut.result == "string" &&
                            joOut.result.length > 0 ) ) {
                            details.error( " bad unexpected result(",
                                log.v( "oracle_submitRequest" ), "), error description is",
                                owaspUtils.extractErrorMessage( err ) );
                            await joCall.disconnect();
                            reject( new Error( "ORACLE ERROR: " +
                                "bad unexpected result(oracle_submitRequest)" ) );
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
                                    details.debug( "RPC call ",
                                        log.v( "oracle_checkResult" ), " attempt ",
                                        idxAttempt, " of ", cntAttempts, "..." );
                                    details.debug( "RPC call ",
                                        log.v( "oracle_checkResult" ), " is ",
                                        log.v( joIn ) );
                                }
                                await joCall.call( joIn, async function( joIn, joOut, err ) {
                                    if( err ) {
                                        if( isVerboseTraceDetails ) {
                                            details.error( "JSON RPC call(",
                                                log.v( "oracle_checkResult" ),
                                                ") failed, error: ",
                                                log.em( owaspUtils.extractErrorMessage( err ) )
                                            );
                                        }
                                        await joCall.disconnect();
                                        return;
                                    }
                                    if( isVerboseTraceDetails ) {
                                        details.debug( "RPC call ",
                                            log.v( "oracle_checkResult" ),
                                            " result is: ", log.v( joOut ) );
                                    }
                                    if( !( "result" in joOut && typeof joOut.result == "string" &&
                                        joOut.result.length > 0 ) ) {
                                        if( isVerboseTraceDetails ) {
                                            details.error( "Bad unexpected result in ",
                                                log.v( "oracle_checkResult" ) );
                                        }
                                        await joCall.disconnect();
                                        return;
                                    }
                                    const joResult = JSON.parse( joOut.result );
                                    if( isVerboseTraceDetails ) {
                                        details.debug( "RPC call ", log.v( "oracle_checkResult" ),
                                            " parsed result field is: ", log.v( joResult ) );
                                    }
                                    const gp = numberToBN( joResult.rslts[0] );
                                    if( isVerbose ) {
                                        details.success( "success, computed Gas Price=",
                                            log.v( gp.toString() ), "=",
                                            log.v( owaspUtils.ensureStartsWith0x(
                                                gp.toString( 16 ) ) ) );
                                    }
                                    resolve( gp );
                                    await joCall.disconnect();
                                    return;
                                } );
                            } catch ( err ) {
                                details.critical( "RPC call {} exception is: {}, stack is: {}{}",
                                    "oracle_checkResult",
                                    log.em( owaspUtils.extractErrorMessage( err ) ),
                                    "\n", log.s( err.stack ) );
                                reject( err );
                                await joCall.disconnect();
                                return;
                            }
                        }
                        details.error( "RPC call ", log.v( "oracle_checkResult" ),
                            " all attempts timed out" );
                        reject( new Error(
                            "RPC call(oracle_checkResult) all attempts timed out" ) );
                        await joCall.disconnect();
                        return;
                    } );
                } catch ( err ) {
                    details.critical( "RPC call{} exception is: {}, stack is: {}{}",
                        "oracle_submitRequest", log.em( owaspUtils.extractErrorMessage( err ) ),
                        "\n", log.s( err.stack ) );
                    reject( err );
                }
                await joCall.disconnect();
            } );
        } catch ( err ) {
            details.error( "RPC call object creation failed, error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            reject( err );
            return;
        }
    } );
    return promiseComplete;
}
