// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * SKALE IMA is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * @file log.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as cc from "./cc.mjs";
import * as fs from "fs";

let gArrStreams = [];

let gFlagLogWithTimeStamps = true;

let gIdentifierAllocatorCounter = 0;

const safeURL = cc.safeURL;
const replaceAll = cc.replaceAll;
const timestampHR = cc.timestampHR;
const capitalizeFirstLetter = cc.capitalizeFirstLetter;
const getDurationString = cc.getDurationString;

export { safeURL, replaceAll, timestampHR, capitalizeFirstLetter, getDurationString };

export function autoEnableColorizationFromCommandLineArgs() {
    return cc.autoEnableFromCommandLineArgs();
}
export function enableColorization( bIsEnable ) {
    cc.enable( !!bIsEnable );
}
export function isEnabledColorization() {
    return ( !! ( cc.isEnabled() ) );
}

export function getPrintTimestamps() {
    return gFlagLogWithTimeStamps;
}

export function setPrintTimestamps( b ) {
    gFlagLogWithTimeStamps = ( !!b );
}

export function n2s( n, sz ) {
    let s = "" + n;
    while( s.length < sz )
        s = "0" + s;
    return s;
}

export function generateTimestampString( ts, isColorized ) {
    isColorized =
        ( typeof isColorized == "undefined" )
            ? true : ( !!isColorized );
    ts = ( ts instanceof Date ) ? ts : new Date();
    const ccDate = function( x ) { return isColorized ? cc.date( x ) : x; };
    const ccTime = function( x ) { return isColorized ? cc.time( x ) : x; };
    const ccFractionPartOfTime = function( x ) { return isColorized ? cc.frac_time( x ) : x; };
    const ccBright = function( x ) { return isColorized ? cc.bright( x ) : x; };
    const s =
        "" + ccDate( n2s( ts.getUTCFullYear(), 4 ) ) +
        ccBright( "-" ) + ccDate( n2s( ts.getUTCMonth() + 1, 2 ) ) +
        ccBright( "-" ) + ccDate( n2s( ts.getUTCDate(), 2 ) ) +
        " " + ccTime( n2s( ts.getUTCHours(), 2 ) ) +
        ccBright( ":" ) + ccTime( n2s( ts.getUTCMinutes(), 2 ) ) +
        ccBright( ":" ) + ccTime( n2s( ts.getUTCSeconds(), 2 ) ) +
        ccBright( "." ) + ccFractionPartOfTime( n2s( ts.getUTCMilliseconds(), 3 ) )
        ;
    return s;
}

export function generateTimestampPrefix( ts, isColorized ) {
    return generateTimestampString( ts, isColorized ) + cc.bright( ":" ) + " ";
}

