// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE COOL SOCKET
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
 * @file socketUtils.mjs
 * @copyright SKALE Labs 2019-Present
 */

import { settings } from "./socketSettings";

export const UUIDv4 = function() : string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace( /[xy]/g, function( c ) {
        const r = Math.random() * 16 | 0, v = c == "x" ? r : ( r & 0x3 | 0x8 );
        return v.toString( 16 );
    } );
};

export const getRandomInt = function( nMax: number ): number {
    return Math.floor( Math.random() * Math.floor( nMax ) );
};

export const randomFixedInteger = function( length: number ): number {
    return Math.floor(
        Math.pow( 10, length - 1 ) +
        Math.random() * ( Math.pow( 10, length ) - Math.pow( 10, length - 1 ) - 1 ) );
};

export const randomStringABC = function( length: number, arrCharacters: string ) : string {
    if( length <= 0 || arrCharacters.length == 0 )
        return "";
    let s = "";
    for( let i = 0; i < length; ++i )
        s += arrCharacters.charAt( Math.floor( Math.random() * arrCharacters.length ) );
    return s;
};

export const randomString = function(
    length: number,
    isABC?: boolean, isDigits?: boolean, isSpecChr?: boolean, isPunctuation?: boolean
): string { // by default only isABC=true
    if( length <= 0 )
        return "";
    isABC = ( isABC == null || isABC == undefined )
        ? true : ( !!isABC );
    isDigits = ( isDigits == null || isDigits == undefined )
        ? false : ( !!isDigits );
    isSpecChr = ( isSpecChr == null || isSpecChr == undefined )
        ? false : ( !!isSpecChr );
    isPunctuation = ( isPunctuation == null || isPunctuation == undefined )
        ? false : ( !!isPunctuation );
    let arrCharacters = "";
    if( isABC )
        arrCharacters += "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    if( isDigits )
        arrCharacters += "0123456789";
    if( isSpecChr )
        arrCharacters += "(){}[]~!?@#$%^&*_+-='\"/\\";
    if( isPunctuation )
        arrCharacters += ",.:;";
    if( arrCharacters.length == 0 )
        return "";
    return randomStringABC( length, arrCharacters );
};

export const randomHexString = function( length: number ) : string {
    // length in characters, not bytes, each byte is 2 characters
    const arrCharacters = "0123456789abcdef";
    return randomStringABC( length, arrCharacters );
};

export const replaceAll = function( str: string, find: string, replace: string ) : string {
    return str.replace( new RegExp( find, "g" ), replace );
};

export const simpleEscapeString = function( s?: any ) : string {
    if( s == null || s == undefined || typeof s != "string" )
        return s;
    s = replaceAll( s, "&", "&amp;" );
    s = replaceAll( s, "<", "&lt;" );
    s = replaceAll( s, ">", "&gt;" );
    s = replaceAll( s, " ", "&nbsp;" );
    return s;
};

export const abstractUniqueID = function() : string {
    const id = replaceAll( UUIDv4(), "-", "" ).toLowerCase();
    return id;
};

export const isEven = function( n: number ) : boolean {
    return n % 2 == 0;
};
export const isOdd = function( n: number ) : boolean {
    return Math.abs( n % 2 ) == 1;
};

const gCountOfCallIdDigits: number = 10;
export const randomCallID = function() : string {
    const id = randomHexString( gCountOfCallIdDigits );
    return id;
};

const gCountOfDirectPipeIdDigits : number = 10;
export const randomDirectPipeID = function() : string {
    const id = randomHexString( gCountOfDirectPipeIdDigits );
    return id;
};

export const prepareAnswerJSON = function( joMessage: any ) : any {
    const joAnswer = {
        "id": "" +
            ( ( joMessage != null &&
                joMessage != undefined &&
                typeof joMessage.id == "string" )
                ? joMessage.id : randomCallID() ),
        "method": "" +
            ( ( joMessage != null &&
                joMessage != undefined &&
                typeof joMessage.method == "string" )
                ? joMessage.method : "" ),
        "error": null
    };
    return joAnswer;
};

