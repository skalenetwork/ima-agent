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
 * @file log.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as cc from "./cc.js";
import * as fs from "fs";

export { cc };

export declare type TLogArgument = cc.TColorableArgument;
export declare type TFnFormatter = cc.TFnColorizer;

export type TMapVerbose = Record<number, string>;
export type TMapVerboseReverse = Record<string, number>;

export type TFunctionWrite = ( ...args: TLogArgument[] ) => void;
export type TFunctionClose = () => void;
export type TFunctionOpen = () => void;
export type TFunctionSize = () => number;
export type TFunctionRotate = ( nBytesToWrite: number ) => void;
export type TFunctionToString = () => string;
export type TFunctionExposeDetailsTo =
    ( otherStream: TLogger, strTitle: string, isSuccess: boolean ) => void;

export interface TLoggerBase {
    write: TFunctionWrite
    writeRaw: TFunctionWrite
    close: TFunctionClose
    toString: TFunctionToString
    exposeDetailsTo: TFunctionExposeDetailsTo
    // high-level formatters
    fatal: TFunctionWrite
    critical: TFunctionWrite
    error: TFunctionWrite
    warning: TFunctionWrite
    attention: TFunctionWrite
    information: TFunctionWrite
    info: TFunctionWrite
    notice: TFunctionWrite
    note: TFunctionWrite
    debug: TFunctionWrite
    trace: TFunctionWrite
    success: TFunctionWrite
}

export interface TLogger extends TLoggerBase {
    id: number
    strPath: string
    nMaxSizeBeforeRotation: number
    nMaxFilesCount: number
    objStream: any | null
    haveOwnTimestamps: boolean
    isPausedTimeStamps: boolean
    strOwnIndent: string
    open: TFunctionOpen
    size: TFunctionSize
    rotate: TFunctionRotate
}

export type TFunctionIsBeginningOfAccumulatedLog = () => boolean;
export type TFunctionIsLastLineEndsWithCarriageReturn = () => boolean;
export type TFunctionClear = () => void;

export interface TLoggerMemory extends TLogger {
    arrAccumulatedLogTextLines: string[]
    isBeginningOfAccumulatedLog: TFunctionIsBeginningOfAccumulatedLog
    isLastLineEndsWithCarriageReturn: TFunctionIsLastLineEndsWithCarriageReturn
    clear: TFunctionClear
};

let gArrStreams: TLogger[] = [];

let gFlagLogWithTimeStamps: boolean = true;

let gIdentifierAllocatorCounter = 1;

const safeURL = cc.safeURL;
const replaceAll = cc.replaceAll;
const timestampHR = cc.timestampHR;
const capitalizeFirstLetter = cc.capitalizeFirstLetter;
const getDurationString = cc.getDurationString;

export { safeURL, replaceAll, timestampHR, capitalizeFirstLetter, getDurationString };

export function autoEnableColorizationFromCommandLineArgs(): void {
    cc.autoEnableFromCommandLineArgs();
}
export function enableColorization( bIsEnable?: boolean ): void {
    cc.enable( !!bIsEnable );
}
export function isEnabledColorization(): boolean {
    return !!cc.isEnabled();
}

export function getPrintTimestamps(): boolean {
    return gFlagLogWithTimeStamps;
}

export function setPrintTimestamps( b?: boolean ): void {
    gFlagLogWithTimeStamps = !!b;
}

export function n2s( n: TLogArgument, sz: number ): string {
    let s: string = n ? n.toString() : "";
    while( s.length < sz )
        s = "0" + s;
    return s;
}

