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
 * @file rpcCall.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as ws from "ws";
import * as urllib from "urllib";
import * as https from "https";
import * as net from "net";
import { validateURL, isUrlWS } from "./owaspUtils.mjs";
import * as log from "./log.mjs";

const gSecondsConnectionTimeout = 60;

export async function waitWebSocketIsOpen( socket, fnDone, fnStep ) {
    fnDone = fnDone || async function( nStep ) {};
    fnDone = fnStep || async function( nStep ) { return true; };
    let nStep = 0;
    const promiseComplete = new Promise( function( resolve, reject ) {
        let isInsideAsyncHandler = false;
        const fnAsyncHandler = async function() {
            if( isInsideAsyncHandler )
                return;
            isInsideAsyncHandler = true;
            ++ nStep;
            if( socket.readyState === 1 ) {
                // Notice, connection is made if we are here
                clearInterval( iv );
                await fnDone( nStep );
                resolve();
            } else {
                if( ! await fnStep( nStep ) ) {
                    clearInterval( iv );
                    reject( new Error( "web socket wait timeout by callback " +
                        `on step ${nStep}` ) );
                }
            }
            isInsideAsyncHandler = false;
        };
        const iv = setInterval( function() {
            if( isInsideAsyncHandler )
                return;
            fnAsyncHandler().then( () => { } ).catch( () => { } );
        }, 1000 ); // 1 second
    } );
    await promiseComplete;
}

export async function doConnect( joCall, opts, fn ) {
    try {
        if( !validateURL( joCall.url ) ) {
            throw new Error( "JSON RPC CALLER cannot connect web socket " +
                `to invalid URL: ${joCall.url}` );
        }
        if( isUrlWS( joCall.url ) ) {
            let strWsError = null;
            joCall.wsConn = new ws.WebSocket( joCall.url );
            joCall.wsConn.on( "open", async function() {
                if( fn )
                    await fn( joCall, null );
            } );
            joCall.wsConn.on( "close", async function() {
                strWsError =
                    "web socket was closed, please check provided URL is valid and accessible";
                joCall.wsConn = null;
            } );
            joCall.wsConn.on( "error", async function( err ) {
                strWsError = err.toString() || "internal web socket error";
                log.error( "{url} web socket error: {err}", joCall.url, err );
                const wsConn = joCall.wsConn;
                joCall.wsConn = null;
                wsConn.close();
                doReconnectWsStep( joCall, opts );
            } );
            joCall.wsConn.on( "fail", async function( err ) {
                strWsError = err.toString() || "internal web socket failure";
                log.error( "{url} web socket fail: {err}", joCall.url, err );
                const wsConn = joCall.wsConn;
                joCall.wsConn = null;
                wsConn.close();
                doReconnectWsStep( joCall, opts );
            } );
            joCall.wsConn.on( "message", async function incoming( data ) {
                const joOut = JSON.parse( data );
                if( joOut.id in joCall.mapPendingByCallID ) {
                    const entry = joCall.mapPendingByCallID[joOut.id];
                    delete joCall.mapPendingByCallID[joOut.id];
                    if( entry.iv ) {
                        clearTimeout( entry.iv );
                        entry.iv = null;
                    }
                    clearTimeout( entry.out );
                    if( entry.fn )
                        await entry.fn( entry.joIn, joOut, null );
                }
            } );
            await waitWebSocketIsOpen( joCall.wsConn,
                async function( nStep ) { // work done handler
                },
                async function( nStep ) { // step handler
                    if( strWsError && typeof strWsError == "string" && strWsError.length > 0 ) {
                        log.error( "{url} web socket wait error detected: {err}",
                            joCall.url, strWsError );
                        return false;
                    }
                    if( nStep >= gSecondsConnectionTimeout ) {
                        strWsError = "wait timeout, web socket is connecting too long";
                        log.error( "{url} web socket wait timeout detected", joCall.url );
                        const wsConn = joCall.wsConn;
                        joCall.wsConn = null;
                        wsConn.close();
                        doReconnectWsStep( joCall, opts );
                        return false; // stop waiting
                    }
                    return true; // continue waiting
                } );
            if( strWsError && typeof strWsError == "string" && strWsError.length > 0 ) {
                const err = new Error( strWsError );
                if( fn )
                    await fn( joCall, err );
                return;
            }
        }
        if( fn )
            await fn( joCall, null );
    } catch ( err ) {
        joCall.wsConn = null;
        if( fn )
            await fn( joCall, err );
    }
    return joCall;
}