export function removeAllStreams() {
    let i = 0; let cnt = 0;
    try {
        cnt = gArrStreams.length;
        for( i = 0; i < cnt; ++i ) {
            try {
                const objEntry = gArrStreams[i];
                objEntry.objStream.close();
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
    gArrStreams = [];
}

export function getStreamWithFilePath( strFilePath ) {
    try {
        let i = 0; const cnt = gArrStreams.length;
        for( i = 0; i < cnt; ++i ) {
            try {
                const objEntry = gArrStreams[i];
                if( objEntry.strPath === strFilePath )
                    return objEntry;
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
    return null;
}

export function createStandardOutputStream() {
    try {
        const objEntry = {
            "id": gIdentifierAllocatorCounter ++,
            "strPath": "stdout",
            "nMaxSizeBeforeRotation": -1,
            "nMaxFilesCount": -1,
            "objStream": null,
            "haveOwnTimestamps": false,
            "isPausedTimeStamps": false,
            "strOwnIndent": "",
            "write": function() {
                let s = ( this.strOwnIndent ? this.strOwnIndent : "" ) +
                    ( ( this.haveOwnTimestamps && ( !this.isPausedTimeStamps ) )
                        ? generateTimestampPrefix( null, true ) : "" );
                s += fmtArgumentsArray( arguments );
                try {
                    if( this.objStream && s.length > 0 )
                        this.objStream.write( s );
                } catch ( err ) { }
            },
            "writeRaw": function() {
                const s = fmtArgumentsArray( arguments );
                try {
                    if( this.objStream && s.length > 0 )
                        this.objStream.write( s );
                } catch ( err ) { }
            },
            "close": function() { this.objStream = null; },
            "open": function() { try { this.objStream = process.stdout; } catch ( err ) { } },
            "size": function() { return 0; },
            "rotate": function( nBytesToWrite ) { },
            "toString": function() { return "" + strFilePath; },
            "exposeDetailsTo": function( otherStream, strTitle, isSuccess ) { },
            // high-level formatters
            "fatal": function() {
                if( verboseGet() >= verboseReversed().fatal )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...arguments ) );
            },
            "critical": function() {
                if( verboseGet() >= verboseReversed().critical ) {
                    this.write(
                        getLogLinePrefixCritical() + fmtCritical( ...arguments ) );
                }
            },
            "error": function() {
                if( verboseGet() >= verboseReversed().error )
                    this.write( getLogLinePrefixError() + fmtError( ...arguments ) );
            },
            "warning": function() {
                if( verboseGet() >= verboseReversed().warning )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...arguments ) );
            },
            "attention": function() {
                if( verboseGet() >= verboseReversed().attention ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...arguments ) );
                }
            },
            "information": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "info": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "notice": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...arguments ) );
            },
            "note": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNote() + fmtNote( ...arguments ) );
            },
            "debug": function() {
                if( verboseGet() >= verboseReversed().debug )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...arguments ) );
            },
            "trace": function() {
                if( verboseGet() >= verboseReversed().trace )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...arguments ) );
            },
            "success": function() {
                if( verboseGet() >= verboseReversed().information )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...arguments ) );
            }
        };
        objEntry.open();
        return objEntry;
    } catch ( err ) {
    }
    return null;
}