export function generateTimestampString( ts?: TLogArgument, isColorized?: boolean ): string {
    isColorized =
        ( typeof isColorized === "undefined" )
            ? true
            : !!isColorized;
    if( isColorized )
        isColorized = cc.isEnabled();
    ts = ( ts instanceof Date ) ? ts : new Date();
    const ccDate = function( x?: TLogArgument ): string { return isColorized ? cc.date( x ) : x; };
    const ccTime = function( x?: TLogArgument ): string { return isColorized ? cc.time( x ) : x; };
    const ccFractionPartOfTime =
        function( x?: TLogArgument ): string { return isColorized ? cc.fracTime( x ) : x; };
    const ccBright = function( x?: TLogArgument ): string {
        return isColorized ? cc.bright( x ) : x;
    };
    const s =
        ccDate( n2s( ts.getUTCFullYear(), 4 ) ) +
        ccBright( "-" ) + ccDate( n2s( ts.getUTCMonth() + 1, 2 ) ) +
        ccBright( "-" ) + ccDate( n2s( ts.getUTCDate(), 2 ) ) +
        " " + ccTime( n2s( ts.getUTCHours(), 2 ) ) +
        ccBright( ":" ) + ccTime( n2s( ts.getUTCMinutes(), 2 ) ) +
        ccBright( ":" ) + ccTime( n2s( ts.getUTCSeconds(), 2 ) ) +
        ccBright( "." ) + ccFractionPartOfTime( n2s( ts.getUTCMilliseconds(), 3 ) );
    return s;
}

export function generateTimestampPrefix( ts?: TLogArgument, isColorized?: boolean ): string {
    return generateTimestampString( ts, isColorized ) + cc.bright( ":" ) + " ";
}

export function removeAllStreams(): void {
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

export function getStreamWithFilePath( strFilePath: string ): TLogger | null {
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

let gStreamGlobal: TLogger | null;

export function globalStream(): TLogger {
    if( !gStreamGlobal ) {
        gStreamGlobal = {
            id: 0,
            strPath: "global",
            nMaxSizeBeforeRotation: -1,
            nMaxFilesCount: -1,
            objStream: null,
            haveOwnTimestamps: false,
            isPausedTimeStamps: false,
            strOwnIndent: "",
            write,
            writeRaw,
            close: function(): void { },
            open: function(): void { },
            size: function(): number { return 0; },
            rotate: function( nBytesToWrite: number ) { },
            toString: function(): string { return ""; },
            exposeDetailsTo,
            // high-level formatters
            fatal,
            critical,
            error,
            warning,
            attention,
            information,
            info,
            notice,
            note,
            debug,
            trace,
            success
        };
    }
    return gStreamGlobal;
};

export function createStandardOutputStream(): TLogger | null {
    try {
        const objEntry: TLogger = {
            id: gIdentifierAllocatorCounter++,
            strPath: "stdout",
            nMaxSizeBeforeRotation: -1,
            nMaxFilesCount: -1,
            objStream: null,
            haveOwnTimestamps: false,
            isPausedTimeStamps: false,
            strOwnIndent: "",
            write: function( ...args: TLogArgument[] ): void {
                let s = ( this.strOwnIndent ? this.strOwnIndent : "" ) +
                    ( ( this.haveOwnTimestamps && !this.isPausedTimeStamps )
                        ? generateTimestampPrefix( null, true )
                        : "" );
                s += fmtArgumentsArray( args );
                try {
                    if( this.objStream && s.length > 0 )
                        this.objStream.write( s );
                } catch ( err ) { }
            },
            writeRaw: function( ...args: TLogArgument[] ): void {
                const s = fmtArgumentsArray( args );
                try {
                    if( this.objStream && s.length > 0 )
                        this.objStream.write( s );
                } catch ( err ) { }
            },
            close: function(): void { this.objStream = null; },
            open: function(): void { try { this.objStream = process.stdout; } catch ( err ) { } },
            size: function(): number { return 0; },
            rotate: function( nBytesToWrite: number ) { },
            toString: function(): string { return this.strPath.toString(); },
            exposeDetailsTo:
                function( otherStream: TLogger, strTitle: string, isSuccess: boolean ): void { },
            // high-level formatters
            fatal: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "fatal" ) )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...args ) );
            },
            critical: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "critical" ) ) {
                    this.write(
                        getLogLinePrefixCritical() + fmtCritical( ...args ) );
                }
            },
            error: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "error" ) )
                    this.write( getLogLinePrefixError() + fmtError( ...args ) );
            },
            warning: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "warning" ) )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...args ) );
            },
            attention: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "attention" ) ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...args ) );
                }
            },
            information: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            info: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            notice: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...args ) );
            },
            note: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNote() + fmtNote( ...args ) );
            },
            debug: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "debug" ) )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...args ) );
            },
            trace: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "trace" ) )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...args ) );
            },
            success: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...args ) );
            }
        };
        objEntry.open();
        return objEntry;
    } catch ( err ) {
    }
    return null;
}

