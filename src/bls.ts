// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option)  any later version.
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
 * @file bls.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as fs from "fs";
import * as path from "path";
import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as childProcessModule from "child_process";
import * as rpcCall from "./rpcCall.js";
import * as shellMod from "shelljs";
import * as imaUtils from "./utils.js";
import * as sha3Module from "sha3";
import * as skaleObserver from "./observer.js";
import * as discoveryTools from "./discoveryTools.js";
import * as threadInfo from "./threadInfo.js";
import * as utils from "./socketUtils.js";
import * as state from "./state.js";
import type * as loop from "./loop.js";
import type * as IMA from "./imaCore.js";
import type * as rpcCallFormats from "./rpcCallFormats.js";

export interface TBLSBasicSignResultFields {
    errorMessage: string
    status: number
    error?: string | null
}

export interface TSignResult extends TBLSBasicSignResultFields {
    signatureShare?: string
}

export interface TGatheringTracker {
    nCountReceivedPrevious: number
    nCountReceived: number
    nCountErrors: number
    nCountSkipped: number
    nWaitIntervalStepMilliseconds: number
    nWaitIntervalMaxSteps: number
}

export interface TSignOperationOptions {
    imaState: state.TIMAState
    nTransferLoopCounter: number
    strDirection: string
    jarrMessages: state.TIMAMessage[]
    nIdxCurrentMsgBlockStart: number
    strFromChainName: string
    joExtraSignOpts?: loop.TExtraSignOpts | null
    fn: IMA.TFunctionAfterSigningMessages
    bHaveResultReportCalled: boolean
    strLogPrefix: string
    strLogPrefixA: string
    strLogPrefixB: string
    joGatheringTracker: TGatheringTracker
    arrSignResults: TBLSSignResult[]
    details: log.TLoggerBase
    strGatheredDetailsName: string
    sequenceId: string
    jarrNodes: discoveryTools.TSChainNode[]
    nThreshold: number
    nParticipants: number
    nCountOfBlsPartsToCollect: number
    errGathering: Error | string | null
    targetChainName: string
    fromChainName: string
    targetChainID: string | number
    fromChainID: string | number
}

export interface TBSU256CallData {
    params: {
        valueToSign: string
        qa?: state.TQAInformation
    }
}

export interface TBSU256Options {
    joCallData: TBSU256CallData
    imaState: state.TIMAState
    strLogPrefix: string
    details: log.TLoggerBase
    joRetVal: TBLSSignResultReturnValue
    isSuccess: boolean
    nThreshold: number
    nParticipants: number
    u256: string | null
    strMessageHash: string
    joAccount: state.TAccount | null
    qa?: state.TQAInformation
}

export interface THandleVerifyAndSignCallDataParams {
    startMessageIdx: number
    srcChainName: string
    dstChainName: string
    srcChainID: string
    dstChainID: string
    direction: string
    messages: state.TIMAMessage[]
    qa?: state.TQAInformation
}

export interface THandleVerifyAndSignCallData {
    params: THandleVerifyAndSignCallDataParams
}

export interface THandleVerifyAndSignOptions {
    joCallData: THandleVerifyAndSignCallData
    imaState: state.TIMAState
    strLogPrefix: string
    details: log.TLoggerBase
    joRetVal: TBLSSignResultReturnValue
    isSuccess: boolean
    nIdxCurrentMsgBlockStart: number
    strFromChainName: string
    strToChainName: string
    strFromChainID: string
    strToChainID: string
    strDirection: string
    jarrMessages: state.TIMAMessage[]
    strMessageHash: string
    joExtraSignOpts: loop.TExtraSignOpts | null
    nThreshold: number
    nParticipants: number
}

export interface TSignU256Options {
    u256: string
    fn: IMA.TFunctionAfterSigningMessages
    details: log.TLoggerBase
    imaState: state.TIMAState
    strLogPrefix: string
    joGatheringTracker: {
        nCountReceivedPrevious: number
        nCountReceived: number
        nCountErrors: number
        nCountSkipped: number
        nWaitIntervalStepMilliseconds: number
        nWaitIntervalMaxSteps: number // 10 is 1 second
    }
    arrSignResults: TBLSSignResult[]
    jarrNodes: discoveryTools.TSChainNode[]
    nThreshold: number
    nParticipants: number
    nCountOfBlsPartsToCollect: number
    errGathering: Error | string | null
}

export interface TBLSSignaturePointXYDecimals {
    X: string
    Y: string
}

export interface TBLSGlueResult {
    signature: TBLSSignaturePointXYDecimals
    hashSrc?: string
    hashPoint?: TBLSSignaturePointXYDecimals
    hint?: string
}

export interface TBLSPropertiesOfG1 {
    hashPoint: TBLSSignaturePointXYDecimals
    hint: string
}

export interface TBLSResultOfG1 {
    g1: TBLSPropertiesOfG1
}

export interface TBLSSignResultBase {
    index: string
    signature: TBLSSignaturePointXYDecimals
}
export interface TBLSSignResult extends TBLSSignResultBase {
    fromNode?: discoveryTools.TSChainNode
    signResult: TSignResult
}

export interface TRPCInputSkaleIMAVerifyAndSign extends rpcCallFormats.TRPCInputBasicFields {
    params: THandleVerifyAndSignCallDataParams
}

export interface TRPCInputBLSSignMessageHash extends rpcCallFormats.TRPCInputBasicFields {
    params: {
        keyShareName: string
        messageHash: string
        n: number
        t: number
    }
}

export interface TRPCOutputBLSSignMessageHashResult extends rpcCallFormats.TRPCOutputBasicFields {
    signResult: TSignResult
}

export interface TRPCInputBLSSignU256 extends rpcCallFormats.TRPCInputBasicFields {
    params: {
        valueToSign: string
    }
}

export interface TBLSSignResultReturnValue {
    qa?: state.TQAInformation
    result?: TBLSSignResult
    error?: string
}

const shell = ( shellMod as any ).default;

const Keccak = sha3Module.Keccak;

function discoverBlsThreshold( joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo ): number {
    const imaState: state.TIMAState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    if( !joSChainNetworkInfo )
        return -1;
    const jarrNodes = joSChainNetworkInfo.network;
    for( let i = 0; i < jarrNodes.length; ++i ) {
        const joNode = jarrNodes[i];
        if( discoveryTools.isSChainNodeFullyDiscovered( joNode ) )
            return joNode.imaInfo.t;
    }
    return -1;
}

function discoverBlsParticipants( joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo ): number {
    const imaState: state.TIMAState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    if( !joSChainNetworkInfo )
        return -1;
    const jarrNodes = joSChainNetworkInfo.network;
    for( let i = 0; i < jarrNodes.length; ++i ) {
        const joNode = jarrNodes[i];
        if( discoveryTools.isSChainNodeFullyDiscovered( joNode ) )
            return joNode.imaInfo.n;
    }
    return -1;
}

function checkBlsThresholdAndBlsParticipants(
    nThreshold: number, nParticipants: number, strOperation: string, details: log.TLoggerBase
): boolean {
    details = details || log;
    if( nThreshold <= 0 ) {
        details.fatal( "Operation {} will fail because discovered BLS threshold {}" +
            " is invalid number or bad value", strOperation, nThreshold );
        return false;
    }
    if( nParticipants <= 0 ) {
        details.fatal( "Operation {} will fail because discovered BLS number of participants {}" +
            " is invalid number or bad value", strOperation, nParticipants );
        return false;
    }
    if( nThreshold > nParticipants ) {
        details.fatal( "Operation {} will fail because discovered BLS threshold {} is greater " +
            "than BLS number of participants {}", strOperation, nThreshold, nParticipants );
        return false;
    }
    return true;
}

function discoverPublicKeyByIndex(
    nNodeIndex: number, joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo,
    details: log.TLoggerBase, isThrowException: boolean
): discoveryTools.TBLSPublicKey | null {
    details = details || log;
    const imaState: state.TIMAState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    const jarrNodes = joSChainNetworkInfo.network;
    const cntNodes = jarrNodes.length;
    const joNode = jarrNodes[nNodeIndex];
    if( discoveryTools.isSChainNodeFullyDiscovered( joNode ) ) {
        return {
            BLSPublicKey0: joNode.imaInfo.BLSPublicKey0,
            BLSPublicKey1: joNode.imaInfo.BLSPublicKey1,
            BLSPublicKey2: joNode.imaInfo.BLSPublicKey2,
            BLSPublicKey3: joNode.imaInfo.BLSPublicKey3
        };
    }
    details.fatal( "BLS 1/{} public key discovery failed for node #{}, node data is: {}",
        cntNodes, nNodeIndex, joNode );
    if( isThrowException )
        throw new Error( `BLS 1/${cntNodes} public key discovery failed for node #${nNodeIndex}` );
    return null;
}

function discoverCommonPublicKey(
    details: log.TLoggerBase, joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo,
    isThrowException: boolean ): discoveryTools.TBLSCommonPublicKey | null {
    const imaState: state.TIMAState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    const jarrNodes = joSChainNetworkInfo.network;
    for( let i = 0; i < jarrNodes.length; ++i ) {
        const joNode = jarrNodes[i];
        if( discoveryTools.isSChainNodeFullyDiscovered( joNode ) ) {
            return {
                commonBLSPublicKey0: joNode.imaInfo.commonBLSPublicKey0,
                commonBLSPublicKey1: joNode.imaInfo.commonBLSPublicKey1,
                commonBLSPublicKey2: joNode.imaInfo.commonBLSPublicKey2,
                commonBLSPublicKey3: joNode.imaInfo.commonBLSPublicKey3
            };
        }
    }
    details.fatal( "BLS common public key discovery failed, chain data is: {}",
        joSChainNetworkInfo );
    if( isThrowException )
        throw new Error( "BLS common public key discovery failed" );
    return null;
}

function hexPrepare(
    strHex: string, isInvertBefore: boolean, isInvertAfter: boolean
): Uint8Array {
    if( isInvertBefore == undefined )
        isInvertBefore = true;
    if( isInvertAfter == undefined )
        isInvertAfter = true;
    let arrBytes = imaUtils.hexToBytes( strHex );
    if( isInvertBefore )
        arrBytes = arrBytes.reverse();
    arrBytes = imaUtils.bytesAlignLeftWithZeroes( arrBytes, 32 );
    if( isInvertAfter )
        arrBytes = arrBytes.reverse();
    return arrBytes;
}

function stringToKeccak256( s: string ): Uint8Array {
    const strU256 = owaspUtils.ethersMod.ethers.utils.id( s );
    return hexPrepare( strU256, true, true );
}

function arrayToKeccak256( arrBytes: Uint8Array ): Uint8Array {
    const k = new Keccak( 256 );
    k.update( imaUtils.toBuffer( arrBytes ) );
    const h = k.digest( "hex" );
    return imaUtils.hexToBytes( "0x" + h );
}

function keccak256Message(
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string
): string {
    let arrBytes = stringToKeccak256( strFromChainName );
    arrBytes = imaUtils.bytesConcat(
        arrBytes,
        hexPrepare(
            owaspUtils.ensureStartsWith0x( nIdxCurrentMsgBlockStart.toString( 16 ) ),
            false, false )
    );
    arrBytes = arrayToKeccak256( arrBytes );
    const cnt = jarrMessages.length;
    for( let i = 0; i < cnt; ++i ) {
        const joMessage: state.TIMAMessage = jarrMessages[i];
        let bytesSender = imaUtils.hexToBytes( joMessage.sender.toString() );
        bytesSender = imaUtils.bytesAlignLeftWithZeroes( bytesSender, 32 );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesSender );
        let bytesDestinationContract = imaUtils.hexToBytes( joMessage.destinationContract );
        bytesDestinationContract =
            imaUtils.bytesAlignLeftWithZeroes( bytesDestinationContract, 32 );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesDestinationContract );
        const bytesData = imaUtils.hexToBytes( joMessage.data );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesData );
        arrBytes = arrayToKeccak256( arrBytes );
    }
    return owaspUtils.ensureStartsWith0x( imaUtils.bytesToHex( arrBytes, false ) );
}

export function keccak256U256( u256: string, isHash: boolean ): string {
    let arrBytes = new Uint8Array();
    let bytesU256 = imaUtils.hexToBytes( u256 );
    bytesU256 = bytesU256.reverse();
    bytesU256 = imaUtils.bytesAlignLeftWithZeroes( bytesU256, 32 );
    bytesU256 = bytesU256.reverse();
    arrBytes = imaUtils.bytesConcat( arrBytes, bytesU256 );
    let strMessageHash = "";
    if( isHash ) {
        const hash = new Keccak( 256 );
        hash.update( imaUtils.toBuffer( arrBytes ) );
        strMessageHash = hash.digest( "hex" );
    } else
        strMessageHash = "0x" + imaUtils.bytesToHex( arrBytes );
    return strMessageHash;
}

