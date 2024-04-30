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
 * @file utils.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as threadInfo from "./threadInfo.js";
import type * as state from "./state.js";
import type * as discoveryTools from "./discoveryTools.js";

import { v4 as uuid } from "uuid";
export { uuid };

const ethersMod = owaspUtils.ethersMod;
export { ethersMod };

export interface TTokesABIHolder {
    joABI: object
}

export function replaceAll( str: string, find: string, replace: string ): string {
    return str.replace( new RegExp( find, "g" ), replace );
}

export function normalizePath( strPath: string ): string {
    strPath = strPath.replace( /^~/, os.homedir() );
    strPath = path.normalize( strPath );
    strPath = path.resolve( strPath );
    return strPath;
}

export function getRandomFileName(): string {
    const timestamp = new Date().toISOString().replace( /[-:.]/g, "" );
    const random = Math.random().toString().substring( 2, 8 );
    const randomNumber = timestamp + random;
    return randomNumber;
}

export function fileExists( strPath: string ): boolean {
    try {
        if( fs.existsSync( strPath ) ) {
            const stats = fs.statSync( strPath );
            if( stats.isFile() )
                return true;
        }
    } catch ( err ) {}
    return false;
}

export function fileLoad( strPath: string, strDefault?: string | null ): string {
    strDefault = strDefault ?? "";
    if( !fileExists( strPath ) )
        return strDefault;
    try {
        const s = fs.readFileSync( strPath ).toString();
        return s;
    } catch ( err ) {}
    return strDefault;
}

export function fileSave( strPath: string, s: string ): boolean {
    try {
        fs.writeFileSync( strPath, s );
        return true;
    } catch ( err ) {}
    return false;
}

export function jsonFileLoad(
    strPath: string, joDefault?: state.TLoadedJSON, bLogOutput?: boolean
): state.TLoadedJSON {
    if( bLogOutput == undefined || bLogOutput == null )
        bLogOutput = false;
    joDefault = joDefault || {};
    if( bLogOutput )
        log.debug( "Will load JSON file {}...", strPath );

    if( !fileExists( strPath ) ) {
        if( bLogOutput )
            log.error( "Cannot load JSON file {}, it does not exist", strPath );
        return joDefault;
    }
    try {
        const s = fs.readFileSync( strPath ).toString();
        if( bLogOutput )
            log.debug( "Did loaded content of JSON file {}, will parse it...", strPath );

        const jo: state.TLoadedJSON = JSON.parse( s );
        if( bLogOutput )
            log.success( "Done, loaded content of JSON file {}.", strPath );
        return jo;
    } catch ( err ) {
        log.error( "Failed to load JSON file {}, error is: {err}, stack is:\n{stack}",
            strPath, err, err );
    }
    return joDefault;
}

export function jsonFileSave(
    strPath: string, jo?: state.TLoadedJSON, bLogOutput?: boolean
): state.TLoadedJSON {
    if( bLogOutput == undefined || bLogOutput == null )
        bLogOutput = false;
    if( bLogOutput )
        log.debug( "Will save JSON file {}...", strPath );
    try {
        const s = JSON.stringify( jo, null, 4 );
        fs.writeFileSync( strPath, s );
        if( bLogOutput )
            log.success( "Done, saved content of JSON file {}.", strPath );
        return true;
    } catch ( err ) {
        log.error( " failed to save JSON file {}, error is: {err}, stack is:\n{stack}",
            strPath, err, err );
    }
    return false;
}

const gMillisecondsToSleepStepWaitForClonedTokenToAppear: number = 1000;