export function insertStandardOutputStream(): boolean {
    let objEntry = getStreamWithFilePath( "stdout" );
    if( objEntry !== null )
        return true;
    objEntry = createStandardOutputStream();
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function createMemoryOutputStream(): TLogger {
    try {
        const objEntry: TLoggerMemory = {
            id: gIdentifierAllocatorCounter++,
            strPath: "memory",
            nMaxSizeBeforeRotation: -1,
            nMaxFilesCount: -1,
            objStream: null,
            arrAccumulatedLogTextLines: [],
            haveOwnTimestamps: true,
            isPausedTimeStamps: false,
            strOwnIndent: "    ",
            isBeginningOfAccumulatedLog: function(): boolean {
                if( this.arrAccumulatedLogTextLines.length == 0 )
                    return true;
                return false;
            },
            isLastLineEndsWithCarriageReturn: function(): boolean {
                if( this.arrAccumulatedLogTextLines.length == 0 )
                    return false;
                const s = this.arrAccumulatedLogTextLines[
                    this.arrAccumulatedLogTextLines.length - 1];
                if( !s )
                    return false;
                if( s[s.length - 1] == "\n" )
                    return true;
                return false;
            },
            write: function( ...args: TLogArgument[] ): void {
                const s = fmtArgumentsArray( args );
                const arr = s.split( "\n" );
                for( let i = 0; i < arr.length; ++i ) {
                    const strLine = arr[i];
                    let strHeader = "";
                    if( this.isLastLineEndsWithCarriageReturn() ||
                        this.isBeginningOfAccumulatedLog() ) {
                        strHeader = ( this.strOwnIndent ? this.strOwnIndent : "" );
                        if( this.haveOwnTimestamps && !this.isPausedTimeStamps )
                            strHeader += generateTimestampPrefix( null, true );
                    }
                    this.arrAccumulatedLogTextLines.push( strHeader + strLine + "\n" );
                }
            },
            writeRaw: function( ...args: TLogArgument[] ): void {
                const s = fmtArgumentsArray( args );
                const arr = s.split( "\n" );
                for( let i = 0; i < arr.length; ++i ) {
                    const strLine = arr[i];
                    this.arrAccumulatedLogTextLines.push( strLine + "\n" );
                }
            },
            clear: function(): void { this.arrAccumulatedLogTextLines = []; },
            close: function(): void { this.clear(); },
            open: function(): void { this.clear(); },
            size: function(): number { return 0; },
            rotate:
            function( nBytesToWrite: number ) { this.arrAccumulatedLogTextLines = []; },
            toString: function(): string {
                let s = "";
                for( let i = 0; i < this.arrAccumulatedLogTextLines.length; ++i )
                    s += this.arrAccumulatedLogTextLines[i];
                return s;
            },
            exposeDetailsTo:
            function( otherStream: TLogger, strTitle: string, isSuccess: boolean ): void {
                if( !( this.arrAccumulatedLogTextLines &&
                    this.arrAccumulatedLogTextLines.length > 0 ) )
                    return;
                let werePausedTimeStamps = false;
                try {
                    werePausedTimeStamps = !!otherStream.isPausedTimeStamps;
                    otherStream.isPausedTimeStamps = true;
                } catch ( err ) {
                }
                try {
                    strTitle = strTitle
                        ? ( cc.bright( " (" ) + cc.attention( strTitle ) + cc.bright( ")" ) )
                        : "";
                    const strSuccessPrefix = isSuccess
                        ? cc.success( "SUCCESS" )
                        : cc.error( "ERROR" );
                    otherStream.write( "\n" );
                    otherStream.write( cc.bright( "--- --- --- --- --- GATHERED " ) +
                        strSuccessPrefix + cc.bright( " DETAILS FOR LATEST(" ) +
                        cc.sunny( strTitle ) + cc.bright( " action (" ) + cc.sunny( "BEGIN" ) +
                        cc.bright( ") --- --- ------ --- " ) );
                    otherStream.write( "\n" );
                    for( let i = 0; i < this.arrAccumulatedLogTextLines.length; ++i ) {
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
            fatal: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "fatal" ) )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...args ) );
            },
            critical: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "critical" ) )
                    this.write( getLogLinePrefixCritical() + fmtCritical( ...args ) );
            },
            error: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "error" ) )
                    this.write( getLogLinePrefixError() + fmtError( ...args ) );
            },
            warning: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "warning" ) )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...args ) );
            },
            attention: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "attention" ) ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...args ) );
                }
            },
            information: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            info: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            notice: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...args ) );
            },
            note: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNote() + fmtNote( ...args ) );
            },
            debug: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "debug" ) )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...args ) );
            },
            trace: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "trace" ) )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...args ) );
            },
            success: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...args ) );
            }
        };
        objEntry.open();
        return objEntry;
    } catch ( err ) {
    }
    return globalStream();
}