export function keccak256ForPendingWorkAnalysis(
    nNodeNumber: number, strLoopWorkType: string, isStart: boolean, ts: number
): string {
    let arrBytes = new Uint8Array();

    let bytesU256 = imaUtils.hexToBytes( nNodeNumber );
    bytesU256 = bytesU256.reverse();
    bytesU256 = imaUtils.bytesAlignLeftWithZeroes( bytesU256, 32 );
    bytesU256 = bytesU256.reverse();
    arrBytes = imaUtils.bytesConcat( arrBytes, bytesU256 );

    arrBytes = imaUtils.bytesConcat( arrBytes, stringToKeccak256( strLoopWorkType ) );

    bytesU256 = imaUtils.hexToBytes( isStart ? 1 : 0 );
    bytesU256 = bytesU256.reverse();
    bytesU256 = imaUtils.bytesAlignLeftWithZeroes( bytesU256, 32 );
    bytesU256 = bytesU256.reverse();
    arrBytes = imaUtils.bytesConcat( arrBytes, bytesU256 );

    bytesU256 = imaUtils.hexToBytes( ts );
    bytesU256 = bytesU256.reverse();
    bytesU256 = imaUtils.bytesAlignLeftWithZeroes( bytesU256, 32 );
    bytesU256 = bytesU256.reverse();
    arrBytes = imaUtils.bytesConcat( arrBytes, bytesU256 );

    const hash = new Keccak( 256 );
    hash.update( imaUtils.toBuffer( arrBytes ) );
    const strMessageHash = hash.digest( "hex" );
    return strMessageHash;
}

function splitSignatureShare( signatureShare: string ): TBLSSignaturePointXYDecimals {
    const jarr = signatureShare.split( ":" );
    if( jarr.length < 2 )
        throw new Error( `Failed to split signatureShare=${signatureShare.toString()}` );
    return { X: jarr[0], Y: jarr[1] };
}

function getBlsGlueTmpDir(): string {
    const strTmpDir = "/tmp/ima-bls-glue";
    shell.mkdir( "-p", strTmpDir );
    return strTmpDir;
}

function allocBlsTmpActionDir(): string {
    const strActionDir = getBlsGlueTmpDir() + "/" + imaUtils.replaceAll( imaUtils.uuid(), "-", "" );
    if( !fs.existsSync( strActionDir ) )
        fs.mkdirSync( strActionDir, { recursive: true } );
    return strActionDir;
}