export async function doConnectIfNeeded( joCall, opts, fn ) {
    try {
        if( !validateURL( joCall.url ) ) {
            throw new Error( "JSON RPC CALLER cannot connect web socket " +
                `to invalid URL: ${joCall.url}` );
        }
        if( isUrlWS( joCall.url ) && ( !joCall.wsConn ) ) {
            await joCall.reconnect( fn );
            return;
        }
        if( fn )
            await fn( joCall, null );
    } catch ( err ) {
        if( fn )
            await fn( joCall, err );
    }
    return joCall;
}

async function doReconnectWsStep( joCall, opts, fn ) {
    if( ! joCall.isAutoReconnect )
        return;
    if( joCall.isDisconnectMode )
        return;
    doConnect( joCall, opts, async function( joCall, err ) {
        if( err ) {
            doReconnectWsStep( joCall, opts );
            return;
        }
        if( fn )
            await fn( joCall, null );
    } );
}

async function doDisconnect( joCall, fn ) {
    try {
        joCall.isDisconnectMode = true;
        const wsConn = joCall.wsConn ? joCall.wsConn : null;
        joCall.wsConn = null;
        if( wsConn )
            wsConn.close();
        joCall.isDisconnectMode = false;
        try {
            if( fn )
                await fn( joCall, null );
        } catch ( err ) {
        }
    } catch ( err ) {
        if( fn )
            await await fn( joCall, err );
    }
}

export async function doCall( joCall, joIn, fn ) {
    joIn = enrichTopLevelFieldsInJSON( joIn );
    if( joCall.wsConn ) {
        const entry = {
            joIn: joIn,
            fn: fn,
            out: null
        };
        joCall.mapPendingByCallID[joIn.id] = entry;
        entry.iv = setTimeout( function() {
            clearTimeout( entry.iv );
            entry.iv = null;
            delete joCall.mapPendingByCallID[joIn.id];
        }, 200 * 1000 );
        joCall.wsConn.send( JSON.stringify( joIn ) );
    } else {
        if( !validateURL( joCall.url ) ) {
            if( fn ) {
                await fn( joIn, null,
                    "JSON RPC CALLER cannot do query post to invalid URL: " + joCall.url );
            }
            return;
        }
        const strBody = JSON.stringify( joIn );
        let errCall = null, joOut = null;
        if( joCall.joRpcOptions &&
            joCall.joRpcOptions.cert && typeof joCall.joRpcOptions.cert == "string" &&
            joCall.joRpcOptions.key && typeof joCall.joRpcOptions.key == "string"
        ) {
            const u = new URL( joCall.url );
            const options = {
                "hostname": u.hostname,
                "port": u.port,
                "path": "/",
                "method": "POST",
                "headers": {
                    "Content-Type": "application/json"
                },
                "ca": ( joCall.joRpcOptions && joCall.joRpcOptions.ca &&
                    typeof joCall.joRpcOptions.ca == "string" )
                    ? joCall.joRpcOptions.ca : null,
                "cert": ( joCall.joRpcOptions && joCall.joRpcOptions.cert &&
                    typeof joCall.joRpcOptions.cert == "string" )
                    ? joCall.joRpcOptions.cert : null,
                "key": ( joCall.joRpcOptions && joCall.joRpcOptions.key &&
                    typeof joCall.joRpcOptions.key == "string" )
                    ? joCall.joRpcOptions.key : null
            };
            let accumulatedBody = "";
            const promiseComplete = new Promise( ( resolve, reject ) => {
                try {
                    const req = https.request( options, res => {
                        res.setEncoding( "utf8" );
                        res.on( "data", body => {
                            accumulatedBody += body;
                        } );
                        res.on( "end", function() {
                            if( res.statusCode !== 200 ) {
                                joOut = null;
                                errCall = "Response ends with bad status code: " +
                                    res.statusCode.toString();
                                reject( errCall );
                            }
                            try {
                                joOut = JSON.parse( accumulatedBody );
                                errCall = null;
                                resolve( joOut );
                            } catch ( err ) {
                                joOut = null;
                                errCall = "Response body parse error: " + err.toString();
                                reject( errCall );
                            }
                        } );
                    } );
                    req.on( "error", err => {
                        log.error( "{url} REST error {err}", joCall.url, err );
                        joOut = null;
                        errCall = `HTTP(S)/RPC call(event) error: ${err.toString()}`;
                        reject( errCall );
                    } );
                    req.write( strBody );
                    req.end();
                } catch ( err ) {
                    log.error( "{url} REST error {err}", joCall.url, err );
                    joOut = null;
                    errCall = `HTTP(S)/RPC call(processing) error: ${err.toString()}`;
                    reject( errCall );
                }
            } );
            await promiseComplete.catch( function( err ) {
                log.error( "{url} HTTP call error {err}", joCall.url, err );
                if( ! errCall )
                    errCall = `HTTP(S)/RPC call(catch) error: ${err.toString()}`;
            } );
        } else {
            try {
                const response = await urllib.request( joCall.url, {
                    "method": "POST",
                    "timeout": gSecondsConnectionTimeout * 1000, // in milliseconds
                    "headers": {
                        "Content-Type": "application/json"
                    },
                    "content": strBody,
                    "rejectUnauthorized": false,
                    // "requestCert": true,
                    "agent": false,
                    "httpsAgent": false,
                    "ca": ( joCall.joRpcOptions && joCall.joRpcOptions.ca &&
                        typeof joCall.joRpcOptions.ca == "string" )
                        ? joCall.joRpcOptions.ca : null,
                    "cert": ( joCall.joRpcOptions && joCall.joRpcOptions.cert &&
                        typeof joCall.joRpcOptions.cert == "string" )
                        ? joCall.joRpcOptions.cert : null,
                    "key": ( joCall.joRpcOptions && joCall.joRpcOptions.key &&
                        typeof joCall.joRpcOptions.key == "string" )
                        ? joCall.joRpcOptions.key : null
                } );
                const body = response.data.toString( "utf8" );
                if( response && response.statusCode && response.statusCode !== 200 )
                    log.warning( "REST call status code is {}", response.statusCode );

                joOut = JSON.parse( body );
                errCall = null;
            } catch ( err ) {
                log.error( "{url} request error {err}", joCall.url, err );
                joOut = null;
                errCall = "request error: " + err.toString();
            }
        }
        try {
            if( fn )
                await fn( joIn, joOut, errCall );
        } catch ( err ) {
        }
    }
}

