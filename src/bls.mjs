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
 * @file bls.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as fs from "fs";
import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as childProcessModule from "child_process";
import * as rpcCall from "./rpcCall.mjs";
import * as shellModule from "shelljs";
import * as imaUtils from "./utils.mjs";
import * as sha3Module from "sha3";
import * as skaleObserver from "./observer.mjs";
import * as discoveryTools from "./discoveryTools.mjs";

import * as state from "./state.mjs";
import { randomCallID } from "./socketUtils.mjs";

const shell = shellModule.default;

const Keccak = sha3Module.Keccak;

const sleep =
    ( milliseconds ) => { return new Promise( resolve => setTimeout( resolve, milliseconds ) ); };

const gSecondsMessageVerifySendTimeout = 2 * 60;

async function withTimeout( strDescription, promise, seconds ) {
    strDescription = strDescription || "withTimeout()";
    let resultError = null, isComplete = false;
    promise.catch( function( err ) {
        isComplete = true;
        resultError =
            new Error( `${strDescription}error: ${owaspUtils.extractErrorMessage( err )}` );
    } ).finally( function() {
        isComplete = true;
    } );
    for( let idxWaitStep = 0; idxWaitStep < seconds; ++ idxWaitStep ) {
        if( isComplete )
            break;
        await sleep( 1000 );
    }
    if( resultError )
        throw resultError;
    if( ! isComplete )
        throw new Error( `${strDescription} reached limit of ${seconds} second(s)` );
};

function discoverBlsThreshold( joSChainNetworkInfo ) {
    const imaState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    if( ! joSChainNetworkInfo )
        return -1;
    const jarrNodes = joSChainNetworkInfo.network;
    for( let i = 0; i < jarrNodes.length; ++i ) {
        const joNode = jarrNodes[i];
        if( discoveryTools.isSChainNodeFullyDiscovered( joNode ) )
            return joNode.imaInfo.t;
    }
    return -1;
}