function performBlsGlue(
    details: log.TLoggerBase, strDirection: string, jarrMessages: state.TIMAMessage[],
    nIdxCurrentMsgBlockStart: number, strFromChainName: string, arrSignResults: TBLSSignResult[]
): TBLSGlueResult | null {
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const strLogPrefix = `${strDirection}/BLS/Glue: `;
    let joGlueResult: TBLSGlueResult | null = null;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    details.debug( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
    details.debug( "{p}Discovered number of BLS participants is {}.", strLogPrefix, nParticipants );
    if( !checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS glue", details ) )
        return null;
    const strMessageHash = owaspUtils.removeStarting0x(
        keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName ) );
    details.debug( "{p}Message hash to sign is {}", strLogPrefix, strMessageHash );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( "{p}{sunny} will work in {} director with {} sign results...",
        strLogPrefix, "performBlsGlue", strActionDir, arrSignResults.length );
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    const strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo: TBLSSignResult = arrSignResults[i];
            if( !jo )
                throw new Error( `Failed to save BLS part ${i} because it's not JSON object` );
            const strPath = strActionDir + "/sign-result" + jo.index + ".json";
            details.trace( "{p}Saving {} file containing {}", strLogPrefix, strPath, jo );
            imaUtils.jsonFileSave( strPath, jo );
            strInput += " --input " + strPath;
        }
        const strGlueCommand =
            imaState.strPathBlsGlue +
            " --t " + nThreshold +
            " --n " + nParticipants +
            strInput +
            " --output " + strActionDir + "/glue-result.json";
        details.trace( "{p}Will execute BLS glue command: {}", strLogPrefix, strGlueCommand );
        let strOutput = childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        joGlueResult = imaUtils.jsonFileLoad( path.join( strActionDir, "glue-result.json" ) );
        details.trace( "{p}BLS glue result is: {}", strLogPrefix, joGlueResult );
        if( joGlueResult && "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( "{p}BLS glue success", strLogPrefix );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( "{p}Computing G1 hash point...", strLogPrefix );
            const strPath = strActionDir + "/hash.json";
            details.trace( "{p}Saving {} file...", strLogPrefix, strPath );
            imaUtils.jsonFileSave( strPath, { message: strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( "{p}Will execute HashG1 command {}", strLogPrefix, strHasG1Command );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } );
            details.trace( "{p}HashG1 output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
            const joResultHashG1: TBLSResultOfG1 =
                imaUtils.jsonFileLoad( path.join( strActionDir, "g1.json" ) );
            details.trace( "{p}HashG1 result is: {}", strLogPrefix, joResultHashG1 );
            if( "g1" in joResultHashG1 &&
                "hint" in joResultHashG1.g1 &&
                "hashPoint" in joResultHashG1.g1 &&
                "X" in joResultHashG1.g1.hashPoint &&
                "Y" in joResultHashG1.g1.hashPoint
            ) {
                joGlueResult.hashPoint = joResultHashG1.g1.hashPoint;
                joGlueResult.hint = joResultHashG1.g1.hint;
            } else {
                joGlueResult = null;
                throw new Error( `malformed HashG1 result: ${JSON.stringify( joResultHashG1 )}` );
            }
        } else {
            const joSavedGlueResult = joGlueResult;
            joGlueResult = null;
            throw new Error( `malformed BLS glue result: ${JSON.stringify( joSavedGlueResult )}` );
        }
        fnShellRestore();
    } catch ( err ) {
        details.critical( "{p}BLS glue error description is: {err}, stack is: \n{stack}",
            strLogPrefix, err, err );
        details.critical( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        fnShellRestore();
        joGlueResult = null;
    }
    return joGlueResult;
}

function performBlsGlueU256(
    details: log.TLoggerBase, u256: string, arrSignResults: TBLSSignResult[]
): TBLSGlueResult | null {
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const strLogPrefix = "BLS/Glue: ";
    let joGlueResult: TBLSGlueResult | null = null;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    details.debug( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
    details.debug( "{p}Discovered number of BLS participants is {}.", strLogPrefix, nParticipants );
    if( !checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS glue-256", details ) )
        return null;
    details.trace( "{p}Original long message is {}", strLogPrefix, keccak256U256( u256, false ) );
    const strMessageHash = keccak256U256( u256, true );
    details.trace( "{p}Message hash to sign is {}", strLogPrefix, strMessageHash );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( "{p}performBlsGlueU256 will work in {} director with {} sign results...",
        strLogPrefix, strActionDir, arrSignResults.length );
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo: TBLSSignResult = arrSignResults[i];
            if( !jo )
                throw new Error( `Failed to save BLS part ${i} because it's not JSON object` );
            const strPath = strActionDir + "/sign-result" + jo.index + ".json";
            details.trace( "{p}Saving {} file...", strLogPrefix, strPath );
            imaUtils.jsonFileSave( strPath, jo );
            strInput += " --input " + strPath;
        }
        const strGlueCommand =
            imaState.strPathBlsGlue +
            " --t " + nThreshold +
            " --n " + nParticipants +
            strInput +
            " --output " + strActionDir + "/glue-result.json";
        details.trace( "{p}Will execute BLS glue command: {}", strLogPrefix, strGlueCommand );
        strOutput =
            childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } ).toString( "utf8" );
        details.trace( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        joGlueResult = imaUtils.jsonFileLoad( path.join( strActionDir, "glue-result.json" ) );
        details.trace( "{p}BLS glue result is:\n{}", strLogPrefix, joGlueResult );
        if( joGlueResult && "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( "{p}BLS glue success", strLogPrefix );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( "{p}Computing G1 hash point...", strLogPrefix );
            const strPath = strActionDir + "/hash.json";
            details.trace( "{p}Saving {} file...", strLogPrefix, strPath );
            imaUtils.jsonFileSave( strPath, { message: strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( "{p}Will execute HashG1 command: {}", strLogPrefix, strHasG1Command );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } )
                .toString( "utf8" );
            details.trace( "{p}HashG1 output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
            const joResultHashG1: TBLSResultOfG1 =
                imaUtils.jsonFileLoad( path.join( strActionDir, "g1.json" ) );
            details.trace( "{p}HashG1 result is: {}", strLogPrefix, joResultHashG1 );
            if( "g1" in joResultHashG1 &&
                "hint" in joResultHashG1.g1 &&
                "hashPoint" in joResultHashG1.g1 &&
                "X" in joResultHashG1.g1.hashPoint &&
                "Y" in joResultHashG1.g1.hashPoint
            ) {
                joGlueResult.hashPoint = joResultHashG1.g1.hashPoint;
                joGlueResult.hint = joResultHashG1.g1.hint;
            } else {
                joGlueResult = null;
                throw new Error( `malformed HashG1 result: ${JSON.stringify( joResultHashG1 )}` );
            }
        } else {
            const joSavedGlueResult = joGlueResult;
            joGlueResult = null;
            throw new Error( `malformed BLS glue result: ${JSON.stringify( joSavedGlueResult )}` );
        }
        fnShellRestore();
    } catch ( err ) {
        details.critical( "BLS glue error description is: {err}, stack is: \n{stack}",
            err, err );
        details.critical( "BLS glue output is:\n{raw}", strOutput || "<<EMPTY>>" );
        fnShellRestore();
        joGlueResult = null;
    }
    return joGlueResult;
}

function performBlsVerifyI(
    details: log.TLoggerBase, strDirection: string, nZeroBasedNodeIndex: number,
    joResultFromNode: TBLSSignResultBase,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joPublicKey: discoveryTools.TBLSPublicKey
): boolean {
    if( !joResultFromNode )
        return true;
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const strLogPrefix = `${strDirection}/BLS/#${nZeroBasedNodeIndex}: `;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( !checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS verify-I", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    try {
        details.trace( "{p}BLS node #{} - first message nonce is {}",
            strLogPrefix, nZeroBasedNodeIndex, nIdxCurrentMsgBlockStart );
        details.trace( "{p}BLS node #{} - first source chain name is {}",
            strLogPrefix, nZeroBasedNodeIndex, strFromChainName );
        details.trace( "{p}BLS node #{} - messages array {}",
            strLogPrefix, nZeroBasedNodeIndex, jarrMessages );
        const strMessageHash = owaspUtils.removeStarting0x(
            keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName ) );
        details.trace( "{p}BLS node #{} - hashed verify message is {}",
            strLogPrefix, nZeroBasedNodeIndex, strMessageHash );
        const joMsg = { message: strMessageHash };
        details.debug(
            "{p}BLS node #{} - composed  {} composed from {} using glue {} and public key {}",
            strLogPrefix, nZeroBasedNodeIndex, joMsg, jarrMessages, joResultFromNode, joPublicKey );
        const strSignResultFileName = strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand =
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName;
        details.trace( "{p}Will execute node #{} BLS verify command: {}", strLogPrefix,
            nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } )
            .toString( "utf8" );
        details.trace( "{p}BLS node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.critical( "{p}BLS node #{} verify error:, error description is: {err}, " +
            "stack is: \n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err );
        details.critical( "{p}BLS node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerifyIU256(
    details: log.TLoggerBase,
    nZeroBasedNodeIndex: number, joResultFromNode: TBLSSignResultBase, u256: string,
    joPublicKey: discoveryTools.TBLSPublicKey
): boolean {
    if( !joResultFromNode )
        return true;
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const strLogPrefix = `BLS/#${nZeroBasedNodeIndex}: `;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( !checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify-I-U256", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    try {
        const joMsg = { message: keccak256U256( u256, true ) };
        details.debug( "{p}BLS u256 node #{} verify message {} composed from {} using glue {} " +
            "and public key {}", strLogPrefix, nZeroBasedNodeIndex, joMsg, u256,
        joResultFromNode, joPublicKey );
        const strSignResultFileName = strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand =
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName;
        details.trace( "{p}Will execute node #{} BLS u256 verify command: {}",
            strLogPrefix, nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } )
            .toString( "utf8" );
        details.trace( "{p}BLS u256 node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS u256 node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS u256 node #{} verify error, error description is: {err}, " +
            "stack is: \n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err );
        details.error( "{p}BLS u256 node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerify(
    details: log.TLoggerBase, strDirection: string, joGlueResult: TBLSGlueResult,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joCommonPublicKey: discoveryTools.TBLSCommonPublicKey
): boolean {
    if( !joGlueResult )
        return true;
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( !checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS verify", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    const strLogPrefix = `${strDirection}/BLS/Summary: "`;
    try {
        details.trace( "{p}BLS/summary verify message - first message nonce is {}",
            strLogPrefix, nIdxCurrentMsgBlockStart );
        details.trace( "{p}BLS/summary verify message - first source chain name is {}",
            strLogPrefix, strFromChainName );
        details.trace( "{p}BLS/summary verify message - messages array {}",
            strLogPrefix, jarrMessages );
        const strMessageHash = owaspUtils.removeStarting0x(
            keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName ) );
        details.trace( "{p}BLS/summary verify message - hashed verify message is {}",
            strLogPrefix, strMessageHash );
        const joMsg = { message: strMessageHash };
        details.debug(
            "{p}BLS/summary verify message - composed JSON {} from messages array {}" +
            " using glue {} and common public key {}",
            strLogPrefix, joMsg, jarrMessages, joGlueResult, joCommonPublicKey );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave: discoveryTools.TBLSCommonPublicKey = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( "{p}BLS common public key for verification is:\n{}",
            strLogPrefix, joCommonPublicKey );
        const strVerifyCommand =
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json";
        details.trace( "{p}Will execute BLS/summary verify command: {}",
            strLogPrefix, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } )
            .toString( "utf8" );
        details.trace( "{p}BLS/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS/summary verify success", strLogPrefix );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS/summary verify error description is: {err}, stack is:\n{stack}",
            strLogPrefix, err, err );
        details.error( "BLS/summary verify output is:\n{raw}", strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerifyU256(
    details: log.TLoggerBase, joGlueResult: TBLSGlueResult, u256: string,
    joCommonPublicKey: discoveryTools.TBLSCommonPublicKey
): boolean {
    if( !joGlueResult )
        return true;
    const imaState: state.TIMAState = state.get();
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( !checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify-U256", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    const strLogPrefix = "BLS u256/Summary: ";
    try {
        const joMsg = { message: keccak256U256( u256, true ) };
        details.debug(
            "{p}BLS u256/summary verify message {} composed from {} using glue {}" +
            " and common public key {}",
            strLogPrefix, joMsg, u256, joGlueResult, joCommonPublicKey );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave: discoveryTools.TBLSCommonPublicKey = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( "{p}BLS u256 common public key for verification is:\n{}",
            strLogPrefix, joCommonPublicKey );
        const strVerifyCommand =
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json";
        details.trace( "{p}Will execute BLS u256/summary verify command: {}",
            strLogPrefix, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } )
            .toString( "utf8" );
        details.trace( "{p}BLS u256/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS u256/summary verify success", strLogPrefix );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS u256/summary  error description is: {err}, stack is: \n{stack}",
            strLogPrefix, err, err );
        details.error( "{p}BLS u256/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

async function checkCorrectnessOfMessagesToSign(
    details: log.TLoggerBase, strLogPrefix: string, strDirection: string,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number,
    joExtraSignOpts?: loop.TExtraSignOpts | null
): Promise < void > {
    const imaState: state.TIMAState = state.get();
    let joMessageProxy: owaspUtils.ethersMod.ethers.Contract | null = null;
    let joAccount: state.TAccount | null = null;
    let joChainName: string | null = null;
    if( strDirection == "M2S" ) {
        joMessageProxy = imaState.joMessageProxyMainNet;
        joAccount = imaState.chainProperties.mn.joAccount;
        joChainName = imaState.chainProperties.sc.strChainName;
    } else if( strDirection == "S2M" ) {
        joMessageProxy = imaState.joMessageProxySChain;
        joAccount = imaState.chainProperties.sc.joAccount;
        joChainName = imaState.chainProperties.mn.strChainName;
    } else if( strDirection == "S2S" ) {
        joAccount = imaState.chainProperties.sc.joAccount;
        if( !joExtraSignOpts?.chainNameDst )
            throw new Error( "Missing destination chain name for BLS signing" );
        joChainName = joExtraSignOpts.chainNameDst;
        const ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider | null =
            ( joExtraSignOpts && "ethersProviderSrc" in joExtraSignOpts &&
            joExtraSignOpts.ethersProviderSrc )
                ? joExtraSignOpts.ethersProviderSrc
                : null;
        if( !ethersProvider ) {
            throw new Error( "CRITICAL ERROR: No provider specified in extra signing options " +
                `for checking messages of direction ${strDirection}` );
        }
        joMessageProxy = new owaspUtils.ethersMod.ethers.Contract(
            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
            imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
            ethersProvider );
    } else {
        throw new Error( "CRITICAL ERROR: Failed checkCorrectnessOfMessagesToSign() with " +
            `unknown direction ${strDirection}` );
    }

    const strCallerAccountAddress = joAccount.address();
    details.debug(
        "{p}{bright} message correctness validation through call to {sunny} method of " +
        "MessageProxy contract with address {}, caller account address is {}, message(s) " +
        "count is {}, message(s) to process are {}, first real message index is {}, messages " +
        "will be sent to chain name {}",
        strLogPrefix, strDirection, "verifyOutgoingMessageData",
        joMessageProxy ? joMessageProxy.address : "<NullContract>",
        strCallerAccountAddress, jarrMessages.length, jarrMessages,
        nIdxCurrentMsgBlockStart, joChainName );
    let cntBadMessages = 0; let i = 0;
    const cnt = jarrMessages.length;
    if( strDirection == "S2M" || strDirection == "S2S" ) {
        for( i = 0; i < cnt; ++i ) {
            const joMessage: state.TIMAMessage = jarrMessages[i];
            const idxMessage = nIdxCurrentMsgBlockStart + i;
            try {
                details.trace(
                    "{p}{bright} Will validate message {} of {}, real message index is {}, " +
                    "source contract is {}, destination contract is {}, message data is {}",
                    strLogPrefix, strDirection, i, cnt, idxMessage, joMessage.sender,
                    joMessage.destinationContract, joMessage.data );
                const outgoingMessageData: state.TIMAOutgoingMessage = {
                    dstChainHash: owaspUtils.ethersMod.ethers.utils.id( joChainName ),
                    msgCounter: idxMessage,
                    srcContract: joMessage.sender,
                    dstContract: joMessage.destinationContract,
                    data: joMessage.data
                };
                if( !joMessageProxy )
                    throw new Error( "No message proxy available" );
                const isValidMessage = await joMessageProxy.callStatic.verifyOutgoingMessageData(
                    outgoingMessageData, { from: strCallerAccountAddress } );
                details.trace(
                    "{p}{bright} Got verification call result {}, real message index is: {}, " +
                    "saved msgCounter is: {}", strLogPrefix, strDirection,
                    isValidMessage, +idxMessage, outgoingMessageData.msgCounter );
                if( !isValidMessage ) {
                    throw new Error( "Bad message detected, " +
                        `message is: ${JSON.stringify( joMessage )}` );
                }
            } catch ( err ) {
                ++cntBadMessages;
                details.critical(
                    "{p}{bright} Correctness validation failed for message {} sent to {}, " +
                    "message is: {}, error information: {err}, stack is:\n{stack}",
                    strLogPrefix, strDirection, idxMessage, joChainName, joMessage,
                    err, err );
            }
        }
    }
    // TODO: M2S - check events
    if( cntBadMessages > 0 ) {
        details.critical( "{p}Correctness validation failed for {} of {} message(s)",
            strLogPrefix, cntBadMessages, cnt );
    } else
        details.success( "{p}Correctness validation passed for {} message(s)", strLogPrefix, cnt );
}

async function prepareSignMessagesImpl(
    optsSignOperation: TSignOperationOptions ): Promise < boolean > {
    optsSignOperation.fn = optsSignOperation.fn ||
        // eslint-disable-next-line n/handle-callback-err
        async function(
            err: Error | string | null,
            jarrMessages: state.TIMAMessage[],
            joGlueResult: TBLSGlueResult | null
        ): Promise < void > {};
    optsSignOperation.sequenceId =
        owaspUtils.removeStarting0x(
            owaspUtils.ethersMod.ethers.utils.id( log.generateTimestampString( null, false ) )
        );
    optsSignOperation.jarrNodes =
        ( optsSignOperation.imaState.bSignMessages &&
            "joSChainNetworkInfo" in optsSignOperation.imaState &&
            optsSignOperation.imaState.joSChainNetworkInfo &&
            typeof optsSignOperation.imaState.joSChainNetworkInfo === "object" &&
            "network" in optsSignOperation.imaState.joSChainNetworkInfo &&
            typeof optsSignOperation.imaState.joSChainNetworkInfo.network === "object"
        )
            ? optsSignOperation.imaState.joSChainNetworkInfo.network
            : [];
    optsSignOperation.details.trace(
        "{p} Invoking {bright} signing messages procedure, message signing is {oo}",
        optsSignOperation.strLogPrefix, optsSignOperation.strDirection,
        optsSignOperation.imaState.bSignMessages );
    if( !( optsSignOperation.imaState.bSignMessages &&
        optsSignOperation.imaState.strPathBlsGlue.length > 0 &&
        optsSignOperation.imaState.joSChainNetworkInfo
    ) ) {
        optsSignOperation.bHaveResultReportCalled = true;
        optsSignOperation.details.debug(
            "{p}BLS message signing is turned off, first real message index is: {}, have {} " +
            "message(s) to process {}", optsSignOperation.strLogPrefix,
            optsSignOperation.nIdxCurrentMsgBlockStart, optsSignOperation.jarrMessages.length,
            optsSignOperation.jarrMessages );
        optsSignOperation.details.exposeDetailsTo(
            log.globalStream(), optsSignOperation.strGatheredDetailsName, false );
        optsSignOperation.details.close();
        await checkCorrectnessOfMessagesToSign(
            optsSignOperation.details, optsSignOperation.strLogPrefix,
            optsSignOperation.strDirection,
            optsSignOperation.jarrMessages,
            optsSignOperation.nIdxCurrentMsgBlockStart,
            optsSignOperation.joExtraSignOpts );
        await optsSignOperation.fn( null, optsSignOperation.jarrMessages, null );
        return true;
    }
    await checkCorrectnessOfMessagesToSign(
        optsSignOperation.details, optsSignOperation.strLogPrefix,
        optsSignOperation.strDirection,
        optsSignOperation.jarrMessages, optsSignOperation.nIdxCurrentMsgBlockStart,
        optsSignOperation.joExtraSignOpts
    );
    optsSignOperation.details.trace( "{p}Will sign {} message(s), sequence ID is {}...",
        optsSignOperation.strLogPrefix, optsSignOperation.jarrMessages.length,
        optsSignOperation.sequenceId );
    optsSignOperation.details.trace( "{p}Will query to sign {} skaled node(s)...",
        optsSignOperation.strLogPrefix, optsSignOperation.jarrNodes.length );
    optsSignOperation.nThreshold =
        discoverBlsThreshold( optsSignOperation.imaState.joSChainNetworkInfo );
    optsSignOperation.nParticipants =
        discoverBlsParticipants( optsSignOperation.imaState.joSChainNetworkInfo );
    optsSignOperation.details.trace( "{p}Discovered BLS threshold is {}.",
        optsSignOperation.strLogPrefix, optsSignOperation.nThreshold );
    optsSignOperation.details.trace( "{p}Discovered number of BLS participants is {}.",
        optsSignOperation.strLogPrefix, optsSignOperation.nParticipants );
    if( !checkBlsThresholdAndBlsParticipants(
        optsSignOperation.nThreshold,
        optsSignOperation.nParticipants,
        "prepare sign messages " + optsSignOperation.strDirection,
        optsSignOperation.details ) ) {
        optsSignOperation.bHaveResultReportCalled = true;
        optsSignOperation.details.exposeDetailsTo(
            log.globalStream(), optsSignOperation.strGatheredDetailsName, false );
        optsSignOperation.details.close();
        await optsSignOperation.fn(
            "signature error(1), S-Chain information " +
            "was not discovered properly and BLS threshold/participants are unknown",
            optsSignOperation.jarrMessages, null );
        return false;
    }
    optsSignOperation.nCountOfBlsPartsToCollect = optsSignOperation.nThreshold;
    optsSignOperation.details.trace( "{p}Will BLS-collect {} from {} nodes, sequence ID is {}",
        optsSignOperation.strLogPrefix, optsSignOperation.nCountOfBlsPartsToCollect,
        optsSignOperation.jarrNodes.length, optsSignOperation.sequenceId );
    return true;
}

async function gatherSigningCheckFinish(
    optsSignOperation: TSignOperationOptions ): Promise < boolean > {
    const cntSuccess = optsSignOperation.arrSignResults.length;
    if( optsSignOperation.joGatheringTracker.nCountReceivedPrevious !=
        optsSignOperation.joGatheringTracker.nCountReceived ) {
        optsSignOperation.details.debug(
            "{bright}/#{} BLS signature gathering progress updated, now have {} BLS " +
            "parts of needed {} arrived, have {} success(es) and {} error(s)",
            optsSignOperation.strDirection, optsSignOperation.nTransferLoopCounter,
            optsSignOperation.joGatheringTracker.nCountReceived,
            optsSignOperation.nCountOfBlsPartsToCollect, cntSuccess,
            optsSignOperation.joGatheringTracker.nCountErrors );
        optsSignOperation.joGatheringTracker.nCountReceivedPrevious =
            owaspUtils.toInteger( optsSignOperation.joGatheringTracker.nCountReceived );
    }
    if( cntSuccess < optsSignOperation.nCountOfBlsPartsToCollect )
        return false;
    optsSignOperation.strLogPrefixB = `${optsSignOperation.strDirection} /# ` +
        `${optsSignOperation.nTransferLoopCounter}/BLS/Summary: `;
    let strError: string | null = null; let strSuccessfulResultDescription: string | null = null;
    const joGlueResult: TBLSGlueResult | null = performBlsGlue( optsSignOperation.details,
        optsSignOperation.strDirection, optsSignOperation.jarrMessages,
        optsSignOperation.nIdxCurrentMsgBlockStart, optsSignOperation.strFromChainName,
        optsSignOperation.arrSignResults );
    if( joGlueResult ) {
        optsSignOperation.details.success( "{p}Got BLS glue result: {}",
            optsSignOperation.strLogPrefixB, joGlueResult );
        if( optsSignOperation.imaState.strPathBlsVerify.length > 0 ) {
            if( !optsSignOperation.imaState.joSChainNetworkInfo )
                throw new Error( "No own S-Chain network information" );
            const joCommonPublicKey = discoverCommonPublicKey(
                optsSignOperation.details, optsSignOperation.imaState.joSChainNetworkInfo, false );
            if( !joCommonPublicKey ) {
                strError = "No BLS common public key";
                optsSignOperation.details.error( "{p}{err}",
                    optsSignOperation.strLogPrefixB, strError );
            } else if( performBlsVerify(
                optsSignOperation.details, optsSignOperation.strDirection,
                joGlueResult, optsSignOperation.jarrMessages,
                optsSignOperation.nIdxCurrentMsgBlockStart,
                optsSignOperation.strFromChainName, joCommonPublicKey
            ) ) {
                strSuccessfulResultDescription = "Got successful summary BLS verification result";
                optsSignOperation.details.success( "{p}{bright}",
                    optsSignOperation.strLogPrefixB, strSuccessfulResultDescription );
            } else {
                strError = "BLS verification failed";
                optsSignOperation.details.error( "{p}{err}",
                    optsSignOperation.strLogPrefixB, strError );
            }
        }
    } else {
        strError = "BLS glue failed, no glue result arrived";
        optsSignOperation.details.error(
            "{p}Problem(1) in BLS sign result handler: {err}",
            optsSignOperation.strLogPrefixB, strError );
    }
    optsSignOperation.details.trace(
        "Will call signed-hash answer-sending callback {}, messages is(are) {}, " +
        "glue result is {}", strError ? log.fmtError( " with error {}", strError ) : "",
        optsSignOperation.jarrMessages, joGlueResult );
    optsSignOperation.fn(
        strError, optsSignOperation.jarrMessages, joGlueResult )
        .catch( function( err: Error | string ): void {
            optsSignOperation.details.critical(
                "Problem(2) in BLS sign result handler: {err}", err );
            optsSignOperation.errGathering = "Problem(2) in BLS sign " +
                `result handler: ${owaspUtils.extractErrorMessage( err )}`;
        } );
    optsSignOperation.bHaveResultReportCalled = true;
    return true;
}

async function gatherSigningCheckOverflow(
    optsSignOperation: TSignOperationOptions ): Promise < boolean > {
    if( optsSignOperation.joGatheringTracker.nCountReceived < optsSignOperation.jarrNodes.length )
        return false;
    optsSignOperation.fn(
        `signature error(2), got ${optsSignOperation.joGatheringTracker.nCountErrors}` +
        ` errors(s) for ${optsSignOperation.jarrNodes.length} node(s)`,
        optsSignOperation.jarrMessages, null
    ).catch( function( err: Error | string ): void {
        const cntSuccess = optsSignOperation.arrSignResults.length;
        optsSignOperation.details.error(
            "Problem(3) in BLS sign result handler, not enough successful BLS signature " +
            "parts({}) when all attempts done, error details: {err}", cntSuccess, err );
        optsSignOperation.errGathering = "Problem(3) in BLS sign result handler, not enough " +
            `successful BLS signature parts(${cntSuccess}) when all attempts done, ` +
            `error details: ${owaspUtils.extractErrorMessage( err )}`;
    } );
    optsSignOperation.bHaveResultReportCalled = true;
    return true;
}

async function gatherSigningStartImpl(
    optsSignOperation: TSignOperationOptions ): Promise < void > {
    optsSignOperation.details.debug( "{p}Waiting for BLS glue result...",
        optsSignOperation.strLogPrefix );
    optsSignOperation.errGathering = null;
    for( let idxStep = 0; idxStep < optsSignOperation.joGatheringTracker.nWaitIntervalMaxSteps;
        ++idxStep ) {
        await threadInfo.sleep(
            optsSignOperation.joGatheringTracker.nWaitIntervalStepMilliseconds );
        if( await gatherSigningCheckFinish( optsSignOperation ) )
            return;
        if( await gatherSigningCheckOverflow( optsSignOperation ) )
            return;
    }
    // timeout
    optsSignOperation.fn(
        `signature error(3), got ${optsSignOperation.joGatheringTracker.nCountErrors}` +
        ` errors(s) for ${optsSignOperation.jarrNodes.length} node(s)`,
        optsSignOperation.jarrMessages, null
    ).catch( function( err: Error | string ): void {
        const cntSuccess = optsSignOperation.arrSignResults.length;
        optsSignOperation.details.critical(
            "Problem(4) in BLS sign result handler, not enough successful BLS signature " +
            "parts({}) and timeout reached, error details: {err}", cntSuccess, err );
        optsSignOperation.errGathering = "Problem(4) in BLS sign result handler, not enough " +
            `successful BLS signature parts(${cntSuccess}) and timeout reached, ` +
            `error details: ${owaspUtils.extractErrorMessage( err )}`;
    } );
    optsSignOperation.bHaveResultReportCalled = true;
}

async function gatherSigningFinishImpl(
    optsSignOperation: TSignOperationOptions ): Promise < void > {
    optsSignOperation.details.trace( "{p}Will await for message BLS verification and sending...",
        optsSignOperation.strLogPrefix );
    if( optsSignOperation.errGathering ) {
        optsSignOperation.details.error( "Failed BLS sign result awaiting(1): {err}",
            optsSignOperation.errGathering.toString() );
        if( !optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn(
                `Failed to gather BLS signatures in ${optsSignOperation.jarrNodes.length} ` +
                "node(s), tracker data is: " +
                `${JSON.stringify( optsSignOperation.joGatheringTracker )} , ` +
                `error is: ${optsSignOperation.errGathering.toString()}`,
                optsSignOperation.jarrMessages, null
            ).catch( function( err: Error | string ): void {
                const cntSuccess = optsSignOperation.arrSignResults.length;
                optsSignOperation.details.error(
                    "Problem(5) in BLS sign result handler, not enough successful BLS " +
                    "signature parts({}) and timeout reached, error details: {err}",
                    cntSuccess, err );
                optsSignOperation.details.exposeDetailsTo(
                    log.globalStream(), optsSignOperation.strGatheredDetailsName, false );
                optsSignOperation.details.close();
                optsSignOperation.details = log.globalStream();
            } );
        }
        return;
    }
    if( !optsSignOperation.bHaveResultReportCalled ) {
        optsSignOperation.details.error( "Failed BLS sign result awaiting(2): {err}",
            "No reports were arrived" );
        optsSignOperation.bHaveResultReportCalled = true;
        await optsSignOperation.fn(
            `Failed to gather BLS signatures in ${optsSignOperation.jarrNodes.length}  node(s), ` +
            `tracker data is: ${JSON.stringify( optsSignOperation.joGatheringTracker )}`,
            optsSignOperation.jarrMessages, null
        ).catch( function( err: Error | string ): void {
            const cntSuccess = optsSignOperation.arrSignResults.length;
            optsSignOperation.details.error(
                "Problem(6) in BLS sign result handler, not enough successful BLS signature " +
                "parts({}) and timeout reached, error details: {err}", cntSuccess, err );
            optsSignOperation.details.exposeDetailsTo(
                log.globalStream(), optsSignOperation.strGatheredDetailsName, false );
            optsSignOperation.details.close();
            optsSignOperation.details = log.globalStream();
        } );
    }
}

async function doSignConfigureChainAccessParams(
    optsSignOperation: TSignOperationOptions ): Promise < void > {
    optsSignOperation.targetChainName = "";
    optsSignOperation.fromChainName = "";
    optsSignOperation.targetChainID = -4;
    optsSignOperation.fromChainID = -4;
    if( optsSignOperation.strDirection == "M2S" ) {
        optsSignOperation.targetChainName =
            ( optsSignOperation.imaState.chainProperties.sc.strChainName
                ? optsSignOperation.imaState.chainProperties.sc.strChainName
                : "" );
        optsSignOperation.fromChainName =
            ( optsSignOperation.imaState.chainProperties.mn.strChainName
                ? optsSignOperation.imaState.chainProperties.mn.strChainName
                : "" );
        optsSignOperation.targetChainID = optsSignOperation.imaState.chainProperties.sc.chainId;
        optsSignOperation.fromChainID = optsSignOperation.imaState.chainProperties.mn.chainId;
    } else if( optsSignOperation.strDirection == "S2M" ) {
        optsSignOperation.targetChainName =
            ( optsSignOperation.imaState.chainProperties.mn.strChainName
                ? optsSignOperation.imaState.chainProperties.mn.strChainName
                : "" );
        optsSignOperation.fromChainName =
            ( optsSignOperation.imaState.chainProperties.sc.strChainName
                ? optsSignOperation.imaState.chainProperties.sc.strChainName
                : "" );
        optsSignOperation.targetChainID = optsSignOperation.imaState.chainProperties.mn.chainId;
        optsSignOperation.fromChainID = optsSignOperation.imaState.chainProperties.sc.chainId;
    } else if( optsSignOperation.strDirection == "S2S" ) {
        if( !optsSignOperation.joExtraSignOpts )
            throw new Error( "No S2S signing options provided" );
        optsSignOperation.targetChainName = optsSignOperation.joExtraSignOpts.chainNameDst;
        optsSignOperation.fromChainName = optsSignOperation.joExtraSignOpts.chainNameSrc;
        optsSignOperation.targetChainID = optsSignOperation.joExtraSignOpts.chainIdDst;
        optsSignOperation.fromChainID = optsSignOperation.joExtraSignOpts.chainIdSrc;
    } else {
        throw new Error( "CRITICAL ERROR: Failed doSignMessagesImpl() with " +
            `unknown direction ${optsSignOperation.strDirection}` );
    }
}

async function doSignProcessHandleCall(
    optsSignOperation: TSignOperationOptions, joParams: THandleVerifyAndSignCallDataParams,
    joCall: rpcCall.TRPCCall,
    joIn: TRPCInputSkaleIMAVerifyAndSign, joOut: rpcCallFormats.TRPCOutputBasicFields,
    i: number ): Promise < void > {
    const imaState: state.TIMAState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber );
    const joNode = optsSignOperation.jarrNodes[i];
    const strNodeURL = optsSignOperation.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {}), sequence ID is {}",
        strNodeURL, i, optsSignOperation.jarrNodes.length, joNode.nodeID,
        optsSignOperation.sequenceId );
    ++optsSignOperation.joGatheringTracker.nCountReceived;
    optsSignOperation.details.trace(
        "{p}{} Got answer from {bright}(node #{} via {url} for transfer from chain {} " +
        "to chain {} with params {}, answer is {}, sequence ID is {}",
        optsSignOperation.strLogPrefix, log.generateTimestampString( null, true ),
        "skale_imaVerifyAndSign", i, strNodeURL, optsSignOperation.fromChainName,
        optsSignOperation.targetChainName, joParams, joOut, optsSignOperation.sequenceId );
    if( !joOut || typeof joOut !== "object" || ( !( "result" in joOut ) ) ||
        !joOut.result || typeof joOut.result !== "object" ||
        ( "error" in joOut && joOut.error ) ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        optsSignOperation.details.critical(
            "{p}S-Chain node {} reported wallet error: {err}, sequence ID is ",
            optsSignOperation.strLogPrefix, strNodeDescColorized,
            owaspUtils.extractErrorMessage( joOut, "unknown wallet error(1)" ),
            optsSignOperation.sequenceId );
        await joCall.disconnect();
        return;
    }
    optsSignOperation.details.debug( "{p}Node {} sign result: {}",
        optsSignOperation.strLogPrefix, joNode.nodeID, joOut.result ? joOut.result : null );
    try {
        if( joOut.result.signResult.signatureShare.length > 0 &&
            joOut.result.signResult.status === 0
        ) {
            const nZeroBasedNodeIndex = joNode.imaInfo.thisNodeIndex - 1;
            // partial BLS verification for one participant
            let bNodeSignatureOKay = false; // initially assume signature is wrong
            optsSignOperation.strLogPrefixA =
                `${optsSignOperation.strDirection}/BLS/#${nZeroBasedNodeIndex}: `;
            try {
                const cntSuccess = optsSignOperation.arrSignResults.length;
                if( cntSuccess > optsSignOperation.nCountOfBlsPartsToCollect ) {
                    ++optsSignOperation.joGatheringTracker.nCountSkipped;
                    optsSignOperation.details.notice(
                        "{p}Will ignore sign result for node {} because {}/{} threshold number " +
                        "of BLS signature parts already gathered",
                        optsSignOperation.strLogPrefixA, nZeroBasedNodeIndex,
                        optsSignOperation.nThreshold, optsSignOperation.nCountOfBlsPartsToCollect );
                    await joCall.disconnect();
                    return;
                }
                const arrTmp = joOut.result.signResult.signatureShare.split( ":" );
                const joResultFromNode: TBLSSignResultBase = {
                    index: nZeroBasedNodeIndex.toString(),
                    signature: {
                        X: arrTmp[0],
                        Y: arrTmp[1]
                    }
                };
                optsSignOperation.details.trace( "{p}Will verify sign result for node {}",
                    optsSignOperation.strLogPrefixA, nZeroBasedNodeIndex );
                if( !optsSignOperation.imaState.joSChainNetworkInfo )
                    throw new Error( "No own S-Chain network information" );
                const joPublicKey = discoverPublicKeyByIndex( nZeroBasedNodeIndex,
                    optsSignOperation.imaState.joSChainNetworkInfo, optsSignOperation.details,
                    true );
                if( !joPublicKey )
                    throw new Error( `No BLS public key for node ${nZeroBasedNodeIndex}` );
                if( performBlsVerifyI(
                    optsSignOperation.details, optsSignOperation.strDirection,
                    nZeroBasedNodeIndex, joResultFromNode,
                    optsSignOperation.jarrMessages,
                    optsSignOperation.nIdxCurrentMsgBlockStart,
                    optsSignOperation.strFromChainName,
                    joPublicKey
                ) ) {
                    optsSignOperation.details.success(
                        "{p}Got successful BLS verification result for node {} with index {}",
                        optsSignOperation.strLogPrefixA, joNode.nodeID, nZeroBasedNodeIndex );
                    bNodeSignatureOKay = true; // node verification passed
                } else {
                    optsSignOperation.details.error( "{p} BLS verification failed",
                        optsSignOperation.strLogPrefixA );
                }
            } catch ( err ) {
                optsSignOperation.details.critical(
                    "{p}S-Chain node {} partial signature fail from with index {}" +
                    ", error is {err}, sequence ID is {}, stack is:\n{stack}",
                    optsSignOperation.strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                    err, optsSignOperation.sequenceId, err );
            }
            if( bNodeSignatureOKay ) {
                optsSignOperation.arrSignResults.push( {
                    index: nZeroBasedNodeIndex.toString(),
                    signature: splitSignatureShare( joOut.result.signResult.signatureShare ),
                    fromNode: joNode, // extra, not needed for bls_glue
                    signResult: joOut.result.signResult
                } );
            } else
                ++optsSignOperation.joGatheringTracker.nCountErrors;
        }
    } catch ( err ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        optsSignOperation.details.critical(
            "{p}S-Chain node {} signature fail from node {}, error is {err}" +
            ", sequence ID is {}, stack is:\n{stack}",
            optsSignOperation.strLogPrefix, strNodeDescColorized, joNode.nodeID,
            err, optsSignOperation.sequenceId, err );
    }
    await joCall.disconnect();
}

async function doSignProcessOneImpl(
    i: number, optsSignOperation: TSignOperationOptions ): Promise < void > {
    const imaState: state.TIMAState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber );
    const joNode = optsSignOperation.jarrNodes[i];
    const strNodeURL = optsSignOperation.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {}), sequence ID is {}",
        strNodeURL, i, optsSignOperation.jarrNodes.length, joNode.nodeID,
        optsSignOperation.sequenceId );
    const rpcCallOpts: rpcCall.TRPCCallOpts | null = null;
    const joCall =
        await rpcCall.create( strNodeURL, rpcCallOpts
        ).catch( function( err: Error | string ): void {
            ++optsSignOperation.joGatheringTracker.nCountReceived;
            ++optsSignOperation.joGatheringTracker.nCountErrors;
            optsSignOperation.details.error(
                "{p}JSON RPC call(doSignProcessOneImpl) to S-Chain node {} failed, " +
                "RPC call failed, error is: {err}, sequence ID is {}",
                optsSignOperation.strLogPrefix, strNodeDescColorized,
                err, optsSignOperation.sequenceId );
            if( joCall )
                joCall.disconnect().then( function(): void {} ).catch( function(): void {} );
        } );
    if( !joCall )
        return;
    await doSignConfigureChainAccessParams( optsSignOperation );
    const joParams: THandleVerifyAndSignCallDataParams = {
        direction: optsSignOperation.strDirection,
        startMessageIdx: optsSignOperation.nIdxCurrentMsgBlockStart,
        dstChainName: optsSignOperation.targetChainName,
        srcChainName: optsSignOperation.fromChainName,
        dstChainID: optsSignOperation.targetChainID.toString(),
        srcChainID: optsSignOperation.fromChainID.toString(),
        messages: optsSignOperation.jarrMessages,
        qa: {
            skaledNumber: owaspUtils.toInteger( i ),
            sequenceId: optsSignOperation.sequenceId,
            ts: log.generateTimestampString( null, false )
        }
    };
    optsSignOperation.details.trace(
        "{p}{} Will invoke {bright} to node #{} via {url} for transfer from chain {} " +
        "to chain {} with params {}, sequence ID is {}", optsSignOperation.strLogPrefix,
        log.generateTimestampString( null, true ), "skale_imaVerifyAndSign", i, strNodeURL,
        optsSignOperation.fromChainName, optsSignOperation.targetChainName,
        joParams, optsSignOperation.sequenceId );
    const joIn: TRPCInputSkaleIMAVerifyAndSign =
        { method: "skale_imaVerifyAndSign", params: joParams };
    const joOut = await joCall.call( joIn );
    await doSignProcessHandleCall( optsSignOperation, joParams, joCall, joIn, joOut, i );
}