export function insertMemoryOutputStream(): boolean {
    let objEntry = getStreamWithFilePath( "memory" );
    if( objEntry !== null )
        return true;
    objEntry = createMemoryOutputStream();
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function createFileOutput(
    strFilePath: string, nMaxSizeBeforeRotation?: number, nMaxFilesCount?: number
): TLogger | null {
    try {
        const objEntry: TLogger = {
            id: gIdentifierAllocatorCounter++,
            strPath: strFilePath.toString(),
            nMaxSizeBeforeRotation: cc.toInteger( nMaxSizeBeforeRotation ?? 0 ),
            nMaxFilesCount: cc.toInteger( nMaxFilesCount ?? 0 ),
            objStream: null,
            haveOwnTimestamps: false,
            isPausedTimeStamps: false,
            strOwnIndent: "",
            write: function( ...args: TLogArgument[] ): void {
                let s = ( this.strOwnIndent ? this.strOwnIndent : "" ) +
                    ( ( this.haveOwnTimestamps && !this.isPausedTimeStamps )
                        ? generateTimestampPrefix( null, true )
                        : "" );
                s += fmtArgumentsArray( args );
                try {
                    if( s.length > 0 ) {
                        this.rotate( s.length );
                        fs.appendFileSync( this.objStream, s, "utf8" );
                    }
                } catch ( err ) { }
            },
            writeRaw: function( ...args: TLogArgument[] ): void {
                const s = fmtArgumentsArray( args );
                try {
                    if( s.length > 0 ) {
                        this.rotate( s.length );
                        fs.appendFileSync( this.objStream, s, "utf8" );
                    }
                } catch ( err ) { }
            },
            close: function(): void {
                if( !this.objStream )
                    return;
                fs.closeSync( this.objStream );
                this.objStream = null;
            },
            open: function(): void {
                this.objStream =
                    fs.openSync( this.strPath, "a", fs.constants.O_NONBLOCK | fs.constants.O_RDWR );
            },
            size: function(): number {
                try { return fs.lstatSync( this.strPath ).size; } catch ( err ) { return 0; }
            },
            rotate: function( nBytesToWrite: number ) {
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
                    let i = 0; const cnt = cc.toInteger( this.nMaxFilesCount );
                    for( i = 0; i < cnt; ++i ) {
                        const j = this.nMaxFilesCount - i - 1;
                        const strPath =
                            this.strPath.toString() + ( ( j === 0 ) ? "" : ( "." + j ) );
                        if( j == ( cnt - 1 ) ) {
                            try { fs.unlinkSync( strPath ); } catch ( err ) { }
                            continue;
                        }
                        const strPathPrev =
                            this.strPath.toString() + "." + ( j + 1 );
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
            toString: function(): string { return strFilePath.toString(); },
            exposeDetailsTo:
                function( otherStream: TLogger, strTitle: string, isSuccess: boolean ): void { },
            // high-level formatters
            fatal: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "fatal" ) )
                    this.write( getLogLinePrefixFatal() + fmtFatal( ...args ) );
            },
            critical: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "critical" ) ) {
                    this.write(
                        getLogLinePrefixCritical() + fmtCritical( ...args ) );
                }
            },
            error: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "error" ) )
                    this.write( getLogLinePrefixError() + fmtError( ...args ) );
            },
            warning: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "warning" ) )
                    this.write( getLogLinePrefixWarning() + fmtWarning( ...args ) );
            },
            attention: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "attention" ) ) {
                    this.write(
                        getLogLinePrefixAttention() + fmtAttention( ...args ) );
                }
            },
            information: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            info: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) ) {
                    this.write(
                        getLogLinePrefixInformation() + fmtInformation( ...args ) );
                }
            },
            notice: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNotice() + fmtNotice( ...args ) );
            },
            note: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "notice" ) )
                    this.write( getLogLinePrefixNote() + fmtNote( ...args ) );
            },
            debug: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "debug" ) )
                    this.write( getLogLinePrefixDebug() + fmtDebug( ...args ) );
            },
            trace: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "trace" ) )
                    this.write( getLogLinePrefixTrace() + fmtTrace( ...args ) );
            },
            success: function( ...args: TLogArgument[] ): void {
                if( verboseGet() >= verboseName2Number( "information" ) )
                    this.write( getLogLinePrefixSuccess() + fmtSuccess( ...args ) );
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
export function insertFileOutput(
    strFilePath: string, nMaxSizeBeforeRotation?: number, nMaxFilesCount?: number ): boolean {
    let objEntry = getStreamWithFilePath( strFilePath.toString() );
    if( objEntry !== null )
        return true;
    objEntry = createFileOutput( strFilePath, nMaxSizeBeforeRotation, nMaxFilesCount );
    if( !objEntry )
        return false;
    gArrStreams.push( objEntry );
    return true;
}

export function extractErrorMessage( jo?: TLogArgument, strDefaultErrorText?: string ): string {
    strDefaultErrorText = strDefaultErrorText ?? "unknown error or error without a description";
    if( !jo )
        return strDefaultErrorText;
    try {
        const isError = function( err: Error | string ): boolean {
            return !!( ( err && err instanceof Error && err.stack && err.message ) );
        };
        if( !isError( jo ) ) {
            if( "error" in jo ) {
                jo = jo.error;
                if( typeof jo === "string" )
                    return jo;
                if( typeof jo !== "object" )
                    return strDefaultErrorText + "(" + jo.toString() + ")";
            }
            if( typeof jo === "string" && jo )
                return strDefaultErrorText + "(" + jo.toString() + ")";
            return strDefaultErrorText;
        }
        if( typeof jo.message === "string" && jo.message.length > 0 )
            return jo.message;
        strDefaultErrorText += "(" + jo.toString() + ")";
    } catch ( err ) {
    }
    return strDefaultErrorText;
}

function tryToSplitFormatString( strFormat?: string, cntArgsMax?: number ): TLogArgument[] | null {
    if( !( strFormat && typeof strFormat === "string" ) )
        return null;
    if( !cntArgsMax )
        cntArgsMax = 0;
    const arrParts: TLogArgument[] = [];
    let s = strFormat; let cntFoundArgs = 0;
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
            arrParts.push( { type: "text", text: strPart } );
        arrParts.push( { type: "arg", text: strArgDesc } );
        ++cntFoundArgs;
        if( s.length == 0 )
            break;
    }
    if( cntFoundArgs == 0 )
        return null;
    if( s.length > 0 )
        arrParts.push( { type: "text", text: s } );
    return arrParts;
}