export async function waitForClonedTokenToAppear(
    sc: state.TOneChainProperties,
    strTokenSuffix: string, // example "erc20"
    addressCallFrom: string,
    cntAttempts: number,
    tokensMN: TTokesABIHolder,
    strMainnetName: string
): Promise <string> {
    const strTokenSuffixLC = strTokenSuffix.toLowerCase();
    const strTokenSuffixUC =
        owaspUtils.replaceAll( strTokenSuffix.toUpperCase(), "_WITH_METADATA", "_with_metadata" );
    const strTokenSuffixLCshort = owaspUtils.replaceAll( strTokenSuffixLC, "_with_metadata", "" );
    const ts0 = log.timestampHR();
    let ts1;
    log.information( "Waiting for {} token to appear automatically deployed on S-Chain {}...",
        strTokenSuffixUC, sc.strChainName );
    log.debug( "... source chain name is {}", strMainnetName );
    log.debug( "... destination {} address is {}", "TokenManager" + strTokenSuffixUC,
        sc.joAbiIMA["token_manager_" + strTokenSuffixLC + "_address"] );
    if( !sc.ethersProvider )
        throw new Error( "no EthersJS provider to wait for cloned token to appear" );
    const contractTokenManager = new owaspUtils.ethersMod.ethers.Contract(
        sc.joAbiIMA["token_manager_" + strTokenSuffixLC + "_address"],
        sc.joAbiIMA["token_manager_" + strTokenSuffixLC + "_abi"],
        sc.ethersProvider );
    for( let idxAttempt = 0; idxAttempt < cntAttempts; ++idxAttempt ) {
        log.information( "Discovering {} step {}...", strTokenSuffixUC, idxAttempt );
        if( gMillisecondsToSleepStepWaitForClonedTokenToAppear > 0 )
            await threadInfo.sleep( gMillisecondsToSleepStepWaitForClonedTokenToAppear );
        const addressOnSChain =
            await contractTokenManager.callStatic[
                "clones" + log.capitalizeFirstLetter( strTokenSuffixLCshort )](
                owaspUtils.ethersMod.ethers.utils.id( strMainnetName ),
                ( tokensMN.joABI as state.TLoadedJSON )[strTokenSuffixUC + "_address"],
                { from: addressCallFrom }
            );
        if( addressOnSChain != "0x0000000000000000000000000000000000000000" ) {
            ts1 = log.timestampHR();
            log.success( "Done, duration is {}", log.getDurationString( ts0, ts1 ) );
            log.success( "Discovered {} instantiated on S-Chain {} at address {}",
                strTokenSuffixUC, sc.strChainName, addressOnSChain );
            return addressOnSChain;
        }
    }
    ts1 = log.timestampHR();
    log.error( "Failed to discover {} instantiated on S-Chain {}",
        strTokenSuffixUC, sc.strChainName );
    throw new Error( `Failed to discover ${strTokenSuffixUC} instantiated ` +
        `on S-Chain ${sc.strChainName}` );
}

export async function waitForClonedTokenToAppearErc20(
    sc: state.TOneChainProperties,
    tokenERC20SC: state.TTokeInformation, joAccountSC: state.TAccount,
    tokensMN: TTokesABIHolder, strMainnetName: string
): Promise <void> {
    if( "abi" in tokenERC20SC && typeof tokenERC20SC.abi === "object" &&
        "address" in tokenERC20SC && typeof tokenERC20SC.address === "string"
    ) {
        log.warning( "Skipping automatic ERC20 instantiation discovery, already done before" );
        return;
    }
    const addressCallFrom = joAccountSC.address();
    const addressOnSChain = await waitForClonedTokenToAppear(
        sc, "erc20", addressCallFrom, 40, tokensMN, strMainnetName );
    tokenERC20SC.abi = JSON.parse(
        JSON.stringify( ( tokensMN.joABI as state.TLoadedJSON ).ERC20_abi ) );
    tokenERC20SC.address = addressOnSChain ? addressOnSChain.toString() : "";
}

export async function waitForClonedTokenToAppearErc721(
    sc: state.TOneChainProperties,
    tokenERC721SC: state.TTokeInformation, joAccountSC: state.TAccount,
    tokensMN: TTokesABIHolder, strMainnetName: string
): Promise <void> {
    if( "abi" in tokenERC721SC && typeof tokenERC721SC.abi === "object" &&
        "address" in tokenERC721SC && typeof tokenERC721SC.address === "string"
    ) {
        log.warning( "Skipping automatic ERC721instantiation discovery, already done before" );
        return;
    }
    const addressCallFrom = joAccountSC.address();
    const addressOnSChain =
        await waitForClonedTokenToAppear(
            sc, "erc721", addressCallFrom, 40, tokensMN, strMainnetName );
    tokenERC721SC.abi = JSON.parse(
        JSON.stringify( ( tokensMN.joABI as state.TLoadedJSON ).ERC721_abi ) );
    tokenERC721SC.address = addressOnSChain ? addressOnSChain.toString() : "";
}