async function doSignMessagesImpl(
    nTransferLoopCounter: number, strDirection: string,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joExtraSignOpts?: loop.TExtraSignOpts | null, fn?: IMA.TFunctionAfterSigningMessages
): Promise < void > {
    const optsSignOperation: TSignOperationOptions = {
        imaState: state.get(),
        nTransferLoopCounter,
        strDirection,
        jarrMessages,
        nIdxCurrentMsgBlockStart,
        strFromChainName,
        joExtraSignOpts,
        // eslint-disable-next-line n/handle-callback-err
        fn: fn ?? async function(
            err: Error | string | null,
            jarrMessages: state.TIMAMessage[] | string[],
            joGlueResult: TBLSGlueResult | null
        ): Promise < void > {},
        bHaveResultReportCalled: false,
        strLogPrefix: "",
        strLogPrefixA: "",
        strLogPrefixB: "",
        joGatheringTracker: {
            nCountReceivedPrevious: 0,
            nCountReceived: 0,
            nCountErrors: 0,
            nCountSkipped: 0,
            nWaitIntervalStepMilliseconds: 500,
            nWaitIntervalMaxSteps: 10 * 60 * 3 // 10 is 1 second
        },
        arrSignResults: [],
        details: log.globalStream(),
        strGatheredDetailsName: "",
        sequenceId: "",
        jarrNodes: [],
        nThreshold: 1,
        nParticipants: 1,
        nCountOfBlsPartsToCollect: 1,
        errGathering: null,
        targetChainName: "",
        fromChainName: "",
        targetChainID: -4,
        fromChainID: -4
    };
    optsSignOperation.strLogPrefix = `${optsSignOperation.strDirection}/#` +
        `${optsSignOperation.nTransferLoopCounter} Sign msgs via ` +
        `${optsSignOperation.imaState.isCrossImaBlsMode ? "IMA agent" : "skaled"}: `;
    optsSignOperation.joGatheringTracker = {
        nCountReceivedPrevious: 0,
        nCountReceived: 0,
        nCountErrors: 0,
        nCountSkipped: 0,
        nWaitIntervalStepMilliseconds: 500,
        nWaitIntervalMaxSteps: 10 * 60 * 3 // 10 is 1 second
    };
    optsSignOperation.details = optsSignOperation.imaState.isDynamicLogInBlsSigner
        ? log.globalStream()
        : log.createMemoryStream();
    optsSignOperation.strGatheredDetailsName = optsSignOperation.strDirection + "-" +
        "doSignMessagesImpl-#" + optsSignOperation.nTransferLoopCounter +
        "-" + optsSignOperation.strFromChainName + "-msg#" +
        optsSignOperation.nIdxCurrentMsgBlockStart;
    try {
        if( !( await prepareSignMessagesImpl( optsSignOperation ) ) )
            return;
        for( let i = 0; i < optsSignOperation.jarrNodes.length; ++i ) {
            const cntSuccess = optsSignOperation.arrSignResults.length;
            if( cntSuccess >= optsSignOperation.nCountOfBlsPartsToCollect ) {
                optsSignOperation.details.trace(
                    "{p}{} Stop invoking {bright} for transfer from chain {} at #{} because " +
                    "successfully gathered count is reached ", optsSignOperation.strLogPrefix,
                    log.generateTimestampString( null, true ), "skale_imaVerifyAndSign",
                    strFromChainName, i, cntSuccess );
                break;
            }
            doSignProcessOneImpl( i, optsSignOperation )
                .then( function(): void {} ).catch( function( err ): void {
                    log.error(
                        "Failed single BLS sign processing, reported error is: {err}", err );
                } );
        }
        await gatherSigningStartImpl( optsSignOperation );
        await gatherSigningFinishImpl( optsSignOperation );
    } catch ( err ) {
        if( optsSignOperation.details ) {
            optsSignOperation.details.critical( "Failed BLS sign due to generic " +
                "flow exception: {err}, stack is:\n{stack}", err, err );
        }
        if( !optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn( "Failed BLS sign due to exception: " +
                `${owaspUtils.extractErrorMessage( err )}`, optsSignOperation.jarrMessages, null
            ).catch( function( err: Error | string ): void {
                log.critical( "Failed BLS sign due to error-reporting callback exception: {err}",
                    err );
                if( optsSignOperation.details ) {
                    optsSignOperation.details.critical(
                        "Failed BLS sign due to error-reporting callback exception: {err}",
                        err );
                    optsSignOperation.details.exposeDetailsTo(
                        log.globalStream(), optsSignOperation.strGatheredDetailsName, false );
                    optsSignOperation.details.close();
                }
            } );
        }
    }
    optsSignOperation.details.success( "{p} completed", optsSignOperation.strGatheredDetailsName );
    if( optsSignOperation.details ) {
        optsSignOperation.details.exposeDetailsTo(
            log.globalStream(), optsSignOperation.strGatheredDetailsName, true );
        optsSignOperation.details.close();
    }
}