export function fmtArgumentsArray( arrArgs: TLogArgument[], fnFormatter?: TFnFormatter ): string {
    fnFormatter = fnFormatter ?? function( arg: TLogArgument ): string { return arg; };
    const arrParts = ( arrArgs && arrArgs.length > 0 )
        ? tryToSplitFormatString( arrArgs[0], arrArgs.length - 1 )
        : null;
    let s = ""; let isValueMode = false;
    const fnDefaultOneArgumentFormatter = function(
        arg?: TLogArgument, fnCustomFormatter?: TFnFormatter | null ): string {
        if( !fnCustomFormatter )
            fnCustomFormatter = fnFormatter;
        if( !fnCustomFormatter )
            fnCustomFormatter = function( x?: TLogArgument ): string { return x; };
        const t = typeof arg;
        if( t == "string" ) {
            if( arg.length > 0 ) {
                if( arg == " " || arg == "\n" ) {
                    // skip
                } else if( !cc.isStringAlreadyColorized( arg ) )
                    return fnCustomFormatter( arg );
            }
        } else
            return cc.logArgToString( arg );
        return arg;
    };
    const fnFormatOneArgument = function( arg: TLogArgument, fmt?: TLogArgument ): string {
        if( !arg )
            return arg;
        if( arg == " " || arg == "\n" )
            return arg;
        if( !isValueMode )
            return fnDefaultOneArgumentFormatter( arg, null );
        if( fmt && typeof "fmt" === "string" ) {
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
                    ++idxArgNextPrinted;
                    continue;
                }
                // assume joPart.type == "text" always here, at this point
                if( !cc.isStringAlreadyColorized( joPart.text ) )
                    s += fnFormatter( joPart.text );
                else
                    s += joPart.text;
            }
        }
        for( let i = idxArgNextPrinted; i < arrArgs.length; ++i ) {
            try {
                s += fnFormatOneArgument( arrArgs[i], null );
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
    return s;
}

export function outputStringToAllStreams( s: string ): void {
    try {
        if( s.length <= 0 )
            return;
        for( let i = 0; i < gArrStreams.length; ++i ) {
            try {
                const objEntry = gArrStreams[i];
                if( objEntry && "write" in objEntry && typeof objEntry.write === "function" )
                    objEntry.write( s );
            } catch ( err ) {
            }
        }
    } catch ( err ) {
    }
}

export function write( ...args: TLogArgument[] ): void {
    let s: string = getPrintTimestamps() ? generateTimestampPrefix( null, true ) : "";
    s += fmtArgumentsArray( args );
    outputStringToAllStreams( s );
}
export function writeRaw( ...args: TLogArgument[] ): void {
    const s: string = fmtArgumentsArray( args );
    outputStringToAllStreams( s );
}

export function getLogLinePrefixFatal(): string {
    return cc.fatal( "FATAL ERROR:" ) + " ";
}
export function getLogLinePrefixCritical(): string {
    return cc.fatal( "CRITICAL ERROR:" ) + " ";
}
export function getLogLinePrefixError(): string {
    return cc.fatal( "ERROR:" ) + " ";
}
export function getLogLinePrefixWarning(): string {
    return cc.error( "WARNING:" ) + " ";
}
export function getLogLinePrefixAttention(): string {
    return "";
}
export function getLogLinePrefixInformation(): string {
    return "";
}
export function getLogLinePrefixNotice(): string {
    return "";
}
export function getLogLinePrefixNote(): string {
    return "";
}
export function getLogLinePrefixDebug(): string {
    return "";
}
export function getLogLinePrefixTrace(): string {
    return "";
}
export function getLogLinePrefixSuccess(): string {
    return "";
}

// high-level format to returned string
export function fmtFatal( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.error );
}
export function fmtCritical( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.error );
}
export function fmtError( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.error );
}
export function fmtWarning( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.warning );
}
export function fmtAttention( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.attention );
}
export function fmtInformation( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.info );
}
export function fmtInfo( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.info );
}
export function fmtNotice( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.notice );
}
export function fmtNote( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.note );
}
export function fmtDebug( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.debug );
}
export function fmtTrace( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.trace );
}
export function fmtSuccess( ...args: TLogArgument[] ): string {
    return fmtArgumentsArray( args, cc.success );
}