export async function waitForClonedTokenToAppearErc721WithMetadata(
    sc: state.TOneChainProperties,
    tokenERC721SC: state.TTokeInformation, joAccountSC: state.TAccount,
    tokensMN: TTokesABIHolder, strMainnetName: string
): Promise <void> {
    if( "abi" in tokenERC721SC && typeof tokenERC721SC.abi === "object" &&
        "address" in tokenERC721SC && typeof tokenERC721SC.address === "string"
    ) {
        log.warning( "Skipping automatic ERC721_with_metadata instantiation discovery, " +
            "already done before" );
        return;
    }
    const addressCallFrom = joAccountSC.address();
    const addressOnSChain = await waitForClonedTokenToAppear(
        sc, "erc721_with_metadata", addressCallFrom, 40, tokensMN, strMainnetName );
    tokenERC721SC.abi = JSON.parse(
        JSON.stringify( ( tokensMN.joABI as state.TLoadedJSON ).ERC721_with_metadata_abi ) );
    tokenERC721SC.address = addressOnSChain ? addressOnSChain.toString() : "";
}

export async function waitForClonedTokenToAppearErc1155(
    sc: state.TOneChainProperties,
    tokenERC1155SC: state.TTokeInformation, joAccountSC: state.TAccount,
    tokensMN: TTokesABIHolder, strMainnetName: string
): Promise <void> {
    if( "abi" in tokenERC1155SC && typeof tokenERC1155SC.abi === "object" &&
        "address" in tokenERC1155SC && typeof tokenERC1155SC.address === "string"
    ) {
        log.warning( "Skipping automatic ERC1155 instantiation discovery, already done before" );
        return;
    }
    const addressCallFrom = joAccountSC.address();
    const addressOnSChain = await waitForClonedTokenToAppear(
        sc, "erc1155", addressCallFrom, 40, tokensMN, strMainnetName );
    tokenERC1155SC.abi = JSON.parse(
        JSON.stringify( ( tokensMN.joABI as state.TLoadedJSON ).ERC1155_abi ) );
    tokenERC1155SC.address = addressOnSChain ? addressOnSChain.toString() : "";
}

export function hexToBytes(
    strHex?: log.TLogArgument, isInversiveOrder?: boolean
): Uint8Array { // convert a hex string to a byte array
    isInversiveOrder = !!(
        ( isInversiveOrder != null && isInversiveOrder != undefined && isInversiveOrder )
    );
    strHex = strHex ?? "";
    strHex = strHex.toString();
    strHex = strHex.trim().toLowerCase();
    if( strHex.length > 1 && strHex[0] == "0" && ( strHex[1] == "x" || strHex[1] == "X" ) )
        strHex = strHex.substr( 2, strHex.length - 2 );
    if( ( strHex.length & 1 ) !== 0 )
        strHex = "0" + strHex;
    const cnt = strHex.length;
    let i: number, j: number;
    const arrBytes = new Uint8Array( cnt / 2 );
    for( i = 0, j = 0; i < cnt; ++j, i += 2 )
        arrBytes[j] = parseInt( strHex.substr( i, 2 ), 16 );
    if( isInversiveOrder )
        return arrBytes.reverse();
    return arrBytes;
}