export async function doSignMessagesM2S(
    nTransferLoopCounter: number,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joExtraSignOpts?: loop.TExtraSignOpts | null, fn?: IMA.TFunctionAfterSigningMessages
): Promise < void > {
    await doSignMessagesImpl(
        nTransferLoopCounter, "M2S",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts, fn );
}

export async function doSignMessagesS2M(
    nTransferLoopCounter: number,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joExtraSignOpts?: loop.TExtraSignOpts | null, fn?: IMA.TFunctionAfterSigningMessages
): Promise < void > {
    await doSignMessagesImpl(
        nTransferLoopCounter, "S2M",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts, fn );
}

export async function doSignMessagesS2S(
    nTransferLoopCounter: number,
    jarrMessages: state.TIMAMessage[], nIdxCurrentMsgBlockStart: number, strFromChainName: string,
    joExtraSignOpts?: loop.TExtraSignOpts | null, fn?: IMA.TFunctionAfterSigningMessages
): Promise < void > {
    await doSignMessagesImpl(
        nTransferLoopCounter, "S2S",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts, fn );
}

async function prepareSignU256( optsSignU256: TSignU256Options ): Promise < boolean > {
    optsSignU256.details.debug( "{p}Will sign {} value...",
        optsSignU256.strLogPrefix, optsSignU256.u256 );
    optsSignU256.details.trace( "{p}Will query to sign {} skaled node(s)...",
        optsSignU256.strLogPrefix, optsSignU256.jarrNodes.length );
    if( !optsSignU256.imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    optsSignU256.nThreshold = discoverBlsThreshold( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.nParticipants =
        discoverBlsParticipants( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.details.trace( "{p}Discovered BLS threshold is {}.",
        optsSignU256.strLogPrefix, optsSignU256.nThreshold );
    optsSignU256.details.trace( "{p}Discovered number of BLS participants is {}.",
        optsSignU256.strLogPrefix, optsSignU256.nParticipants );
    if( !checkBlsThresholdAndBlsParticipants(
        optsSignU256.nThreshold,
        optsSignU256.nParticipants,
        "prepare sign-U256",
        optsSignU256.details ) ) {
        await optsSignU256.fn(
            "signature error(1, u256), S-Chain information " +
            "was not discovered properly and BLS threshold/participants are unknown",
            [ optsSignU256.u256 ], null );
        return false;
    }
    optsSignU256.nCountOfBlsPartsToCollect = optsSignU256.nThreshold;
    optsSignU256.details.trace( "{p}Will(optsSignU256.u256) collect {} from {} nodes",
        optsSignU256.strLogPrefix, optsSignU256.nCountOfBlsPartsToCollect,
        optsSignU256.jarrNodes.length );
    return true;
}

async function doSignU256OneImplHandleCallResult(
    i: number, optsSignU256: TSignU256Options, joCall: rpcCall.TRPCCall,
    joIn: TRPCInputBLSSignU256, joOut: rpcCallFormats.TRPCOutputBasicFields
): Promise < void > {
    const imaState: state.TIMAState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber );
    const joNode = optsSignU256.jarrNodes[i];
    const strNodeURL = optsSignU256.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {})",
        strNodeURL, i, optsSignU256.jarrNodes.length, joNode.nodeID );
    ++optsSignU256.joGatheringTracker.nCountReceived;
    optsSignU256.details.trace( "{p}Did invoked {} for to sign value {}, answer is: {}",
        optsSignU256.strLogPrefix, "skale_imaBSU256", optsSignU256.u256.toString(), joOut );
    const isWithError: boolean = !!( ( "error" in joOut && joOut.error ) );
    if( !joOut || typeof joOut !== "object" || ( !( "result" in joOut ) ) ||
        isWithError || !joOut.result || typeof joOut.result !== "object" ||
        ( !( "signature" in joOut.result ) ) || joOut.result.signature != "object"
    ) {
        ++optsSignU256.joGatheringTracker.nCountErrors;
        const strErrorMessage =
            owaspUtils.extractErrorMessage( joOut, "unknown wallet error(2)" );
        optsSignU256.details.error( "{p}S-Chain node {} reported wallet error: {err}",
            optsSignU256.strLogPrefix, strNodeDescColorized, strErrorMessage );
        await joCall.disconnect();
        return;
    }
    optsSignU256.details.trace( "{p}Node {} sign result: ",
        optsSignU256.strLogPrefix, joNode.nodeID, joOut.result ? joOut.result : null );
    try {
        if( joOut.result.signResult.signatureShare.length > 0 &&
            joOut.result.signResult.status === 0
        ) {
            const nZeroBasedNodeIndex = joNode.imaInfo.thisNodeIndex - 1;
            // partial BLS verification for one participant
            let bNodeSignatureOKay = false; // initially assume signature is wrong
            const strLogPrefixA = `BLS/#${nZeroBasedNodeIndex}: `;
            try {
                const cntSuccess = optsSignU256.arrSignResults.length;
                if( cntSuccess > optsSignU256.nCountOfBlsPartsToCollect ) {
                    ++optsSignU256.joGatheringTracker.nCountSkipped;
                    optsSignU256.details.notice(
                        "{p}Will ignore sign result for node {} because {}/{} threshold " +
                        "number of BLS signature parts already gathered", strLogPrefixA,
                        nZeroBasedNodeIndex, optsSignU256.nThreshold,
                        optsSignU256.nCountOfBlsPartsToCollect );
                    return;
                }
                const arrTmp = joOut.result.signResult.signatureShare.split( ":" );
                const joResultFromNode: TBLSSignResultBase = {
                    index: nZeroBasedNodeIndex.toString(),
                    signature: { X: arrTmp[0], Y: arrTmp[1] }
                };
                optsSignU256.details.trace( "{p}Will verify sign result for node {}",
                    strLogPrefixA, nZeroBasedNodeIndex );
                if( !optsSignU256.imaState.joSChainNetworkInfo )
                    throw new Error( "No own S-Chain network information" );
                const joPublicKey = discoverPublicKeyByIndex( nZeroBasedNodeIndex,
                    optsSignU256.imaState.joSChainNetworkInfo, optsSignU256.details,
                    true );
                if( !joPublicKey )
                    throw new Error( `No BLS public key for node ${nZeroBasedNodeIndex}` );
                if( performBlsVerifyIU256(
                    optsSignU256.details, nZeroBasedNodeIndex, joResultFromNode,
                    optsSignU256.u256, joPublicKey ) ) {
                    optsSignU256.details.success(
                        "{p}Got successful BLS verification result for node {} " +
                        "with index {}", strLogPrefixA, joNode.nodeID,
                        nZeroBasedNodeIndex );
                    bNodeSignatureOKay = true; // node verification passed
                } else {
                    optsSignU256.details.error( "{p} BLS u256 one node verify failed",
                        strLogPrefixA );
                }
            } catch ( err ) {
                optsSignU256.details.critical(
                    "{p}S-Chain node {} sign CRITICAL ERROR: partial signature fail from " +
                    "with index {}, error is {err}, stack is:\n{stack}",
                    strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                    err, err );
            }
            if( bNodeSignatureOKay ) {
                optsSignU256.arrSignResults.push( {
                    index: nZeroBasedNodeIndex.toString(),
                    signature:
                        splitSignatureShare( joOut.result.signResult.signatureShare ),
                    fromNode: joNode, // extra, not needed for bls_glue
                    signResult: joOut.result.signResult
                } );
            } else
                ++optsSignU256.joGatheringTracker.nCountErrors;
        }
    } catch ( err ) {
        ++optsSignU256.joGatheringTracker.nCountErrors;
        optsSignU256.details.critical(
            "{p}S-Chain node {} signature fail from node {}, error is {err}, " +
            "stack is:\n{stack}", optsSignU256.strLogPrefix,
            strNodeDescColorized, joNode.nodeID, err, err );
    }
    await joCall.disconnect();
}