// high-level formatted output
export function fatal( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "fatal" ) )
        write( getLogLinePrefixFatal() + fmtFatal( ...args ) + "\n" );
}
export function critical( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "critical" ) )
        write( getLogLinePrefixCritical() + fmtCritical( ...args ) + "\n" );
}
export function error( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "error" ) )
        write( getLogLinePrefixError() + fmtError( ...args ) + "\n" );
}
export function warning( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "warning" ) )
        write( getLogLinePrefixWarning() + fmtWarning( ...args ) + "\n" );
}
export function attention( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "attention" ) )
        write( getLogLinePrefixAttention() + fmtAttention( ...args ) + "\n" );
}
export function information( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "information" ) )
        write( getLogLinePrefixInformation() + fmtInformation( ...args ) + "\n" );
}
export function info( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "information" ) )
        write( getLogLinePrefixInformation() + fmtInformation( ...args ) + "\n" );
}
export function notice( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "notice" ) )
        write( getLogLinePrefixNotice() + fmtNotice( ...args ) + "\n" );
}
export function note( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "notice" ) )
        write( getLogLinePrefixNote() + fmtNote( ...args ) + "\n" );
}
export function debug( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "debug" ) )
        write( getLogLinePrefixDebug() + fmtDebug( ...args ) + "\n" );
}
export function trace( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "trace" ) )
        write( getLogLinePrefixTrace() + fmtTrace( ...args ) + "\n" );
}
export function success( ...args: TLogArgument[] ): void {
    if( verboseGet() >= verboseName2Number( "information" ) )
        write( getLogLinePrefixSuccess() + fmtSuccess( ...args ) + "\n" );
}