export function insertStandardOutputStream() {
    let objEntry = getStreamWithFilePath( "stdout" );
    if( objEntry !== null )
        return true;
    objEntry = createStandardOutputStream();
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function createMemoryOutputStream() {
    try {
        const objEntry = {
            "id": gIdentifierAllocatorCounter ++,
            "strPath": "memory",
            "nMaxSizeBeforeRotation": -1,
            "nMaxFilesCount": -1,
            "arrAccumulatedLogTextLines": [],
            "haveOwnTimestamps": true,
            "isPausedTimeStamps": false,
            "strOwnIndent": "    ",
            "isBeginningOfAccumulatedLog": function() {
                if( this.arrAccumulatedLogTextLines.length == 0 )
                    return true;
                return false;
            },
            "isLastLineEndsWithCarriageReturn": function() {
                if( this.arrAccumulatedLogTextLines.length == 0 )
                    return false;
                const s = this.arrAccumulatedLogTextLines[
                    this.arrAccumulatedLogTextLines.length - 1];
                if( ! s )
                    return false;
                if( s[s.length - 1] == "\n" )
                    return true;
                return false;
            },
            "write": function() {
                const s = fmtArgumentsArray( arguments );
                const arr = s.split( "\n" );
                for( let i = 0; i < arr.length; ++ i ) {
                    const strLine = arr[i];
                    let strHeader = "";
                    if( this.isLastLineEndsWithCarriageReturn() ||
                        this.isBeginningOfAccumulatedLog() ) {
                        strHeader = ( this.strOwnIndent ? this.strOwnIndent : "" );
                        if( this.haveOwnTimestamps && ( !this.isPausedTimeStamps ) )
                            strHeader += generateTimestampPrefix( null, true );
                    }
                    this.arrAccumulatedLogTextLines.push( strHeader + strLine + "\n" );
                }
            },
            "writeRaw": function() {
                const s = fmtArgumentsArray( arguments );
                const arr = s.split( "\n" );
                for( let i = 0; i < arr.length; ++ i ) {
                    const strLine = arr[i];
                    this.arrAccumulatedLogTextLines.push( strLine + "\n" );
                }
            },
            "clear": function() { this.arrAccumulatedLogTextLines = []; },
            "close": function() { this.clear(); },
            "open": function() { this.clear(); },
            "size": function() { return 0; },
            "rotate": function( nBytesToWrite ) { this.this.arrAccumulatedLogTextLines = []; },
            "toString": function() {
                let s = "";
                for( let i = 0; i < this.arrAccumulatedLogTextLines.length; ++ i )
                    s += this.arrAccumulatedLogTextLines[i];
                return s;
            },
            "exposeDetailsTo": function( otherStream, strTitle, isSuccess ) {
                if( ! ( this.arrAccumulatedLogTextLines &&
                    this.arrAccumulatedLogTextLines.length > 0 ) )
                    return;
                let werePausedTimeStamps = false;
                try {
                    werePausedTimeStamps = ( !!otherStream.isPausedTimeStamps );
                    otherStream.isPausedTimeStamps = true;
                } catch ( err ) {
                }
                try {
                    strTitle = strTitle
                        ? ( cc.bright( " (" ) + cc.attention( strTitle ) + cc.bright( ")" ) ) : "";
                    const strSuccessPrefix = isSuccess
                        ? cc.success( "SUCCESS" ) : cc.error( "ERROR" );
                    otherStream.write( "\n" );
                    otherStream.write( cc.bright( "--- --- --- --- --- GATHERED " ) +
                        strSuccessPrefix + cc.bright( " DETAILS FOR LATEST(" ) +
                        cc.sunny( strTitle ) + cc.bright( " action (" ) + cc.sunny( "BEGIN" ) +
                        cc.bright( ") --- --- ------ --- " ) );
                    otherStream.write( "\n" );
                    for( let i = 0; i < this.arrAccumulatedLogTextLines.length; ++ i ) {
                        try {
                            otherStream.writeRaw( this.arrAccumulatedLogTextLines[i] );
                        } catch ( err ) {
                        }
                    }
                    otherStream.write( cc.bright( "--- --- --- --- --- GATHERED " ) +
                        strSuccessPrefix + cc.bright( " DETAILS FOR LATEST(" ) +
                        cc.sunny( strTitle ) + cc.bright( " action (" ) + cc.sunny( "END" ) +
                        cc.bright( ") --- --- --- --- ---" ) );
                    otherStream.write( "\n" );
                } catch ( err ) {
                }
                try {
                    otherStream.isPausedTimeStamps = werePausedTimeStamps;
                } catch ( err ) {
                }
            },
            // high-level formatters
            "fatal": function() {
                if( verboseGet() >= verboseReversed().fatal )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...arguments ) );
            },
            "critical": function() {
                if( verboseGet() >= verboseReversed().critical )
                    this.write( getLogLinePrefixCritical() + fmtCritical( ...arguments ) );
            },
            "error": function() {
                if( verboseGet() >= verboseReversed().error )
                    this.write( getLogLinePrefixError() + fmtError( ...arguments ) );
            },
            "warning": function() {
                if( verboseGet() >= verboseReversed().warning )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...arguments ) );
            },
            "attention": function() {
                if( verboseGet() >= verboseReversed().attention ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...arguments ) );
                }
            },
            "information": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "info": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "notice": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...arguments ) );
            },
            "note": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNote() + fmtNote( ...arguments ) );
            },
            "debug": function() {
                if( verboseGet() >= verboseReversed().debug )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...arguments ) );
            },
            "trace": function() {
                if( verboseGet() >= verboseReversed().trace )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...arguments ) );
            },
            "success": function() {
                if( verboseGet() >= verboseReversed().information )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...arguments ) );
            }
        };
        objEntry.open();
        return objEntry;
    } catch ( err ) {
    }
    return null;
}