function discoverBlsParticipants( joSChainNetworkInfo ) {
    const imaState = state.get();
    joSChainNetworkInfo = joSChainNetworkInfo || imaState.joSChainNetworkInfo;
    if( ! joSChainNetworkInfo )
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
    nThreshold, nParticipants, strOperation, details ) {
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

function discoverPublicKeyByIndex( nNodeIndex, joSChainNetworkInfo, details, isThrowException ) {
    details = details || log;
    const imaState = state.get();
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

function discoverCommonPublicKey( joSChainNetworkInfo, isThrowException ) {
    const imaState = state.get();
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

function hexPrepare( strHex, isInvertBefore, isInvertAfter ) {
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

function stringToKeccak256( s ) {
    const strU256 = owaspUtils.ethersMod.ethers.utils.id( s );
    return hexPrepare( strU256, true, true );
}

function arrayToKeccak256( arrBytes ) {
    const k = new Keccak( 256 );
    k.update( imaUtils.toBuffer( arrBytes ) );
    const h = k.digest( "hex" );
    return imaUtils.hexToBytes( "0x" + h );
}

function keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName ) {
    let arrBytes = stringToKeccak256( strFromChainName );
    arrBytes = imaUtils.bytesConcat(
        arrBytes,
        hexPrepare(
            owaspUtils.ensureStartsWith0x( nIdxCurrentMsgBlockStart.toString( 16 ) ),
            false,
            false
        )
    );
    arrBytes = arrayToKeccak256( arrBytes );
    const cnt = jarrMessages.length;
    for( let i = 0; i < cnt; ++i ) {
        const joMessage = jarrMessages[i];

        let bytesSender = imaUtils.hexToBytes( joMessage.sender.toString() );
        bytesSender = imaUtils.bytesAlignLeftWithZeroes( bytesSender, 32 );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesSender );

        let bytesDestinationContract =
            imaUtils.hexToBytes( joMessage.destinationContract );
        bytesDestinationContract =
            imaUtils.bytesAlignLeftWithZeroes( bytesDestinationContract, 32 );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesDestinationContract );

        const bytesData = imaUtils.hexToBytes( joMessage.data );
        arrBytes = imaUtils.bytesConcat( arrBytes, bytesData );
        arrBytes = arrayToKeccak256( arrBytes );
    }
    return owaspUtils.ensureStartsWith0x( imaUtils.bytesToHex( arrBytes, false ) );
}

export function keccak256U256( u256, isHash ) {
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

export function keccak256ForPendingWorkAnalysis( nNodeNumber, strLoopWorkType, isStart, ts ) {
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

function splitSignatureShare( signatureShare ) {
    const jarr = signatureShare.split( ":" );
    if( jarr.length < 2 )
        throw new Error( `Failed to split signatureShare=${signatureShare.toString()}` );
    return { X: jarr[0], Y: jarr[1] };
}

function getBlsGlueTmpDir() {
    const strTmpDir = "/tmp/ima-bls-glue";
    shell.mkdir( "-p", strTmpDir );
    return strTmpDir;
}

function allocBlsTmpActionDir() {
    const strActionDir =
        getBlsGlueTmpDir() + "/" + imaUtils.replaceAll( imaUtils.uuid(), "-", "" );
    if( ! fs.existsSync( strActionDir ) )
        fs.mkdirSync( strActionDir , { recursive: true } );
    return strActionDir;
}

function performBlsGlue(
    details, strDirection, jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName, arrSignResults
) {
    const imaState = state.get();
    const strLogPrefix = `${strDirection}/BLS/Glue: `;
    let joGlueResult = null;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    details.debug( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
    details.debug( "{p}Discovered number of BLS participants is {}.", strLogPrefix, nParticipants );
    if( ! checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS glue", details ) )
        return null;
    const strMessageHash =
        owaspUtils.removeStarting0x(
            keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName )
        );
    details.debug( "{p}Message hash to sign is {}", strLogPrefix, strMessageHash );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( "{p}{sunny} will work in {} director with {} sign results...",
        strLogPrefix, "performBlsGlue", strActionDir, arrSignResults.length );
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo = arrSignResults[i];
            if( ( !jo ) || typeof jo != "object" )
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
        strOutput = childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        joGlueResult = imaUtils.jsonFileLoad( strActionDir + "/glue-result.json" );
        details.trace( "{p}BLS glue result is: {}", strLogPrefix, joGlueResult );
        if( "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( "{p}BLS glue success", strLogPrefix );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( "{p}Computing G1 hash point...", strLogPrefix );
            const strPath = strActionDir + "/hash.json";
            details.trace( "{p}Saving {} file...", strLogPrefix, strPath );
            imaUtils.jsonFileSave( strPath, { "message": strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( "{p}Will execute HashG1 command {}", strLogPrefix, strHasG1Command );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } );
            details.trace( "{p}HashG1 output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
            const joResultHashG1 = imaUtils.jsonFileLoad( strActionDir + "/g1.json" );
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
            strLogPrefix, err, err.stack );
        details.critical( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        fnShellRestore();
        joGlueResult = null;
    }
    return joGlueResult;
}

function performBlsGlueU256( details, u256, arrSignResults ) {
    const imaState = state.get();
    const strLogPrefix = "BLS/Glue: ";
    let joGlueResult = null;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    details.debug( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
    details.debug( "{p}Discovered number of BLS participants is {}.", strLogPrefix, nParticipants );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS glue-256", details ) )
        return null;
    details.trace( "{p}Original long message is {}", strLogPrefix, keccak256U256( u256, false ) );
    const strMessageHash = keccak256U256( u256, true );
    details.trace( "{p}Message hash to sign is {}", strLogPrefix, strMessageHash );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( "{p}performBlsGlueU256 will work in {} director with {} sign results...",
        strLogPrefix, strActionDir, arrSignResults.length );
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo = arrSignResults[i];
            if( ( !jo ) || typeof jo != "object" )
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
        strOutput = childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS glue output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
        joGlueResult = imaUtils.jsonFileLoad( strActionDir + "/glue-result.json" );
        details.trace( "{p}BLS glue result is:\n{}", strLogPrefix, joGlueResult );
        if( "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( "{p}BLS glue success", strLogPrefix );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( "{p}Computing G1 hash point...", strLogPrefix );
            const strPath = strActionDir + "/hash.json";
            details.trace( "{p}Saving {} file...", strLogPrefix, strPath );
            imaUtils.jsonFileSave( strPath, { "message": strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( "{p}Will execute HashG1 command: {}", strLogPrefix, strHasG1Command );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } );
            details.trace( "{p}HashG1 output is:\n{raw}", strLogPrefix, strOutput || "<<EMPTY>>" );
            const joResultHashG1 = imaUtils.jsonFileLoad( strActionDir + "/g1.json" );
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
            err, err.stack );
        details.critical( "BLS glue output is:\n{raw}", strOutput || "<<EMPTY>>" );
        fnShellRestore();
        joGlueResult = null;
    }
    return joGlueResult;
}

function performBlsVerifyI(
    details,
    strDirection,
    nZeroBasedNodeIndex,
    joResultFromNode,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joPublicKey
) {
    if( !joResultFromNode )
        return true;
    const imaState = state.get();
    const strLogPrefix = `${strDirection}/BLS/#${nZeroBasedNodeIndex}: `;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify-I", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
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
        const joMsg = { "message": strMessageHash };
        details.debug(
            "{p}BLS node #{} - composed  {} composed from {} using glue {} and public key {}",
            strLogPrefix, nZeroBasedNodeIndex, joMsg, jarrMessages, joResultFromNode, joPublicKey );
        const strSignResultFileName = strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName
            ;
        details.trace( "{p}Will execute node #{} BLS verify command: {}", strLogPrefix,
            nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.critical( "{p}BLS node #{} verify error:, error description is: {err}, " +
            "stack is: \n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err.stack );
        details.critical( "{p}BLS node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerifyIU256(
    details,
    nZeroBasedNodeIndex,
    joResultFromNode,
    u256,
    joPublicKey
) {
    if( ! joResultFromNode )
        return true;
    const imaState = state.get();
    const strLogPrefix = `BLS/#${nZeroBasedNodeIndex}: `;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify-I-U256", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        const joMsg = { "message": keccak256U256( u256, true ) };
        details.debug( "{p}BLS u256 node #{} verify message {} composed from {} using glue {} " +
            "and public key {}", strLogPrefix, nZeroBasedNodeIndex, joMsg, u256,
        joResultFromNode, joPublicKey );
        const strSignResultFileName = strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName
            ;
        details.trace( "{p}Will execute node #{} BLS u256 verify command: {}",
            strLogPrefix, nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS u256 node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS u256 node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS u256 node #{} verify error, error description is: {err}, " +
            "stack is: \n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err.stack );
        details.error( "{p}BLS u256 node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerify(
    details,
    strDirection,
    joGlueResult,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joCommonPublicKey
) {
    if( !joGlueResult )
        return true;
    const imaState = state.get();
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
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
        const joMsg = { "message": strMessageHash };
        details.debug(
            "{p}BLS/summary verify message - composed JSON {} from messages array {}" +
            " using glue {} and common public key {}",
            strLogPrefix, joMsg, jarrMessages, joGlueResult, joCommonPublicKey );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( "{p}BLS common public key for verification is:\n{}",
            strLogPrefix, joCommonPublicKey );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json"
            ;
        details.trace( "{p}Will execute BLS/summary verify command: {}",
            strLogPrefix, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS/summary verify success", strLogPrefix );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS/summary verify error description is: {err}, stack is:\n{stack}",
            strLogPrefix, err, err.stack );
        details.error( "BLS/summary verify output is:\n{raw}", strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

function performBlsVerifyU256( details, joGlueResult, u256, joCommonPublicKey ) {
    if( !joGlueResult )
        return true;
    const imaState = state.get();
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS verify-U256", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    const strLogPrefix = "BLS u256/Summary: ";
    try {
        const joMsg = { "message": keccak256U256( u256, true ) };
        details.debug(
            "{p}BLS u256/summary verify message {} composed from {} using glue {}" +
            " and common public key {}",
            strLogPrefix, joMsg, u256, joGlueResult, joCommonPublicKey );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( "{p}BLS u256 common public key for verification is:\n{}",
            strLogPrefix, joCommonPublicKey );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json"
            ;
        details.trace( "{p}Will execute BLS u256/summary verify command: {}",
            strLogPrefix, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS u256/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS u256/summary verify success", strLogPrefix );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( "{p}BLS u256/summary  error description is: {err}, stack is: \n{stack}",
            strLogPrefix, err, err.stack );
        details.error( "{p}BLS u256/summary verify output is:\n{raw}", strLogPrefix,
            strOutput || "<<EMPTY>>" );
        fnShellRestore();
    }
    return false;
}

async function checkCorrectnessOfMessagesToSign(
    details,
    strLogPrefix,
    strDirection,
    jarrMessages,
    nIdxCurrentMsgBlockStart,
    joExtraSignOpts
) {
    const imaState = state.get();
    let joMessageProxy = null, joAccount = null, joChainName = null;
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
        joChainName = joExtraSignOpts.chainNameDst;
        const ethersProvider =
            ( "ethersProviderSrc" in joExtraSignOpts &&
                joExtraSignOpts.ethersProviderSrc )
                ? joExtraSignOpts.ethersProviderSrc
                : null
                ;
        if( ! ethersProvider ) {
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
        strLogPrefix, strDirection, "verifyOutgoingMessageData", joMessageProxy.address,
        strCallerAccountAddress, jarrMessages.length, jarrMessages,
        nIdxCurrentMsgBlockStart, joChainName );
    let cntBadMessages = 0, i = 0;
    const cnt = jarrMessages.length;
    if( strDirection == "S2M" || strDirection == "S2S" ) {
        for( i = 0; i < cnt; ++i ) {
            const joMessage = jarrMessages[i];
            const idxMessage = nIdxCurrentMsgBlockStart + i;
            try {
                details.trace(
                    "{p}{bright} Will validate message {} of {}, real message index is {}, " +
                    "source contract is {}, destination contract is {}, message data is {}",
                    strLogPrefix, strDirection, i, cnt, idxMessage, joMessage.sender,
                    joMessage.destinationContract, joMessage.data );
                const outgoingMessageData = {
                    "dstChainHash": owaspUtils.ethersMod.ethers.utils.id( joChainName ),
                    "msgCounter": 0 + idxMessage,
                    "srcContract": joMessage.sender,
                    "dstContract": joMessage.destinationContract,
                    "data": joMessage.data
                };
                const isValidMessage = await joMessageProxy.callStatic.verifyOutgoingMessageData(
                    outgoingMessageData, { from: strCallerAccountAddress } );
                details.trace(
                    "{p}{bright} Got verification call result {}, real message index is: {}, " +
                    "saved msgCounter is: {}", strLogPrefix, strDirection,
                    isValidMessage, + idxMessage, outgoingMessageData.msgCounter );
                if( !isValidMessage ) {
                    throw new Error( "Bad message detected, " +
                        `message is: ${JSON.stringify( joMessage )}` );
                }
            } catch ( err ) {
                ++cntBadMessages;
                if( log.id != details.id ) {
                    log.critical(
                        "{p}{bright} Correctness validation failed for message {} sent to {}, " +
                        "message is: {}, error information: {err}, stack is:\n{stack}",
                        strLogPrefix, strDirection, idxMessage, joChainName, joMessage,
                        err, err.stack );
                }
                details.critical(
                    "{p}{bright} Correctness validation failed for message {} sent to {}, " +
                    "message is: {}, error information: {err}, stack is:\n{stack}",
                    strLogPrefix, strDirection, idxMessage, joChainName, joMessage,
                    err, err.stack );
            }
        }
    }
    // TODO: M2S - check events
    if( cntBadMessages > 0 ) {
        if( log.id != details.id ) {
            log.critical( "{p}Correctness validation failed for {} of {} message(s)",
                strLogPrefix, cntBadMessages, cnt );
        }
        details.critical( "{p}Correctness validation failed for {} of {} message(s)",
            strLogPrefix, cntBadMessages, cnt );
    } else
        details.success( "{p}Correctness validation passed for {} message(s)", strLogPrefix, cnt );

}

async function prepareSignMessagesImpl( optsSignOperation ) {
    optsSignOperation.fn = optsSignOperation.fn || function() {};
    optsSignOperation.sequenceId =
        owaspUtils.removeStarting0x(
            owaspUtils.ethersMod.ethers.utils.id( log.generateTimestampString( null, false ) )
        );
    optsSignOperation.jarrNodes =
        ( optsSignOperation.imaState.bSignMessages &&
            "joSChainNetworkInfo" in optsSignOperation.imaState &&
            typeof optsSignOperation.imaState.joSChainNetworkInfo == "object" &&
            "network" in optsSignOperation.imaState.joSChainNetworkInfo &&
            typeof optsSignOperation.imaState.joSChainNetworkInfo.network == "object"
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
            log, optsSignOperation.strGatheredDetailsName, false );
        optsSignOperation.details.close();
        await checkCorrectnessOfMessagesToSign(
            optsSignOperation.details, optsSignOperation.strLogPrefix,
            optsSignOperation.strDirection,
            optsSignOperation.jarrMessages,
            optsSignOperation.nIdxCurrentMsgBlockStart,
            optsSignOperation.joExtraSignOpts );
        await optsSignOperation.fn( null, optsSignOperation.jarrMessages );
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
    if( ! checkBlsThresholdAndBlsParticipants(
        optsSignOperation.nThreshold,
        optsSignOperation.nParticipants,
        "prepare sign messages " + optsSignOperation.strDirection,
        optsSignOperation.details ) ) {
        optsSignOperation.bHaveResultReportCalled = true;
        optsSignOperation.details.exposeDetailsTo(
            log, optsSignOperation.strGatheredDetailsName, false );
        optsSignOperation.details.close();
        await optsSignOperation.fn(
            "signature error(1), S-Chain information " +
            "was not discovered properly and BLS threshold/participants are unknown",
            optsSignOperation.jarrMessages );
        return false;
    }
    optsSignOperation.nCountOfBlsPartsToCollect = 0 + optsSignOperation.nThreshold;
    optsSignOperation.details.trace( "{p}Will BLS-collect {} from {} nodes, sequence ID is {}",
        optsSignOperation.strLogPrefix, optsSignOperation.nCountOfBlsPartsToCollect,
        optsSignOperation.jarrNodes.length, optsSignOperation.sequenceId );
    return true;
}

async function gatherSigningStartImpl( optsSignOperation ) {
    optsSignOperation.details.debug( "{p}Waiting for BLS glue result...",
        optsSignOperation.strLogPrefix );
    optsSignOperation.errGathering = null;
    optsSignOperation.promiseCompleteGathering = new Promise( ( resolve, reject ) => {
        const iv = setInterval( function() {
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
                    0 + optsSignOperation.joGatheringTracker.nCountReceived;
            }
            ++ optsSignOperation.joGatheringTracker.nWaitIntervalStepsDone;
            if( cntSuccess >= optsSignOperation.nCountOfBlsPartsToCollect ) {
                optsSignOperation.strLogPrefixB = `${optsSignOperation.strDirection} /# ` +
                    `${optsSignOperation.nTransferLoopCounter}/BLS/Summary: `;
                clearInterval( iv );
                let strError = null, strSuccessfulResultDescription = null;
                const joGlueResult = performBlsGlue( optsSignOperation.details,
                    optsSignOperation.strDirection, optsSignOperation.jarrMessages,
                    optsSignOperation.nIdxCurrentMsgBlockStart, optsSignOperation.strFromChainName,
                    optsSignOperation.arrSignResults );
                if( joGlueResult ) {
                    optsSignOperation.details.success( "{p}Got BLS glue result: {}",
                        optsSignOperation.strLogPrefixB, joGlueResult );
                    if( optsSignOperation.imaState.strPathBlsVerify.length > 0 ) {
                        const joCommonPublicKey = discoverCommonPublicKey(
                            optsSignOperation.imaState.joSChainNetworkInfo, false );
                        if( ! joCommonPublicKey ) {
                            strError = "No BLS common public key";
                            optsSignOperation.details.error( "{p}{err}",
                                optsSignOperation.strLogPrefixB, strError );
                        } else if( performBlsVerify(
                            optsSignOperation.details, optsSignOperation.strDirection,
                            joGlueResult, optsSignOperation.jarrMessages,
                            optsSignOperation.nIdxCurrentMsgBlockStart,
                            optsSignOperation.strFromChainName,
                            joCommonPublicKey
                        ) ) {
                            strSuccessfulResultDescription =
                                "Got successful summary BLS verification result";
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
                    if( log.id != optsSignOperation.details.id ) {
                        log.error( "{p}Problem(1) in BLS sign result handler: {err}",
                            optsSignOperation.strLogPrefixB, strError );
                    }
                }
                optsSignOperation.details.trace(
                    "Will call signed-hash answer-sending callback {}, messages is(are) {}, " +
                    "glue result is {}", strError ? log.fmtError( " with error {}", strError ) : "",
                    optsSignOperation.jarrMessages, joGlueResult );
                optsSignOperation.fn(
                    strError, optsSignOperation.jarrMessages, joGlueResult )
                    .catch( ( err ) => {
                        if( log.id != optsSignOperation.details.id )
                            log.critical( "Problem(2) in BLS sign result handler: {err}", err );
                        optsSignOperation.details.critical(
                            "Problem(2) in BLS sign result handler: {err}", err );
                        optsSignOperation.errGathering = "Problem(2) in BLS sign " +
                            `result handler: ${owaspUtils.extractErrorMessage( err )}`;
                        return;
                    } );
                optsSignOperation.bHaveResultReportCalled = true;
                if( strError ) {
                    optsSignOperation.errGathering = strError;
                    reject( new Error( optsSignOperation.errGathering ) );
                } else
                    resolve();
                return;
            }
            if( optsSignOperation.joGatheringTracker.nCountReceived >=
                    optsSignOperation.jarrNodes.length ) {
                clearInterval( iv );
                optsSignOperation.fn(
                    `signature error(2), got ${optsSignOperation.joGatheringTracker.nCountErrors}` +
                    ` errors(s) for ${optsSignOperation.jarrNodes.length} node(s)`,
                    optsSignOperation.jarrMessages
                ).catch( ( err ) => {
                    const cntSuccess = optsSignOperation.arrSignResults.length;
                    optsSignOperation.details.error(
                        "Problem(3) in BLS sign result handler, not enough successful BLS " +
                        "signature parts({}) when all attempts done, error details: {err}",
                        cntSuccess, err );
                    if( log.id != optsSignOperation.details.id ) {
                        log.error(
                            "Problem(3) in BLS sign result handler, not enough successful BLS " +
                            "signature parts({}) when all attempts done, error details: {err}",
                            cntSuccess, err );
                    }
                    optsSignOperation.errGathering = "Problem(3) in BLS sign result handler, not " +
                        `enough successful BLS signature parts(${cntSuccess}) ` +
                        "when all attempts done, " +
                        `error details: ${owaspUtils.extractErrorMessage( err )}`;
                    reject( new Error( optsSignOperation.errGathering ) );
                } );
                optsSignOperation.bHaveResultReportCalled = true;
                return;
            }
            if( optsSignOperation.joGatheringTracker.nWaitIntervalStepsDone >=
                    optsSignOperation.joGatheringTracker.nWaitIntervalMaxSteps
            ) {
                clearInterval( iv );
                optsSignOperation.fn(
                    `signature error(3), got ${optsSignOperation.joGatheringTracker.nCountErrors}` +
                    ` errors(s) for ${optsSignOperation.jarrNodes.length} node(s)`,
                    optsSignOperation.jarrMessages
                ).catch( ( err ) => {
                    const cntSuccess = optsSignOperation.arrSignResults.length;
                    optsSignOperation.details.critical(
                        "Problem(4) in BLS sign result handler, not enough successful BLS " +
                        "signature parts({}) and timeout reached, error details: {err}",
                        cntSuccess, err );
                    if( log.id != optsSignOperation.details.id ) {
                        log.critical(
                            "Problem(4) in BLS sign result handler, not enough successful BLS " +
                            "signature parts({}) and timeout reached, error details: {err}",
                            cntSuccess, err );
                    }
                    optsSignOperation.errGathering = "Problem(4) in BLS sign result handler, not " +
                        `enough successful BLS signature parts(${cntSuccess}) ` +
                        "and timeout reached, " +
                        `error details: ${owaspUtils.extractErrorMessage( err )}`;
                    reject( new Error( optsSignOperation.errGathering ) );
                } );
                optsSignOperation.bHaveResultReportCalled = true;
                return;
            }
        }, optsSignOperation.joGatheringTracker.nWaitIntervalStepMilliseconds );
    } );
}

async function gatherSigningFinishImpl( optsSignOperation ) {
    optsSignOperation.details.trace( "{p}Will await for message BLS verification and sending...",
        optsSignOperation.strLogPrefix );
    await withTimeout(
        "BLS verification and sending",
        optsSignOperation.promiseCompleteGathering,
        gSecondsMessageVerifySendTimeout )
        .then( strSuccessfulResultDescription => {
            optsSignOperation.details.success(
                "BLS verification and sending promise awaited." );
        } ).catch( err => {
            if( log.id != optsSignOperation.details.id )
                log.error( "Failed to verify BLS and send message: {err}", err );
            optsSignOperation.details.error( "Failed to verify BLS and send message: {err}", err );
        } );
    if( optsSignOperation.errGathering ) {
        if( log.id != optsSignOperation.details.id ) {
            log.error( "Failed BLS sign result awaiting(1): {err}",
                optsSignOperation.errGathering.toString() );
        }
        optsSignOperation.details.error( "Failed BLS sign result awaiting(1): {err}",
            optsSignOperation.errGathering.toString() );
        if( ! optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn(
                `Failed to gather BLS signatures in ${optsSignOperation.jarrNodes.length} ` +
                "node(s), tracker data is: " +
                `${JSON.stringify( optsSignOperation.joGatheringTracker )} , ` +
                `error is: ${optsSignOperation.errGathering.toString()}`,
                optsSignOperation.jarrMessages
            ).catch( ( err ) => {
                const cntSuccess = optsSignOperation.arrSignResults.length;
                if( log.id != optsSignOperation.details.id ) {
                    log.error(
                        "Problem(5) in BLS sign result handler, not enough successful BLS " +
                        "signature parts({}) and timeout reached, error details: {err}",
                        cntSuccess, err );
                }
                optsSignOperation.details.error(
                    "Problem(5) in BLS sign result handler, not enough successful BLS " +
                    "signature parts({}) and timeout reached, error details: {err}",
                    cntSuccess, err );
                optsSignOperation.details.exposeDetailsTo(
                    log, optsSignOperation.strGatheredDetailsName, false );
                optsSignOperation.details.close();
                optsSignOperation.details = null;
            } );
        }
        return;
    }
    if( ! optsSignOperation.bHaveResultReportCalled ) {
        if( log.id != optsSignOperation.details.id ) {
            log.error( "Failed BLS sign result awaiting(2): {err}",
                "No reports were arrived" );
        }
        optsSignOperation.details.error( "Failed BLS sign result awaiting(2): {err}",
            "No reports were arrived" );
        optsSignOperation.bHaveResultReportCalled = true;
        await optsSignOperation.fn(
            `Failed to gather BLS signatures in ${optsSignOperation.jarrNodes.length}  node(s), ` +
            `tracker data is: ${JSON.stringify( optsSignOperation.joGatheringTracker )}`,
            optsSignOperation.jarrMessages
        ).catch( ( err ) => {
            if( log.id != optsSignOperation.details.id ) {
                log.error(
                    "Problem(6) in BLS sign result handler, not enough successful BLS signature " +
                    "parts({}) and timeout reached, error details: {err}", cntSuccess, err );
            }
            optsSignOperation.details.error(
                "Problem(6) in BLS sign result handler, not enough successful BLS signature " +
                "parts({}) and timeout reached, error details: {err}", cntSuccess, err );
            optsSignOperation.details.exposeDetailsTo(
                log, optsSignOperation.strGatheredDetailsName, false );
            optsSignOperation.details.close();
            optsSignOperation.details = null;
        } );
    }
}

async function doSignConfigureChainAccessParams( optsSignOperation ) {
    optsSignOperation.targetChainName = "";
    optsSignOperation.fromChainName = "";
    optsSignOperation.targetChainID = -4;
    optsSignOperation.fromChainID = -4;
    if( optsSignOperation.strDirection == "M2S" ) {
        optsSignOperation.targetChainName = "" +
            ( optsSignOperation.imaState.chainProperties.sc.strChainName
                ? optsSignOperation.imaState.chainProperties.sc.strChainName
                : "" );
        optsSignOperation.fromChainName = "" +
            ( optsSignOperation.imaState.chainProperties.mn.strChainName
                ? optsSignOperation.imaState.chainProperties.mn.strChainName
                : "" );
        optsSignOperation.targetChainID = optsSignOperation.imaState.chainProperties.sc.chainId;
        optsSignOperation.fromChainID = optsSignOperation.imaState.chainProperties.mn.chainId;
    } else if( optsSignOperation.strDirection == "S2M" ) {
        optsSignOperation.targetChainName = "" +
            ( optsSignOperation.imaState.chainProperties.mn.strChainName
                ? optsSignOperation.imaState.chainProperties.mn.strChainName
                : "" );
        optsSignOperation.fromChainName = "" +
            ( optsSignOperation.imaState.chainProperties.sc.strChainName
                ? optsSignOperation.imaState.chainProperties.sc.strChainName
                : "" );
        optsSignOperation.targetChainID = optsSignOperation.imaState.chainProperties.mn.chainId;
        optsSignOperation.fromChainID = optsSignOperation.imaState.chainProperties.sc.chainId;
    } else if( optsSignOperation.strDirection == "S2S" ) {
        optsSignOperation.targetChainName =
            "" + optsSignOperation.joExtraSignOpts.chainNameDst;
        optsSignOperation.fromChainName = "" + optsSignOperation.joExtraSignOpts.chainNameSrc;
        optsSignOperation.targetChainID = optsSignOperation.joExtraSignOpts.chainIdDst;
        optsSignOperation.fromChainID = optsSignOperation.joExtraSignOpts.chainIdSrc;
    } else {
        await joCall.disconnect();
        throw new Error( "CRITICAL ERROR: Failed doSignMessagesImpl() with " +
            `unknown direction ${optsSignOperation.strDirection}` );
    }
}

async function doSignProcessHandleCall(
    optsSignOperation,
    joNode, joParams,
    joIn, joOut, err, strNodeURL, i
) {
    ++optsSignOperation.joGatheringTracker.nCountReceived;
    if( err ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        if( log.id != optsSignOperation.details.id ) {
            log.error(
                "{p}JSON RPC call(doSignProcessHandleCall) to S-Chain node {}(node #{} " +
                "via {url}) failed, RPC call reported error: {err}, sequence ID is {}",
                optsSignOperation.strLogPrefix, strNodeDescColorized, i, strNodeURL,
                err, optsSignOperation.sequenceId );
        }
        optsSignOperation.details.error(
            "{p}JSON RPC call(doSignProcessHandleCall) to S-Chain node {} (node #{} " +
            "via {url}) failed, RPC call reported error: {err}, " +
            "sequence ID is {}", optsSignOperation.strLogPrefix, strNodeDescColorized, i,
            strNodeURL, err, optsSignOperation.sequenceId );
        await joCall.disconnect();
        return;
    }
    optsSignOperation.details.trace(
        "{p}{} Got answer from {bright}(node #{} via {url} for transfer from chain {} " +
        "to chain {} with params {}, answer is {}, sequence ID is {}",
        optsSignOperation.strLogPrefix, log.generateTimestampString( null, true ),
        "skale_imaVerifyAndSign", i, strNodeURL, optsSignOperation.fromChainName,
        optsSignOperation.targetChainName, joParams, joOut, optsSignOperation.sequenceId );
    if( ( !joOut ) || typeof joOut != "object" || ( !( "result" in joOut ) ) || ( !joOut.result ) ||
            typeof joOut.result != "object" ||
            ( !( "signature" in joOut.result ) ) || joOut.result.signature != "object"
    ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        if( log.id != optsSignOperation.details.id ) {
            log.critical( "{p}S-Chain node {} reported wallet error: {err}, sequence ID is ",
                optsSignOperation.strLogPrefix, strNodeDescColorized,
                owaspUtils.extractErrorMessage( joOut, "unknown wallet error(1)" ),
                optsSignOperation.sequenceId );
        }
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
                const joResultFromNode = {
                    index: "" + nZeroBasedNodeIndex,
                    signature: {
                        X: arrTmp[0],
                        Y: arrTmp[1]
                    }
                };
                optsSignOperation.details.trace( "{p}Will verify sign result for node {}",
                    optsSignOperation.strLogPrefixA, nZeroBasedNodeIndex );
                const joPublicKey = discoverPublicKeyByIndex( nZeroBasedNodeIndex,
                    optsSignOperation.imaState.joSChainNetworkInfo, optsSignOperation.details,
                    true );
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
                if( log.id != optsSignOperation.details.id ) {
                    log.critical(
                        "{p}S-Chain node {} partial signature fail from with index {}" +
                        ", error is {err}, sequence ID is {}, stack is:\n{stack}",
                        optsSignOperation.strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                        err, optsSignOperation.sequenceId, err.stack );
                }
                optsSignOperation.details.critical(
                    "{p}S-Chain node {} partial signature fail from with index {}" +
                    ", error is {err}, sequence ID is {}, stack is:\n{stack}",
                    optsSignOperation.strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                    err, optsSignOperation.sequenceId, err.stack );
            }
            if( bNodeSignatureOKay ) {
                optsSignOperation.arrSignResults.push( {
                    index: "" + nZeroBasedNodeIndex,
                    signature: splitSignatureShare( joOut.result.signResult.signatureShare ),
                    fromNode: joNode, // extra, not needed for bls_glue
                    signResult: joOut.result.signResult
                } );
            } else
                ++optsSignOperation.joGatheringTracker.nCountErrors;
        }
    } catch ( err ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        if( log.id != optsSignOperation.details.id ) {
            log.critical(
                "{p}S-Chain node {} signature fail from node {}, error is {err}" +
                ", sequence ID is {}, stack is:\n{stack}",
                optsSignOperation.strLogPrefix, strNodeDescColorized, joNode.nodeID,
                err, optsSignOperation.sequenceId, err.stack );
        }
        optsSignOperation.details.critical(
            "{p}S-Chain node {} signature fail from node {}, error is {err}" +
            ", sequence ID is {}, stack is:\n{stack}",
            optsSignOperation.strLogPrefix, strNodeDescColorized, joNode.nodeID,
            err, optsSignOperation.sequenceId, err.stack );
    }
    await joCall.disconnect();
}

async function doSignProcessOneImpl( i, optsSignOperation ) {
    const imaState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber ) ? true : false;
    const joNode = optsSignOperation.jarrNodes[i];
    const strNodeURL = optsSignOperation.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {}), sequence ID is {}",
        strNodeURL, i, optsSignOperation.jarrNodes.length, joNode.nodeID,
        optsSignOperation.sequenceId );
    const rpcCallOpts = null;
    rpcCall.create(
        strNodeURL, rpcCallOpts, async function( joCall, err ) {
            if( err ) {
                ++optsSignOperation.joGatheringTracker.nCountReceived;
                ++optsSignOperation.joGatheringTracker.nCountErrors;
                if( log.id != optsSignOperation.details.id ) {
                    log.error(
                        "{p}JSON RPC call(doSignProcessOneImpl) to S-Chain node {} failed, " +
                        "RPC call was not created, error is: {err}, sequence ID is {}",
                        optsSignOperation.strLogPrefix, strNodeDescColorized, err,
                        optsSignOperation.sequenceId );
                }
                optsSignOperation.details.error(
                    "{p}JSON RPC call(doSignProcessOneImpl) to S-Chain node {} failed, " +
                    "RPC call was not created, error is: {err}, sequence ID is {}",
                    optsSignOperation.strLogPrefix, strNodeDescColorized, err,
                    optsSignOperation.sequenceId );
                if( joCall )
                    await joCall.disconnect();
                return;
            }
            await doSignConfigureChainAccessParams( optsSignOperation );
            const joParams = {
                "direction": "" + optsSignOperation.strDirection,
                "startMessageIdx": optsSignOperation.nIdxCurrentMsgBlockStart,
                "dstChainName": optsSignOperation.targetChainName,
                "srcChainName": optsSignOperation.fromChainName,
                "dstChainID": optsSignOperation.targetChainID,
                "srcChainID": optsSignOperation.fromChainID,
                "messages": optsSignOperation.jarrMessages,
                "qa": {
                    "skaledNumber": 0 + i,
                    "optsSignOperation.sequenceId": "" + optsSignOperation.sequenceId,
                    "ts": "" + log.generateTimestampString( null, false )
                }
            };
            optsSignOperation.details.trace(
                "{p}{} Will invoke {bright} to node #{} via {url} for transfer from chain {} " +
                "to chain {} with params {}, sequence ID is {}", optsSignOperation.strLogPrefix,
                log.generateTimestampString( null, true ), "skale_imaVerifyAndSign", i, strNodeURL,
                optsSignOperation.fromChainName, optsSignOperation.targetChainName,
                joParams, optsSignOperation.sequenceId );
            await joCall.call( { "method": "skale_imaVerifyAndSign", "params": joParams },
                async function( joIn, joOut, err ) {
                    await doSignProcessHandleCall(
                        optsSignOperation, joNode, joParams, joIn, joOut, err, strNodeURL, i );
                } ); // joCall.call ...
        } ); // rpcCall.create ...
}

async function doSignMessagesImpl(
    nTransferLoopCounter, strDirection,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joExtraSignOpts, fn
) {
    const optsSignOperation = {
        imaState: state.get(),
        nTransferLoopCounter: nTransferLoopCounter,
        strDirection: strDirection,
        jarrMessages: jarrMessages,
        nIdxCurrentMsgBlockStart: nIdxCurrentMsgBlockStart,
        strFromChainName: strFromChainName,
        joExtraSignOpts: joExtraSignOpts,
        fn: fn,
        bHaveResultReportCalled: false,
        strLogPrefix: "",
        strLogPrefixA: "",
        strLogPrefixB: "",
        joGatheringTracker: {},
        arrSignResults: [],
        details: log,
        strGatheredDetailsName: "",
        sequenceId: "",
        jarrNodes: [],
        nThreshold: 1,
        nParticipants: 1,
        nCountOfBlsPartsToCollect: 1,
        errGathering: null,
        promiseCompleteGathering: null,
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
        nWaitIntervalStepMilliseconds: 100,
        nWaitIntervalStepsDone: 0,
        nWaitIntervalMaxSteps: 10 * 60 * 3 // 10 is 1 second
    };
    optsSignOperation.details =
        optsSignOperation.imaState.isDynamicLogInBlsSigner
            ? log : log.createMemoryStream( true );
    optsSignOperation.strGatheredDetailsName = optsSignOperation.strDirection + "-" +
        "doSignMessagesImpl-#" + optsSignOperation.nTransferLoopCounter +
        "-" + optsSignOperation.strFromChainName + "-msg#" +
        optsSignOperation.nIdxCurrentMsgBlockStart;
    try {
        if( ! ( await prepareSignMessagesImpl( optsSignOperation ) ) )
            return;
        for( let i = 0; i < optsSignOperation.jarrNodes.length; ++i ) {
            const cntSuccess = optsSignOperation.arrSignResults.length;
            if( cntSuccess >= optsSignOperation.nCountOfBlsPartsToCollect ) {
                optsSignOperation.details.trace(
                    "{p}{} Stop invoking {bright} for transfer from chain {} at #{} because " +
                    "successfully gathered count is reached ", optsSignOperation.strLogPrefix,
                    log.generateTimestampString( null, true ), "skale_imaVerifyAndSign",
                    fromChainName, i, cntSuccess );
                break;
            }
            doSignProcessOneImpl( i, optsSignOperation );
        }
        await gatherSigningStartImpl( optsSignOperation );
        await gatherSigningFinishImpl( optsSignOperation );
    } catch ( err ) {
        if( ( !optsSignOperation.details ) || log.id != optsSignOperation.details.id ) {
            log.critical( "Failed BLS sign due to generic " +
                "flow exception: {err}, stack is:\n{stack}", err, err.stack );
        }
        if( optsSignOperation.details ) {
            optsSignOperation.details.critical( "Failed BLS sign due to generic " +
                "flow exception: {err}, stack is:\n{stack}", err, err.stack );
        }
        if( ! optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn( "Failed BLS sign due to exception: " +
                `${owaspUtils.extractErrorMessage( err )}`, optsSignOperation.jarrMessages
            ).catch( ( err ) => {
                log.critical( "Failed BLS sign due to error-reporting callback exception: {err}",
                    err );
                if( optsSignOperation.details ) {
                    optsSignOperation.details.critical(
                        "Failed BLS sign due to error-reporting callback exception: {err}",
                        err );
                    optsSignOperation.details.exposeDetailsTo(
                        log, optsSignOperation.strGatheredDetailsName, false );
                    optsSignOperation.details.close();
                }
            } );
        }
    }
    optsSignOperation.details.success( "{p} completed", optsSignOperation.strGatheredDetailsName );
    if( optsSignOperation.details ) {
        optsSignOperation.details.exposeDetailsTo(
            log, optsSignOperation.strGatheredDetailsName, true );
        optsSignOperation.details.close();
    }
}

export async function doSignMessagesM2S(
    nTransferLoopCounter,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joExtraSignOpts,
    fn
) {
    return await doSignMessagesImpl(
        nTransferLoopCounter,
        "M2S",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts,
        fn
    );
}

export async function doSignMessagesS2M(
    nTransferLoopCounter,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joExtraSignOpts,
    fn
) {
    return await doSignMessagesImpl(
        nTransferLoopCounter,
        "S2M",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts,
        fn
    );
}

export async function doSignMessagesS2S(
    nTransferLoopCounter,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    joExtraSignOpts,
    fn
) {
    return await doSignMessagesImpl(
        nTransferLoopCounter,
        "S2S",
        jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
        joExtraSignOpts,
        fn
    );
}

async function prepareSignU256( optsSignU256 ) {
    optsSignU256.details.debug( "{p}Will sign {} value...",
        optsSignU256.strLogPrefix, optsSignU256.u256 );
    optsSignU256.details.trace( "{p}Will query to sign {} skaled node(s)...",
        optsSignU256.strLogPrefix,optsSignU256.jarrNodes.length );
    optsSignU256.nThreshold = discoverBlsThreshold( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.nParticipants =
        discoverBlsParticipants( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.details.trace( "{p}Discovered BLS threshold is {}.",
        optsSignU256.strLogPrefix, optsSignU256.nThreshold );
    optsSignU256.details.trace( "{p}Discovered number of BLS participants is {}.",
        optsSignU256.strLogPrefix, optsSignU256.nParticipants );
    if( ! checkBlsThresholdAndBlsParticipants(
        optsSignU256.nThreshold,
        optsSignU256.nParticipants,
        "prepare sign-U256",
        optsSignU256.details ) ) {
        await optsSignU256.fn(
            "signature error(1, u256), S-Chain information " +
            "was not discovered properly and BLS threshold/participants are unknown",
            optsSignU256.u256 );
        return false;
    }
    optsSignU256.nCountOfBlsPartsToCollect = 0 + optsSignU256.nThreshold;
    optsSignU256.details.trace( "{p}Will(optsSignU256.u256) collect {} from {} nodes",
        optsSignU256.strLogPrefix, optsSignU256.nCountOfBlsPartsToCollect,
        optsSignU256.jarrNodes.length );
    return true;
}

async function doSignU256OneImpl( i, optsSignU256 ) {
    const imaState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber ) ? true : false;
    const joNode = optsSignU256.jarrNodes[i];
    const strNodeURL = optsSignU256.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.fmtDebug( "{url} ({}/{}, ID {})",
        strNodeURL, i, optsSignU256.jarrNodes.length, joNode.nodeID );
    const rpcCallOpts = null;
    await rpcCall.create( strNodeURL, rpcCallOpts, async function( joCall, err ) {
        ++optsSignU256.joGatheringTracker.nCountReceived;
        if( err ) {
            ++optsSignU256.joGatheringTracker.nCountErrors;
            if( log.id != optsSignU256.details.id ) {
                log.error(
                    "{p}JSON RPC call(doSignU256OneImpl) to S-Chain node {} " +
                    "failed, RPC call was not created, error is: {err",
                    optsSignU256.strLogPrefix, strNodeDescColorized, err );
            }
            optsSignU256.details.error(
                "{p}JSON RPC call(doSignU256OneImpl) to S-Chain node {} " +
                "failed, RPC call was not created, error is: {err}",
                optsSignU256.strLogPrefix, strNodeDescColorized, err );
            if( joCall )
                await joCall.disconnect();
            return;
        }
        optsSignU256.details.trace( "{p}Will invoke skale_imaBSU256 for to sign value {}",
            optsSignU256.strLogPrefix, ptsSignU256.u256.toString() );
        await joCall.call( {
            "method": "skale_imaBSU256",
            "params": {
                "valueToSign": optsSignU256.u256 // must be 0x string, came from outside 0x string
            }
        }, async function( joIn, joOut, err ) {
            ++optsSignU256.joGatheringTracker.nCountReceived;
            if( err ) {
                ++optsSignU256.joGatheringTracker.nCountErrors;
                if( log.id != optsSignU256.details.id ) {
                    log.error(
                        "{p}JSON RPC call(doSignU256OneImpl) to S-Chain node {} failed, " +
                        "RPC call reported error: {err}", optsSignU256.strLogPrefix,
                        strNodeDescColorized, err );
                }
                optsSignU256.details.error(
                    "{p}JSON RPC call(doSignU256OneImpl) to S-Chain " +
                    "node {} failed, RPC call reported error: {err}", optsSignU256.strLogPrefix,
                    strNodeDescColorized, err );
                await joCall.disconnect();
                return;
            }
            optsSignU256.details.trace( "{p}Did invoked {} for to sign value {}, answer is: {}",
                optsSignU256.strLogPrefix, "skale_imaBSU256", optsSignU256.u256.toString(), joOut );
            if( ( !joOut ) || typeof joOut != "object" || ( !( "result" in joOut ) ) ||
                ( !joOut.result ) || typeof joOut.result != "object" ||
                ( !( "signature" in joOut.result ) ) || joOut.result.signature != "object"
            ) {
                ++optsSignU256.joGatheringTracker.nCountErrors;
                const strErrorMessage =
                    owaspUtils.extractErrorMessage( joOut, "unknown wallet error(2)" );
                if( log.id != optsSignU256.details.id ) {
                    log.error( "{p}S-Chain node {} reported wallet error: {err}",
                        optsSignU256.strLogPrefix, strNodeDescColorized, strErrorMessage );
                }
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
                        const joResultFromNode = {
                            index: "" + nZeroBasedNodeIndex,
                            signature: { X: arrTmp[0], Y: arrTmp[1] }
                        };
                        optsSignU256.details.trace( "{p}Will verify sign result for node {}",
                            strLogPrefixA, nZeroBasedNodeIndex );
                        const joPublicKey = discoverPublicKeyByIndex( nZeroBasedNodeIndex,
                            optsSignU256.imaState.joSChainNetworkInfo, optsSignU256.details,
                            true );
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
                        if( log.id != optsSignU256.details.id ) {
                            log.critical(
                                "{p}S-Chain node {} sign CRITICAL ERROR: partial signature fail " +
                                "from with index {}, error is {err}, stack is:\n{stack}",
                                strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                                err, err.stack );
                        }
                        optsSignU256.details.critical(
                            "{p}S-Chain node {} sign CRITICAL ERROR: partial signature fail from " +
                            "with index {}, error is {err}, stack is:\n{stack}",
                            strLogPrefixA, strNodeDescColorized, nZeroBasedNodeIndex,
                            err, err.stack );
                    }
                    if( bNodeSignatureOKay ) {
                        optsSignU256.arrSignResults.push( {
                            index: "" + nZeroBasedNodeIndex,
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
                if( log.id != optsSignU256.details.id ) {
                    log.critical(
                        "{p}S-Chain node {} signature fail from node {}, error is {err}, " +
                        "stack is:\n{stack}", optsSignU256.strLogPrefix,
                        strNodeDescColorized, joNode.nodeID, err, err.stack );
                }
                optsSignU256.details.critical(
                    "{p}S-Chain node {} signature fail from node {}, error is {err}, " +
                    "stack is:\n{stack}", optsSignU256.strLogPrefix,
                    strNodeDescColorized, joNode.nodeID, err, err.stack );
            }
            await joCall.disconnect();
        } ); // joCall.call ...
    } ); // rpcCall.create ...
}

async function doSignU256Gathering( optsSignU256 ) {
    optsSignU256.details.debug( "{p}Waiting for BLS glue result ", optsSignU256.strLogPrefix );
    optsSignU256.errGathering = null;
    optsSignU256.promiseCompleteGathering = new Promise( ( resolve, reject ) => {
        const iv = setInterval( function() {
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
                    0 + optsSignU256.joGatheringTracker.nCountReceived;
            }
            ++ optsSignU256.joGatheringTracker.nWaitIntervalStepsDone;
            if( cntSuccess >= optsSignU256.nCountOfBlsPartsToCollect ) {
                const strLogPrefixB = "BLS u256/Summary: ";
                clearInterval( iv );
                let strError = null, strSuccessfulResultDescription = null;
                const joGlueResult = performBlsGlueU256(
                    optsSignU256.details, optsSignU256.u256, optsSignU256.arrSignResults );
                if( joGlueResult ) {
                    optsSignU256.details.success( "{p}Got BLS glue u256 result: {}",
                        strLogPrefixB, joGlueResult );
                    if( optsSignU256.imaState.strPathBlsVerify.length > 0 ) {
                        const joCommonPublicKey = discoverCommonPublicKey(
                            optsSignU256.imaState.joSChainNetworkInfo, false );
                        if( ! joCommonPublicKey ) {
                            strError = "No BLS common public key";
                            optsSignOperation.details.error( "{p}{}",
                                optsSignOperation.strLogPrefixB, strError );
                        } else if( performBlsVerifyU256( optsSignU256.details, joGlueResult,
                            optsSignU256.u256, joCommonPublicKey ) ) {
                            strSuccessfulResultDescription =
                                "Got successful summary BLS u256 verification result";
                            optsSignU256.details.success( "{p}{}", strLogPrefixB,
                                strSuccessfulResultDescription );
                        } else {
                            strError = "BLS verification failed";
                            if( log.id != optsSignU256.details.id ) {
                                log.error( "{p}BLS verification failure:{}",
                                    strLogPrefixB, strError );
                            }
                            optsSignU256.details.error( "{p}BLS verification failure:{}",
                                strLogPrefixB, strError );
                        }
                    }
                } else {
                    strError = "BLS u256 glue failed, no glue result arrived";
                    if( log.id != optsSignU256.details.id ) {
                        log.error( "{p}Problem(1) in BLS u256 sign result handler: {err}",
                            strLogPrefixB, strError );
                    }
                    optsSignU256.details.error(
                        "{p}Problem(1) in BLS u256 sign result handler: {err}",
                        strLogPrefixB, strError );
                }
                optsSignU256.details.trace(
                    "Will call signed-256 answer-sending callback {}, u256 is {}, " +
                    "glue result is {}",
                    strError ? ( " with error " + log.fmtError( { em }, strError ) ) : "",
                    optsSignU256.u256, joGlueResult );
                optsSignU256.fn( strError, optsSignU256.u256, joGlueResult ).catch( ( err ) => {
                    if( log.id != optsSignU256.details.id ) {
                        log.critical( "Problem(2) in BLS u256 sign result handler: {err}",
                            err );
                    }
                    optsSignU256.details.critical(
                        "Problem(2) in BLS u256 sign result handler: {err}", err );
                    optsSignU256.errGathering = "Problem(2) in BLS u256 sign result " +
                            `handler: ${owaspUtils.extractErrorMessage( err )}`;
                } );
                if( strError ) {
                    optsSignU256.errGathering = strError;
                    reject( new Error( optsSignU256.errGathering ) );
                } else
                    resolve();
                return;
            }
            if( optsSignU256.joGatheringTracker.nCountReceived >=
                    optsSignU256.jarrNodes.length ) {
                clearInterval( iv );
                optsSignU256.fn(
                    "signature error(2, u256), got " +
                    `${optsSignU256.joGatheringTracker.nCountErrors} errors(s) for ` +
                    `${optsSignU256.jarrNodes.length}  node(s)`,
                    optsSignU256.u256
                ).catch( ( err ) => {
                    if( log.id != optsSignU256.details.id ) {
                        log.critical(
                            "Problem(3) in BLS u256 sign result handler, not enough successful " +
                            "BLS signature parts({} when all attempts done, error details: {err}",
                            cntSuccess, err );
                    }
                    optsSignU256.details.critical(
                        "Problem(3) in BLS u256 sign result handler, not enough successful BLS " +
                        "signature parts({} when all attempts done, error details: {err}",
                        cntSuccess, err );
                    optsSignU256.errGathering = "Problem(3) in BLS u256 sign result handler, not " +
                        `enough successful BLS signature parts(${cntSuccess} when all attempts ` +
                        `done, error details: ${owaspUtils.extractErrorMessage( err )}`;
                    reject( new Error( optsSignU256.errGathering ) );
                } );
                return;
            }
            if( optsSignU256.joGatheringTracker.nWaitIntervalStepsDone >=
                optsSignU256.joGatheringTracker.nWaitIntervalMaxSteps
            ) {
                clearInterval( iv );
                optsSignU256.fn(
                    "signature error(3, u256), got " +
                    `${optsSignU256.joGatheringTracker.nCountErrors}  errors(s) for ` +
                    `${optsSignU256.jarrNodes.length} node(s)`,
                    optsSignU256.u256
                ).catch( ( err ) => {
                    if( log.id != optsSignU256.details.id ) {
                        log.error(
                            "Problem(4) in BLS u256 sign result handler, not enough successful " +
                            "BLS signature parts({}) and timeout reached, error details: {err}",
                            cntSuccess, err );
                    }
                    optsSignU256.details.error(
                        "Problem(4) in BLS u256 sign result handler, not enough successful BLS " +
                        "signature parts({}) and timeout reached, error details: {err",
                        cntSuccess, err );
                    optsSignU256.errGathering = "Problem(4) in BLS u256 sign result handler, not " +
                        `enough successful BLS signature parts(${cntSuccess}) and timeout ` +
                        `reached, error details: ${owaspUtils.extractErrorMessage( err )}`;
                    reject( new Error( optsSignU256.errGathering ) );
                } );
                return;
            }
        }, optsSignU256.joGatheringTracker.nWaitIntervalStepMilliseconds );
    } );
}

export async function doSignU256( u256, details, fn ) {
    const optsSignU256 = {
        u256: u256,
        fn: fn,
        details: details,
        imaState: state.get(),
        strLogPrefix: "Sign u256: ",
        joGatheringTracker: {
            nCountReceivedPrevious: 0,
            nCountReceived: 0,
            nCountErrors: 0,
            nCountSkipped: 0,
            nWaitIntervalStepMilliseconds: 100,
            nWaitIntervalStepsDone: 0,
            nWaitIntervalMaxSteps: 10 * 60 * 3 // 10 is 1 second
        },
        arrSignResults: [],
        jarrNodes: {},
        nThreshold: 1,
        nParticipants: 1,
        nCountOfBlsPartsToCollect: 1,
        errGathering: null,
        promiseCompleteGathering: null
    };
    optsSignU256.jarrNodes = optsSignU256.imaState.joSChainNetworkInfo.network;
    optsSignU256.details.trace( "{p}Invoking signing u256 procedure...",
        optsSignU256.strLogPrefix );
    optsSignU256.fn = optsSignU256.fn || function() {};
    if( !(
        optsSignU256.imaState.strPathBlsGlue.length > 0 &&
        optsSignU256.imaState.joSChainNetworkInfo
    ) ) {
        optsSignU256.details.warning( "{p}BLS u256 signing is unavailable",
            optsSignU256.strLogPrefix );
        await optsSignU256.fn( "BLS u256 signing is unavailable", optsSignU256.u256 );
        return;
    }
    if( ! ( await prepareSignU256( optsSignU256 ) ) )
        return;
    for( let i = 0; i < optsSignU256.jarrNodes.length; ++i )
        await doSignU256OneImpl( i, optsSignU256 );
    await doSignU256Gathering( optsSignU256 );
    optsSignU256.details.trace( "Will await BLS u256 sign result..." );
    await withTimeout(
        "BLS u256 sign",
        optsSignU256.promiseCompleteGathering,
        gSecondsMessageVerifySendTimeout
    ).then( strSuccessfulResultDescription => {
        optsSignU256.details.trace( "BLS u256 sign promise awaited." );
    } ).catch( err => {
        if( log.id != optsSignU256.details.id )
            log.critical( "Failed to verify BLS and send message : {err}", err );

        optsSignU256.details.critical( "Failed to verify BLS and send message : {err}", err );
    } );
    if( optsSignU256.errGathering ) {
        if( log.id != optsSignU256.details.id ) {
            log.error( "Failed BLS u256 sign result awaiting: {err}",
                optsSignU256.errGathering.toString() );
        }
        optsSignU256.details.error( "Failed BLS u256 sign result awaiting: {err}",
            optsSignU256.errGathering.toString() );
        return;
    }
    optsSignU256.details.information( "{p}Completed signing u256 procedure",
        optsSignU256.strLogPrefix );
}

export async function doVerifyReadyHash(
    strMessageHash,
    nZeroBasedNodeIndex,
    signature,
    isExposeOutput
) {
    const imaState = state.get();
    const strDirection = "RAW";
    const strLogPrefix = `${strDirection}/BLS/#${nZeroBasedNodeIndex}: `;
    const details = log.createMemoryStream();
    let isSuccess = false;
    const arrTmp = signature.signatureShare.split( ":" );
    const joResultFromNode = {
        index: "" + nZeroBasedNodeIndex,
        signature: {
            X: arrTmp[0],
            Y: arrTmp[1]
        }
    };
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "verify ready hash", details ) )
        return false;
    const strActionDir = allocBlsTmpActionDir();
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        const joPublicKey = discoverPublicKeyByIndex(
            nZeroBasedNodeIndex, imaState.joSChainNetworkInfo, details, true );
        details.trace( "{p}BLS node #{} - hashed verify message is {}",
            strLogPrefix, nZeroBasedNodeIndex, strMessageHash );
        const joMsg = {
            "message": strMessageHash
        };
        details.debug( "{p}BLS node #{} - composed {} using hash {} and glue {} and public key {}",
            strLogPrefix, nZeroBasedNodeIndex, joMsg, strMessageHash,
            joResultFromNode, joPublicKey );
        const strSignResultFileName =
            strActionDir + "/sign-result" + nZeroBasedNodeIndex + ".json";
        imaUtils.jsonFileSave( strSignResultFileName, joResultFromNode );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        imaUtils.jsonFileSave(
            strActionDir + "/BLS_keys" + nZeroBasedNodeIndex + ".json", joPublicKey );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --j " + nZeroBasedNodeIndex +
            " --input " + strSignResultFileName
            ;
        details.trace( "{p}Will execute node #{} BLS verify command: {}",
            strLogPrefix, nZeroBasedNodeIndex, strVerifyCommand );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( "{p}BLS node #{} verify output is:\n{raw}", strLogPrefix,
            nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        details.success( "{p}BLS node #{} verify success", strLogPrefix, nZeroBasedNodeIndex );
        fnShellRestore();
        isSuccess = true;
    } catch ( err ) {
        if( log.id != details.id ) {
            log.critical( "{p}BLS node #{} verify error, error description is: {err}, " +
                "stack is:\n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err.stack );
            log.critical( "{p}BLS node#{} verify output is:\n{raw}",
                strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        }
        details.critical( "{p}BLS node #{} verify error, error description is: {err}" +
                ", stack is:\n{stack}", strLogPrefix, nZeroBasedNodeIndex, err, err.stack );
        details.critical( "{p}BLS node #{} verify output is:\n{raw}",
            strLogPrefix, nZeroBasedNodeIndex, strOutput || "<<EMPTY>>" );
        fnShellRestore();
        isSuccess = false;
    }
    if( isExposeOutput || ( !isSuccess ) )
        details.exposeDetailsTo( log, "BLS-raw-verifier", isSuccess );
    details.close();
    return isSuccess;
}

export async function doSignReadyHash( strMessageHash, isExposeOutput ) {
    const imaState = state.get();
    const strLogPrefix = "";
    const details = log.createMemoryStream();
    let joSignResult = null;
    try {
        const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
        const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
        details.debug( "{p}Will BLS-sign ready hash.", strLogPrefix );
        details.trace( "{p}Discovered BLS threshold is {}.", strLogPrefix, nThreshold );
        details.trace( "{p}Discovered number of BLS participants is {}.",
            strLogPrefix, nParticipants );
        details.trace( "{p}hash value to sign is {}", strLogPrefix, strMessageHash );
        if( ! checkBlsThresholdAndBlsParticipants(
            nThreshold, nParticipants, "sign ready hash", details ) )
            return false;
        let joAccount = imaState.chainProperties.sc.joAccount;
        if( ! joAccount.strURL ) {
            joAccount = imaState.chainProperties.mn.joAccount;
            if( ! joAccount.strSgxURL )
                throw new Error( "SGX URL is unknown, cannot sign U256" );
            if( ! joAccount.strBlsKeyName )
                throw new Error( "BLS keys name is unknown, cannot sign U256" );
        }
        let rpcCallOpts = null;
        if( "strPathSslKey" in joAccount && typeof joAccount.strPathSslKey == "string" &&
            joAccount.strPathSslKey.length > 0 && "strPathSslCert" in joAccount &&
            typeof joAccount.strPathSslCert == "string" && joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                "cert": fs.readFileSync( joAccount.strPathSslCert, "utf8" ),
                "key": fs.readFileSync( joAccount.strPathSslKey, "utf8" )
            };
        } else
            details.warning( "Will sign via SGX without SSL options" );

        const signerIndex = imaState.nNodeNumber;
        await rpcCall.create( joAccount.strSgxURL, rpcCallOpts, async function( joCall, err ) {
            if( err ) {
                if( log.id != details.id ) {
                    log.error( "{p}JSON RPC call(doSignReadyHash) to SGX failed, " +
                        "RPC call was not created, error is: {err}", strLogPrefix, err );
                }
                details.error( "{p}JSON RPC call(doSignReadyHash) to SGX failed, " +
                    "RPC call was not created, error is: {err}", strLogPrefix, err );
                if( joCall )
                    await joCall.disconnect();
                throw new Error( "JSON RPC call to SGX failed, RPC call(doSignReadyHash) was " +
                    `not created, error is: ${owaspUtils.extractErrorMessage( err )}` );
            }
            const joCallSGX = {
                "jsonrpc": "2.0",
                "id": randomCallID(),
                "method": "blsSignMessageHash",
                "params": {
                    "keyShareName": joAccount.strBlsKeyName,
                    "messageHash": strMessageHash,
                    "n": nParticipants,
                    "t": nThreshold,
                    "signerIndex": signerIndex + 0 // 1-based
                }
            };
            details.trace( "{p}Will invoke SGX with call data {}", strLogPrefix, joCallSGX );
            await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                if( err ) {
                    const jsErrorObject = new Error( "JSON RPC call(doSignReadyHash) " +
                        "to SGX failed, RPC call reported " +
                        `error: ${owaspUtils.extractErrorMessage( err )}` );
                    if( log.id != details.id ) {
                        log.error(
                            "{p}JSON RPC call(doSignReadyHash) to SGX failed, RPC call reported " +
                            "error: {err}, stack is:\n{stack}", strLogPrefix,
                            err, jsErrorObject.stack );
                    }
                    details.error(
                        "{p}JSON RPC call(doSignReadyHash) to SGX failed, RPC call reported " +
                        "error: {err}, stack is:\n{stack}", strLogPrefix,
                        err, jsErrorObject.stack );
                    await joCall.disconnect();
                    throw jsErrorObject;
                }
                details.trace( "{p}Call to ", "SGX done, answer is: {}", strLogPrefix, joOut );
                joSignResult = joOut;
                if( joOut.result != null && joOut.result != undefined &&
                    typeof joOut.result == "object" )
                    joSignResult = joOut.result;
                if( joOut.signResult != null && joOut.signResult != undefined &&
                    typeof joOut.signResult == "object" )
                    joSignResult = joOut.signResult;
                if( !joSignResult ) {
                    const strError = "No signature arrived";
                    joRetVal.error = strError;
                    if( log.id != details.id ) {
                        log.error( "{p}BLS-sign(1) finished with error: {err}",
                            strLogPrefix, strError );
                    }
                    details.error( "{p}BLS-sign(1) finished with error: {err}",
                        strLogPrefix, strError );
                    await joCall.disconnect();
                    throw new Error( strError );
                }
                if( "errorMessage" in joSignResult &&
                    typeof joSignResult.errorMessage == "string" &&
                    joSignResult.errorMessage.length > 0
                ) {
                    const strError = `BLS-sign finished with error: ${joSignResult.errorMessage};`;
                    joRetVal.error = strError;
                    if( log.id != details.id ) {
                        log.error( "{p}BLS-sign(2) finished with error: {err}",
                            strLogPrefix, joSignResult.errorMessage );
                    }
                    details.error( "{p}BLS-sign(2) finished with error: {err}",
                        strLogPrefix, joSignResult.errorMessage );
                    await joCall.disconnect();
                    throw new Error( strError );
                }
                joSignResult.error = null;
                await joCall.disconnect();
            } ); // joCall.call ...
        } ); // rpcCall.create ...
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        joSignResult = { };
        joSignResult.error = strError;
        if( log.id != details.id ) {
            log.error( "{p}BLS-raw-signer error: {err}, stack is:\n{stack}",
                strLogPrefix, strError, err.stack );
        }
        details.error( "{p}BLS-raw-signer error: {err}, stack is:\n{stack}",
            strLogPrefix, strError, err.stack );
    }
    const isSuccess = (
        joSignResult && typeof joSignResult == "object" && ( !joSignResult.error ) )
        ? true : false;
    if( isExposeOutput || ( !isSuccess ) )
        details.exposeDetailsTo( log, "BLS-raw-signer", isSuccess );
    details.close();
    return joSignResult;
}

async function prepareHandlingOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign ) {
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
    if( ! checkBlsThresholdAndBlsParticipants(
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

async function prepareS2sOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign ) {
    const strSChainNameSrc = optsHandleVerifyAndSign.joCallData.params.srcChainName;
    const strSChainNameDst = optsHandleVerifyAndSign.joCallData.params.dstChainName;
    optsHandleVerifyAndSign.details.trace(
        "{p}{bright} verification algorithm will use for source chain name {} and destination " +
        "chain name {}", optsHandleVerifyAndSign.strLogPrefix,
        optsHandleVerifyAndSign.strDirection, strSChainNameSrc, strSChainNameDst );
    const arrSChainsCached = skaleObserver.getLastCachedSChains();
    if( ( !arrSChainsCached ) || arrSChainsCached.length == 0 ) {
        throw new Error( `Could not handle ${optsHandleVerifyAndSign.strDirection} ` +
            "skale_imaVerifyAndSign(1), no S-Chains in SKALE NETWORK observer cached yet, " +
            "try again later" );
    }

    let joSChainSrc = null, strUrlSrcSChain = null;
    for( let idxSChain = 0; idxSChain < arrSChainsCached.length; ++ idxSChain ) {
        const joSChain = arrSChainsCached[idxSChain];
        if( joSChain.data.name.toString() == strSChainNameSrc.toString() ) {
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
        joSChainSrc.data.computed.computedSChainId, joSChainSrc.data.computed.chainId );
    optsHandleVerifyAndSign.joExtraSignOpts = {
        skaleObserver: skaleObserver,
        ethersProviderSrc: owaspUtils.getEthersProviderFromURL( strUrlSrcSChain ),
        chainNameSrc: optsHandleVerifyAndSign.strFromChainName,
        chainNameDst: optsHandleVerifyAndSign.strToChainName,
        chainIdSrc: optsHandleVerifyAndSign.strFromChainID,
        chainIdDst: optsHandleVerifyAndSign.strToChainID
    };
}

export async function handleSkaleImaVerifyAndSign( joCallData ) {
    const optsHandleVerifyAndSign = {
        joCallData: joCallData,
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
    try {
        if( ! ( await prepareHandlingOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign ) ) )
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
        if( ! joAccount.strURL ) {
            joAccount = optsHandleVerifyAndSign.imaState.chainProperties.mn.joAccount;
            if( ! joAccount.strSgxURL )
                throw new Error( "SGX URL is unknown, cannot sign(handle) IMA message(s)" );
            if( ! joAccount.strBlsKeyName )
                throw new Error( "BLS keys name is unknown, cannot sign IMA message(s)" );
        }
        let rpcCallOpts = null;
        if( "strPathSslKey" in joAccount && typeof joAccount.strPathSslKey == "string" &&
            joAccount.strPathSslKey.length > 0 && "strPathSslCert" in joAccount &&
            typeof joAccount.strPathSslCert == "string" && joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                "cert": fs.readFileSync( joAccount.strPathSslCert, "utf8" ),
                "key": fs.readFileSync( joAccount.strPathSslKey, "utf8" )
            };
        } else
            optsHandleVerifyAndSign.details.warning( "Will sign via SGX without SSL options" );
        const signerIndex = optsHandleVerifyAndSign.imaState.nNodeNumber;
        await rpcCall.create( joAccount.strSgxURL, rpcCallOpts, async function( joCall, err ) {
            if( err ) {
                if( log.id != optsHandleVerifyAndSign.details.id ) {
                    log.error(
                        "{p}{bright}JSON RPC call(handleSkaleImaVerifyAndSign) " +
                        "to SGX failed, RPC call was not created, error is: {err}" ,
                        optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
                        err );
                }
                optsHandleVerifyAndSign.details.error(
                    "{p}{bright}JSON RPC call(handleSkaleImaVerifyAndSign) " +
                    "to SGX failed, RPC call was not created, error is: {err}" ,
                    optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
                    err );
                if( joCall )
                    await joCall.disconnect();
                throw new Error( "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, " +
                    "RPC call was not created, " +
                    `error is: ${owaspUtils.extractErrorMessage( err )}` );
            }
            const joCallSGX = {
                "jsonrpc": "2.0",
                "id": randomCallID(),
                "method": "blsSignMessageHash",
                "params": {
                    "keyShareName": joAccount.strBlsKeyName,
                    "messageHash": optsHandleVerifyAndSign.strMessageHash,
                    "n": optsHandleVerifyAndSign.nParticipants,
                    "t": optsHandleVerifyAndSign.nThreshold,
                    "signerIndex": signerIndex + 0 // 1-based
                }
            };
            optsHandleVerifyAndSign.details.trace(
                "{p}{bright} verification algorithm will invoke SGX with call data {}",
                optsHandleVerifyAndSign.strLogPrefix, optsHandleVerifyAndSign.strDirection,
                joCallSGX );
            await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                if( err ) {
                    const strError =
                        "JSON RPC call(handleSkaleImaVerifyAndSign) " +
                        "to SGX failed, RPC call reported error: " +
                        owaspUtils.extractErrorMessage( err );
                    optsHandleVerifyAndSign.joRetVal.error = strError;
                    const jsErrorObject = new Error( strError );
                    if( log.id != optsHandleVerifyAndSign.details.id ) {
                        log.error(
                            "{p}JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, " +
                            "RPC call reported error: {err}, stack is:\n{stack}",
                            optsHandleVerifyAndSign.strLogPrefix, err, jsErrorObject.stack );
                    }
                    optsHandleVerifyAndSign.details.error(
                        "{p}JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, " +
                        "RPC call reported error: {err}, stack is:\n{stack}",
                        optsHandleVerifyAndSign.strLogPrefix, err, jsErrorObject.stack );
                    await joCall.disconnect();
                    throw jsErrorObject;
                }
                optsHandleVerifyAndSign.details.trace( "{p}{bright} Call to SGX done, " +
                    "answer is: {}", optsHandleVerifyAndSign.strLogPrefix,
                optsHandleVerifyAndSign.strDirection, joOut );
                let joSignResult = joOut;
                if( joOut.result != null && joOut.result != undefined &&
                    typeof joOut.result == "object" )
                    joSignResult = joOut.result;
                if( joOut.signResult != null && joOut.signResult != undefined &&
                    typeof joOut.signResult == "object" )
                    joSignResult = joOut.signResult;
                if( "qa" in optsHandleVerifyAndSign.joCallData )
                    optsHandleVerifyAndSign.joRetVal.qa = optsHandleVerifyAndSign.joCallData.qa;
                if( !joSignResult ) {
                    const strError = "No signature arrived";
                    joRetVal.error = strError;
                    if( log.id != details.id ) {
                        log.error( "{p}BLS-sign(1) finished with error: {err}",
                            strLogPrefix, strError );
                    }
                    details.error( "{p}BLS-sign(1) finished with error: {err}",
                        strLogPrefix, strError );
                    await joCall.disconnect();
                    throw new Error( strError );
                }
                if( "errorMessage" in joSignResult &&
                    typeof joSignResult.errorMessage == "string" &&
                    joSignResult.errorMessage.length > 0
                ) {
                    optsHandleVerifyAndSign.isSuccess = false;
                    const strError = `BLS-sign finished with error: ${joSignResult.errorMessage};`;
                    optsHandleVerifyAndSign.joRetVal.error = strError;
                    if( log.id != optsHandleVerifyAndSign.details.id ) {
                        log.error( "{p}BLS-sign(2) finished with error: {err}",
                            optsHandleVerifyAndSign.strLogPrefix,
                            joSignResult.errorMessage );
                    }
                    optsHandleVerifyAndSign.details.error(
                        "{p}BLS-sign(2) finished with error: {err}",
                        optsHandleVerifyAndSign.strLogPrefix, joSignResult.errorMessage );
                    await joCall.disconnect();
                    throw new Error( strError );
                }
                optsHandleVerifyAndSign.isSuccess = true;
                optsHandleVerifyAndSign.joRetVal.result = { signResult: joSignResult };
                if( "qa" in optsHandleVerifyAndSign.joCallData )
                    optsHandleVerifyAndSign.joRetVal.qa = optsHandleVerifyAndSign.joCallData.qa;
                await joCall.disconnect();
            } ); // joCall.call ...
        } ); // rpcCall.create ...
    } catch ( err ) {
        optsHandleVerifyAndSign.isSuccess = false;
        const strError = owaspUtils.extractErrorMessage( err );
        optsHandleVerifyAndSign.joRetVal.error = strError;
        if( log.id != optsHandleVerifyAndSign.details.id ) {
            log.critical( "{p}IMA messages verifier/signer error: {err}, stack is:\n{stack}",
                optsHandleVerifyAndSign.strLogPrefix, strError, err.stack );
        }
        optsHandleVerifyAndSign.details.critical(
            "{p}IMA messages verifier/signer error: {err}, stack is:\n{stack}",
            optsHandleVerifyAndSign.strLogPrefix, strError, err.stack );
    }
    optsHandleVerifyAndSign.details.exposeDetailsTo(
        log, "IMA messages verifier/signer", optsHandleVerifyAndSign.isSuccess );
    optsHandleVerifyAndSign.details.close();
    return optsHandleVerifyAndSign.joRetVal;
}

async function handleSkaleImaBSU256Prepare( optsBSU256 ) {
    optsBSU256.details.debug( "{p}Will U256-BLS-sign {}",
        optsBSU256.strLogPrefix, optsBSU256.joCallData );
    optsBSU256.nThreshold = discoverBlsThreshold( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.nParticipants = discoverBlsParticipants( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.details.trace( "{p}Discovered BLS threshold is {}.",
        optsBSU256.strLogPrefix, optsBSU256.nThreshold );
    optsBSU256.details.trace( "{p}Discovered number of BLS participants is {}.",
        optsBSU256.strLogPrefix, optsBSU256.nParticipants );
    if( ! checkBlsThresholdAndBlsParticipants(
        optsHandleVerifyAndSign.nThreshold,
        optsHandleVerifyAndSign.nParticipants,
        "handle BSU256Prepare",
        optsBSU256.details ) )
        return false;
    optsBSU256.u256 = optsBSU256.joCallData.params.valueToSign;
    optsBSU256.details.trace( "{p}U256 original value is {}",
        optsBSU256.strLogPrefix, optsBSU256.u256 );
    optsBSU256.strMessageHash = keccak256U256.u256( optsBSU256.u256, true );
    optsBSU256.details.trace( "{p}hash of U256 value to sign is {}",
        optsBSU256.strLogPrefix, optsBSU256.strMessageHash );
    optsBSU256.details.trace( "{p}Will BLS-sign U256.", optsBSU256.strLogPrefix );
    optsBSU256.joAccount = optsBSU256.imaState.chainProperties.sc.optsBSU256.joAccount;
    if( ! optsBSU256.joAccount.strURL ) {
        optsBSU256.joAccount = optsBSU256.imaState.chainProperties.mn.optsBSU256.joAccount;
        if( ! optsBSU256.joAccount.strSgxURL )
            throw new Error( "SGX URL is unknown, cannot sign U256" );
        if( ! optsBSU256.joAccount.strBlsKeyName )
            throw new Error( "BLS keys name is unknown, cannot sign U256" );
    }
    return true;
}

export async function handleSkaleImaBSU256( joCallData ) {
    const optsBSU256 = {
        joCallData: joCallData,
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
    try {
        if( ! ( await handleSkaleImaBSU256Prepare( optsBSU256 ) ) )
            return null;
        let rpcCallOpts = null;
        if( "strPathSslKey" in optsBSU256.joAccount &&
            typeof optsBSU256.joAccount.strPathSslKey == "string" &&
            optsBSU256.joAccount.strPathSslKey.length > 0 &&
            "strPathSslCert" in optsBSU256.joAccount &&
            typeof optsBSU256.joAccount.strPathSslCert == "string" &&
            optsBSU256.joAccount.strPathSslCert.length > 0
        ) {
            rpcCallOpts = {
                "cert": fs.readFileSync( optsBSU256.joAccount.strPathSslCert, "utf8" ),
                "key": fs.readFileSync( optsBSU256.joAccount.strPathSslKey, "utf8" )
            };
        } else
            optsBSU256.details.warning( "Will sign via SGX without SSL options" );
        const signerIndex = optsBSU256.imaState.nNodeNumber;
        await rpcCall.create( optsBSU256.joAccount.strSgxURL, rpcCallOpts,
            async function( joCall, err ) {
                if( err ) {
                    if( log.id != optsBSU256.details.id ) {
                        log.error(
                            "{p}JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                            "RPC call was not created, error is: {err}",
                            optsBSU256.strLogPrefix, err );
                    }
                    optsBSU256.details.error(
                        "{p}JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                        "RPC call was not created, error is: {err}",
                        optsBSU256.strLogPrefix, err );
                    if( joCall )
                        await joCall.disconnect();
                    throw new Error( "JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                        "RPC call was not created, " +
                        `error is: ${owaspUtils.extractErrorMessage( err )}` );
                }
                const joCallSGX = {
                    "jsonrpc": "2.0",
                    "id": randomCallID(),
                    "method": "blsSignMessageHash",
                    "params": {
                        "keyShareName": optsBSU256.joAccount.strBlsKeyName,
                        "messageHash": optsBSU256.strMessageHash,
                        "n": optsBSU256.nParticipants,
                        "t": optsBSU256.nThreshold,
                        "signerIndex": signerIndex + 0 // 1-based
                    }
                };
                optsBSU256.details.trace( "{p}Will invoke SGX with call data {}",
                    optsBSU256.strLogPrefix, joCallSGX );
                await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                    if( err ) {
                        const jsErrorObject = new Error( "JSON RPC call(handleSkaleImaBSU256) " +
                            "to SGX failed, RPC call " +
                            `reported error: ${owaspUtils.extractErrorMessage( err )}` );
                        if( log.id != optsBSU256.details.id ) {
                            log.error(
                                "{p}JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                                "RPC call reported error: {err}, stack is:\n{stack}",
                                optsBSU256.strLogPrefix, err, jsErrorObject.stack );
                        }
                        optsBSU256.details.error(
                            "{p}JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                            "RPC call reported error: {err}, stack is:\n{stack}",
                            optsBSU256.strLogPrefix, err, jsErrorObject.stack );
                        await joCall.disconnect();
                        throw jsErrorObject;
                    }
                    optsBSU256.details.trace( "{p}Call to SGX done, answer is: {}",
                        optsBSU256.strLogPrefix, joOut );
                    let joSignResult = joOut;
                    if( joOut.result != null && joOut.result != undefined &&
                        typeof joOut.result == "object" )
                        joSignResult = joOut.result;
                    if( joOut.signResult != null && joOut.signResult != undefined &&
                        typeof joOut.signResult == "object" )
                        joSignResult = joOut.signResult;
                    if( !joSignResult ) {
                        const strError = "No signature arrived";
                        joRetVal.error = strError;
                        if( log.id != details.id ) {
                            log.error( "{p}U256/BLS-sign(1) finished with error: {err}",
                                strLogPrefix, strError );
                        }
                        details.error( "{p}U256/BLS-sign(1) finished with error: {err}",
                            strLogPrefix, strError );
                        await joCall.disconnect();
                        throw new Error( strError );
                    }
                    if( "errorMessage" in joSignResult &&
                        typeof joSignResult.errorMessage == "string" &&
                        joSignResult.errorMessage.length > 0 ) {
                        optsBSU256.isSuccess = false;
                        const strError = "BLS-sign finished with " +
                            `error: ${joSignResult.errorMessage}`;
                        optsBSU256.joRetVal.error = strError;
                        if( log.id != optsBSU256.details.id ) {
                            log.error( "{p}U256/BLS-sign(2) finished with error: {err}",
                                optsBSU256.strLogPrefix, joSignResult.errorMessage );
                        }
                        optsBSU256.details.error( "{p}U256/BLS-sign(2) finished with error: {err}",
                            optsBSU256.strLogPrefix, joSignResult.errorMessage );
                        await joCall.disconnect();
                        throw new Error( strError );
                    }
                    optsBSU256.isSuccess = true;
                    optsBSU256.joRetVal.result = { signResult: joSignResult };
                    if( "qa" in optsBSU256.joCallData )
                        optsBSU256.joRetVal.qa = optsBSU256.joCallData.qa;
                    await joCall.disconnect();
                } ); // joCall.call ...
            } ); // rpcCall.create ...
    } catch ( err ) {
        optsBSU256.isSuccess = false;
        const strError = owaspUtils.extractErrorMessage( err );
        optsBSU256.joRetVal.error = strError;
        if( log.id != optsBSU256.details.id ) {
            log.critical( "{p}U256-BLS-signer error: {err}, stack is:\n{stack}",
                optsBSU256.strLogPrefix, strError, err.stack );
        }
        optsBSU256.details.critical( "{p}U256-BLS-signer error: {err}, stack is:\n{stack}",
            optsBSU256.strLogPrefix, strError, err.stack );
    }
    optsBSU256.details.exposeDetailsTo( log, "U256-BLS-signer", optsBSU256.isSuccess );
    optsBSU256.details.close();
    return optsBSU256.joRetVal;
}