export function removeAll(): void {
    removeAllStreams();
}

export function addStdout(): boolean {
    return insertStandardOutputStream();
}

export function addMemory(): boolean {
    return insertMemoryOutputStream();
}

export function createMemoryStream(): TLogger {
    return createMemoryOutputStream();
}

export function add(
    strFilePath: string, nMaxSizeBeforeRotation?: number, nMaxFilesCount?: number ): boolean {
    if( !nMaxSizeBeforeRotation )
        nMaxSizeBeforeRotation = 0;
    if( !nMaxFilesCount )
        nMaxFilesCount = 0;
    return insertFileOutput(
        strFilePath,
        ( nMaxSizeBeforeRotation <= 0 ) ? -1 : nMaxSizeBeforeRotation,
        ( nMaxFilesCount <= 1 ) ? -1 : nMaxFilesCount
    );
}

export function close(): void {
    // for compatibility with created streams
}

export function exposeDetailsTo(
    otherStream: TLogger, strTitle: string, isSuccess: boolean ): void {
    // for compatibility with created streams
}

export function toString(): string {
    // for compatibility with created streams
    return "";
}

const gMapVerbose: TMapVerbose = { };
gMapVerbose[0] = "silent";
gMapVerbose[1] = "fatal";
gMapVerbose[2] = "critical";
gMapVerbose[3] = "error";
gMapVerbose[4] = "warning";
gMapVerbose[5] = "attention";
gMapVerbose[6] = "information";
gMapVerbose[7] = "notice";
gMapVerbose[8] = "debug";
gMapVerbose[9] = "trace";