async function doSignU256OneImpl(
    i: number, optsSignU256: TSignU256Options ): Promise < boolean> {
    const imaState: state.TIMAState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber );
    const joNode = optsSignU256.jarrNodes[i];
    const strNodeURL = optsSignU256.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {})",
        strNodeURL, i, optsSignU256.jarrNodes.length, joNode.nodeID );
    const rpcCallOpts: rpcCall.TRPCCallOpts | null = null;
    let joCall: rpcCall.TRPCCall | null = null;
    try {
        joCall = await rpcCall.create( strNodeURL, rpcCallOpts );
        if( !joCall )
            throw new Error( `Failed to create JSON RPC call object to ${strNodeURL}` );
        optsSignU256.details.trace( "{p}Will invoke skale_imaBSU256 for to sign value {}",
            optsSignU256.strLogPrefix, optsSignU256.u256.toString() );
        const joIn: TRPCInputBLSSignU256 = {
            method: "skale_imaBSU256",
            params: {
                valueToSign: optsSignU256.u256 // must be 0x string, came from outside 0x string
            }
        };
        const joOut = await joCall.call( joIn );
        await doSignU256OneImplHandleCallResult( i, optsSignU256, joCall, joIn, joOut );
        return true;
    } catch ( err ) {
        ++optsSignU256.joGatheringTracker.nCountReceived;
        ++optsSignU256.joGatheringTracker.nCountErrors;
        optsSignU256.details.error(
            "{p}JSON RPC call(doSignU256OneImpl) to S-Chain node {} failed, RPC call was " +
            "not created, error is: {err}",
            optsSignU256.strLogPrefix, strNodeDescColorized, err );
        if( joCall )
            await joCall.disconnect();
        return true;
    }
}

async function gatherSigningCheckFinish256(
    optsSignU256: TSignU256Options ): Promise < boolean > {
    const cntSuccess = optsSignU256.arrSignResults.length;
    if( optsSignU256.joGatheringTracker.nCountReceivedPrevious !=
        optsSignU256.joGatheringTracker.nCountReceived ) {
        optsSignU256.details.debug(
            "BLS u256 - BLS signature gathering progress updated, now have {} BLS parts " +
            "of needed {} arrived, have {} success(es) and {} error(s)",
            optsSignU256.joGatheringTracker.nCountReceived,
            optsSignU256.nCountOfBlsPartsToCollect, cntSuccess,
            optsSignU256.joGatheringTracker.nCountErrors );
        optsSignU256.joGatheringTracker.nCountReceivedPrevious =
            owaspUtils.toInteger( optsSignU256.joGatheringTracker.nCountReceived );
    }
    if( cntSuccess < optsSignU256.nCountOfBlsPartsToCollect )
        return false;
    const strLogPrefixB = "BLS u256/Summary: ";
    const strError = null;
    const joGlueResult: TBLSGlueResult | null = performBlsGlueU256(
        optsSignU256.details, optsSignU256.u256, optsSignU256.arrSignResults );
    if( joGlueResult ) {
        optsSignU256.details.success( "{p}Got BLS glue u256 result: {}",
            strLogPrefixB, joGlueResult );
        if( optsSignU256.imaState.strPathBlsVerify.length > 0 ) {
            if( !optsSignU256.imaState.joSChainNetworkInfo )
                throw new Error( "No own S-Chain network information" );
            const joCommonPublicKey = discoverCommonPublicKey(
                optsSignU256.details, optsSignU256.imaState.joSChainNetworkInfo, false );
            if( !joCommonPublicKey ) {
                if( !optsSignU256.imaState.joSChainNetworkInfo )
                    throw new Error( "No own S-Chain network information" );
                const strError = "No BLS common public key";
                optsSignU256.details.error( "{p}{}", strLogPrefixB, strError );
            } else if( performBlsVerifyU256( optsSignU256.details, joGlueResult,
                optsSignU256.u256, joCommonPublicKey ) ) {
                const strSuccessfulResultDescription =
                    "Got successful summary BLS u256 verification result";
                optsSignU256.details.success( "{p}{}", strLogPrefixB,
                    strSuccessfulResultDescription );
            } else {
                const strError = "BLS verification failed";
                optsSignU256.details.error( "{p}BLS verification failure:{}",
                    strLogPrefixB, strError );
            }
        }
    } else {
        const strError = "BLS u256 glue failed, no glue result arrived";
        optsSignU256.details.error(
            "{p}Problem(1) in BLS u256 sign result handler: {err}",
            strLogPrefixB, strError );
    }
    optsSignU256.details.trace(
        "Will call signed-256 answer-sending callback {}, u256 is {}, " +
        "glue result is {}", strError ? ( " with error " + log.fmtError( "{err}", strError ) ) : "",
        optsSignU256.u256, joGlueResult );
    optsSignU256.fn( strError, [ optsSignU256.u256 ], joGlueResult )
        .catch( function( err: Error | string ): void {
            optsSignU256.details.critical(
                "Problem(2) in BLS u256 sign result handler: {err}", err );
            optsSignU256.errGathering = "Problem(2) in BLS u256 sign result " +
                `handler: ${owaspUtils.extractErrorMessage( err )}`;
        } );
    return true;
}

async function gatherSigningCheckOverflow256(
    optsSignU256: TSignU256Options ): Promise < boolean > {
    if( optsSignU256.joGatheringTracker.nCountReceived < optsSignU256.jarrNodes.length )
        return false;
    optsSignU256.fn(
        "signature error(2, u256), got " +
        `${optsSignU256.joGatheringTracker.nCountErrors} errors(s) for ` +
        `${optsSignU256.jarrNodes.length}  node(s)`, [ optsSignU256.u256 ], null
    ).catch( function( err: Error | string ): void {
        const cntSuccess = optsSignU256.arrSignResults.length;
        optsSignU256.details.critical(
            "Problem(3) in BLS u256 sign result handler, not enough successful BLS " +
            "signature parts({} when all attempts done, error details: {err}",
            cntSuccess, err );
        optsSignU256.errGathering = "Problem(3) in BLS u256 sign result handler, not " +
            `enough successful BLS signature parts(${cntSuccess} when all attempts ` +
            `done, error details: ${owaspUtils.extractErrorMessage( err )}`;
    } );
    return true;
}

async function doSignU256Gathering( optsSignU256: TSignU256Options ): Promise < void > {
    optsSignU256.details.debug( "{p}Waiting for BLS glue result ", optsSignU256.strLogPrefix );
    optsSignU256.errGathering = null;
    for( let idxStep = 0; idxStep < optsSignU256.joGatheringTracker.nWaitIntervalMaxSteps;
        ++idxStep ) {
        await threadInfo.sleep(
            optsSignU256.joGatheringTracker.nWaitIntervalStepMilliseconds );
        if( await gatherSigningCheckFinish256( optsSignU256 ) )
            return;
        if( await gatherSigningCheckOverflow256( optsSignU256 ) )
            return;
    }
    // timeout
    optsSignU256.fn(
        "signature error(3, u256), got " +
        `${optsSignU256.joGatheringTracker.nCountErrors}  errors(s) for ` +
        `${optsSignU256.jarrNodes.length} node(s)`,
        [ optsSignU256.u256 ], null
    ).catch( function( err: Error | string ): void {
        const cntSuccess = optsSignU256.arrSignResults.length;
        optsSignU256.details.error(
            "Problem(4) in BLS u256 sign result handler, not enough successful BLS " +
            "signature parts({}) and timeout reached, error details: {err",
            cntSuccess, err );
        optsSignU256.errGathering = "Problem(4) in BLS u256 sign result handler, not " +
            `enough successful BLS signature parts(${cntSuccess}) and timeout ` +
            `reached, error details: ${owaspUtils.extractErrorMessage( err )}`;
    } );
}