export function bytesToHex(
    arrBytes: Uint8Array, isInversiveOrder?: boolean
): string { // convert a byte array to a hex string
    isInversiveOrder = !!(
        ( isInversiveOrder != null && isInversiveOrder != undefined && isInversiveOrder )
    );
    const hex: log.TLogArgument[] = [];
    for( let i = 0; i < arrBytes.length; i++ ) {
        const current = arrBytes[i] < 0 ? arrBytes[i] + 256 : arrBytes[i];
        const c0 = ( current >>> 4 ).toString( 16 );
        const c1 = ( current & 0xF ).toString( 16 );
        if( isInversiveOrder ) {
            hex.splice( 0, 0, c0 );
            hex.splice( 1, 0, c1 );
        } else {
            hex.push( c0 );
            hex.push( c1 );
        }
    }
    return hex.join( "" );
}

export function bytesAlignLeftWithZeroes( arrBytes: Uint8Array, cntMin: number ): Uint8Array {
    if( arrBytes.length >= cntMin )
        return arrBytes;
    const cntNewZeros = cntMin - arrBytes.length;
    // By default Uint8Array, Uint16Array and Uint32Array classes keep zeros as it's values.
    const arrNewZeros = new Uint8Array( cntNewZeros );
    arrBytes = bytesConcat( arrNewZeros, arrBytes );
    return arrBytes;
}

export function bytesAlignRightWithZeroes( arrBytes: Uint8Array, cntMin: number ): Uint8Array {
    if( arrBytes.length >= cntMin )
        return arrBytes;
    const cntNewZeros = cntMin - arrBytes.length;
    // By default Uint8Array, Uint16Array and Uint32Array classes keep zeros as it's values.
    const arrNewZeros = new Uint8Array( cntNewZeros );
    arrBytes = bytesConcat( arrBytes, arrNewZeros );
    return arrBytes;
}

export function concatUint8Arrays(
    a: Uint8Array, b: Uint8Array ): Uint8Array { // a, b TypedArray of same type
    if( typeof a === "string" )
        a = hexToBytes( a );
    if( typeof b === "string" )
        b = hexToBytes( b );
    const c = new Uint8Array( a.length + b.length );
    c.set( a, 0 );
    c.set( b, a.length );
    return c;
}

export function concatByte( ui8a: Uint8Array, byte: number ): Uint8Array {
    const b = new Uint8Array( 1 );
    b[0] = byte;
    return concatUint8Arrays( ui8a, b );
}

export function bytesConcat( a1?: Uint8Array, a2?: Uint8Array ): Uint8Array {
    a1 = a1 ?? new Uint8Array();
    a2 = a2 ?? new Uint8Array();
    return concatUint8Arrays( a1, a2 );
}

export function toBuffer( ab?: log.TLogArgument ): Buffer {
    return Buffer.from( new Uint8Array( ab ) );
}

export function discoverCoinNameInJSON( jo?: state.TLoadedJSON ): string {
    if( typeof jo !== "object" )
        return "";
    const arrKeys = Object.keys( jo );
    let s1 = "";
    let s2 = "";
    let i; const cnt = arrKeys.length;
    let j;
    for( i = 0; i < cnt; ++i ) {
        if( s1.length > 0 && s2.length > 0 )
            break;
        const k = arrKeys[i];
        j = k.indexOf( "_address" );
        if( j > 0 ) {
            s1 = k.substring( 0, j );
            continue;
        }
        j = k.indexOf( "_abi" );
        if( j > 0 ) {
            s2 = k.substring( 0, j );
            continue;
        }
    }
    if( s1.length === 0 || s2.length === 0 )
        return "";
    if( s1 !== s2 )
        return "";
    return s1;
}

export function checkKeyExistInABI(
    strName: string, strFile: string, joABI: state.TLoadedJSON,
    strKey: string, isExitOnError?: boolean
): boolean {
    if( isExitOnError == null || isExitOnError == undefined )
        isExitOnError = true;
    try {
        if( strKey in joABI )
            return true;
    } catch ( err ) {
        if( isExitOnError ) {
            log.fatal(
                "Loaded {} ABI JSON file {} does not contain needed key {}, stack is:\n{stack}",
                strName, strFile, strKey, err );
            process.exit( 126 );
        }
    }
    return false;
}