export function insertMemoryOutputStream() {
    let objEntry = getStreamWithFilePath( "memory" );
    if( objEntry !== null )
        return true;
    objEntry = createMemoryOutputStream();
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function createFileOutput( strFilePath, nMaxSizeBeforeRotation, nMaxFilesCount ) {
    try {
        const objEntry = {
            "id": gIdentifierAllocatorCounter ++,
            "strPath": "" + strFilePath,
            "nMaxSizeBeforeRotation": 0 + nMaxSizeBeforeRotation,
            "nMaxFilesCount": 0 + nMaxFilesCount,
            "objStream": null,
            "haveOwnTimestamps": false,
            "isPausedTimeStamps": false,
            "strOwnIndent": "",
            "write": function() {
                let s = ( this.strOwnIndent ? this.strOwnIndent : "" ) +
                    ( ( this.haveOwnTimestamps && ( !this.isPausedTimeStamps ) )
                        ? generateTimestampPrefix( null, true ) : "" );
                s += fmtArgumentsArray( arguments );
                try {
                    if( s.length > 0 ) {
                        this.rotate( s.length );
                        fs.appendFileSync( this.objStream, s, "utf8" );
                    }
                } catch ( err ) { }
            },
            "writeRaw": function() {
                const s = fmtArgumentsArray( arguments );
                try {
                    if( s.length > 0 ) {
                        this.rotate( s.length );
                        fs.appendFileSync( this.objStream, s, "utf8" );
                    }
                } catch ( err ) { }
            },
            "close": function() {
                if( !this.objStream )
                    return;
                fs.closeSync( this.objStream );
                this.objStream = null;
            },
            "open": function() {
                this.objStream =
                    fs.openSync( this.strPath, "a", fs.constants.O_NONBLOCK | fs.constants.O_WR );
            },
            "size": function() {
                try { return fs.lstatSync( this.strPath ).size; } catch ( err ) { return 0; }
            },
            "rotate": function( nBytesToWrite ) {
                try {
                    if( this.nMaxSizeBeforeRotation <= 0 || this.nMaxFilesCount <= 1 )
                        return;
                    this.close();
                    const nFileSize = this.size();
                    const nNextSize = nFileSize + nBytesToWrite;
                    if( nNextSize <= this.nMaxSizeBeforeRotation ) {
                        this.open();
                        return;
                    }
                    let i = 0; const cnt = 0 + this.nMaxFilesCount;
                    for( i = 0; i < cnt; ++i ) {
                        const j = this.nMaxFilesCount - i - 1;
                        const strPath = "" + this.strPath + ( ( j === 0 ) ? "" : ( "." + j ) );
                        if( j == ( cnt - 1 ) ) {
                            try { fs.unlinkSync( strPath ); } catch ( err ) { }
                            continue;
                        }
                        const strPathPrev = "" + this.strPath + "." + ( j + 1 );
                        try { fs.unlinkSync( strPathPrev ); } catch ( err ) { }
                        try { fs.renameSync( strPath, strPathPrev ); } catch ( err ) { }
                    }
                } catch ( err ) {
                }
                try {
                    this.open();
                } catch ( err ) {
                }
            },
            "toString": function() { return "" + strFilePath; },
            "exposeDetailsTo": function( otherStream, strTitle, isSuccess ) { },
            // high-level formatters
            "fatal": function() {
                if( verboseGet() >= verboseReversed().fatal )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...arguments ) );
            },
            "critical": function() {
                if( verboseGet() >= verboseReversed().critical ) {
                    this.write(
                        getLogLinePrefixCritical() + fmtCritical( ...arguments ) );
                }
            },
            "error": function() {
                if( verboseGet() >= verboseReversed().error )
                    this.write( getLogLinePrefixError() + fmtError( ...arguments ) );
            },
            "warning": function() {
                if( verboseGet() >= verboseReversed().warning )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...arguments ) );
            },
            "attention": function() {
                if( verboseGet() >= verboseReversed().attention ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...arguments ) );
                }
            },
            "information": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "info": function() {
                if( verboseGet() >= verboseReversed().information ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...arguments ) );
                }
            },
            "notice": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...arguments ) );
            },
            "note": function() {
                if( verboseGet() >= verboseReversed().notice )
                    this.write( getLogLinePrefixNote() + fmtNote( ...arguments ) );
            },
            "debug": function() {
                if( verboseGet() >= verboseReversed().debug )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...arguments ) );
            },
            "trace": function() {
                if( verboseGet() >= verboseReversed().trace )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...arguments ) );
            },
            "success": function() {
                if( verboseGet() >= verboseReversed().information )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...arguments ) );
            }
        };
        objEntry.open();
        return objEntry;
    } catch ( err ) {
        console.log(
            "CRITICAL ERROR: Failed to open file system log stream for " + strFilePath +
            ", error is " + JSON.stringify( err )
        );
    }
    return null;
}
export function insertFileOutput( strFilePath, nMaxSizeBeforeRotation, nMaxFilesCount ) {
    let objEntry = getStreamWithFilePath( "" + strFilePath );
    if( objEntry !== null )
        return true;
    objEntry = createFileOutput( strFilePath, nMaxSizeBeforeRotation, nMaxFilesCount );
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function extractErrorMessage( jo, strDefaultErrorText ) {
    strDefaultErrorText = strDefaultErrorText || "unknown error or error without a description";
    try {
        const isError = function( err ) {
            return err && err.stack && err.message;
        };
        if( ! isError( jo ) ) {
            if( "error" in jo ) {
                jo = jo.error;
                if( typeof jo == "string" )
                    return jo;
                if( typeof jo != "object" )
                    return strDefaultErrorText + "(" + jo.toString() + ")";
            }
            if( typeof jo == "string" && jo )
                return strDefaultErrorText + "(" + jo.toString() + ")";
            return strDefaultErrorText;
        }
        if( typeof jo.message == "string" && jo.message.length > 0 )
            return jo.message; // + jo.stack;
        strDefaultErrorText += "(" + jo.toString() + ")"; // + jo.stack;
    } catch ( err ) {
    }
    return strDefaultErrorText;
}

function tryToSplitFormatString( strFormat, cntArgsMax ) {
    if( !( strFormat && typeof strFormat == "string" ) )
        return null;
    const arrParts = [];
    let s = strFormat, cntFoundArgs = 0;
    for( ; true; ) {
        if( cntFoundArgs >= cntArgsMax )
            break; // nothing to do split for
        const nStart = s.indexOf( "{" );
        if( nStart < 0 )
            break;
        const nEnd = s.indexOf( "}", nStart + 1 );
        if( nEnd < 0 )
            break;
        const strPart = s.substring( 0, nStart );
        const strArgDesc = s.substring( nStart + 1, nEnd ).trim().toLowerCase();
        s = s.substring( nEnd + 1 );
        if( strPart.length > 0 )
            arrParts.push( { "type": "text", "text": strPart } );
        arrParts.push( { "type": "arg", "text": strArgDesc } );
        ++ cntFoundArgs;
        if( s.length == 0 )
            break;
    }
    if( cntFoundArgs == 0 )
        return null;
    if( s.length > 0 )
        arrParts.push( { "type": "text", "text": s } );
    return arrParts;
}

export function fmtArgumentsArray( arrArgs, fnFormatter ) {
    fnFormatter = fnFormatter || function( arg ) { return arg; };
    const arrParts = ( arrArgs && arrArgs.length > 0 )
        ? tryToSplitFormatString( arrArgs[0], arrArgs.length - 1 ) : null;
    let s = "", isValueMode = false;
    const fnDefaultOneArgumentFormatter = function( arg, fnCustomFormatter ) {
        if( ! fnCustomFormatter )
            fnCustomFormatter = fnFormatter;
        const t = typeof arg;
        if( t == "string" ) {
            if( arg.length > 0 ) {
                if( arg == " " || arg == "\n" ) {
                    // skip
                } else if( ! cc.isStringAlreadyColorized( arg ) )
                    return fnCustomFormatter( arg );
            }
        } else
            return cc.logArgToString( arg );
        return arg;
    };
    const fnFormatOneArgument = function( arg, fmt ) {
        if( ! arg )
            return arg;
        if( arg == " " || arg == "\n" )
            return arg;
        if( ! isValueMode )
            return fnDefaultOneArgumentFormatter( arg, null );
        if( fmt && typeof "fmt" == "string" ) {
            if( fmt == "raw" )
                return arg;
            if( fmt == "p" )
                return fnDefaultOneArgumentFormatter( arg, null );
            if( fmt == "url" )
                return u( arg );
            if( fmt == "yn" )
                return yn( arg );
            if( fmt == "oo" )
                return onOff( arg );
            if( fmt == "stack" )
                return stack( arg );
            if( fmt == "em" )
                return em( arg );
            if( fmt == "err" )
                return em( extractErrorMessage( arg ) );
            if( fmt == "bright" )
                return fnDefaultOneArgumentFormatter( arg, cc.bright );
            if( fmt == "sunny" )
                return fnDefaultOneArgumentFormatter( arg, cc.sunny );
            if( fmt == "rainbow" )
                return fnDefaultOneArgumentFormatter( arg, cc.rainbow );
        }
        return v( arg );
    };
    try {
        let idxArgNextPrinted = 0;
        if( arrParts && arrParts.length > 0 ) {
            idxArgNextPrinted = 1;
            for( let i = 0; i < arrParts.length; ++i ) {
                const joPart = arrParts[i];
                if( joPart.type == "arg" ) {
                    isValueMode = true;
                    if( idxArgNextPrinted < arrArgs.length )
                        s += fnFormatOneArgument( arrArgs[idxArgNextPrinted], joPart.text );
                    ++ idxArgNextPrinted;
                    continue;
                }
                // assume joPart.type == "text" always here, at this point
                if( ! cc.isStringAlreadyColorized( joPart.text ) )
                    s += fnFormatter( joPart.text );
                else
                    s += joPart.text;
            }
        }
        for( let i = idxArgNextPrinted; i < arrArgs.length; ++i ) {
            try {
                // if( i > 0 && s.length > 0 )
                //    s += " ";
                s += fnFormatOneArgument( arrArgs[i], null );
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
    return s;
}

export function outputStringToAllStreams( s ) {
    try {
        if( s.length <= 0 )
            return;
        for( let i = 0; i < gArrStreams.length; ++i ) {
            try {
                const objEntry = gArrStreams[i];
                if( objEntry && "write" in objEntry && typeof objEntry.write == "function" )
                    objEntry.write( s );
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
}

export function write() {
    let s = getPrintTimestamps() ? generateTimestampPrefix( null, true ) : "";
    s += fmtArgumentsArray( arguments );
    outputStringToAllStreams( s );
}
export function writeRaw() {
    const s = fmtArgumentsArray( arguments );
    outputStringToAllStreams( s );
}

export function getLogLinePrefixFatal() {
    return cc.fatal( "FATAL ERROR:" ) + " ";
}
export function getLogLinePrefixCritical() {
    return cc.fatal( "CRITICAL ERROR:" ) + " ";
}
export function getLogLinePrefixError() {
    return cc.fatal( "ERROR:" ) + " ";
}
export function getLogLinePrefixWarning() {
    return cc.error( "WARNING:" ) + " ";
}
export function getLogLinePrefixAttention() {
    return "";
}
export function getLogLinePrefixInformation() {
    return "";
}
export function getLogLinePrefixNotice() {
    return "";
}
export function getLogLinePrefixNote() {
    return "";
}
export function getLogLinePrefixDebug() {
    return "";
}
export function getLogLinePrefixTrace() {
    return "";
}
export function getLogLinePrefixSuccess() {
    return "";
}

// high-level format to returned string
export function fmtFatal() {
    return fmtArgumentsArray( arguments, cc.error );
}
export function fmtCritical() {
    return fmtArgumentsArray( arguments, cc.error );
}
export function fmtError() {
    return fmtArgumentsArray( arguments, cc.error );
}
export function fmtWarning() {
    return fmtArgumentsArray( arguments, cc.warning );
}
export function fmtAttention() {
    return fmtArgumentsArray( arguments, cc.attention );
}
export function fmtInformation() {
    return fmtArgumentsArray( arguments, cc.info );
}
export function fmtInfo() {
    return fmtArgumentsArray( arguments, cc.info );
}
export function fmtNotice() {
    return fmtArgumentsArray( arguments, cc.notice );
}
export function fmtNote() {
    return fmtArgumentsArray( arguments, cc.note );
}
export function fmtDebug() {
    return fmtArgumentsArray( arguments, cc.debug );
}
export function fmtTrace() {
    return fmtArgumentsArray( arguments, cc.trace );
}
export function fmtSuccess() {
    return fmtArgumentsArray( arguments, cc.success );
}

// high-level formatted output
export function fatal() {
    if( verboseGet() >= verboseReversed().fatal )
        write( getLogLinePrefixFatal() + fmtFatal( ...arguments ) + "\n" );
}
export function critical() {
    if( verboseGet() >= verboseReversed().critical )
        write( getLogLinePrefixCritical() + fmtCritical( ...arguments ) + "\n" );
}
export function error() {
    if( verboseGet() >= verboseReversed().error )
        write( getLogLinePrefixError() + fmtError( ...arguments ) + "\n" );
}
export function warning() {
    if( verboseGet() >= verboseReversed().warning )
        write( getLogLinePrefixWarning() + fmtWarning( ...arguments ) + "\n" );
}
export function attention() {
    if( verboseGet() >= verboseReversed().attention )
        write( getLogLinePrefixAttention() + fmtAttention( ...arguments ) + "\n" );
}
export function information() {
    if( verboseGet() >= verboseReversed().information )
        write( getLogLinePrefixInformation() + fmtInformation( ...arguments ) + "\n" );
}
export function info() {
    if( verboseGet() >= verboseReversed().information )
        write( getLogLinePrefixInformation() + fmtInformation( ...arguments ) + "\n" );
}
export function notice() {
    if( verboseGet() >= verboseReversed().notice )
        write( getLogLinePrefixNotice() + fmtNotice( ...arguments ) + "\n" );
}
export function note() {
    if( verboseGet() >= verboseReversed().notice )
        write( getLogLinePrefixNote() + fmtNote( ...arguments ) + "\n" );
}
export function debug() {
    if( verboseGet() >= verboseReversed().debug )
        write( getLogLinePrefixDebug() + fmtDebug( ...arguments ) + "\n" );
}
export function trace() {
    if( verboseGet() >= verboseReversed().trace )
        write( getLogLinePrefixTrace() + fmtTrace( ...arguments ) + "\n" );
}
export function success() {
    if( verboseGet() >= verboseReversed().information )
        write( getLogLinePrefixSuccess() + fmtSuccess( ...arguments ) + "\n" );
}

export function removeAll() {
    removeAllStreams();
}

export function addStdout() {
    return insertStandardOutputStream();
}

export function addMemory() {
    return insertMemoryOutputStream();
}

export function createMemoryStream() {
    return createMemoryOutputStream();
}

export function add( strFilePath, nMaxSizeBeforeRotation, nMaxFilesCount ) {
    return insertFileOutput(
        strFilePath,
        ( nMaxSizeBeforeRotation <= 0 ) ? -1 : nMaxSizeBeforeRotation,
        ( nMaxFilesCount <= 1 ) ? -1 : nMaxFilesCount
    );
}

export function close() {
    // for compatibility with created streams
}

export function exposeDetailsTo() {
    // for compatibility with created streams
}

export function toString() {
    // for compatibility with created streams
    return "";
}

const gMapVerbose = {
    0: "silent",
    1: "fatal",
    2: "critical",
    3: "error",
    4: "warning",
    5: "attention",
    6: "information",
    7: "notice",
    8: "debug",
    9: "trace"
};
function computeVerboseAlias() {
    const m = {};
    for( const key in gMapVerbose ) {
        if( !gMapVerbose.hasOwnProperty( key ) )
            continue; // skip loop if the property is from prototype
        const name = gMapVerbose[key];
        m[name] = parseInt( key );
    }
    m.empty = 0 + parseInt( m.silent ); // alias
    m.none = 0 + parseInt( m.silent ); // alias
    m.stop = 0 + parseInt( m.fatal ); // alias
    m.bad = 0 + parseInt( m.critical ); // alias
    m.err = 0 + parseInt( m.error ); // alias
    m.warn = 0 + parseInt( m.warning ); // alias
    m.attn = 0 + parseInt( m.attention ); // alias
    m.info = 0 + parseInt( m.information ); // alias
    m.note = 0 + parseInt( m.notice ); // alias
    m.dbg = 0 + parseInt( m.debug ); // alias
    m.crazy = 0 + parseInt( m.trace ); // alias
    m.detailed = 0 + parseInt( m.trace ); // alias
    return m;
}
let gMapReversedVerbose = null;

export function verbose() { return gMapVerbose; }
export function verboseReversed() {
    if( ! gMapReversedVerbose )
        gMapReversedVerbose = computeVerboseAlias();
    return gMapReversedVerbose;
}
export function verboseLevelAsTextForLog( vl ) {
    if( typeof vl == "undefined" )
        vl = verboseGet();
    if( vl in gMapVerbose ) {
        const tl = gMapVerbose[vl];
        return tl;
    }
    return "unknown(" + JSON.stringify( y ) + ")";
}

let gFlagIsExposeDetails = false;
let gVerboseLevel = 0 + verboseReversed().information;

export function exposeDetailsGet() {
    return ( !!gFlagIsExposeDetails );
}
export function exposeDetailsSet( isExpose ) {
    gFlagIsExposeDetails = ( !!isExpose );
}

export function verboseGet() {
    return 0 + gVerboseLevel;
}
export function verboseSet( vl ) {
    gVerboseLevel = parseInt( vl );
}

export function verboseParse( s ) {
    let n = 5;
    try {
        const isNumbersOnly = /^\d+$/.test( s );
        if( isNumbersOnly )
            n = cc.toInteger( s );
        else {
            const ch0 = s[0].toLowerCase();
            for( const key in gMapVerbose ) {
                if( !gMapVerbose.hasOwnProperty( key ) )
                    continue; // skip loop if the property is from prototype
                const name = gMapVerbose[key];
                const ch1 = name[0].toLowerCase();
                if( ch0 == ch1 ) {
                    n = key;
                    return n;
                }
            }
        }
    } catch ( err ) { }
    return n;
}

export function verboseList() {
    for( const key in gMapVerbose ) {
        if( !gMapVerbose.hasOwnProperty( key ) )
            continue; // skip loop if the property is from prototype
        const name = gMapVerbose[key];
        console.log( "    " + cc.j( key ) + cc.sunny( "=" ) + cc.bright( name ) );
    }
}

export function u( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.u( x );
}

export function v( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.j( x );
}

export function em( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.warning( x );
}

export function stack( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.stack( x );
}

export function onOff( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.onOff( x );
}

export function yn( x ) {
    return cc.isStringAlreadyColorized( x ) ? x : cc.yn( x );
}

export function posNeg( condition, strPositive, strNegative ) {
    return condition
        ? ( cc.isStringAlreadyColorized( strPositive ) ? strPositive : cc.success( strPositive ) )
        : ( cc.isStringAlreadyColorized( strNegative ) ? strNegative : cc.error( strNegative ) );
}