function computeVerboseAlias(): TMapVerboseReverse {
    const m: TMapVerboseReverse = { };
    const arrKeys: string[] = Object.keys( gMapVerbose );
    for( const key of arrKeys ) {
        const val = gMapVerbose[key as any];
        const name = val;
        if( name )
            m[name] = key as any;
    }
    m.empty = m.silent ?? 0; // alias
    m.none = m.silent ?? 0; // alias
    m.stop = m.fatal ?? 0; // alias
    m.bad = m.critical ?? 0; // alias
    m.err = m.error ?? 0; // alias
    m.warn = m.warning ?? 0; // alias
    m.attn = m.attention ?? 0; // alias
    m.info = m.information ?? 0; // alias
    m.note = m.notice ?? 0; // alias
    m.dbg = m.debug ?? 0; // alias
    m.crazy = m.trace ?? 0; // alias
    m.detailed = m.trace ?? 0; // alias
    return m;
}
let gMapReversedVerbose: TMapVerboseReverse = { };

export function verbose(): TMapVerbose { return gMapVerbose; }
export function verboseReversed(): TMapVerboseReverse {
    if( !gMapReversedVerbose )
        gMapReversedVerbose = computeVerboseAlias();
    return gMapReversedVerbose;
}
export function verboseLevelAsTextForLog( vl: TLogArgument ): string {
    if( typeof vl === "undefined" )
        vl = verboseGet();
    if( vl in gMapVerbose ) {
        const tl = gMapVerbose[vl] ?? 0;
        return tl.toString();
    }
    return "unknown(" + JSON.stringify( vl ) + ")";
}
export function verboseName2Number( s: string ): number {
    const mapReversedVerbose: TMapVerboseReverse = verboseReversed();
    const n = mapReversedVerbose[s];
    if( typeof n === "undefined" )
        return 9;
    return n;
}

let gFlagIsExposeDetails = false;
let gVerboseLevel = verboseName2Number( "information" );

export function exposeDetailsGet(): boolean {
    return !!gFlagIsExposeDetails;
}
export function exposeDetailsSet( isExpose: TLogArgument ): void {
    gFlagIsExposeDetails = !!isExpose;
}

export function verboseGet(): number {
    return cc.toInteger( gVerboseLevel );
}
export function verboseSet( vl?: TLogArgument ): void {
    gVerboseLevel = parseInt( vl );
}

export function verboseParse( s: string ): number {
    let n: number = 5;
    try {
        const isNumbersOnly = /^\d+$/.test( s );
        if( isNumbersOnly )
            n = cc.toInteger( s );
        else {
            const ch0 = s[0].toLowerCase();
            const arrKeys: string[] = Object.keys( gMapVerbose );
            for( const key of arrKeys ) {
                const val = gMapVerbose[key as any];
                const name = val;
                const ch1: string = name[0].toLowerCase();
                if( ch0 == ch1 ) {
                    n = key as any;
                    return n;
                }
            }
        }
    } catch ( err ) { }
    return n;
}

export function verboseList(): void {
    const arrKeys: string[] = Object.keys( gMapVerbose );
    for( const key of arrKeys ) {
        const val = gMapVerbose[key as any];
        const name = val;
        console.log( "    " + cc.j( key ) + cc.sunny( "=" ) + cc.bright( name ) );
    }
}

export function u( x?: TLogArgument ): string {
    return cc.isStringAlreadyColorized( x ) ? x : cc.u( x );
}

export function v( x?: TLogArgument ): string {
    return cc.isStringAlreadyColorized( x ) ? x : cc.j( x );
}

export function em( x?: TLogArgument ): string {
    return cc.isStringAlreadyColorized( x ) ? x : cc.warning( x );
}

export function stack( err?: TLogArgument ): string {
    return cc.stack( err );
}

export function onOff( x?: TLogArgument ): string {
    return cc.isStringAlreadyColorized( x ) ? x : cc.onOff( x );
}

export function yn( x?: TLogArgument ): string {
    return cc.isStringAlreadyColorized( x ) ? x : cc.yn( x );
}

export function posNeg(
    condition: TLogArgument, strPositive: string, strNegative: string
): string {
    return condition
        ? ( cc.isStringAlreadyColorized( strPositive ) ? strPositive : cc.success( strPositive ) )
        : ( cc.isStringAlreadyColorized( strNegative ) ? strNegative : cc.error( strNegative ) );
}