export async function doSignU256(
    u256bn: owaspUtils.ethersMod.BigNumber | string, details: log.TLoggerBase,
    fn: IMA.TFunctionAfterSigningMessages ): Promise < void > {
    const u256: string = ( typeof u256bn === "string" )
        ? u256bn
        : owaspUtils.ensureStartsWith0x( u256bn.toHexString() );
    const optsSignU256: TSignU256Options = {
        u256,
        fn,
        details,
        imaState: state.get(),
        strLogPrefix: "Sign u256: ",
        joGatheringTracker: {
            nCountReceivedPrevious: 0,
            nCountReceived: 0,
            nCountErrors: 0,
            nCountSkipped: 0,
            nWaitIntervalStepMilliseconds: 500,
            nWaitIntervalMaxSteps: 10 * 60 * 3 // 10 is 1 second
        },
        arrSignResults: [],
        jarrNodes: [],
        nThreshold: 1,
        nParticipants: 1,
        nCountOfBlsPartsToCollect: 1,
        errGathering: null
    };
    if( !optsSignU256.imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    optsSignU256.jarrNodes = optsSignU256.imaState.joSChainNetworkInfo.network;
    optsSignU256.details.trace( "{p}Invoking signing u256 procedure...",
        optsSignU256.strLogPrefix );
    optsSignU256.fn = optsSignU256.fn || function(): void {};
    if( !(
        optsSignU256.imaState.strPathBlsGlue.length > 0 &&
        optsSignU256.imaState.joSChainNetworkInfo
    ) ) {
        optsSignU256.details.warning( "{p}BLS u256 signing is unavailable",
            optsSignU256.strLogPrefix );
        await optsSignU256.fn( "BLS u256 signing is unavailable", [ optsSignU256.u256 ], null );
        return;
    }
    if( !( await prepareSignU256( optsSignU256 ) ) )
        return;
    for( let i = 0; i < optsSignU256.jarrNodes.length; ++i )
        await doSignU256OneImpl( i, optsSignU256 );
    await doSignU256Gathering( optsSignU256 );
    optsSignU256.details.trace( "Will await BLS u256 sign result..." );
    if( optsSignU256.errGathering ) {
        optsSignU256.details.error( "Failed BLS u256 sign result awaiting: {err}",
            optsSignU256.errGathering.toString() );
        return;
    }
    optsSignU256.details.information( "{p}Completed signing u256 procedure",
        optsSignU256.strLogPrefix );
}

export async function doVerifyReadyHash(
    strMessageHash: string, nZeroBasedNodeIndex: number,
    signature: TSignResult, isExposeOutput: boolean
): Promise < boolean > {
    const imaState: state.TIMAState = state.get();
    const strDirection = "RAW";
    const strLogPrefix = `${strDirection}/BLS/#${nZeroBasedNodeIndex}: `;
    const details = log.createMemoryStream();
    let isSuccess = false;
    if( !signature.signatureShare )
        throw new Error( "No valid BLS signatureShare to verify" );
    const arrTmp = signature.signatureShare.split( ":" );
    const joResultFromNode: TBLSSignResultBase = {
        index: nZeroBasedNodeIndex.toString(),
        signature: {
            X: arrTmp[0],
            Y: arrTmp[1]
        }
    };
    if( !imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( !checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "verify ready hash", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function(): void { shell.rm( "-rf", strActionDir ); };
    let strOutput = "";
    try {
        const joPublicKey = discoverPublicKeyByIndex(
            nZeroBasedNodeIndex, imaState.joSChainNetworkInfo, details, true );
        details.trace( "{p}BLS node #{} - hashed verify message is {}",
            strLogPrefix, nZeroBasedNodeIndex, strMessageHash );
        const joMsg = { message: strMessageHash };
        details.debug( "{p}BLS node #{} - composed {} using hash {} and glue {} and public key {}",
            strLogPrefix, nZeroBasedNodeIndex, joMsg, strMessageHash,
            joResultFromNode, joPublicKey );
        const strSignResultFileName =
            strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand =
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName;
        details.trace( "{p}Will execute node #{} BLS verify command: {}",
            strLogPrefix, nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } )
            .toString( "utf8" );
        details.trace( "{p}BLS node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        isSuccess = true;
    } catch ( err ) {
        details.critical( "{p}BLS node #{} verify error, error description is: {err}" +
                ", stack is:\n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err );
        details.critical( "{p}BLS node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
        isSuccess = false;
    }
    if( isExposeOutput || !isSuccess )
        details.exposeDetailsTo( log.globalStream(), "BLS-raw-verifier", isSuccess );
    details.close();
    return isSuccess;
}

async function doSignReadyHashHandleCallResult(
    strLogPrefix: string, details: log.TLoggerBase,
    strMessageHash: string, isExposeOutput: boolean, joCall: rpcCall.TRPCCall,
    joIn: TRPCInputBLSSignMessageHash, joOut: TRPCOutputBLSSignMessageHashResult
): Promise < TSignResult > {
    details.trace( "{p}Call to ", "SGX done, answer is: {}", strLogPrefix, joOut );
    let joSignResult: TSignResult = joOut as any;
    if( joOut.result != null && joOut.result != undefined &&
        typeof joOut.result === "object" )
        joSignResult = joOut.result;
    if( joOut.signResult != null && joOut.signResult != undefined &&
        typeof joOut.signResult === "object" )
        joSignResult = joOut.signResult;
    if( !joSignResult ) {
        const strError = "No signature arrived";
        details.error( "{p}BLS-sign(1) finished with error: {err}", strLogPrefix, strError );
        await joCall.disconnect();
        throw new Error( strError );
    }
    if( "errorMessage" in joSignResult &&
        typeof joSignResult.errorMessage === "string" &&
        joSignResult.errorMessage.length > 0
    ) {
        const strError = `BLS-sign finished with error: ${joSignResult.errorMessage};`;
        details.error( "{p}BLS-sign(2) finished with error: {err}",
            strLogPrefix, joSignResult.errorMessage );
        await joCall.disconnect();
        throw new Error( strError );
    }
    joSignResult.error = null;
    await joCall.disconnect();
    return joSignResult;
}

export async function doSignReadyHash(
    strMessageHash: string, isExposeOutput: boolean ): Promise < TSignResult | null > {
    const imaState: state.TIMAState = state.get();
    const strLogPrefix = "";
    const details: log.TLoggerBase = log.createMemoryStream();
    let joSignResult: TSignResult | null = null;
    let joCall: rpcCall.TRPCCall | null = null;
    try {
        if( !imaState.joSChainNetworkInfo )
            throw new Error( "No own S-Chain network information" );
        const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
        const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
        details.debug( "{p}Will BLS-sign ready hash.", strLogPrefix );
        details.trace( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
        details.trace( "{p}Discovered number of BLS participants is {}.",
            strLogPrefix, nParticipants );
        details.trace( "{p}hash value to sign is {}", strLogPrefix, strMessageHash );
        if( !checkBlsThresholdAndBlsParticipants(
            nThreshold, nParticipants, "sign ready hash", details ) )
            return null;
        let joAccount: state.TAccount = imaState.chainProperties.sc.joAccount;
        if( !joAccount.strSgxURL ) {
            joAccount = imaState.chainProperties.mn.joAccount;
            if( !joAccount.strSgxURL )
                throw new Error( "SGX URL is unknown, cannot sign U256" );
            if( !joAccount.strBlsKeyName )
                throw new Error( "BLS keys name is unknown, cannot sign U256" );
        }
        let rpcCallOpts: rpcCall.TRPCCallOpts | null = null;
        if( "strPathSslKey" in joAccount && typeof joAccount.strPathSslKey === "string" &&
            joAccount.strPathSslKey.length > 0 && "strPathSslCert" in joAccount &&
            typeof joAccount.strPathSslCert === "string" && joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                cert: fs.readFileSync( joAccount.strPathSslCert, "utf8" ),
                key: fs.readFileSync( joAccount.strPathSslKey, "utf8" )
            };
        } else
            details.warning( "Will sign via SGX without SSL options" );
        joCall = await rpcCall.create( joAccount.strSgxURL, rpcCallOpts );
        if( !joCall )
            throw new Error( `Failed to create JSON RPC call object to ${joAccount.strSgxURL}` );
        const joIn: TRPCInputBLSSignMessageHash = {
            jsonrpc: "2.0",
            id: utils.randomCallID(),
            method: "blsSignMessageHash",
            params: {
                keyShareName: joAccount.strBlsKeyName,
                messageHash: strMessageHash,
                n: nParticipants,
                t: nThreshold
            }
        };
        details.trace( "{p}Will invoke SGX with call data {}", strLogPrefix, joIn );
        const joOut = await joCall.call( joIn );
        joSignResult = await doSignReadyHashHandleCallResult(
            strLogPrefix, details, strMessageHash, isExposeOutput, joCall, joIn, joOut );
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        joSignResult = {
            errorMessage: strError,
            status: -1,
            error: strError
        };
        details.error( "{p}JSON RPC call to SGX failed, error is: {err}, stack is:\n{stack}",
            strLogPrefix, err, err );
        if( joCall )
            await joCall.disconnect();
    }
    const isSuccess = !!( (
        joSignResult && typeof joSignResult === "object" && !joSignResult.error ) );
    if( isExposeOutput || !isSuccess )
        details.exposeDetailsTo( log.globalStream(), "BLS-raw-signer", isSuccess );
    details.close();
    return joSignResult;
}

async function prepareHandlingOfSkaleImaVerifyAndSign(
    optsHandleVerifyAndSign: THandleVerifyAndSignOptions ): Promise < boolean > {
    optsHandleVerifyAndSign.details.debug( "{p}Will verify and sign {}",
        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.joCallData );
    optsHandleVerifyAndSign.nIdxCurrentMsgBlockStart =
        optsHandleVerifyAndSign.joCallData.params.startMessageIdx;
    optsHandleVerifyAndSign.strFromChainName =
        optsHandleVerifyAndSign.joCallData.params.srcChainName;
    optsHandleVerifyAndSign.strToChainName =
        optsHandleVerifyAndSign.joCallData.params.dstChainName;
    optsHandleVerifyAndSign.strFromChainID =
        optsHandleVerifyAndSign.joCallData.params.srcChainID;
    optsHandleVerifyAndSign.strToChainID =
        optsHandleVerifyAndSign.joCallData.params.dstChainID;
    optsHandleVerifyAndSign.strDirection =
        optsHandleVerifyAndSign.joCallData.params.direction;
    optsHandleVerifyAndSign.jarrMessages =
        optsHandleVerifyAndSign.joCallData.params.messages;
    optsHandleVerifyAndSign.details.trace(
        "{p}{bright} verification algorithm will work for transfer from chain {}/{} to " +
        "chain {}/{} and work with array of message(s) {}",
        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
        optsHandleVerifyAndSign.strFromChainName, optsHandleVerifyAndSign.strFromChainID,
        optsHandleVerifyAndSign.strToChainName, optsHandleVerifyAndSign.strToChainID,
        optsHandleVerifyAndSign.jarrMessages );
    if( !optsHandleVerifyAndSign.imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    optsHandleVerifyAndSign.nThreshold =
        discoverBlsThreshold( optsHandleVerifyAndSign.imaState.joSChainNetworkInfo );
    optsHandleVerifyAndSign.nParticipants =
        discoverBlsParticipants( optsHandleVerifyAndSign.imaState.joSChainNetworkInfo );
    optsHandleVerifyAndSign.details.debug(
        "{p}{bright} verification algorithm discovered BLS threshold is {}.",
        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
        optsHandleVerifyAndSign.nThreshold );
    optsHandleVerifyAndSign.details.debug(
        "{p}{bright} verification algorithm discovered number of BLS participants is {}.",
        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
        optsHandleVerifyAndSign.nParticipants );
    if( !checkBlsThresholdAndBlsParticipants(
        optsHandleVerifyAndSign.nThreshold,
        optsHandleVerifyAndSign.nParticipants,
        "prepare handling of skale_imaVerifyAndSign",
        optsHandleVerifyAndSign.details ) )
        return false;
    optsHandleVerifyAndSign.strMessageHash = owaspUtils.removeStarting0x( keccak256Message(
        optsHandleVerifyAndSign.jarrMessages,
        optsHandleVerifyAndSign.nIdxCurrentMsgBlockStart,
        optsHandleVerifyAndSign.strFromChainName
    ) );
    optsHandleVerifyAndSign.details.debug(
        "{p}{bright} verification algorithm message hash to sign is {}",
        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
        optsHandleVerifyAndSign.strMessageHash );
    return true;
}

async function prepareS2sOfSkaleImaVerifyAndSign(
    optsHandleVerifyAndSign: THandleVerifyAndSignOptions ): Promise < void > {
    const strSChainNameSrc = optsHandleVerifyAndSign.joCallData.params.srcChainName;
    const strSChainNameDst = optsHandleVerifyAndSign.joCallData.params.dstChainName;
    optsHandleVerifyAndSign.details.trace(
        "{p}{bright} verification algorithm will use for source chain name {} and destination " +
        "chain name {}", optsHandleVerifyAndSign.strLogPrefix,
        optsHandleVerifyAndSign.strDirection, strSChainNameSrc, strSChainNameDst );
    const arrSChainsCached: skaleObserver.TSChainInformation[] =
        skaleObserver.getLastCachedSChains();
    if( !arrSChainsCached || arrSChainsCached.length == 0 ) {
        throw new Error( `Could not handle ${optsHandleVerifyAndSign.strDirection} ` +
            "skale_imaVerifyAndSign(1), no S-Chains in SKALE NETWORK observer cached yet, " +
            "try again later" );
    }

    let joSChainSrc: skaleObserver.TSChainInformation | null = null;
    let strUrlSrcSChain: string | null = null;
    for( let idxSChain = 0; idxSChain < arrSChainsCached.length; ++idxSChain ) {
        const joSChain = arrSChainsCached[idxSChain];
        if( joSChain.name.toString() == strSChainNameSrc.toString() ) {
            joSChainSrc = joSChain;
            strUrlSrcSChain = skaleObserver.pickRandomSChainUrl( joSChain );
            break;
        }
    }
    if( joSChainSrc == null || strUrlSrcSChain == null || strUrlSrcSChain.length == 0 ) {
        throw new Error( `Could not handle ${optsHandleVerifyAndSign.strDirection} ` +
            "skale_imaVerifyAndSign(2), failed to discover source chain access parameters, " +
            "try again later" );
    }
    optsHandleVerifyAndSign.details.trace(
        "{p}{bright} verification algorithm discovered source chain URL is {url}, chain name " +
        "is {}, chain id is {}", optsHandleVerifyAndSign.strLogPrefix,
        optsHandleVerifyAndSign.strDirection, strUrlSrcSChain,
        joSChainSrc.name, joSChainSrc.chainId );
    optsHandleVerifyAndSign.joExtraSignOpts = {
        ethersProviderSrc: owaspUtils.getEthersProviderFromURL( strUrlSrcSChain ),
        chainNameSrc: optsHandleVerifyAndSign.strFromChainName,
        chainNameDst: optsHandleVerifyAndSign.strToChainName,
        chainIdSrc: optsHandleVerifyAndSign.strFromChainID,
        chainIdDst: optsHandleVerifyAndSign.strToChainID
    };
}

async function handleBlsSignMessageHashResult(
    optsHandleVerifyAndSign: THandleVerifyAndSignOptions, joCallData: THandleVerifyAndSignCallData,
    joAccount: state.TAccount, joCall: rpcCall.TRPCCall,
    joIn: TRPCInputBLSSignMessageHash, joOut: TRPCOutputBLSSignMessageHashResult
): Promise < TSignResult > {
    optsHandleVerifyAndSign.details.trace( "{p}{bright} Call to SGX done, " +
        "answer is: {}", optsHandleVerifyAndSign.strLogPrefix,
    optsHandleVerifyAndSign.strDirection, joOut );
    let joSignResult: TSignResult = joOut as any;
    if( joOut.result != null && joOut.result != undefined &&
        typeof joOut.result === "object" )
        joSignResult = joOut.result;
    if( joOut.signResult != null && joOut.signResult != undefined &&
        typeof joOut.signResult === "object" )
        joSignResult = joOut.signResult;
    if( "qa" in optsHandleVerifyAndSign.joCallData.params &&
        optsHandleVerifyAndSign.joCallData.params.qa )
        optsHandleVerifyAndSign.joRetVal.qa = optsHandleVerifyAndSign.joCallData.params.qa;
    if( !joSignResult ) {
        const strError = "No signature arrived";
        optsHandleVerifyAndSign.joRetVal.error = strError;
        optsHandleVerifyAndSign.details.error(
            "{p}BLS-sign(1) finished with error: {err}",
            optsHandleVerifyAndSign.strLogPrefix, strError );
        await joCall.disconnect();
        throw new Error( strError );
    }
    if( "errorMessage" in joSignResult &&
        typeof joSignResult.errorMessage === "string" &&
        joSignResult.errorMessage.length > 0
    ) {
        optsHandleVerifyAndSign.isSuccess = false;
        const strError = `BLS-sign finished with error: ${joSignResult.errorMessage};`;
        optsHandleVerifyAndSign.joRetVal.error = strError;
        optsHandleVerifyAndSign.details.error(
            "{p}BLS-sign(2) finished with error: {err}",
            optsHandleVerifyAndSign.strLogPrefix, joSignResult.errorMessage );
        await joCall.disconnect();
        throw new Error( strError );
    }
    optsHandleVerifyAndSign.isSuccess = true;
    optsHandleVerifyAndSign.joRetVal.result = { signResult: joSignResult } as any;
    if( "qa" in optsHandleVerifyAndSign.joCallData.params &&
    optsHandleVerifyAndSign.joCallData.params.qa )
        optsHandleVerifyAndSign.joRetVal.qa = optsHandleVerifyAndSign.joCallData.params.qa;
    await joCall.disconnect();
    return joSignResult;
}

export async function handleSkaleImaVerifyAndSign(
    joCallData: THandleVerifyAndSignCallData ): Promise < object | null > {
    const optsHandleVerifyAndSign: THandleVerifyAndSignOptions = {
        joCallData,
        imaState: state.get(),
        strLogPrefix: "",
        details: log.createMemoryStream(),
        joRetVal: {},
        isSuccess: false,
        nIdxCurrentMsgBlockStart: 0,
        strFromChainName: "",
        strToChainName: "",
        strFromChainID: "",
        strToChainID: "",
        strDirection: "",
        jarrMessages: [],
        strMessageHash: "",
        joExtraSignOpts: null,
        nThreshold: 1,
        nParticipants: 1
    };
    let joCall: rpcCall.TRPCCall | null = null;
    try {
        if( !( await prepareHandlingOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign ) ) )
            return null;
        optsHandleVerifyAndSign.joExtraSignOpts = null;
        if( optsHandleVerifyAndSign.strDirection == "S2S" )
            await prepareS2sOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign );

        await checkCorrectnessOfMessagesToSign(
            optsHandleVerifyAndSign.details, optsHandleVerifyAndSign.strLogPrefix,
            optsHandleVerifyAndSign.strDirection, optsHandleVerifyAndSign.jarrMessages,
            optsHandleVerifyAndSign.nIdxCurrentMsgBlockStart,
            optsHandleVerifyAndSign.joExtraSignOpts
        );
        optsHandleVerifyAndSign.details.debug( "{p}Will BLS-sign verified messages.",
            optsHandleVerifyAndSign.strLogPrefix );
        let joAccount = optsHandleVerifyAndSign.imaState.chainProperties.sc.joAccount;
        if( !joAccount.strSgxURL ) {
            joAccount = optsHandleVerifyAndSign.imaState.chainProperties.mn.joAccount;
            if( !joAccount.strSgxURL )
                throw new Error( "SGX URL is unknown, cannot sign(handle) IMA message(s)" );
            if( !joAccount.strBlsKeyName )
                throw new Error( "BLS keys name is unknown, cannot sign IMA message(s)" );
        }
        let rpcCallOpts: rpcCall.TRPCCallOpts | null = null;
        if( "strPathSslKey" in joAccount && typeof joAccount.strPathSslKey === "string" &&
            joAccount.strPathSslKey.length > 0 && "strPathSslCert" in joAccount &&
            typeof joAccount.strPathSslCert === "string" && joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                cert: fs.readFileSync( joAccount.strPathSslCert, "utf8" ),
                key: fs.readFileSync( joAccount.strPathSslKey, "utf8" )
            };
        } else
            optsHandleVerifyAndSign.details.warning( "Will sign via SGX without SSL options" );
        joCall = await rpcCall.create( joAccount.strSgxURL, rpcCallOpts );
        if( !joCall )
            throw new Error( `Failed to create JSON RPC call object to ${joAccount.strSgxURL}` );

        const joIn: TRPCInputBLSSignMessageHash = {
            jsonrpc: "2.0",
            id: utils.randomCallID(),
            method: "blsSignMessageHash",
            params: {
                keyShareName: joAccount.strBlsKeyName,
                messageHash: optsHandleVerifyAndSign.strMessageHash,
                n: optsHandleVerifyAndSign.nParticipants,
                t: optsHandleVerifyAndSign.nThreshold
            }
        };
        optsHandleVerifyAndSign.details.trace(
            "{p}{bright} verification algorithm will invoke SGX with call data {}",
            optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection, joIn );
        const joOut = await joCall.call( joIn );
        await handleBlsSignMessageHashResult(
            optsHandleVerifyAndSign, joCallData, joAccount, joCall, joIn, joOut );
    } catch ( err ) {
        optsHandleVerifyAndSign.details.error(
            "{p}{bright}JSON RPC call(handleSkaleImaVerifyAndSign) " +
            "to SGX failed, RPC call failed, error is: {err}",
            optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection, err );
        if( joCall )
            await joCall.disconnect();
        throw new Error( "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, " +
            `RPC call failed, error is: ${owaspUtils.extractErrorMessage( err )}` );
    }
    optsHandleVerifyAndSign.details.exposeDetailsTo(
        log.globalStream(), "IMA messages verifier/signer", optsHandleVerifyAndSign.isSuccess );
    optsHandleVerifyAndSign.details.close();
    return optsHandleVerifyAndSign.joRetVal;
}

async function handleSkaleImaBSU256Prepare( optsBSU256: TBSU256Options ): Promise < boolean > {
    optsBSU256.details.debug( "{p}Will U256-BLS-sign {}",
        optsBSU256.strLogPrefix, optsBSU256.joCallData );
    if( !optsBSU256.imaState.joSChainNetworkInfo )
        throw new Error( "No own S-Chain network information" );
    optsBSU256.nThreshold = discoverBlsThreshold( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.nParticipants = discoverBlsParticipants( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.details.trace( "{p}Discovered BLS threshold is {}.",
        optsBSU256.strLogPrefix, optsBSU256.nThreshold );
    optsBSU256.details.trace( "{p}Discovered number of BLS participants is {}.",
        optsBSU256.strLogPrefix, optsBSU256.nParticipants );
    if( !checkBlsThresholdAndBlsParticipants(
        optsBSU256.nThreshold,
        optsBSU256.nParticipants,
        "handle BSU256Prepare",
        optsBSU256.details ) )
        return false;
    optsBSU256.u256 = optsBSU256.joCallData.params.valueToSign;
    optsBSU256.details.trace( "{p}U256 original value is {}",
        optsBSU256.strLogPrefix, optsBSU256.u256 );
    optsBSU256.strMessageHash = keccak256U256( optsBSU256.u256, true );
    optsBSU256.details.trace( "{p}hash of U256 value to sign is {}",
        optsBSU256.strLogPrefix, optsBSU256.strMessageHash );
    optsBSU256.details.trace( "{p}Will BLS-sign U256.", optsBSU256.strLogPrefix );
    if( !optsBSU256.joAccount )
        throw new Error( "No account to perform blsSignMessageHash for U256" );
    optsBSU256.joAccount = optsBSU256.imaState.chainProperties.sc.joAccount;
    if( !optsBSU256.joAccount.strSgxURL ) {
        optsBSU256.joAccount = optsBSU256.imaState.chainProperties.mn.joAccount;
        if( !optsBSU256.joAccount.strSgxURL )
            throw new Error( "SGX URL is unknown, cannot sign U256" );
        if( !optsBSU256.joAccount.strBlsKeyName )
            throw new Error( "BLS keys name is unknown, cannot sign U256" );
    }
    return true;
}

async function handleBlsSignMessageHash256Result(
    optsBSU256: TBSU256Options, joCallData: TBSU256CallData,
    joCall: rpcCall.TRPCCall,
    joIn: TRPCInputBLSSignMessageHash,
    joOut: TRPCOutputBLSSignMessageHashResult
): Promise < object > {
    optsBSU256.details.trace( "{p}Call to SGX done, answer is: {}",
        optsBSU256.strLogPrefix, joOut );
    let joSignResult: TSignResult = joOut as any;
    if( joOut.result != null && joOut.result != undefined &&
        typeof joOut.result === "object" )
        joSignResult = joOut.result;
    if( joOut.signResult != null && joOut.signResult != undefined &&
        typeof joOut.signResult === "object" )
        joSignResult = joOut.signResult;
    if( !joSignResult ) {
        const strError = "No signature arrived";
        optsBSU256.joRetVal.error = strError;
        optsBSU256.details.error(
            "{p}U256/BLS-sign(1) finished with error: {err}", optsBSU256.strLogPrefix, strError );
        await joCall.disconnect();
        throw new Error( strError );
    }
    if( "errorMessage" in joSignResult &&
        typeof joSignResult.errorMessage === "string" &&
        joSignResult.errorMessage.length > 0 ) {
        optsBSU256.isSuccess = false;
        const strError = "BLS-sign finished with " +
            `error: ${joSignResult.errorMessage}`;
        optsBSU256.joRetVal.error = strError;
        optsBSU256.details.error( "{p}U256/BLS-sign(2) finished with error: {err}",
            optsBSU256.strLogPrefix, joSignResult.errorMessage );
        await joCall.disconnect();
        throw new Error( strError );
    }
    optsBSU256.isSuccess = true;
    optsBSU256.joRetVal.result = { signResult: joSignResult } as any;
    if( "qa" in optsBSU256.joCallData.params )
        optsBSU256.joRetVal.qa = optsBSU256.joCallData.params.qa;
    await joCall.disconnect();
    return joSignResult;
}

export async function handleSkaleImaBSU256(
    joCallData: TBSU256CallData ): Promise < object | null > {
    const optsBSU256: TBSU256Options = {
        joCallData,
        imaState: state.get(),
        strLogPrefix: "",
        details: log.createMemoryStream(),
        joRetVal: {},
        isSuccess: false,
        nThreshold: 1,
        nParticipants: 1,
        u256: null,
        strMessageHash: "",
        joAccount: null
    };
    let joCall: rpcCall.TRPCCall | null = null;
    try {
        if( !( await handleSkaleImaBSU256Prepare( optsBSU256 ) ) )
            return null;
        if( !optsBSU256.joAccount )
            throw new Error( "No account to perform blsSignMessageHash for U256" );
        let rpcCallOpts: rpcCall.TRPCCallOpts | null = null;
        if( "strPathSslKey" in optsBSU256.joAccount &&
            typeof optsBSU256.joAccount.strPathSslKey === "string" &&
            optsBSU256.joAccount.strPathSslKey.length > 0 &&
            "strPathSslCert" in optsBSU256.joAccount &&
            typeof optsBSU256.joAccount.strPathSslCert === "string" &&
            optsBSU256.joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                cert: fs.readFileSync( optsBSU256.joAccount.strPathSslCert, "utf8" ),
                key: fs.readFileSync( optsBSU256.joAccount.strPathSslKey, "utf8" )
            };
        } else
            optsBSU256.details.warning( "Will sign via SGX without SSL options" );
        joCall = await rpcCall.create( optsBSU256.joAccount.strSgxURL, rpcCallOpts );
        if( !joCall ) {
            throw new Error( "Failed to create JSON RPC call object " +
                `to ${optsBSU256.joAccount.strSgxURL}` );
        }
        const joIn: TRPCInputBLSSignMessageHash = {
            jsonrpc: "2.0",
            id: utils.randomCallID(),
            method: "blsSignMessageHash",
            params: {
                keyShareName: optsBSU256.joAccount.strBlsKeyName,
                messageHash: optsBSU256.strMessageHash,
                n: optsBSU256.nParticipants,
                t: optsBSU256.nThreshold
            }
        };
        optsBSU256.details.trace( "{p}Will invoke SGX with call data {}",
            optsBSU256.strLogPrefix, joIn );
        const joOut = await joCall.call( joIn );
        await handleBlsSignMessageHash256Result( optsBSU256, joCallData, joCall, joIn, joOut );
    } catch ( err ) {
        optsBSU256.isSuccess = false;
        const strError = owaspUtils.extractErrorMessage( err );
        optsBSU256.joRetVal.error = strError;
        optsBSU256.details.error(
            "{p}JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
            "RPC call failed, error is: {err}", optsBSU256.strLogPrefix, err );
        if( joCall )
            await joCall.disconnect();
        throw new Error( "JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
            `RPC call failed, error is: ${owaspUtils.extractErrorMessage( err )}` );
    }
    optsBSU256.details.exposeDetailsTo(
        log.globalStream(), "U256-BLS-signer", optsBSU256.isSuccess );
    optsBSU256.details.close();
    return optsBSU256.joRetVal;
}
