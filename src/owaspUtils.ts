// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * SKALE IMA is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option)  any later version.
 *
 * SKALE IMA is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with SKALE IMA.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file owaspUtils.ts
 * @copyright SKALE Labs 2019-Present
 */

// introduction: https://github.com/Checkmarx/JS-SCP
// main PDF with rules to follow:
//     https://www.gitbook.com/download/pdf/book/checkmarx/JS-SCP
// top 10 hit parade: https://owasp.org/www-project-top-ten/

import * as log from "./log.js";
import * as ethersMod from "ethers";
import * as fs from "fs";

export interface TXYSignature {
    X: string
    Y: string
}

export interface TBLSSignature {
    blsSignature: any[2] // BLS glue of signatures, X then Y
    hashA: string // G1.X from joGlueResult.hashSrc
    hashB: string // G1.Y from joGlueResult.hashSrc
    counter: string | number | null
}

const BigNumber = ethersMod.ethers.BigNumber;

const safeURL = log.safeURL;
const replaceAll = log.replaceAll;
const extractErrorMessage = log.extractErrorMessage;

export { ethersMod, safeURL, replaceAll, extractErrorMessage, BigNumber };

export function rxIsInt( val: any ): boolean {
    try {
        const intRegex = /^-?\d+$/;
        if( !intRegex.test( val ) )
            return false;
        const intVal = parseInt( val, 10 );
        if( parseFloat( val ) == intVal && ( !isNaN( intVal ) ) )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function rxIsFloat( val: any ): boolean {
    try {
        const floatRegex = /^-?\d+(?:[.,]\d*?)?$/;
        if( !floatRegex.test( val ) )
            return false;
        val = parseFloat( val );
        if( isNaN( val ) )
            return false;
        return true;
    } catch ( err ) {
    }
    return false;
}

export function parseIntOrHex( s: any ): number {
    if( typeof s !== "string" )
        return parseInt( s );
    s = s.trim();
    if( s.length > 2 && s[0] == "0" && ( s[1] == "x" || s[1] == "X" ) )
        return parseInt( s, 16 );
    return parseInt( s, 10 );
}

export function validateRadix( value: any, radix?: any ): boolean {
    value = ( value ? value.toString() : "10" ).trim();
    radix = ( radix === null || radix === undefined )
        ? ( ( value.length > 2 && value[0] == "0" && ( value[1] == "x" || value[1] == "X" ) )
            ? 16
            : 10 )
        : parseInt( radix, 10 );
    return radix;
}

export function validateInteger( value: any, radix?: any ): boolean {
    try {
        if( value === null || value === undefined )
            return false;
        if( value === 0 || value === 0.0 )
            return true;
        const s = value ? value.toString().trim() : "";
        if( s.length < 1 )
            return false;
        radix = validateRadix( value, radix );
        if( ( !isNaN( value ) ) &&
            ( parseInt( value, radix ) == value || radix !== 10 ) &&
            ( !isNaN( parseInt( value, radix ) ) )
        )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function toInteger( value: any, radix?: any ): number {
    try {
        if( value === 0 || value === 0.0 || value === null || value === undefined )
            return 0;
        value = ( value ? value.toString().trim() : "" ).trim();
        radix = validateRadix( value, radix );
        if( !validateInteger( value, radix ) )
            return NaN;
        return parseInt( value.toString().trim(), radix );
    } catch ( err ) {
    }
    return 0;
}

export function validateFloat( value: any ): boolean {
    try {
        if( value === null || value === undefined )
            return false;
        if( value === 0 || value === 0.0 )
            return true;
        const f = parseFloat( value.toString().trim() );
        if( isNaN( f ) )
            return false;
        return true;
    } catch ( err ) {
    }
    return false;
}

export function toFloat( value: any ): number {
    try {
        if( value === 0 || value === 0.0 || value === null || value === undefined )
            return 0.0;
        const f = parseFloat( value.toString().trim() );
        return f;
    } catch ( err ) {
    }
    return 0.0;
}

export function validateURL( s: any ): boolean {
    const url = toURL( s );
    if( url == null )
        return false;
    return true;
}

export function toURL( s: any ): URL | null {
    try {
        if( s == null || s == undefined )
            return null;
        if( typeof s !== "string" )
            return null;
        s = s.trim();
        if( s.length <= 0 )
            return null;
        const sc = s[0];
        if( sc == "\"" || sc == "'" ) {
            const cnt = s.length;
            if( s[cnt - 1] == sc ) {
                const ss = s.substring( 1, cnt - 1 );
                const objURL = toURL( ss );
                if( objURL != null && objURL != undefined ) {
                    const anyURL: any = objURL;
                    anyURL.strStrippedStringComma = sc;
                }
                return objURL;
            }
            return null;
        }
        const objURL = new URL( s );
        if( !objURL.hostname )
            return null;
        if( objURL.hostname.length === 0 )
            return null;
        const anyURL: any = objURL;
        anyURL.strStrippedStringComma = null;
        return objURL;
    } catch ( err ) {
        return null;
    }
}

export function toStringURL( s?: any, defValue?: string ): string {
    defValue = defValue ?? "";
    try {
        const url = toURL( s );
        if( url == null || url == undefined )
            return defValue;
        return url.toString();
    } catch ( err ) {
        return defValue;
    }
}

export function isUrlHTTP( strURL?: any ): boolean {
    try {
        if( !validateURL( strURL ) )
            return false;
        const url = new URL( strURL );
        if( url.protocol == "http:" || url.protocol == "https:" )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function isUrlWS( strURL?: any ): boolean {
    try {
        if( !validateURL( strURL ) )
            return false;
        const url = new URL( strURL );
        if( url.protocol == "ws:" || url.protocol == "wss:" )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function toBoolean( value?: any ): boolean {
    let b = false;
    try {
        if( value === null || value === undefined )
            return false;
        if( typeof value === "boolean" )
            return value;
        if( typeof value === "string" ) {
            const ch = value[0].toLowerCase();
            if( ch == "y" || ch == "t" )
                b = true; else if( validateInteger( value ) )
                b = !!toInteger( value ); else if( validateFloat( value ) )
                b = !!toFloat( value ); else
                b = !!b;
        } else
            b = !!b;
    } catch ( err ) {
        b = false;
    }
    b = !!b;
    return b;
}

export function validateInputAddresses( address?: any ): boolean {
    return ( /^(0x){1}[0-9a-fA-F]{40}$/i.test( address ) );
}

export function validateEthAddress( value?: any ): boolean {
    try {
        if( validateInputAddresses( ensureStartsWith0x( value ) ) )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function validateEthPrivateKey( value?: any ): boolean {
    try {
        const ethersWallet = new ethersMod.ethers.Wallet( ensureStartsWith0x( value ) );
        if( ethersWallet.address )
            return true;
    } catch ( err ) {
    }
    return false;
}

export function toEthAddress( value?: any, defValue?: string ): string {
    try {
        value = value ? ensureStartsWith0x( value.toString() ) : "";
        defValue = defValue ?? "";
        if( !validateEthAddress( value ) )
            return defValue;
    } catch ( err ) {
    }
    return value;
}

export function toEthPrivateKey( value?: any, defValue?: string ): string {
    try {
        value = value ? value.toString() : "";
        defValue = defValue ?? "";
        if( !validateEthPrivateKey( value ) )
            return defValue;
    } catch ( err ) {
    }
    return value;
}

export function verifyArgumentWithNonEmptyValue( joArg?: any ): any {
    if( ( !joArg.value ) || ( typeof joArg.value === "string" && joArg.value.length === 0 ) ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must not be empty",
            joArg.value, joArg.name ) );
        process.exit( 126 );
    }
    return joArg;
}

export function verifyArgumentIsURL( joArg?: any ): any {
    try {
        verifyArgumentWithNonEmptyValue( joArg );
        const url = toURL( joArg.value );
        if( url == null ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid URL",
                joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        if( url.hostname.length <= 0 ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid URL",
                joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        return joArg;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid URL",
            joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function verifyArgumentIsInteger( joArg?: any ): any {
    try {
        verifyArgumentWithNonEmptyValue( joArg );
        if( !validateInteger( joArg.value ) ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid integer",
                joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        joArg.value = toInteger( joArg.value );
        return joArg;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid integer",
            joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function verifyArgumentIsIntegerIpPortNumber( joArg: any ): any {
    try {
        verifyArgumentIsInteger( joArg );
        if( joArg.value < 0 )
            throw new Error( `Port number ${joArg.value} cannot be negative` );
        if( joArg.value < 1 )
            throw new Error( `Port number ${joArg.value} too small` );
        if( joArg.value > 65535 )
            throw new Error( `Port number ${joArg.value} too big` );
        return joArg;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
            "valid integer IP port number", joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function verifyArgumentIsPathToExistingFile( joArg?: any ): any {
    try {
        verifyArgumentWithNonEmptyValue( joArg );
        const stats = fs.lstatSync( joArg.value );
        if( stats.isDirectory() ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
                "path to existing file, path to folder provided", joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        if( !stats.isFile() ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
                "path to existing file, bad path provided", joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        return joArg;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
            "path to existing file", joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function verifyArgumentIsPathToExistingFolder( joArg?: any ): any {
    try {
        verifyArgumentWithNonEmptyValue( joArg );
        const stats = fs.lstatSync( joArg.value );
        if( stats.isFile() ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
                "path to existing folder, path to file provided", joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        if( !stats.isDirectory() ) {
            console.log( log.fmtFatal( "(OWASP) Value {} of argument }{} must be " +
                "path to existing folder, bad path provided", joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        return joArg;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be " +
            "path to existing folder", joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function verifyArgumentIsArrayOfIntegers( joArg?: any ): any[] {
    try {
        verifyArgumentWithNonEmptyValue( joArg );
        if( joArg.value.length < 3 ) {
            console.log( log.fmtFatal( "(OWASP) Length {} of argument {} must be " +
                "bigger than 2", joArg.value.length, joArg.name ) );
            process.exit( 126 );
        }
        if( joArg.value[0] !== "[" || joArg.value[joArg.value.length - 1] !== "]" ) {
            console.log( log.fmtFatal( "(OWASP) First and last symbol {} of argument {} must be " +
                "brackets", joArg.value, joArg.name ) );
            process.exit( 126 );
        }
        const newValue = joArg.value.replace( "[", "" ).replace( "]", "" ).split( "," );
        for( let index = 0; index < newValue.length; index++ ) {
            if( !newValue[index] ||
                ( typeof newValue[index] === "string" && newValue[index].length === 0 )
            ) {
                console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must not be empty",
                    newValue[index], joArg.name ) );
                process.exit( 126 );
            }
            if( !validateInteger( newValue[index] ) ) {
                console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid integer",
                    newValue[index], joArg.name ) );
                process.exit( 126 );
            }
            newValue[index] = toInteger( newValue[index] );
        }
        return newValue;
    } catch ( err ) {
        console.log( log.fmtFatal( "(OWASP) Value {} of argument {} must be valid integer array",
            joArg.value, joArg.name ) );
        process.exit( 126 );
    }
}

export function ensureStartsWith0x( s?: any ): string {
    if( s == null || s == undefined || typeof s !== "string" )
        return s;
    if( s.length < 2 )
        return "0x" + s;
    if( s[0] == "0" && s[1] == "x" )
        return s;
    return "0x" + s;
}

export function removeStarting0x( s?: any ): string {
    if( s == null || s == undefined || typeof s !== "string" )
        return s;
    if( s.length < 2 )
        return s;
    if( s[0] == "0" && s[1] == "x" )
        return s.substr( 2 );
    return s;
}

export function inetNtoA( n: number ): string {
    const a = ( ( n >> 24 ) & 0xFF ) >>> 0;
    const b = ( ( n >> 16 ) & 0xFF ) >>> 0;
    const c = ( ( n >> 8 ) & 0xFF ) >>> 0;
    const d = ( n & 0xFF ) >>> 0;
    return ( a + "." + b + "." + c + "." + d );
}

export function ipFromHex( hex?: any ): string {
    return inetNtoA( parseInt( removeStarting0x( hex ), 16 ) );
}

export function cloneObjectByRootKeys( joIn?: any ): any {
    const joOut: any = { }; const arrKeys = Object.keys( joIn );
    for( let i = 0; i < arrKeys.length; ++i ) {
        const key = arrKeys[i];
        const value = joIn[key];
        joOut[key] = value;
    }
    return joOut;
}

// example: "1ether" -> "1000000000000000000"
// supported suffix aliases, lowercase
const gMapMoneyNameSuffixAliases: any = {
    ethe: "ether",
    ethr: "ether",
    eth: "ether",
    eter: "ether",
    ete: "ether",
    et: "ether",
    eh: "ether",
    er: "ether",
    finne: "finney",
    finn: "finney",
    fin: "finney",
    fn: "finney",
    fi: "finney",
    szab: "szabo",
    szb: "szabo",
    sza: "szabo",
    sz: "szabo",
    shanno: "shannon",
    shannn: "shannon",
    shann: "shannon",
    shan: "shannon",
    sha: "shannon",
    shn: "shannon",
    sh: "shannon",
    lovelac: "lovelace",
    lovela: "lovelace",
    lovel: "lovelace",
    love: "lovelace",
    lovl: "lovelace",
    lvl: "lovelace",
    lvla: "lovelace",
    lvlc: "lovelace",
    lvc: "lovelace",
    lv: "lovelace",
    lo: "lovelace",
    lc: "lovelace",
    ll: "lovelace",
    babbag: "babbage",
    babba: "babbage",
    babbg: "babbage",
    babb: "babbage",
    bab: "babbage",
    bag: "babbage",
    bbb: "babbage",
    bb: "babbage",
    bg: "babbage",
    ba: "babbage",
    be: "babbage",
    we: "wei",
    wi: "wei",

    // next are advanced kind of
    noether: "noether",
    noeth: "noether",
    kwei: "kwei",
    femtoether: "femtoether",
    femto: "femtoether",
    mwei: "mwei",
    picoether: "picoether",
    pico: "picoether",
    gwei: "gwei",
    nanoether: "nanoether",
    nano: "nanoether",
    microether: "microether",
    micro: "microether",
    milliether: "milliether",
    milli: "milliether",
    kether: "kether",
    mether: "mether",
    gether: "gether",
    tether: "tether"
};

export function parseMoneyUnitName( s: string ): string {
    s = s.trim().toLowerCase();
    if( s == "" )
        return "wei";
    if( s in gMapMoneyNameSuffixAliases ) {
        s = gMapMoneyNameSuffixAliases[s];
        return s;
    }
    return s;
}

function moneyUnitNameToEthersParseSpec( s: string ): string | number {
    switch ( s.toString().trim().toLowerCase() ) {
    case "shannon": return 9;
    case "lovelace": return 6;
    case "babbage": return 3;
    case "femtoether": return "ether";
    case "picoether": return "ether";
    case "nanoether": return "ether";
    case "microether": return "ether";
    case "milliether": return "ether";
    case "kether": return "ether";
    case "mether": return "ether";
    case "gether": return "ether";
    case "tether": return "ether";
    }
    return s;
}

function moneyUnitNameToPostDivider( s: string ): string | null {
    switch ( s.toString().trim().toLowerCase() ) {
    case "femtoether": return "1000000000000000";
    case "picoether": return "1000000000000";
    case "nanoether": return "1000000000";
    case "microether": return "1000000";
    case "milliether": return "1000";
    }
    return null;
}
function moneyUnitNameToPostMultiplier( s: string ): string | null {
    switch ( s.toString().trim().toLowerCase() ) {
    case "kether": return "1000";
    case "mether": return "1000000";
    case "gether": return "1000000000";
    case "tether": return "1000000000000";
    }
    return null;
}

export function parseMoneySpecToWei( s?: any, isThrowException?: boolean ): ethersMod.BigNumber {
    try {
        isThrowException = ( !!isThrowException );
        if( s == null || s == undefined ) {
            if( isThrowException )
                throw new Error( "no parse-able value provided" );
            return toBN( "0" );
        }
        s = s.toString().trim();
        let strNumber = "";
        while( s.length > 0 ) {
            const chr = s[0];
            if( /^\d+$/.test( chr ) || // is numeric
                chr == "."
            ) {
                strNumber += chr;
                s = s.substr( 1 ); // remove first character
                continue;
            }
            if( chr == " " || chr == "\t" || chr == "\r" || chr == "\n" )
                s = s.substr( 1 ); // remove first character
            s = s.trim().toLowerCase();
            break;
        }
        // here s is rest suffix string, number is number as string or empty string
        if( strNumber == "" )
            throw new Error( "no number or float value found" );
        s = parseMoneyUnitName( s );
        const ddr = moneyUnitNameToPostDivider( s );
        const mlr = moneyUnitNameToPostMultiplier( s );
        s = moneyUnitNameToEthersParseSpec( s );
        s = ethersMod.ethers.utils.parseUnits( strNumber, s );
        if( ddr != null )
            s = s.div( toBN( ddr ) );
        if( mlr != null )
            s = s.mul( toBN( mlr ) );
        s = s.toString();
        return toBN( s );
    } catch ( err: any ) {
        if( isThrowException ) {
            throw new Error( `Parse error in parseMoneySpecToWei( ${s} ), ` +
                `error is: ${err}` );
        }
    }
    return toBN( "0" );
}

export function computeChainIdFromSChainName( strName: string ): string {
    let h = ethersMod.ethers.utils.id( strName );
    h = removeStarting0x( h ).toLowerCase();
    while( h.length < 64 )
        h = "0" + h;
    h = h.substr( 0, 14 );
    return ensureStartsWith0x( h );
}

export function privateKeyToAccountAddress( keyPrivate: string ): string {
    return ethersMod.ethers.utils.computeAddress(
        ensureStartsWith0x( keyPrivate ) );
}

export function fnAddressImpl_( anyThis: any ): string {
    if( anyThis.address_ == undefined || anyThis.address_ == null || anyThis.address_ == "" ) {
        if( anyThis.privateKey )
            anyThis.address_ = privateKeyToAccountAddress( anyThis.privateKey ).toString();
    }
    return anyThis.address_;
}

export function getEthersProviderFromURL(
    strURL: URL | string ): ethersMod.ethers.providers.JsonRpcProvider {
    const url = new URL( strURL.toString() );
    let userName: string | null = null; let userPwd: string | null = null;
    if( url.username ) {
        userName = url.username;
        userPwd = url.password;
        url.username = "";
        url.password = "";
        strURL = url.href; // remove credentials
    }
    const joConnectionInfo: any = { // see https://docs.ethers.io/v5/api/utils/web/#ConnectionInfo
        url: strURL,
        allowInsecureAuthentication: true
    };
    if( userName ) {
        joConnectionInfo.user = userName;
        if( userPwd )
            joConnectionInfo.password = userPwd;
    }
    const ethersProvider: ethersMod.ethers.providers.JsonRpcProvider =
        new ethersMod.ethers.providers.JsonRpcProvider( joConnectionInfo );
    return ethersProvider;
}

export function ethersProviderToUrl(
    ethersProvider: ethersMod.ethers.providers.JsonRpcProvider | null
): string {
    let strURL: string | null = null;
    if( ethersProvider &&
        "connection" in ethersProvider && typeof ethersProvider.connection === "object" &&
        "url" in ethersProvider.connection && typeof ethersProvider.connection.url === "string"
    )
        strURL = ethersProvider.connection.url.toString();
    return strURL ?? "N/A-URL";
}

export function isHexPrefixed( s: any ): boolean {
    if( typeof s !== "string" ) {
        throw new Error(
            "Parameter value of owaspUtils.isHexPrefixed() must be type 'string' but it's " +
            `type ${typeof s}, while checking isHexPrefixed.` );
    }
    return ( s.slice( 0, 2 ) === "0x" );
}

export function stripHexPrefix( s: any ): string {
    if( typeof s !== "string" )
        return s;
    return isHexPrefixed( s ) ? s.slice( 2 ) : s;
}

export function toBNbasic( x?: any, optionalRadix?: number ): any {
    try {
        if( optionalRadix && typeof optionalRadix === "number" && optionalRadix == 16 )
            x = ensureStartsWith0x( x );
        const bn = ethersMod.ethers.BigNumber.from( x );
        return bn;
    } catch ( err: any ) {
        console.log( `CRITICAL ERROR: Failure in owaspUtils.toBNbasic( ${x} ): ${err}` );
        throw err;
    }
}

export function toBN( arg: any ): ethersMod.BigNumber {
    if( typeof arg === "string" || typeof arg === "number" ) {
        let multiplier = toBNbasic( 1 );
        const formattedString = String( arg ).toLowerCase().trim();
        const isHexPrefixed =
            formattedString.substr( 0, 2 ) === "0x" ||
            formattedString.substr( 0, 3 ) === "-0x";
        let stringArg = stripHexPrefix( formattedString );
        if( stringArg.substr( 0, 1 ) === "-" ) {
            stringArg = stripHexPrefix( stringArg.slice( 1 ) );
            multiplier = toBNbasic( -1, 10 );
        }
        stringArg = stringArg === "" ? "0" : stringArg;
        const isMatchN: boolean = !!stringArg.match( /^-?[0-9]+$/ );
        const isMatchX: boolean = !!stringArg.match( /^[0-9A-Fa-f]+$/ );
        const isMatchA: boolean = !!stringArg.match( /^[a-fA-F]+$/ );
        if( ( ( !isMatchN ) && isMatchX ) || isMatchA || ( isHexPrefixed && isMatchX ) )
            return toBNbasic( stringArg, 16 ).mul( multiplier );
        if( ( isMatchN || stringArg === "" ) && ( !isHexPrefixed ) )
            return toBNbasic( stringArg, 10 ).mul( multiplier );
    } else if( typeof arg === "object" && arg.toString && ( !arg.pop && !arg.push ) ) {
        if( arg.toString().match( /^-?[0-9]+$/ ) && ( arg.mul || arg.dividedToIntegerBy ) )
            return toBNbasic( arg.toString(), 10 );
    } else if( arg )
        return toBNbasic( arg ); // try to convert as is

    throw new Error(
        "Error in owaspUtils.toBN() while converting " +
        `number ${JSON.stringify( arg )}to BN.js instance, error: ` +
        "invalid number value. Value must be an integer, hex string, BN or BigNumber instance. " +
        "Note, decimals are not supported." );
}

export function isNumeric( s?: any ): boolean {
    return /^\d+$/.test( s );
}

export function toHexStringSafe( val?: any ): string {
    if( !val )
        return "0x0";
    if( "toHexString" in val && typeof val.toHexString === "function" )
        return val.toHexString();
    if( typeof val === "number" || typeof val === "bigint" )
        return ensureStartsWith0x( val.toString( 16 ) );
    if( "toString" in val && typeof val.toString === "function" )
        return val.toString();
    return val.toString();
}

export function setInterval2( fn: () => void, t: number, stepMilliSeconds?: number ): any {
    const iv: any = {
        real_iv: null,
        stepMilliSeconds: stepMilliSeconds ?? 1000,
        maxMilliSeconds: t,
        accumulatedMilliSeconds: 0
    };
    iv.real_iv = setInterval( () => {
        iv.accumulatedMilliSeconds += iv.stepMilliSeconds;
        if( iv.accumulatedMilliSeconds >= iv.maxMilliSeconds ) {
            iv.accumulatedMilliSeconds = 0;
            fn();
        }
    }, iv.stepMilliSeconds );
    return iv;
}

export function clearInterval2( iv: any ): void {
    if( !iv )
        return;
    if( !( "real_iv" in iv ) )
        return;
    if( !iv.real_iv )
        return;
    clearInterval( iv.real_iv );
    iv.real_iv = null;
}

export function escapeShell( cmd: string ): string {
    return "\"" + cmd.replace( /(["'$`\\])/g, "\\$1" ) + "\"";
}