export async function rpcCallCreate( strURL, opts ) {
    if( !validateURL( strURL ) )
        throw new Error( `JSON RPC CALLER cannot create a call object invalid URL: ${strURL}` );
    if( !( strURL && typeof strURL == "string" && strURL.length > 0 ) ) {
        throw new Error( "rpcCallCreate() was invoked with " +
            `bad parameters: ${JSON.stringify( arguments )}` );
    }
    const joCall = {
        "url": "" + strURL,
        "joRpcOptions": opts ? opts : null,
        "mapPendingByCallID": { },
        "wsConn": null,
        "isAutoReconnect":
            ( opts && "isAutoReconnect" in opts && opts.isAutoReconnect ) ? true : false,
        "isDisconnectMode": false,
        "reconnect": async function( fnAfter ) {
            await doConnect( joCall, fnAfter );
        },
        "reconnect_if_needed": async function( fnAfter ) {
            await doConnectIfNeeded( joCall, opts, fnAfter );
        },
        "call": function( joIn, fnAfter ) {
            const self = this;
            const promiseComplete = new Promise( function( resolve, reject ) {
                self.reconnect_if_needed( async function( joCall, err ) {
                    if( err ) {
                        if( fnAfter )
                            await fnAfter( joIn, null, err );
                        reject( err );
                        return;
                    }
                    await doCall( joCall, joIn, async function( joIn, joOut, err ) {
                        if( fnAfter )
                            await fnAfter( joIn, joOut, err );
                        if( err )
                            reject( err );
                        else
                            resolve( joOut );
                    } ).catch( function( err ) {
                        log.error(
                            "{url} JSON RPC call(performer) error: {err}", strURL, err );
                    } );
                } );
            } );
            return promiseComplete.catch( function( err ) {
                log.error(
                    "{url} JSON RPC call(awaiter) error: {err}", strURL, err );
            } );
        },
        "disconnect": async function( fnAfter ) {
            await doDisconnect( joCall, fnAfter );
        }
    };
    await doConnect( joCall, opts );
    return joCall;
}

export { rpcCallCreate as create };

export function generateRandomIntegerInRange( min, max ) {
    min = Math.ceil( min );
    max = Math.floor( max );
    return Math.floor( Math.random() * ( max - min + 1 ) ) + min;
}

export function generateRandomRpcCallId() {
    return generateRandomIntegerInRange( 1, Number.MAX_SAFE_INTEGER );
}

export function enrichTopLevelFieldsInJSON( jo ) {
    if( ( !( "jsonrpc" in jo ) ) ||
        ( typeof jo.jsonrpc !== "string" ) ||
        jo.jsonrpc.length === 0
    )
        jo.jsonrpc = "2.0";
    if( ( !( "id" in jo ) ) || ( typeof jo.id !== "number" ) || jo.id <= 0 )
        jo.id = generateRandomRpcCallId();
    return jo;
}

