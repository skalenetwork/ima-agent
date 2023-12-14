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
 * @file cc.ts
 * @copyright SKALE Labs 2019-Present
 */

let gFlagIsEnabled: boolean = false;

export function autoEnableFromCommandLineArgs(): void {
    const b: boolean =
        ( process.argv.includes( "--colors" ) || process.argv.includes( "-colors" ) )
            ? true : false;
    enable( b );
}

export function enable( b?: boolean ): void {
    gFlagIsEnabled = !!b;
}

export function isStringAlreadyColorized( s?: any ): boolean {
    if( s && typeof s == "string" && s.length > 0 && s[0] == "\x1b" )
        return true;
    return false;
}

export function isEnabled(): boolean {
    return !!gFlagIsEnabled;
}

export function replaceAll( str: string, find: string, replace: string ): string {
    return str.replace( new RegExp( find, "g" ), replace );
}

export function validateRadix( value?: any, radix?: any ) {
    value = "" + ( value ? value.toString() : "10" );
    value = value.trim();
    radix = ( radix == null || radix == undefined )
        ? ( ( value.length > 2 && value[0] == "0" && ( value[1] == "x" || value[1] == "X" ) )
            ? 16 : 10 )
        : parseInt( radix, 10 );
    return radix;
}

export function validateInteger( value?: any, radix?: any ): boolean {
    try {
        value = "" + value;
        value = value.trim();
        if( value.length < 1 )
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

export function toInteger( value?: any, radix?: any ): number {
    try {
        radix = validateRadix( value, radix );
        if( !validateInteger( value, radix ) )
            return NaN;
        return parseInt( value, radix );
    } catch ( err ) {
    }
    return 0;
}

export function validateFloat( value?: any ): boolean {
    try {
        const f = parseFloat( value );
        if( isNaN( f ) )
            return false;
        return true;
    } catch ( err ) {
    }
    return false;
}

function toFloat( value?: any ): number {
    try {
        const f = parseFloat( value );
        return f;
    } catch ( err ) {
    }
    return 0.0;
}

export function toBoolean( value?: any ): boolean {
    let b = false;
    try {
        if( typeof value === "boolean" )
            return value;
        if( typeof value === "string" ) {
            const ch = value[0].toLowerCase();
            if( ch == "y" || ch == "t" )
                b = true;
            else if( /^-?\d+$/.test( value ) ) // check string is integer
                b = !!parseInt( value, 10 );
            else if( /^-?\d+(?:[.,]\d*?)?$/.test( value ) ) // check string is float
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

export function yn( flag?: any ): string {
    if( !gFlagIsEnabled )
        return flag ? "true" : "false";
    return toBoolean( flag ) ? yes( "yes" ) : no( "no" );
}

export function tf( flag?: any ): string {
    if( !gFlagIsEnabled )
        return flag ? "true" : "false";
    return toBoolean( flag ) ? yes( "true" ) : no( "false" );
}

export function onOff( flag?: any ): string {
    if( !gFlagIsEnabled )
        return flag ? "true" : "false";
    return toBoolean( flag ) ? yes( "on" ) : no( "off" );
}
const gMapColorDefinitions: any = {
    reset: "\x1b[0m",
    enlight: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    fgBlack: "\x1b[30m",
    fgRed: "\x1b[31m",
    fgGreen: "\x1b[32m",
    fgYellow: "\x1b[33m",
    fgBlue: "\x1b[34m",
    fgMagenta: "\x1b[35m",
    fgCyan: "\x1b[36m",
    fgWhite: "\x1b[37m",
    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bBgWhite: "\x1b[47m"
};

const gArrRainbowParts: any[] = [
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgRed,
    gMapColorDefinitions.fgRed,
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgYellow,
    gMapColorDefinitions.fgYellow,
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgGreen,
    gMapColorDefinitions.fgGreen,
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgCyan,
    gMapColorDefinitions.fgCyan,
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgBlue,
    gMapColorDefinitions.fgBlue,
    gMapColorDefinitions.enlight + gMapColorDefinitions.fgMagenta,
    gMapColorDefinitions.fgMagenta
];

export function rainbowPart( s: string, i: number ) {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    const j = i % gArrRainbowParts.length;
    return gArrRainbowParts[j] + s + gMapColorDefinitions.reset;
}

export function rainbow( s?: any ): string {
    if( ( !gFlagIsEnabled ) || ( !s ) || ( typeof s != "string" ) || s.length == 0 )
        return s ? s.toString() : JSON.stringify( s );
    let res = "";
    const cnt = s.length;
    for( let i = 0; i < cnt; ++ i )
        res = res + rainbowPart( s[i], i );
    return res;
}

export function isInt2( n?: any ): boolean {
    const intRegex = /^-?\d+$/;
    if( !intRegex.test( n ) )
        return false;

    const intVal = parseInt( n, 10 );
    return parseFloat( n ) == intVal && !isNaN( intVal );
}

export function isFloat2( n?: any ): boolean {
    const val = parseFloat( n );
    return !isNaN( val );
}

function urlObjColorized( objURL?: any ): string {
    let strURL = "";
    if( !objURL )
        return strURL;
    if( objURL.protocol && objURL.protocol !== null && objURL.protocol !== undefined )
        strURL += "" + yellow( objURL.protocol ) + normal( "//" );
    if( objURL.username && objURL.username !== null && objURL.username !== undefined ) {
        strURL += "" + magenta( objURL.username );
        if( objURL.password && objURL.password !== null && objURL.password !== undefined )
            strURL += normal( ":" ) + yellow( objURL.password );
        strURL += normal( "@" );
    }
    if( objURL.hostname )
        strURL += "" + magenta( logArgToStringAsIpv4( objURL.hostname ) );
    if( objURL.port && objURL.port !== null && objURL.port !== undefined )
        strURL += normal( ":" ) + logArgToString( objURL.port );
    if( objURL.pathname && objURL.pathname !== null &&
        objURL.pathname !== undefined && objURL.pathname !== "/" )
        strURL += "" + yellow( replaceAll( objURL.pathname, "/", normal( "/" ) ) );
    if( objURL.search && objURL.search !== null && objURL.search !== undefined )
        strURL += "" + magenta( objURL.search );
    return strURL;
}

export function urlStrColorized( s?: any ): string {
    const objURL = safeURL( s );
    if( !objURL )
        return "";
    return urlObjColorized( objURL );
}

export function urlColorized( x?: any ): string {
    if( typeof x === "string" || x instanceof String )
        return urlStrColorized( x );
    return urlObjColorized( x );
}

export function u( x?: any ): string {
    return urlColorized( x );
}

export function safeURL( arg?: any ): URL | null {
    try {
        const sc = arg[0];
        if( sc == "\"" || sc == "'" ) {
            const cnt = arg.length;
            if( arg[cnt - 1] == sc ) {
                const ss = arg.substring( 1, cnt - 1 );
                const objURL = safeURL( ss );
                if( objURL != null && objURL != undefined ) {
                    const anyURL: any = objURL;
                    anyURL.strStrippedStringComma = sc;
                }

                return objURL;
            }
            return null;
        }
        const objURL = new URL( arg );
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

export function toIpv4Arr( s: string ): any[] | null {
    // eslint-disable-next-line max-len
    if( /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test( s ) ) {
        const arr = s.split( "." );
        if( ( !arr ) || arr.length !== 4 )
            return null;

        return arr;
    }
    return null;
}

export function logArgToStringAsIpv4( arg?: any ): string {
    const arr = toIpv4Arr( arg );
    if( !arr )
        return arg.toString();
    let s = "";
    for( let i = 0; i < 4; ++i ) {
        if( i > 0 )
            s += normal( "." );

        s += logArgToString( arr[i] );
    }
    return s;
}

export function logArgToString( ...args: any[] ): string {
    let i;
    const cnt = arguments.length;
    let s = "";
    for( i = 0; i < cnt; ++i ) {
        const arg = arguments[i];
        if( arg === undefined ) {
            s += "" + undefval( arg );
            continue
        }
        if( arg === null ) {
            s += "" + nullval( arg );
            continue
        }
        if( isNaN( arg ) ) {
            s += "" + nanval( arg );
            continue
        }
        if( typeof arg === "boolean" ) {
            s += "" + tf( arg );
            continue
        }
        if( typeof arg === "object" && typeof arg.valueOf() === "boolean" )
            s += "" + tf( arg.valueOf() );

        if( typeof arg === "number" || typeof arg === "bigint" ) {
            s += "" + number( arg );
            continue
        }
        if( typeof arg === "object" &&
            ( typeof arg.valueOf() === "number" || typeof arg.valueOf() === "bigint" ) ) {
            s += "" + number( arg.valueOf() );
            continue
        }
        if( typeof arg === "string" || arg instanceof String ) {
            const objURL = safeURL( arg );
            if( objURL != null && objURL != undefined ) {
                let strURL = "";
                const anyURL: any = objURL;
                if( anyURL.strStrippedStringComma )
                    strURL += normal( anyURL.strStrippedStringComma );

                if( objURL.protocol )
                    strURL += "" + yellow( objURL.protocol ) + normal( "//" );

                if( objURL.username ) {
                    strURL += "" + magenta( objURL.username );
                    if( objURL.password )
                        strURL += normal( ":" ) + yellow( objURL.password );

                    strURL += normal( "@" );
                }
                if( objURL.hostname )
                    strURL += "" + magenta( logArgToStringAsIpv4( objURL.hostname ) );

                if( objURL.port )
                    strURL += normal( ":" ) + logArgToString( objURL.port );

                if( objURL.pathname )
                    strURL += "" + yellow( replaceAll( objURL.pathname, "/", normal( "/" ) ) );

                if( objURL.search )
                    strURL += "" + magenta( objURL.search );

                if( anyURL.strStrippedStringComma )
                    strURL += normal( anyURL.strStrippedStringComma );

                s += strURL;
                continue
            }
            if( ( arg.length > 1 && arg[0] == "-" && arg[1] != "-" ) ||
                ( arg.length > 2 && arg[0] == "-" && arg[1] == "-" && arg[2] != "-" )
            ) {
                s += "" + cla( arg );
                continue
            }
            if( arg.length > 0 && ( arg[0] == "\"" || arg[0] == "'" ) ) {
                s += "" + strval( arg );
                continue
            }
            if( isFloat2( arg ) ) {
                s += "" + real( arg );
                continue
            }
            if( isInt2( arg ) ) {
                s += "" + number( arg );
                continue
            }
        }
        if( Array.isArray( arg ) || typeof arg === "object" ) {
            s += jsonColorizer.prettyPrintConsole( arg );
            continue
        }
        s += "" + kk( arg );
    }
    return s;
}

export const getCircularReplacerForJsonStringify = (): any => {
    const seen = new WeakSet();
    return ( key: any, value: any ): any => {
        if( typeof value === "object" && value !== null ) {
            if( seen.has( value ) )
                return;
            seen.add( value );
        }
        return value;
    }
}

export const jsonColorizer: any = { // see http://jsfiddle.net/unLSJ/
    cntCensoredMax: 30000, // zero to disable censoring
    censor: ( censor: any ): any => {
        let i = 0;
        return ( key: any, value: any ) => {
            if( i !== 0 && typeof ( censor ) === "object" &&
                typeof ( value ) === "object" && censor == value
            )
                return "[Circular]";

            if( i >= jsonColorizer.cntCensoredMax )
                return "[Unknown]";

            ++i // so we know we aren't using the original object anymore
            return value;
        }
    },
    replacerHTML: ( match?: any, pIndent?: any, pKey?: any, pVal?: any, pEnd?: any ): any => {
        const key = "<span class=json-key>";
        const val = "<span class=json-value>";
        const str = "<span class=json-string>";
        let r = pIndent || "";
        if( pKey )
            r = r + key + pKey.replace( /[": ]/g, "" ) + "</span>: ";

        if( pVal )
            r = r + ( pVal[0] == "\"" ? str : val ) + pVal + "</span>";

        return r + ( pEnd || "" );
    },
    prettyPrintHTML: ( obj?: any ) => {
        const jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
        const s =
            JSON.stringify(
                obj, ( jsonColorizer.cntCensoredMax > 0 )
                    ? jsonColorizer.censor( obj ) : null, 4
            )
                .replace( /&/g, "&amp;" ).replace( /\\"/g, "&quot;" )
                .replace( /</g, "&lt;" ).replace( />/g, "&gt;" )
                .replace( jsonLine, jsonColorizer.replacerHTML );
        return s;
    },
    replacerConsole: ( match?: any, pIndent?: any, pKey?: any, pVal?: any, pEnd?: any ): any => {
        let r = pIndent || "";
        if( pKey )
            r = r + logArgToString( pKey.replace( /[": ]/g, "" ) ) + ": ";

        if( pVal )
            r = r + logArgToString( pVal );

        return r + ( pEnd || "" );
    },
    prettyPrintConsole: ( obj?: any ): any => {
        if( !gFlagIsEnabled ) {
            if( obj === null )
                return "null";
            if( obj === undefined )
                return "undefined";
            try {
                const s = JSON.stringify( obj );
                return s;
            } catch ( err ) { }
            try {
                const s = JSON.stringify( obj, getCircularReplacerForJsonStringify() );
                return s;
            } catch ( err ) { }
            try {
                const s = obj.toString();
                return s;
            } catch ( err ) { }
            return obj;
        }
        const cntSpaces: number = 4;
        const jsonLine = /^( *)("[\w]+": )?("[^"]*"|[\w.+-]*)?([,[{])?$/mg;
        try {
            const tmp: string = JSON.stringify(
                obj,
                ( jsonColorizer.cntCensoredMax > 0 ) ? jsonColorizer.censor( obj ) : null,
                cntSpaces
            );
            const s = tmp ? tmp.replace( jsonLine, jsonColorizer.replacerConsole ) : ( "" + tmp );
            return s;
        } catch ( err ) { }
        obj = JSON.parse( JSON.stringify( obj, getCircularReplacerForJsonStringify() ) );
        const tmp = JSON.stringify(
            obj,
            ( jsonColorizer.cntCensoredMax > 0 ) ? jsonColorizer.censor( obj ) : null,
            cntSpaces
        );
        const s = tmp ? tmp.replace( jsonLine, jsonColorizer.replacerConsole ) : ( "" + tmp );
        return s;
    }
};

// see:
// http://jsfiddle.net/KJQ9K/554
// https://qastack.ru/programming/4810841/pretty-print-json-using-javascript
export function syntaxHighlightJSON( jo?: any, strKeyNamePrefix?: string ): string {
    strKeyNamePrefix = strKeyNamePrefix || "";
    jo = jo.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" );
    return jo.replace(
    // eslint-disable-next-line max-len
        /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
        function( match: any ) {
            if( ! gFlagIsEnabled )
                return match;
            let cls = "number";
            if( /^"/.test( match ) ) {
                if( /:$/.test( match ) )
                    cls = "key";
                else
                    cls = "string";
            } else if( /true|false/.test( match ) )
                cls = "boolean";
            else if( /null/.test( match ) )
                cls = "null";
            else if( /NaN/.test( match ) )
                cls = "nan";
            else if( /undefined/.test( match ) )
                cls = "undefined";
            else if( ( typeof match === "string" || match instanceof String ) &&
                match.length >= 2 &&
                ( ( match[0] == "\"" && match[match.length - 1] == "\"" ) ||
                ( match[0] == "'" && match[match.length - 1] == "'" ) )
            )
                cls = "string";
            switch ( cls ) {
            case "key":
                return "" +
                    strKeyNamePrefix + logArgToString( match.replace( /[": ]/g, "" ) ) + ": ";
            case "boolean":
                return tf( match );
            case "null":
                return "" + nullval( match );
            case "undefined":
                return "" + undefval( match );
            case "nan":
                return "" + nanval( match );
            case "string":
                return "" + strval( match );
            case "number":
                return "" + number( match );
            }
            return logArgToString( match );
        } );
}

export function safeStringifyJSON( jo?: any, n?: number ): string | undefined {
    try {
        const s = "" + JSON.stringify( jo, getCircularReplacerForJsonStringify(), n );
        return s;
    } catch ( err ) {
    }
    return undefined;
}

export function jn( x?: any ): string {
    return "" + jsonColorizer.prettyPrintConsole( x );
}

export function j1( x?: any, n?: number, strKeyNamePrefix?: string ): string {
    let isDefaultKeyNamePrefix = false;
    if( typeof strKeyNamePrefix !== "string" ) {
        strKeyNamePrefix = " ";
        isDefaultKeyNamePrefix = true;
    }
    let s = safeStringifyJSON( x, n );
    if( ! gFlagIsEnabled )
        return s || "";
    s = "" + syntaxHighlightJSON( s, strKeyNamePrefix );
    if( isDefaultKeyNamePrefix && s.length > 9 && s[0] == " " )
        s = s.substring( 1, s.length );
    return s;
}

export function j( x?: any ): string {
    return j1( x ); // jn
}

const reset = gMapColorDefinitions.reset;
const enlight = gMapColorDefinitions.enlight;
const dim = gMapColorDefinitions.dim;
const underscore = gMapColorDefinitions.underscore;
const blink = gMapColorDefinitions.blink;
const reverse = gMapColorDefinitions.reverse;
const hidden = gMapColorDefinitions.hidden;
const fgBlack = gMapColorDefinitions.fgBlack;
const fgRed = gMapColorDefinitions.fgRed;
const fgGreen = gMapColorDefinitions.fgGreen;
const fgYellow = gMapColorDefinitions.fgYellow;
const fgBlue = gMapColorDefinitions.fgBlue;
const fgMagenta = gMapColorDefinitions.fgMagenta;
const fgCyan = gMapColorDefinitions.fgCyan;
const fgWhite = gMapColorDefinitions.fgWhite;
const bgBlack = gMapColorDefinitions.bgBlack;
const bgRed = gMapColorDefinitions.bgRed;
const bgGreen = gMapColorDefinitions.bgGreen;
const bgYellow = gMapColorDefinitions.bgYellow;
const bgBlue = gMapColorDefinitions.bgBlue;
const bgMagenta = gMapColorDefinitions.bgMagenta;
const bgCyan = gMapColorDefinitions.bgCyan;
const bBgWhite = gMapColorDefinitions.bBgWhite;
export {
    reset,
    enlight,
    dim,
    underscore,
    blink,
    reverse,
    hidden,
    fgBlack,
    fgRed,
    fgGreen,
    fgYellow,
    fgBlue,
    fgMagenta,
    fgCyan,
    fgWhite,
    bgBlack,
    bgRed,
    bgGreen,
    bgYellow,
    bgBlue,
    bgMagenta,
    bgCyan,
    bBgWhite
};

export function normal( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgWhite + s + reset;
}

export function trace( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgWhite + s + reset;
}

export function debug( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgWhite + s + reset;
}
export function debugDark( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgBlack + enlight + s + reset;
}

export function note( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgBlue + s + reset;
}

export function notice( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + s + reset;
}

export function info( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgBlue + enlight + s + reset;
}

export function warning( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + s + reset;
}

export function warn( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + s + reset;
}

export function error( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgRed + s + reset;
}

export function fatal( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + bgRed + fgYellow + enlight + s + reset;
}

export function success( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function attention( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgCyan + s + reset;
}

export function bright( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgWhite + enlight + s + reset;
}

export function sunny( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + enlight + s + reset;
}

export function rx( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + s + reset;
}

export function rxa( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + enlight + s + reset;
}

export function tx( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + s + reset;
}

export function txa( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function date( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + s + reset;
}

export function time( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + enlight + s + reset;
}

export function fracTime( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + s + reset;
}

export function yes( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function no( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgRed + s + reset;
}

export function number( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgBlue + enlight + s + reset;
}

export function real( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + s + reset;
}

export function undefval( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function nullval( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function nanval( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgGreen + enlight + s + reset;
}

export function yellow( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + s + reset;
}

export function magenta( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgMagenta + s + reset;
}

export function cla( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgBlue + dim + s + reset;
}

export function kk( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + enlight + s + reset;
}

export function strval( s?: any ): string {
    if( !gFlagIsEnabled )
        return s ? s.toString() : JSON.stringify( s );
    return "" + fgYellow + s + reset;
}

export function n2s( n: any, sz: number ) {
    let s = "" + n;
    while( s.length < sz )
        s = "0" + s;
    return s;
}

export function timestampHR(): number {
    const d = new Date();
    const ts = Math.floor( ( d ).getTime() );
    return ts;
}

export function timestampUnix(): number {
    const d = new Date();
    const ts = Math.floor( ( d ).getTime() / 1000 );
    return ts;
}

function trimLeftUnneededTimestampZeros( s?: any ): string {
    while( s.length >= 2 ) {
        if( s[0] == "0" && s[1] >= "0" && s[1] <= "9" )
            s = s.substring( 1 );
        else
            break;
    }
    return s;
}

export function getDurationString( tsFrom: number, tsTo: number ): string {
    let s = "";
    let n = tsTo - tsFrom;

    const ms = n % 1000;
    n = Math.floor( n / 1000 );
    s += "." + n2s( ms, 3 );
    if( n == 0 )
        return "0" + s;

    const secs = n % 60;
    n = Math.floor( n / 60 );
    s = "" + n2s( secs, 2 ) + s;
    if( n == 0 )
        return trimLeftUnneededTimestampZeros( s );
    s = ":" + s;

    const mins = n % 60;
    n = Math.floor( n / 60 );
    s = "" + n2s( mins, 2 ) + s;
    if( n == 0 )
        return trimLeftUnneededTimestampZeros( s );
    s = ":" + s;

    const hours = n % 24;
    n = Math.floor( n / 24 );
    s = "" + n2s( hours, 2 ) + s;
    if( n == 0 )
        return trimLeftUnneededTimestampZeros( s );

    return "" + n + " " + ( ( n > 1 ) ? "days" : "day" ) + "," + s;
}

export function capitalizeFirstLetter( s?: any ): string {
    if( ! s )
        return JSON.stringify( s );
    let s2 = s.toString();
    if( ! s2 )
        return s.toString();
    s2 = s2.charAt( 0 ).toUpperCase() + s2.slice( 1 );
    return s2;
}

function errFnDottedName( s?: any ): string {
    const arr = s.split( "." );
    const cnt = arr.length;
    let i, s2 = "";
    for( i = 0; i < cnt; ++ i ) {
        if( i > 0 )
            s2 += bright( "." );
        s2 += sunny( arr[i] );
    }
    return s2;
}

function errFnName( s?: any ): string {
    if( s.indexOf( "async " ) == 0 )
        return bright( "async" ) + " " + errFnDottedName( s.substring( 6 ) );
    return errFnDottedName( s );
}

function errLocLn( s: string, isWithBraces?: boolean ): string {
    let s2 = "";
    s = s.replace( "file://", "" );
    s = s.replace( "node:", "" );
    if( isWithBraces )
        s2 += " " + debug( "(" );
    const arrCodePoint = s.split( ":" );
    if( arrCodePoint.length > 0 ) {
        s2 += trace( arrCodePoint[0] );
        for( let j = 1; j < arrCodePoint.length; ++j ) {
            s2 += debug( ":" );
            if( j == 1 )
                s2 += info( arrCodePoint[j] );
            else
                s2 += attention( arrCodePoint[j] );
        }
    } else
        s2 += trace( s );
    if( isWithBraces )
        s2 += debug( ")" );
    return s2;
}

export function stack( err?: any ): string {
    if( ! err )
        return "";
    if( err && "stack" in err ) {
        const st = err.stack
        if( st && typeof st == "string" )
            err = st;
    }
    try {
        const arr = ( typeof err == "string" ) ? err.split( "\n" ) : err;
        const cnt = arr.length;
        let i;
        for( i = 0; i < cnt; ++ i ) {
            let s = arr[i].replace( /\s+/g, " " ).trim();
            if( s.indexOf( "at " ) == 0 ) {
                // stack entry
                s = s.substring( 3 );
                let s2 = "    " + debug( "-->" ) + " ";
                const n = s.indexOf( " (" );
                if( n > 0 ) {
                    s2 += errFnName( s.substring( 0, n ) );
                    s = s.substring( n + 2 );
                    if( s[s.length - 1] == ")" )
                        s = s.substring( 0, s.length - 1 );
                    s2 += errLocLn( s, true );
                } else
                    s2 += errLocLn( s, false );
                s = s2;
            } else {
                // probably error description line
                const n = s.indexOf( ":" );
                if( n >= 0 ) {
                    s = error(
                        s.substring( 0, n ) ) + normal( ":" ) + warning( s.substring( n + 1 ) );
                } else
                    s = error( s );
            }
            arr[i] = s;
        }
        return arr.join( "\n" );
    } catch ( errCaught ) {
        return err.toString();
    }
}