export const makeValidSignalingServerURL = function( strSignalingServerURL?: string ) : string {
    const proto = settings.net.secure ? "wss" : "ws";
    return "" +
        ( ( strSignalingServerURL != null &&
            strSignalingServerURL != undefined &&
            typeof strSignalingServerURL == "string" &&
            strSignalingServerURL.length > 0 )
            ? "" + strSignalingServerURL
            : "" + proto + "://" + settings.net.hostname + ":" + settings.net.ports.signaling
        );
};

export const zeroPaddingLeft = function( val: any, cntCharsNeeded: number ) : string {
    if( val == null || val == undefined )
        return val;
    let s = "" + val;
    while( s.length < cntCharsNeeded )
        s = "0" + s;
    return s;
};
export const zeroPaddingRight = function( val: any, cntCharsNeeded: number ) : string {
    if( val == null || val == undefined )
        return val;
    let s = "" + val;
    while( s.length < cntCharsNeeded )
        s = s + "0";
    return s;
};

export const parseDateTime = function( ts?: any ) : Date|null {
    if( ts === null || ts === undefined )
        return ts;
    if( typeof ts != "string" )
        return null;
    // example:
    //  0----|----1----|----2----|----
    //  012345678901234567890123456789
    // "2020/03/19-19:42:55.663"
    const year = parseInt( ts.substring( 0, 4 ), 10 );
    const month = parseInt( ts.substring( 5, 7 ), 10 ) + 1;
    const day = parseInt( ts.substring( 8, 10 ), 10 );
    const hour = parseInt( ts.substring( 11, 13 ), 10 );
    const minute = parseInt( ts.substring( 14, 16 ), 10 );
    const second = parseInt( ts.substring( 17, 19 ), 10 );
    let millisecond: any = ts.substring( 20 );
    if( millisecond.length > 3 )
        millisecond = millisecond.substring( 0, 3 );
    else {
        while( millisecond.length < 3 )
            millisecond = "0" + millisecond;
    }
    millisecond = parseInt( millisecond, 10 );
    const u = Date.UTC( year, month, day, hour, minute, second, millisecond );
    const d = new Date( u );
    d.setMilliseconds( millisecond );
    return d;
};
export const formatDateTime = function(
    dt: any,
    isDate?: boolean, isTime?: boolean, isMilliseconds?: boolean,
    sepDate?: string, sepTime?: string, sepBetween?: string, sepMilliseconds?: string
) : string {
    if( dt === null )
        return "null-date-time";
    if( dt === undefined )
        return "undefined-date-time";
    if( ! ( dt instanceof Date ) )
        return "not-a-date-time";
    isDate = ( isDate == null || isDate == undefined ) ? true : ( !!isDate );
    isTime = ( isTime == null || isTime == undefined ) ? true : ( !!isTime );
    if( ( !isDate ) && ( !isTime ) )
        return "";
    let s = "";
    if( isDate ) {
        sepDate = ( sepDate == null || sepDate == undefined || ( typeof sepDate != "string" ) )
            ? "/" : sepDate;
        const strDate = "" +
            zeroPaddingLeft( dt.getFullYear(), 4 ) +
            sepDate +
            zeroPaddingLeft( dt.getMonth() + 1, 2 ) +
            sepDate +
            zeroPaddingLeft( dt.getDate(), 2 );
        s += strDate;
    }
    if( isTime ) {
        sepTime = ( sepTime == null || sepTime == undefined || ( typeof sepTime != "string" ) )
            ? ":" : sepTime;
        if( isDate ) {
            sepBetween =
                ( sepBetween == null ||
                    sepBetween == undefined ||
                    ( typeof sepBetween != "string" ) )
                    ? "-" : sepBetween;
            s += sepBetween;
        }
        let strTime = "" +
            zeroPaddingLeft( dt.getHours(), 2 ) +
            sepDate +
            zeroPaddingLeft( dt.getMinutes(), 2 ) +
            sepDate +
            zeroPaddingLeft( dt.getSeconds(), 2 );
        isMilliseconds = ( isMilliseconds == null || isMilliseconds == undefined )
            ? true : ( !!isMilliseconds );
        if( isMilliseconds ) {
            sepMilliseconds =
                ( sepMilliseconds == null ||
                    sepMilliseconds == undefined ||
                    ( typeof sepMilliseconds != "string" ) )
                    ? "." : sepMilliseconds;
            strTime += sepMilliseconds + zeroPaddingRight( dt.getMilliseconds(), 3 );
        }
        s += strTime;
    }
    return s;
};