export function isValidUrl( s ) {
    if( ! s )
        return false;
    try {
        const u = new URL( s.toString() );
        if( u )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function getValidUrl( s ) {
    if( ! s )
        return null;
    try {
        return new URL( s.toString() );
    } catch ( err ) {
    }
    return null;
}

export function getDefaultPort( strProtocol ) {
    if( ! strProtocol )
        return 80;
    switch ( strProtocol.toString().toLowerCase() ) {
    case "http:":
    case "ws:":
        return 80;
    case "https:":
    case "wss:":
        return 443;
    }
    return 80;
}

export function getValidHostAndPort( s ) {
    const u = getValidUrl( s );
    if( ! u )
        return null;
    const jo = {
        strHost: u.hostname,
        nPort: u.port ? parseInt( u.port, 10 ) : getDefaultPort( u.protocol )
    };
    return jo;
}

const gStrTcpConnectionHeader = "TCP connection checker: ";

export function checkTcpPromise( strHost, nPort, nTimeoutMilliseconds, isLog ) {
    return new Promise( ( resolve, reject ) => {
        if( isLog ) {
            console.log(
                `${gStrTcpConnectionHeader}Will establish ` +
                `TCP connection to ${strHost}:${nPort}...` );
        }
        const conn = net.createConnection( { host: strHost, port: nPort }, () => {
            if( isLog ) {
                console.log(
                    `${gStrTcpConnectionHeader}Done, ` +
                    `TCP connection to ${strHost}:${nPort} established` );
            }
            conn.end();
            resolve();
        } );
        if( isLog ) {
            console.log(
                `${gStrTcpConnectionHeader}Did created NET object ` +
                `for TCP connection to ${strHost}:${nPort}...` );
        }
        if( nTimeoutMilliseconds )
            nTimeoutMilliseconds = parseInt( nTimeoutMilliseconds.toString(), 10 );
        if( nTimeoutMilliseconds > 0 ) {
            if( isLog ) {
                console.log(
                    `${gStrTcpConnectionHeader}Will use ` +
                    `TCP connection to ${strHost}:${nPort} ` +
                    `timeout ${nTimeoutMilliseconds} milliseconds...` );
            }
            conn.setTimeout( nTimeoutMilliseconds );
        } else {
            if( isLog ) {
                console.log(
                    `${gStrTcpConnectionHeader}Will use ` +
                    `default TCP connection to ${strHost}:${nPort} timeout...` );
            }
        }
        conn.on( "timeout", err => {
            if( isLog ) {
                console.log(
                    `${gStrTcpConnectionHeader}TCP connection ` +
                    `to ${strHost}:${nPort} timed out` );
            }
            conn.destroy();
            reject( err );
        } );
        conn.on( "error", err => {
            if( isLog ) {
                console.log(
                    `${gStrTcpConnectionHeader}TCP connection ` +
                    `to ${strHost}:${nPort} failed` );
            }
            reject( err );
        } );
        if( isLog ) {
            console.log(
                `${gStrTcpConnectionHeader}TCP connection ` +
                `to ${strHost}:${nPort} check started...` );
        }
    } );
}

export async function checkTcp( strHost, nPort, nTimeoutMilliseconds, isLog ) {
    let isOnline = false;
    try {
        const promiseCompleteTcpCheck = checkTcpPromise(
            strHost, nPort, nTimeoutMilliseconds, isLog )
            .then( function() { isOnline = true; } )
            .catch( function() { isOnline = false; } )
            ;
        if( isLog ) {
            console.log(
                `${gStrTcpConnectionHeader}Waiting for ` +
                `TCP connection to ${strHost}:${nPort} check done...` );
        }
        await promiseCompleteTcpCheck.catch( function() { isOnline = false; } );
        if( isLog ) {
            console.log(
                `${gStrTcpConnectionHeader}TCP connection ` +
                `to ${strHost}:${nPort} check finished` );
        }
    } catch ( err ) {
        isOnline = false;
        console.log(
            `${gStrTcpConnectionHeader}TCP connection ` +
            `to ${strHost}:${nPort} check failed with error: ${err.toString()}` );
    }
    return isOnline;
}

export async function checkUrl( u, nTimeoutMilliseconds, isLog ) {
    if( ! u )
        return false;
    const jo = getValidHostAndPort( u );
    if( isLog ) {
        console.log( `${gStrTcpConnectionHeader}Extracted from URL ${u.toString()} data ` +
            `fields are: ${JSON.stringify( jo )}` );
    }
    if( ! ( jo && jo.strHost && "nPort" in jo ) ) {
        console.log( `${gStrTcpConnectionHeader}Extracted from URL ${u.toString()} data ` +
            "fields are bad, returning \"false\" as result of TCP connection check" );
        return false;
    }
    return await checkTcp( jo.strHost, jo.nPort, nTimeoutMilliseconds, isLog );
}