export function checkKeysExistInABI(
    strName: string, strFile: string, joABI: state.TLoadedJSON,
    arrKeys: string[], isExitOnError?: boolean
): boolean {
    const cnt = arrKeys.length;
    for( let i = 0; i < cnt; ++i ) {
        const strKey = arrKeys[i];
        if( !checkKeyExistInABI( strName, strFile, joABI, strKey, isExitOnError ) )
            return false;
    }
    return true;
}

export function composeSChainNodeUrl( joNode: discoveryTools.TSChainNode ): string {
    if( "ip" in joNode && joNode?.ip && joNode.ip.length > 0 ) {
        if( "httpRpcPort" in joNode && joNode?.httpRpcPort && joNode.httpRpcPort > 0 )
            return "http://" + joNode.ip + ":" + joNode.httpRpcPort;
        if( "wsRpcPort" in joNode && joNode?.wsRpcPort && joNode.wsRpcPort > 0 )
            return "ws://" + joNode.ip + ":" + joNode.wsRpcPort;
        if( "httpsRpcPort" in joNode && joNode?.httpsRpcPort && joNode.httpsRpcPort > 0 )
            return "https://" + joNode.ip + ":" + joNode.httpsRpcPort;
        if( "wssRpcPort" in joNode && joNode?.wssRpcPort && joNode.wssRpcPort > 0 )
            return "wss://" + joNode.ip + ":" + joNode.wssRpcPort;
    }
    if( "ip6" in joNode && joNode?.ip6 && joNode.ip6.length > 0 ) {
        if( "httpRpcPort6" in joNode && joNode?.httpRpcPort6 && joNode.httpRpcPort6 > 0 )
            return "http://[" + joNode.ip6 + "]:" + joNode.httpRpcPort6;
        if( "wsRpcPort6" in joNode && joNode?.wsRpcPort6 && joNode.wsRpcPort6 > 0 )
            return "ws://[" + joNode.ip6 + "]:" + joNode.wsRpcPort6;
        if( "httpsRpcPort6" in joNode && joNode?.httpsRpcPort6 && joNode.httpsRpcPort6 > 0 )
            return "https://[" + joNode.ip6 + "]:" + joNode.httpsRpcPort6;
        if( "wssRpcPort6" in joNode && joNode?.wssRpcPort6 && joNode.wssRpcPort6 > 0 )
            return "wss://[" + joNode.ip6 + "]:" + joNode.wssRpcPort6;
    }
    return "";
}

export function composeImaAgentNodeUrl(
    joNode: discoveryTools.TSChainNode, isThisNode: boolean ): string {
    let nPort = -1;
    if( "imaAgentRpcPort" in joNode && joNode?.imaAgentRpcPort && joNode.imaAgentRpcPort > 0 )
        nPort = joNode.imaAgentRpcPort;
    // PROPOSAL = 0
    // CATCHUP = 1
    // WS_JSON = 2
    // HTTP_JSON = 3
    // BINARY_CONSENSUS = 4
    // ZMQ_BROADCAST = 5
    // IMA_MONITORING = 6
    // WSS_JSON = 7
    // HTTPS_JSON = 8
    // INFO_HTTP_JSON = 9
    // IMA_AGENT_JSON = 10
    if( nPort < 0 && joNode?.httpRpcPort && joNode.httpRpcPort > 0 )
        nPort = joNode.httpRpcPort - 3 + 10;
    if( nPort < 0 && joNode?.wsRpcPort && joNode.wsRpcPort > 0 )
        nPort = joNode.wsRpcPort - 2 + 10;
    if( nPort < 0 && joNode?.httpsRpcPort && joNode.httpsRpcPort > 0 )
        nPort = joNode.httpsRpcPort - 8 + 10;
    if( nPort < 0 && joNode?.wssRpcPort && joNode.wssRpcPort > 0 )
        nPort = joNode.wssRpcPort - 7 + 10;
    if( nPort > 0 ) {
        const strNodeIP = isThisNode ? "127.0.0.1" : joNode.ip;
        return "http://" + strNodeIP + ":" + nPort;
    }
    return "";
}
