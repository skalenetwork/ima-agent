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
import * as cc from "./cc.mjs";
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
            new Error( strDescription + "error: " + owaspUtils.extractErrorMessage( err ) );
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
        throw new Error( strDescription + " reached limit of " + seconds + " second(s)" );
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
        details.fatal( "Operation ", log.v( strOperation ),
            " will fail because discovered BLS threshold ", nThreshold,
            " is invalid number or bad value" );
        return false;
    }
    if( nParticipants <= 0 ) {
        details.fatal( "Operation ", log.v( strOperation ),
            " will fail because discovered BLS number of participants ", nParticipants,
            " is invalid number or bad value" );
        return false;
    }
    if( nThreshold > nParticipants ) {
        details.fatal( "Operation ", log.v( strOperation ),
            " will fail because discovered BLS threshold ", nThreshold,
            " is greater than BLS number of participants ", nParticipants );
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
    details.fatal( "BLS 1/", cntNodes,
        " public key discovery failed for node #",
        nNodeIndex, ", node data is: ", log.v( joNode ) );
    if( isThrowException ) {
        throw new Error( "BLS 1/" + cntNodes +
            " public key discovery failed for node #" + nNodeIndex );
    }
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
    details.fatal( "BLS common public key discovery failed, chain data is: ",
        log.v( joSChainNetworkInfo ) );
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
    return {
        X: jarr[0],
        Y: jarr[1]
    };
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
    details,
    strDirection,
    jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName,
    arrSignResults
) {
    const imaState = state.get();
    const strLogPrefix = strDirection + "/BLS/Glue: ";
    let joGlueResult = null;
    const nThreshold = discoverBlsThreshold( imaState.joSChainNetworkInfo );
    const nParticipants = discoverBlsParticipants( imaState.joSChainNetworkInfo );
    details.debug( strLogPrefix, "Discovered BLS threshold is ", nThreshold, "." );
    details.debug( strLogPrefix, "Discovered number of BLS participants is ", nParticipants, "." );
    if( ! checkBlsThresholdAndBlsParticipants( nThreshold, nParticipants, "BLS glue", details ) )
        return null;
    const strMessageHash =
        owaspUtils.removeStarting0x(
            keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName )
        );
    details.debug( strLogPrefix, "Message hash to sign is ", log.v( strMessageHash ) );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( strLogPrefix, "performBlsGlue will work in ", log.v( strActionDir ),
        " director with ", arrSignResults.length, " sign results..." );
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo = arrSignResults[i];
            const strPath = strActionDir + "/sign-result" + jo.index + ".json";
            details.trace( strLogPrefix, "Saving ", log.v( strPath ), " file containing ",
                log.v( jo ) );
            imaUtils.jsonFileSave( strPath, jo );
            strInput += " --input " + strPath;
        }
        const strGlueCommand =
            imaState.strPathBlsGlue +
            " --t " + nThreshold +
            " --n " + nParticipants +
            strInput +
            " --output " + strActionDir + "/glue-result.json";
        details.trace( strLogPrefix, "Will execute BLS glue command:", "\n",
            log.v( strGlueCommand ) );
        strOutput = childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS glue output is:", "\n", log.v( strOutput ) );
        joGlueResult = imaUtils.jsonFileLoad( strActionDir + "/glue-result.json" );
        details.trace( strLogPrefix, "BLS glue result is: ", log.v( joGlueResult ) );
        if( "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( strLogPrefix, "BLS glue success" );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( strLogPrefix, "Computing ", log.v( "G1" ), " hash point..." );
            const strPath = strActionDir + "/hash.json";
            details.trace( strLogPrefix, "Saving ", log.v( strPath ), " file..." );
            imaUtils.jsonFileSave( strPath, { "message": strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( strLogPrefix, "Will execute HashG1 command:", "\n",
                log.v( strHasG1Command ) );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } );
            details.trace( strLogPrefix, "HashG1 output is:", "\n", log.v( strOutput ) );
            const joResultHashG1 = imaUtils.jsonFileLoad( strActionDir + "/g1.json" );
            details.trace( strLogPrefix, "HashG1 result is: ", log.v( joResultHashG1 ) );
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
                throw new Error( "malformed HashG1 result: " + JSON.stringify( joResultHashG1 ) );
            }
        } else {
            const joSavedGlueResult = joGlueResult;
            joGlueResult = null;
            throw new Error( "malformed BLS glue result: " + JSON.stringify( joSavedGlueResult ) );
        }
        fnShellRestore();
    } catch ( err ) {
        details.critical( strLogPrefix, "BLS glue error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
        details.critical( strLogPrefix, "BLS glue output is:", "\n", log.v( strOutput ) );
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
    details.debug( strLogPrefix, "Discovered BLS threshold is ", nThreshold, "." );
    details.debug( strLogPrefix, "Discovered number of BLS participants is ", nParticipants, "." );
    if( ! checkBlsThresholdAndBlsParticipants(
        nThreshold, nParticipants, "BLS glue-256", details ) )
        return null;
    details.trace( strLogPrefix, "Original long message is ",
        log.v( keccak256U256( u256, false ) ) );
    const strMessageHash = keccak256U256( u256, true );
    details.trace( strLogPrefix, "Message hash to sign is ", log.v( strMessageHash ) );
    const strActionDir = allocBlsTmpActionDir();
    details.trace( strLogPrefix, "performBlsGlueU256 will work in ", log.v( strActionDir ),
        " director with ", arrSignResults.length, " sign results..." );
    const fnShellRestore = function() {
        shell.rm( "-rf", strActionDir );
    };
    let strOutput = "";
    try {
        let strInput = "";
        const cnt = arrSignResults.length;
        for( let i = 0; i < cnt; ++i ) {
            const jo = arrSignResults[i];
            const strPath = strActionDir + "/sign-result" + jo.index + ".json";
            details.trace( strLogPrefix, "Saving ", CC.notice( strPath ), " file..." );
            imaUtils.jsonFileSave( strPath, jo );
            strInput += " --input " + strPath;
        }
        const strGlueCommand =
            imaState.strPathBlsGlue +
            " --t " + nThreshold +
            " --n " + nParticipants +
            strInput +
            " --output " + strActionDir + "/glue-result.json";
        details.trace( strLogPrefix, "Will execute BLS glue command:", "\n",
            log.v( strGlueCommand ) );
        strOutput = childProcessModule.execSync( strGlueCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS glue output is:", "\n", log.v( strOutput ) );
        joGlueResult = imaUtils.jsonFileLoad( strActionDir + "/glue-result.json" );
        details.trace( strLogPrefix, "BLS glue result is: ", log.v( joGlueResult ) );
        if( "X" in joGlueResult.signature && "Y" in joGlueResult.signature ) {
            details.success( strLogPrefix, "BLS glue success" );
            joGlueResult.hashSrc = strMessageHash;
            details.trace( strLogPrefix, "Computing ", log.v( "G1" ), " hash point..." );
            const strPath = strActionDir + "/hash.json";
            details.trace( strLogPrefix, "Saving ", log.v( strPath ), " file..." );
            imaUtils.jsonFileSave( strPath, { "message": strMessageHash } );
            const strHasG1Command =
                imaState.strPathHashG1 +
                " --t " + nThreshold +
                " --n " + nParticipants;
            details.trace( strLogPrefix, "Will execute HashG1 command:", "\n",
                log.v( strHasG1Command ) );
            strOutput = childProcessModule.execSync( strHasG1Command, { cwd: strActionDir } );
            details.trace( strLogPrefix, "HashG1 output is:", "\n", log.v( strOutput ) );
            const joResultHashG1 = imaUtils.jsonFileLoad( strActionDir + "/g1.json" );
            details.trace( strLogPrefix, "HashG1 result is: ", log.v( joResultHashG1 ) );
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
                throw new Error( "malformed HashG1 result: " + JSON.stringify( joResultHashG1 ) );
            }
        } else {
            const joSavedGlueResult = joGlueResult;
            joGlueResult = null;
            throw new Error( "malformed BLS glue result: " + JSON.stringify( joSavedGlueResult ) );
        }
        fnShellRestore();
    } catch ( err ) {
        details.critical( "BLS glue error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ) + "\n" +
            ", stack is: ", log.s( err.stack ) );
        details.critical( "BLS glue output is:", "\n", log.v( strOutput ) );
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
    const strLogPrefix = strDirection + "/BLS/#" + nZeroBasedNodeIndex + ": ";
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
        details.trace( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - first message nonce is ", nIdxCurrentMsgBlockStart );
        details.trace( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - first source chain name is ", log.v( strFromChainName ) );
        details.trace( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - messages array ", log.v( jarrMessages ) );
        const strMessageHash =
            owaspUtils.removeStarting0x(
                keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName ) );
        details.trace( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - hashed verify message is ", log.v( strMessageHash ) );
        const joMsg = { "message": strMessageHash };
        details.debug( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - composed  ", log.v( joMsg ), " composed from ", log.v( jarrMessages ),
            " using glue ", log.v( joResultFromNode ), " and public key ", log.v( joPublicKey ) );
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
        details.trace( strLogPrefix, "Will execute node #",
            nZeroBasedNodeIndex, " BLS verify command:", "\n", log.v( strVerifyCommand ) );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " verify output is:", "\n", log.v( strOutput ) );
        details.success( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " verify success" );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.critical( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " verify error:", " error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ), ", stack is: ", "\n",
            log.s( err.stack ) );
        details.critical( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " verify output is:", "\n",
            log.v( strOutput ) );
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
    const strLogPrefix = "BLS/#" + nZeroBasedNodeIndex + ": ";
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
        details.debug( strLogPrefix, "BLS u256 node #", nZeroBasedNodeIndex,
            cc.debug( " verify message " ) + log.v( joMsg ) + " composed from ", log.v( u256 ),
            " using glue ", log.v( joResultFromNode ), " and public key ", log.v( joPublicKey ) );
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
        details.trace( strLogPrefix, "Will execute node #",
            nZeroBasedNodeIndex, " BLS u256 verify command:", "\n",
            log.v( strVerifyCommand ) );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS u256 node #", nZeroBasedNodeIndex +
            " verify output is:", "\n", log.v( strOutput ) );
        details.success( strLogPrefix, "BLS u256 node #",
            nZeroBasedNodeIndex, " verify success" );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( strLogPrefix, "BLS u256 node #", nZeroBasedNodeIndex, " verify error:",
            " error description is: ", log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
        details.error( strLogPrefix, "BLS u256 node #", nZeroBasedNodeIndex, " verify output is:",
            "\n", log.v( strOutput ) );
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
    const strLogPrefix = strDirection + "/BLS/Summary: ";
    try {
        details.trace( strLogPrefix, "BLS/summary verify message - ",
            "first message nonce is ", log.v( nIdxCurrentMsgBlockStart ) );
        details.trace( strLogPrefix, "BLS/summary verify message - ",
            "first source chain name is ", log.v( strFromChainName ) );
        details.trace( strLogPrefix, "BLS/summary verify message - ",
            "messages array ", log.v( jarrMessages ) );
        const strMessageHash =
            owaspUtils.removeStarting0x(
                keccak256Message( jarrMessages, nIdxCurrentMsgBlockStart, strFromChainName )
            );
        details.trace( strLogPrefix, "BLS/summary verify message - ",
            "hashed verify message is ", log.v( strMessageHash ) );
        const joMsg = { "message": strMessageHash };
        details.debug( strLogPrefix, "BLS/summary verify message - composed JSON ",
            log.v( joMsg ), " from messages array ", log.v( jarrMessages ), " using glue ",
            log.v( joGlueResult ), " and common public key ", log.v( joCommonPublicKey ) );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( strLogPrefix, "BLS common public key for verification is:", "\n",
            log.v( joCommonPublicKey ) );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json"
            ;
        details.trace( strLogPrefix, "Will execute BLS/summary verify command:", "\n",
            log.v( strVerifyCommand ) );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS/summary verify output is:", "\n",
            log.v( strOutput ) );
        details.success( strLogPrefix, "BLS/summary verify success" );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( strLogPrefix, "BLS/summary verify error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
        details.error( "BLS/summary verify output is:", "\n", log.v( strOutput ) );
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
        details.debug( strLogPrefix, "BLS u256/summary verify message ", log.v( joMsg ),
            " composed from ", log.v( u256 ), " using glue ", log.v( joGlueResult ),
            " and common public key ", log.v( joCommonPublicKey ) );
        imaUtils.jsonFileSave( strActionDir + "/glue-result.json", joGlueResult );
        imaUtils.jsonFileSave( strActionDir + "/hash.json", joMsg );
        const joCommonPublicKeyToSave = {
            commonBLSPublicKey0: joCommonPublicKey.commonBLSPublicKey0,
            commonBLSPublicKey1: joCommonPublicKey.commonBLSPublicKey1,
            commonBLSPublicKey2: joCommonPublicKey.commonBLSPublicKey2,
            commonBLSPublicKey3: joCommonPublicKey.commonBLSPublicKey3
        };
        imaUtils.jsonFileSave( strActionDir + "/common_public_key.json", joCommonPublicKeyToSave );
        details.trace( strLogPrefix, "BLS u256 common public key for verification is:", "\n",
            log.v( joCommonPublicKey ) );
        const strVerifyCommand = "" +
            imaState.strPathBlsVerify +
            " --t " + nThreshold +
            " --n " + nParticipants +
            " --input " + "./glue-result.json"
            ;
        details.trace( strLogPrefix, "Will execute BLS u256/summary verify command:", "\n",
            log.v( strVerifyCommand ) );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS u256/summary verify output is:", "\n",
            log.v( strOutput ) );
        details.success( strLogPrefix, "BLS u256/summary verify success" );
        fnShellRestore();
        return true;
    } catch ( err ) {
        details.error( strLogPrefix, "BLS u256/summary  error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: " + "\n" + log.s( err.stack ) );
        details.error( strLogPrefix, "BLS u256/summary verify output is:", "\n",
            log.v( strOutput ) );
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
            throw new Error(
                "CRITICAL ERROR: No provider specified in " +
                "extra signing options for checking messages of direction \"" +
                strDirection + "\"" );
        }
        joMessageProxy =
            new owaspUtils.ethersMod.ethers.Contract(
                imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
                imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                ethersProvider
            );
    } else {
        throw new Error(
            "CRITICAL ERROR: Failed checkCorrectnessOfMessagesToSign() " +
            "with unknown direction \"" + strDirection + "\"" );
    }

    const strCallerAccountAddress = joAccount.address();
    details.debug( strLogPrefix, log.v( strDirection ),
        " message correctness validation through call to ",
        log.v( "verifyOutgoingMessageData" ), " method of ", log.v( "MessageProxy" ),
        " contract with address ", log.v( joMessageProxy.address ),
        ", caller account address is ", log.v( joMessageProxy.address ),
        ", message(s) count is ", jarrMessages.length, ", message(s) to process are ",
        log.v( jarrMessages ), ", first real message index is ", nIdxCurrentMsgBlockStart,
        ", messages will be sent to chain name ", log.v( joChainName ),
        ", caller address is ", log.v( strCallerAccountAddress ) );
    let cntBadMessages = 0, i = 0;
    const cnt = jarrMessages.length;
    if( strDirection == "S2M" || strDirection == "S2S" ) {
        for( i = 0; i < cnt; ++i ) {
            const joMessage = jarrMessages[i];
            const idxMessage = nIdxCurrentMsgBlockStart + i;
            try {
                details.trace( strLogPrefix, log.v( strDirection ),
                    " Will validate message ", i, " of ", cnt, ", real message index is ",
                    idxMessage, ", source contract is ", log.v( joMessage.sender ),
                    ", destination contract is ", log.v( joMessage.destinationContract ),
                    ", message data is ", log.v( joMessage.data ) );
                const outgoingMessageData = {
                    "dstChainHash": owaspUtils.ethersMod.ethers.utils.id( joChainName ),
                    "msgCounter": 0 + idxMessage,
                    "srcContract": joMessage.sender,
                    "dstContract": joMessage.destinationContract,
                    "data": joMessage.data
                };
                const isValidMessage = await joMessageProxy.callStatic.verifyOutgoingMessageData(
                    outgoingMessageData,
                    { from: strCallerAccountAddress }
                );
                details.trace( strLogPrefix, log.v( strDirection ),
                    " Got verification call result ", cc.tf( isValidMessage ),
                    ", real message index is: ", idxMessage, ", saved msgCounter is: ",
                    outgoingMessageData.msgCounter );
                if( !isValidMessage ) {
                    throw new Error(
                        "Bad message detected, message is: " + JSON.stringify( joMessage ) );
                }
            } catch ( err ) {
                ++cntBadMessages;
                if( log.id != details.id ) {
                    log.critical( strLogPrefix, log.v( strDirection ),
                        " Correctness validation failed for message ",
                        idxMessage, " sent to ", log.v( joChainName ),
                        ", message is: ", log.v( joMessage ), ", error information: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", stack is:", "\n", log.s( err.stack )
                    );
                }
                details.critical( log.v( strDirection ),
                    " Correctness validation failed for message ",
                    idxMessage, " sent to ", log.v( joChainName ),
                    ", message is: ", log.v( joMessage ), ", error information: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ),
                    ", stack is:", "\n", log.s( err.stack )
                );
            }
        }
    }
    // TODO: M2S - check events
    if( cntBadMessages > 0 ) {
        if( log.id != details.id ) {
            log.critical( strLogPrefix, "Correctness validation failed for ",
                cntBadMessages, " of ", cnt, " message(s)"
            );
        }
        details.critical( strLogPrefix, "Correctness validation failed for ",
            cntBadMessages, " of ", cnt, " message(s)"
        );
    } else
        details.success( strLogPrefix, "Correctness validation passed for ", cnt, " message(s)" );

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
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix, " Invoking ",
        log.v( optsSignOperation.strDirection ),
        " signing messages procedure, message signing is ",
        cc.onOff( optsSignOperation.imaState.bSignMessages ) );
    if( !( optsSignOperation.imaState.bSignMessages &&
        optsSignOperation.imaState.strPathBlsGlue.length > 0 &&
        optsSignOperation.imaState.joSChainNetworkInfo
    ) ) {
        optsSignOperation.bHaveResultReportCalled = true;
        optsSignOperation.details.debug( optsSignOperation.strLogPrefix,
            "BLS message signing is turned off, first real message index is: ",
            optsSignOperation.nIdxCurrentMsgBlockStart,
            ", have ", optsSignOperation.jarrMessages.length, " message(s) to process ",
            log.v( optsSignOperation.jarrMessages ) );
        optsSignOperation.details.exposeDetailsTo(
            log, optsSignOperation.strGatheredDetailsName, false );
        optsSignOperation.details.close();
        await checkCorrectnessOfMessagesToSign(
            optsSignOperation.details, optsSignOperation.strLogPrefix,
            optsSignOperation.strDirection,
            optsSignOperation.jarrMessages,
            optsSignOperation.nIdxCurrentMsgBlockStart,
            optsSignOperation.joExtraSignOpts
        );
        await optsSignOperation.fn( null, optsSignOperation.jarrMessages, null );
        return true;
    }
    await checkCorrectnessOfMessagesToSign(
        optsSignOperation.details, optsSignOperation.strLogPrefix,
        optsSignOperation.strDirection,
        optsSignOperation.jarrMessages, optsSignOperation.nIdxCurrentMsgBlockStart,
        optsSignOperation.joExtraSignOpts
    );
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix, "Will sign ",
        optsSignOperation.jarrMessages.length, " message(s), sequence ID is ",
        log.v( optsSignOperation.sequenceId ), "..." );
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix +
        cc.debug( "Will query to sign " ) + log.v( optsSignOperation.jarrNodes.length ) +
        cc.debug( " skaled node(s)..." ) );
    optsSignOperation.nThreshold =
        discoverBlsThreshold( optsSignOperation.imaState.joSChainNetworkInfo );
    optsSignOperation.nParticipants =
        discoverBlsParticipants( optsSignOperation.imaState.joSChainNetworkInfo );
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
        "Discovered BLS threshold is ", optsSignOperation.nThreshold, "." );
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
        "Discovered number of BLS participants is ", optsSignOperation.nParticipants, "." );
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
            optsSignOperation.jarrMessages,
            null
        );
        return false;
    }
    optsSignOperation.nCountOfBlsPartsToCollect = 0 + optsSignOperation.nThreshold;
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix, "Will BLS-collect ",
        optsSignOperation.nCountOfBlsPartsToCollect, " from ", optsSignOperation.jarrNodes.length,
        " nodes, sequence ID is ", log.v( optsSignOperation.sequenceId ) );
    return true;
}

async function gatherSigningStartImpl( optsSignOperation ) {
    optsSignOperation.details.debug( optsSignOperation.strLogPrefix,
        "Waiting for BLS glue result " );
    optsSignOperation.errGathering = null;
    optsSignOperation.promiseCompleteGathering = new Promise( ( resolve, reject ) => {
        const iv = setInterval( function() {
            if( optsSignOperation.joGatheringTracker.nCountReceivedPrevious !=
                optsSignOperation.joGatheringTracker.nCountReceived ) {
                optsSignOperation.details.debug( log.v( optsSignOperation.strDirection ), "/#",
                    optsSignOperation.nTransferLoopCounter,
                    " BLS signature gathering progress updated, now have ",
                    optsSignOperation.joGatheringTracker.nCountReceived, " BLS parts of ",
                    optsSignOperation.nCountOfBlsPartsToCollect, " arrived, have ",
                    optsSignOperation.cntSuccess, " success(es) and ",
                    optsSignOperation.joGatheringTracker.nCountErrors, " error(s)" );
                optsSignOperation.joGatheringTracker.nCountReceivedPrevious =
                    0 + optsSignOperation.joGatheringTracker.nCountReceived;
            }
            ++ optsSignOperation.joGatheringTracker.nWaitIntervalStepsDone;
            optsSignOperation.cntSuccess =
                optsSignOperation.joGatheringTracker.nCountReceived -
                optsSignOperation.joGatheringTracker.nCountErrors;
            if( optsSignOperation.cntSuccess >= optsSignOperation.nCountOfBlsPartsToCollect ) {
                optsSignOperation.strLogPrefixB = optsSignOperation.strDirection + "/#" +
                    optsSignOperation.nTransferLoopCounter + "/BLS/Summary: ";
                clearInterval( iv );
                let strError = null, strSuccessfulResultDescription = null;
                const joGlueResult = performBlsGlue(
                    optsSignOperation.details, optsSignOperation.strDirection,
                    optsSignOperation.jarrMessages,
                    optsSignOperation.nIdxCurrentMsgBlockStart,
                    optsSignOperation.strFromChainName,
                    optsSignOperation.arrSignResults
                );
                if( joGlueResult ) {
                    optsSignOperation.details.success( optsSignOperation.strLogPrefixB,
                        "Got BLS glue result: ", log.v( joGlueResult ) );
                    if( optsSignOperation.imaState.strPathBlsVerify.length > 0 ) {
                        const joCommonPublicKey = discoverCommonPublicKey(
                            optsSignOperation.imaState.joSChainNetworkInfo, false );
                        if( ! joCommonPublicKey ) {
                            strError = "No BLS common public key";
                            optsSignOperation.details.error( optsSignOperation.strLogPrefixB,
                                log.em( strError ) );
                        } else if( performBlsVerify(
                            optsSignOperation.details, optsSignOperation.strDirection,
                            joGlueResult, optsSignOperation.jarrMessages,
                            optsSignOperation.nIdxCurrentMsgBlockStart,
                            optsSignOperation.strFromChainName,
                            joCommonPublicKey
                        ) ) {
                            strSuccessfulResultDescription =
                                "Got successful summary BLS verification result";
                            optsSignOperation.details.success( optsSignOperation.strLogPrefixB,
                                strSuccessfulResultDescription );
                        } else {
                            strError = "BLS verification failed";
                            optsSignOperation.details.error( optsSignOperation.strLogPrefixB,
                                log.em( strError ) );
                        }
                    }
                } else {
                    strError = "BLS glue failed, no glue result arrived";
                    optsSignOperation.details.error( optsSignOperation.strLogPrefixB,
                        "Problem(1) in BLS sign result handler: ", log.em( strError ) );
                    if( log.id != details.id ) {
                        log.error( optsSignOperation.strLogPrefixB,
                            "Problem(1) in BLS sign result handler: ", log.em( strError ) );
                    }
                }
                optsSignOperation.trace.trace( "Will call signed-hash answer-sending callback ",
                    ( strError ? ( cc.debug( " with error " ) + log.v( strError ) ) : "" ),
                    ", optsSignOperation.jarrMessages is ", log.v( optsSignOperation.jarrMessages ),
                    ", glue result is ", log.v( joGlueResult ) );
                optsSignOperation.fn(
                    strError, optsSignOperation.jarrMessages, joGlueResult )
                    .catch( ( err ) => {
                        if( log.id != optsSignOperation.details.id ) {
                            log.critical( "Problem(2) in BLS sign result handler: ",
                                log.em( owaspUtils.extractErrorMessage( err ) ) );
                        }
                        optsSignOperation.details.critical(
                            "Problem(2) in BLS sign result handler: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                        optsSignOperation.errGathering =
                            "Problem(2) in BLS sign result handler: " +
                            owaspUtils.extractErrorMessage( err );
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
                    "signature error(2), got " +
                    optsSignOperation.joGatheringTracker.nCountErrors +
                    " errors(s) for " + optsSignOperation.jarrNodes.length +
                    " node(s)", optsSignOperation.jarrMessages,
                    null
                ).catch( ( err ) => {
                    optsSignOperation.details.error( "Problem(3) in BLS sign result handler, ",
                        "not enough successful BLS signature parts(", optsSignOperation.cntSuccess,
                        " when all attempts done, error optsSignOperation.details: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    if( log.id != optsSignOperation.details.id ) {
                        log.error( "Problem(3) in BLS sign result handler, ",
                            "not enough successful BLS signature parts(",
                            optsSignOperation.cntSuccess,
                            " when all attempts done, error optsSignOperation.details: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                    }
                    optsSignOperation.errGathering =
                        "Problem(3) in BLS sign result handler," +
                            " not enough successful BLS signature parts(" +
                        optsSignOperation.cntSuccess +
                        " when all attempts done, error optsSignOperation.details: " +
                        owaspUtils.extractErrorMessage( err );
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
                    "signature error(3), got " +
                        optsSignOperation.joGatheringTracker.nCountErrors +
                        " errors(s) for " + optsSignOperation.jarrNodes.length + " node(s)",
                    optsSignOperation.jarrMessages,
                    null
                ).catch( ( err ) => {
                    optsSignOperation.details.critical(
                        "Problem(4) in BLS sign result handler, ",
                        "not enough successful BLS signature parts(",
                        optsSignOperation.cntSuccess,
                        ") and timeout reached, error optsSignOperation.details: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    if( log.id != optsSignOperation.details.id ) {
                        log.critical( "Problem(4) in BLS sign result handler, ",
                            "not enough successful BLS signature parts(",
                            optsSignOperation.cntSuccess,
                            ") and timeout reached, error optsSignOperation.details: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                    }
                    optsSignOperation.errGathering =
                        "Problem(4) in BLS sign result handler, " +
                        "not enough successful BLS signature parts(" +
                        optsSignOperation.cntSuccess +
                        ") and timeout reached, error optsSignOperation.details: " +
                        owaspUtils.extractErrorMessage( err );
                    reject( new Error( optsSignOperation.errGathering ) );
                } );
                optsSignOperation.bHaveResultReportCalled = true;
                return;
            }
        }, optsSignOperation.joGatheringTracker.nWaitIntervalStepMilliseconds );
    } );
}

async function gatherSigningFinishImpl( optsSignOperation ) {
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
        "Will await for message BLS verification and sending..." );
    await withTimeout(
        "BLS verification and sending",
        optsSignOperation.promiseCompleteGathering,
        gSecondsMessageVerifySendTimeout )
        .then( strSuccessfulResultDescription => {
            optsSignOperation.details.success(
                "BLS verification and sending promise awaited." );
        } ).catch( err => {
            if( log.id != optsSignOperation.details.id ) {
                log.error( "Failed to verify BLS and send message : ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
            }
            optsSignOperation.details.error( "Failed to verify BLS and send message : ",
                log.em( owaspUtils.extractErrorMessage( err ) ) );
        } );
    if( optsSignOperation.errGathering ) {
        if( log.id != optsSignOperation.details.id ) {
            log.error( "Failed BLS sign result awaiting(1): ",
                log.em( optsSignOperation.errGathering.toString() ) );
        }
        optsSignOperation.details.error( "Failed BLS sign result awaiting(1): ",
            log.em( optsSignOperation.errGathering.toString() ) );
        if( ! optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn(
                "Failed to gather BLS signatures in " + optsSignOperation.jarrNodes.length +
                    " node(s), tracker data is: " +
                    JSON.stringify( optsSignOperation.joGatheringTracker ) +
                    ", error is: " + optsSignOperation.errGathering.toString(),
                optsSignOperation.jarrMessages,
                null
            ).catch( ( err ) => {
                if( log.id != optsSignOperation.details.id ) {
                    log.error( "Problem(5) in BLS sign result handler, ",
                        "not enough successful BLS signature parts(" ,
                        optsSignOperation.cntSuccess,
                        ") and timeout reached, error optsSignOperation.details: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                }
                optsSignOperation.details.error( "Problem(5) in BLS sign result handler, ",
                    "not enough successful BLS signature parts(" ,
                    optsSignOperation.cntSuccess,
                    ") and timeout reached, error optsSignOperation.details: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
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
            log.error( "Failed BLS sign result awaiting(2): ",
                log.em( "No reports were arrived" ) );
        }
        optsSignOperation.details.error( "Failed BLS sign result awaiting(2): ",
            log.em( "No reports were arrived" ) );
        optsSignOperation.bHaveResultReportCalled = true;
        await optsSignOperation.fn(
            "Failed to gather BLS signatures in " + optsSignOperation.jarrNodes.length +
            " node(s), tracker data is: " +
            JSON.stringify( optsSignOperation.joGatheringTracker ),
            optsSignOperation.jarrMessages, null
        ).catch( ( err ) => {
            if( log.id != optsSignOperation.details.id ) {
                log.error( "Problem(6) in BLS sign result handler, ",
                    "not enough successful BLS signature parts(",
                    optsSignOperation.cntSuccess,
                    ") and timeout reached, error optsSignOperation.details: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
            }
            optsSignOperation.details.error( "Problem(6) in BLS sign result handler, ",
                "not enough successful BLS signature parts(",
                optsSignOperation.cntSuccess,
                ") and timeout reached, error optsSignOperation.details: ",
                log.em( owaspUtils.extractErrorMessage( err ) ) );
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
        throw new Error(
            "CRITICAL ERROR: " +
            "Failed doSignMessagesImpl() with unknown direction \"" +
            optsSignOperation.strDirection + "\""
        );
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
            log.error( optsSignOperation.strLogPrefix,
                "JSON RPC call(doSignProcessHandleCall) to S-Chain node ", strNodeDescColorized,
                "(node #", i, " via ", log.u( strNodeURL ),
                ") failed, RPC call reported error: ",
                log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
                log.v( optsSignOperation.sequenceId ) );
        }
        optsSignOperation.details.error(
            optsSignOperation.strLogPrefix,
            "JSON RPC call(doSignProcessHandleCall) to S-Chain node ", strNodeDescColorized,
            "(node #", i, " via ", log.u( strNodeURL ),
            ") failed, RPC call reported error: ",
            log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
            log.v( optsSignOperation.sequenceId ) );
        await joCall.disconnect();
        return;
    }
    optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
        log.generateTimestampString( null, true ), " ",
        "Got answer from ", log.v( "skale_imaVerifyAndSign" ), "(node #", i, " via ",
        log.u( strNodeURL ), ") for transfer from chain ",
        log.v( optsSignOperation.fromChainName ), " to chain ",
        log.v( optsSignOperation.targetChainName ), " with params ", log.v( joParams ),
        ", answer is ", log.v( joOut ), ", sequence ID is ",
        log.v( optsSignOperation.sequenceId ) );
    if( joOut.result == null ||
        joOut.result == undefined ||
        ( !typeof joOut.result == "object" )
    ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        if( log.id != optsSignOperation.details.id ) {
            log.critical( optsSignOperation.strLogPrefix,
                "S-Chain node ", strNodeDescColorized, " reported wallet error: ",
                log.em( owaspUtils.extractErrorMessage( joOut, "unknown wallet error(1)" ) ),
                ", sequence ID is ",
                log.v( optsSignOperation.sequenceId ) );
        }
        optsSignOperation.details.critical( optsSignOperation.strLogPrefix,
            "S-Chain node ", strNodeDescColorized, " reported wallet error: ",
            log.em( owaspUtils.extractErrorMessage( joOut, "unknown wallet error(1)" ) ),
            ", sequence ID is ",
            log.v( optsSignOperation.sequenceId ) );
        await joCall.disconnect();
        return;
    }
    optsSignOperation.details.debug( optsSignOperation.strLogPrefix, "Node ",
        log.v( joNode.nodeID ), " sign result: ", log.v( joOut.result ? joOut.result : null ) );
    try {
        if( joOut.result.signResult.signatureShare.length > 0 &&
            joOut.result.signResult.status === 0
        ) {
            const nZeroBasedNodeIndex = joNode.imaInfo.thisNodeIndex - 1;
            // partial BLS verification for one participant
            let bNodeSignatureOKay = false; // initially assume signature is wrong
            optsSignOperation.strLogPrefixA = optsSignOperation.strDirection + "/BLS/#" +
                nZeroBasedNodeIndex + ": ";
            try {
                optsSignOperation.cntSuccess =
                    optsSignOperation.joGatheringTracker.nCountReceived -
                    optsSignOperation.joGatheringTracker.nCountErrors;
                if( optsSignOperation.cntSuccess >
                        optsSignOperation.nCountOfBlsPartsToCollect ) {
                    ++optsSignOperation.joGatheringTracker.nCountSkipped;
                    optsSignOperation.details.notice( optsSignOperation.strLogPrefixA,
                        "Will ignore sign result for node ", nZeroBasedNodeIndex, " because ",
                        optsSignOperation.nThreshold, "/",
                        optsSignOperation.nCountOfBlsPartsToCollect,
                        " threshold number of BLS signature parts already gathered" );
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
                optsSignOperation.details.trace( optsSignOperation.strLogPrefixA,
                    "Will verify sign result for node ", nZeroBasedNodeIndex );
                const joPublicKey =
                    discoverPublicKeyByIndex( nZeroBasedNodeIndex,
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
                    optsSignOperation.details.success( optsSignOperation.strLogPrefixA,
                        "Got successful BLS verification result for node ",
                        log.v( joNode.nodeID ), " with index ", nZeroBasedNodeIndex );
                    bNodeSignatureOKay = true; // node verification passed
                } else {
                    optsSignOperation.details.error( optsSignOperation.strLogPrefixA,
                        " ", "BLS verification failed" );
                }
            } catch ( err ) {
                if( log.id != optsSignOperation.details.id ) {
                    log.critical( optsSignOperation.strLogPrefixA, "S-Chain node ",
                        strNodeDescColorized, " partial signature fail from with index ",
                        nZeroBasedNodeIndex,
                        ", error is ", log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", sequence ID is ",
                        log.v( optsSignOperation.sequenceId ), ", stack is:", "\n",
                        log.s( err.stack ) );
                }
                optsSignOperation.details.critical( optsSignOperation.strLogPrefixA,
                    "S-Chain node ", strNodeDescColorized,
                    " partial signature fail from with index ", nZeroBasedNodeIndex, ", error is ",
                    log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
                    log.v( optsSignOperation.sequenceId ), ", stack is:", "\n",
                    log.s( err.stack ) );
            }
            if( bNodeSignatureOKay ) {
                optsSignOperation.arrSignResults.push( {
                    index: "" + nZeroBasedNodeIndex,
                    signature:
                        splitSignatureShare(
                            joOut.result.signResult.signatureShare
                        ),
                    fromNode: joNode, // extra, not needed for bls_glue
                    signResult: joOut.result.signResult
                } );
            } else
                ++optsSignOperation.joGatheringTracker.nCountErrors;
        }
    } catch ( err ) {
        ++optsSignOperation.joGatheringTracker.nCountErrors;
        if( log.id != optsSignOperation.details.id ) {
            log.critical( optsSignOperation.strLogPrefix, "S-Chain node ", strNodeDescColorized,
                " signature fail from node ", log.v( joNode.nodeID ), ", error is ",
                log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
                log.v( optsSignOperation.sequenceId ), ", stack is:", "\n" + log.s( err.stack ) );
        }
        optsSignOperation.details.critical( ptsSignOperation.strLogPrefix, "S-Chain node ",
            strNodeDescColorized,
            " signature fail from node ", log.v( joNode.nodeID ), ", error is ",
            log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
            log.v( optsSignOperation.sequenceId ), ", stack is:", "\n" + log.s( err.stack ) );
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
    const strNodeDescColorized = log.u( strNodeURL ) + " " + cc.debug( "(" ) + log.v( i ) +
        cc.debug( "/" ) + log.v( optsSignOperation.jarrNodes.length ) + cc.debug( ", ID " ) +
        log.v( joNode.nodeID ) + cc.debug( "), sequence ID is " ) +
        log.v( optsSignOperation.sequenceId );
    const rpcCallOpts = null;
    rpcCall.create(
        strNodeURL, rpcCallOpts, async function( joCall, err ) {
            if( err ) {
                ++optsSignOperation.joGatheringTracker.nCountReceived;
                ++optsSignOperation.joGatheringTracker.nCountErrors;
                if( log.id != optsSignOperation.details.id ) {
                    log.error( optsSignOperation.strLogPrefix,
                        "JSON RPC call(doSignProcessOneImpl) to S-Chain node ",
                        strNodeDescColorized, " failed, RPC call was not created, error is: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
                        log.v( optsSignOperation.sequenceId ) );
                }
                optsSignOperation.details.error( optsSignOperation.strLogPrefix,
                    "JSON RPC call(doSignProcessOneImpl) to S-Chain node ",
                    strNodeDescColorized, " failed, RPC call was not created, error is: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ), ", sequence ID is ",
                    log.v( optsSignOperation.sequenceId ) );
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
            optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
                log.generateTimestampString( null, true ), " ", "Will invoke ",
                log.v( "skale_imaVerifyAndSign" ), " to node #", i, " via ",
                log.u( strNodeURL ), " for transfer from chain ",
                log.v( optsSignOperation.fromChainName ), " to chain ",
                log.v( optsSignOperation.targetChainName ), " with params ", log.v( joParams ),
                ", sequence ID is ",
                log.v( optsSignOperation.sequenceId ) );
            await joCall.call( {
                "method": "skale_imaVerifyAndSign",
                "params": joParams
            }, async function( joIn, joOut, err ) {
                await doSignProcessHandleCall(
                    optsSignOperation, joNode, joParams, joIn, joOut, err, strNodeURL, i
                );
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
        cntSuccess: 0,
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
    optsSignOperation.strLogPrefix = optsSignOperation.strDirection + "/#" +
        optsSignOperation.nTransferLoopCounter + " " + "Sign msgs via " +
        ( optsSignOperation.imaState.isCrossImaBlsMode ? "IMA agent" : "skaled" ) + ": ";
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
            optsSignOperation.cntSuccess =
                optsSignOperation.joGatheringTracker.nCountReceived -
                optsSignOperation.joGatheringTracker.nCountErrors;
            if( optsSignOperation.cntSuccess >= optsSignOperation.nCountOfBlsPartsToCollect ) {
                optsSignOperation.details.trace( optsSignOperation.strLogPrefix,
                    log.generateTimestampString( null, true ), " Stop invoking ",
                    log.v( "skale_imaVerifyAndSign" ), " for transfer from chain ",
                    log.v( fromChainName ) + " at #", i,
                    " because successfully gathered count is reached ",
                    log.v( optsSignOperation.cntSuccess ) );
                break;
            }
            doSignProcessOneImpl( i, optsSignOperation );
        }
        await gatherSigningStartImpl( optsSignOperation );
        await gatherSigningFinishImpl( optsSignOperation );
    } catch ( err ) {
        if( ( !optsSignOperation.details ) || log.id != optsSignOperation.details.id ) {
            log.critical( "Failed BLS sign due to generic flow exception: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
        if( optsSignOperation.details ) {
            optsSignOperation.details.critical( "Failed BLS sign due to generic flow exception: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
        }
        if( ! optsSignOperation.bHaveResultReportCalled ) {
            optsSignOperation.bHaveResultReportCalled = true;
            await optsSignOperation.fn(
                "Failed BLS sign due to exception: " +
                owaspUtils.extractErrorMessage( err ),
                optsSignOperation.jarrMessages,
                null
            ).catch( ( err ) => {
                log.critical( "Failed BLS sign due to error-reporting callback exception: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
                if( optsSignOperation.details ) {
                    optsSignOperation.details.critical(
                        "Failed BLS sign due to error-reporting callback exception: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    optsSignOperation.details.exposeDetailsTo(
                        log, optsSignOperation.strGatheredDetailsName, false );
                    optsSignOperation.details.close();
                }
            } );
        }
    }
    optsSignOperation.details.success(
        log.v( optsSignOperation.strGatheredDetailsName ), " completed" );
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
    optsSignU256.details.debug( optsSignU256.strLogPrefix, "Will sign ",
        log.v( optsSignU256.u256 ), " value..." );
    optsSignU256.details.trace( optsSignU256.strLogPrefix, "Will query to sign ",
        log.v( optsSignU256.jarrNodes.length ), " skaled node(s)..." );
    optsSignU256.nThreshold =
        discoverBlsThreshold( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.nParticipants =
        discoverBlsParticipants( optsSignU256.imaState.joSChainNetworkInfo );
    optsSignU256.details.trace( optsSignU256.strLogPrefix,
        "Discovered BLS threshold is ", log.v( optsSignU256.nThreshold ), "." );
    optsSignU256.details.trace( optsSignU256.strLogPrefix,
        "Discovered number of BLS participants is ", log.v( optsSignU256.nParticipants ) + "." );
    if( ! checkBlsThresholdAndBlsParticipants(
        optsSignU256.nThreshold,
        optsSignU256.nParticipants,
        "prepare sign-U256",
        optsSignU256.details ) ) {
        await optsSignU256.fn(
            "signature error(1, u256), S-Chain information " +
            "was not discovered properly and BLS threshold/participants are unknown",
            optsSignU256.u256,
            null
        );
        return false;
    }
    optsSignU256.nCountOfBlsPartsToCollect = 0 + optsSignU256.nThreshold;
    optsSignU256.details.trace( optsSignU256.strLogPrefix,
        "Will(optsSignU256.u256) collect ", optsSignU256.nCountOfBlsPartsToCollect,
        " from ", optsSignU256.jarrNodes.length, " nodes" );
    return true;
}

async function doSignU256OneImpl( i, optsSignU256 ) {
    const imaState = state.get();
    const isThisNode = ( i == imaState.nNodeNumber ) ? true : false;
    const joNode = optsSignU256.jarrNodes[i];
    const strNodeURL = optsSignU256.imaState.isCrossImaBlsMode
        ? imaUtils.composeImaAgentNodeUrl( joNode, isThisNode )
        : imaUtils.composeSChainNodeUrl( joNode );
    const strNodeDescColorized = log.u( strNodeURL ) + " " + cc.debug( "(" ) + log.v( i ) +
        cc.debug( "/" ) + log.v( optsSignU256.jarrNodes.length ) +
        cc.debug( ", ID " ) + log.v( joNode.nodeID ) + cc.debug( ")" );
    const rpcCallOpts = null;
    await rpcCall.create( strNodeURL, rpcCallOpts, async function( joCall, err ) {
        ++optsSignU256.joGatheringTracker.nCountReceived;
        if( err ) {
            ++optsSignU256.joGatheringTracker.nCountErrors;
            if( log.id != optsSignU256.details.id ) {
                log.error( optsSignU256.strLogPrefix,
                    "JSON RPC call(doSignU256OneImpl) to S-Chain node ", strNodeDescColorized,
                    " failed, RPC call was not created, error is: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
            }
            optsSignU256.details.error( optsSignU256.strLogPrefix,
                "JSON RPC call(doSignU256OneImpl) to S-Chain node ", strNodeDescColorized,
                " failed, RPC call was not created, error is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ) );
            if( joCall )
                await joCall.disconnect();
            return;
        }
        optsSignU256.details.trace( optsSignU256.strLogPrefix, "Will invoke ",
            log.v( "skale_imaBSU256" ), " for to sign value ",
            log.v( optsSignU256.u256.toString() ) );
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
                    log.error( optsSignU256.strLogPrefix,
                        "JSON RPC call(doSignU256OneImpl) to S-Chain node ",
                        strNodeDescColorized, " failed, RPC call reported error: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                }
                optsSignU256.details.error( optsSignU256.strLogPrefix,
                    "JSON RPC call(doSignU256OneImpl) to S-Chain node ",
                    strNodeDescColorized, " failed, RPC call reported error: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
                await joCall.disconnect();
                return;
            }
            optsSignU256.details.trace( optsSignU256.strLogPrefix, "Did invoked ",
                log.v( "skale_imaBSU256" ), " for to sign value ",
                log.v( optsSignU256.u256.toString() ), ", answer is: ", log.v( joOut ) );
            if( joOut.result == null ||
                joOut.result == undefined ||
                ( !typeof joOut.result == "object" )
            ) {
                ++optsSignU256.joGatheringTracker.nCountErrors;
                if( log.id != optsSignU256.details.id ) {
                    log.error( optsSignU256.strLogPrefix,
                        "S-Chain node ", strNodeDescColorized, " reported wallet error: ",
                        log.em(
                            owaspUtils.extractErrorMessage( joOut, "unknown wallet error(2)" ) ) );
                }
                optsSignU256.details.error( optsSignU256.strLogPrefix,
                    "S-Chain node ", strNodeDescColorized, " reported wallet error: ",
                    log.em(
                        owaspUtils.extractErrorMessage( joOut, "unknown wallet error(2)" ) ) );
                await joCall.disconnect();
                return;
            }
            optsSignU256.details.trace( optsSignU256.strLogPrefix, "Node ",
                log.v( joNode.nodeID ), " sign result: ",
                log.v( joOut.result ? joOut.result : null ) );
            try {
                if( joOut.result.signResult.signatureShare.length > 0 &&
                    joOut.result.signResult.status === 0
                ) {
                    const nZeroBasedNodeIndex = joNode.imaInfo.thisNodeIndex - 1;
                    // partial BLS verification for one participant
                    let bNodeSignatureOKay = false; // initially assume signature is wrong
                    const strLogPrefixA = "BLS/#" + nZeroBasedNodeIndex + ": ";
                    try {
                        const cntSuccess = optsSignU256.joGatheringTracker.nCountReceived -
                            optsSignU256.joGatheringTracker.nCountErrors;
                        if( cntSuccess > optsSignU256.nCountOfBlsPartsToCollect ) {
                            ++optsSignU256.joGatheringTracker.nCountSkipped;
                            optsSignU256.details.notice( strLogPrefixA,
                                "Will ignore sign result for node ", nZeroBasedNodeIndex,
                                " because ", optsSignU256.nThreshold, "/",
                                optsSignU256.nCountOfBlsPartsToCollect,
                                " threshold number of BLS signature parts already gathered" );
                            return;
                        }
                        const arrTmp = joOut.result.signResult.signatureShare.split( ":" );
                        const joResultFromNode = {
                            index: "" + nZeroBasedNodeIndex,
                            signature: { X: arrTmp[0], Y: arrTmp[1] }
                        };
                        optsSignU256.details.trace( strLogPrefixA,
                            "Will verify sign result for node ", nZeroBasedNodeIndex );
                        const joPublicKey = discoverPublicKeyByIndex( nZeroBasedNodeIndex,
                            optsSignU256.imaState.joSChainNetworkInfo, optsSignU256.details,
                            true );
                        if( performBlsVerifyIU256(
                            optsSignU256.details, nZeroBasedNodeIndex, joResultFromNode,
                            optsSignU256.u256, joPublicKey ) ) {
                            optsSignU256.details.success( strLogPrefixA,
                                "Got successful BLS verification result for node ",
                                log.v( joNode.nodeID ), " with index ", nZeroBasedNodeIndex );
                            bNodeSignatureOKay = true; // node verification passed
                        } else {
                            const strError = "BLS u256 one node verify failed";
                            optsSignU256.details.error( strLogPrefixA,
                                " ", strError );
                        }
                    } catch ( err ) {
                        if( log.id != optsSignU256.details.id ) {
                            log.critical( strLogPrefixA, "S-Chain node ",
                                strNodeDescColorized, " sign ", " CRITICAL ERROR:",
                                " partial signature fail from with index ",
                                nZeroBasedNodeIndex, ", error is ",
                                log.em( owaspUtils.extractErrorMessage( err ) ),
                                ", stack is:", "\n", log.s( err.stack ) );
                        }
                        optsSignU256.details.critical( strLogPrefixA, "S-Chain node ",
                            strNodeDescColorized, " sign ", " CRITICAL ERROR:",
                            " partial signature fail from with index ",
                            nZeroBasedNodeIndex, ", error is ",
                            log.em( owaspUtils.extractErrorMessage( err ) ),
                            ", stack is:", "\n", log.s( err.stack ) );
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
                    log.critical( optsSignU256.strLogPrefix, "S-Chain node ",
                        strNodeDescColorized,
                        " signature fail from node ", log.v( joNode.nodeID ),
                        ", error is ", log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", stack is:", "\n", log.s( err.stack ) );
                }
                optsSignU256.details.critical( optsSignU256.strLogPrefix, "S-Chain node ",
                    strNodeDescColorized,
                    " signature fail from node ", log.v( joNode.nodeID ),
                    ", error is ", log.em( owaspUtils.extractErrorMessage( err ) ),
                    ", stack is:", "\n", log.s( err.stack ) );
            }
            await joCall.disconnect();
        } ); // joCall.call ...
    } ); // rpcCall.create ...
}

async function doSignU256Gathering( optsSignU256 ) {
    optsSignU256.details.debug( optsSignU256.strLogPrefix, "Waiting for BLS glue result " );
    optsSignU256.errGathering = null;
    optsSignU256.promiseCompleteGathering = new Promise( ( resolve, reject ) => {
        const iv = setInterval( function() {
            if( optsSignU256.joGatheringTracker.nCountReceivedPrevious !=
                optsSignU256.joGatheringTracker.nCountReceived ) {
                optsSignU256.details.debug(
                    "BLS u256 - BLS signature gathering progress updated, now have ",
                    optsSignU256.joGatheringTracker.nCountReceived, " BLS parts of ",
                    optsSignU256.nCountOfBlsPartsToCollect, " arrived, have ",
                    optsSignU256.cntSuccess, " success(es) and " ,
                    optsSignU256.joGatheringTracker.nCountErrors, " error(s)" );
                optsSignU256.joGatheringTracker.nCountReceivedPrevious =
                    0 + optsSignU256.joGatheringTracker.nCountReceived;
            }
            ++ optsSignU256.joGatheringTracker.nWaitIntervalStepsDone;
            const cntSuccess =
                optsSignU256.joGatheringTracker.nCountReceived -
                optsSignU256.joGatheringTracker.nCountErrors;
            if( cntSuccess >= optsSignU256.nCountOfBlsPartsToCollect ) {
                const strLogPrefixB = "BLS u256/Summary: ";
                clearInterval( iv );
                let strError = null, strSuccessfulResultDescription = null;
                const joGlueResult =
                    performBlsGlueU256(
                        optsSignU256.details, optsSignU256.u256, optsSignU256.arrSignResults );
                if( joGlueResult ) {
                    optsSignU256.details.success( strLogPrefixB,
                        "Got BLS glue u256 result: ", log.v( joGlueResult ) );
                    if( optsSignU256.imaState.strPathBlsVerify.length > 0 ) {
                        const joCommonPublicKey = discoverCommonPublicKey(
                            optsSignU256.imaState.joSChainNetworkInfo, false );
                        if( ! joCommonPublicKey ) {
                            strError = "No BLS common public key";
                            optsSignOperation.details.error( optsSignOperation.strLogPrefixB,
                                strError );
                        } else if( performBlsVerifyU256(
                            optsSignU256.details,
                            joGlueResult,
                            optsSignU256.u256,
                            joCommonPublicKey
                        )
                        ) {
                            strSuccessfulResultDescription =
                                "Got successful summary BLS u256 verification result";
                            optsSignU256.details.success( strLogPrefixB,
                                strSuccessfulResultDescription );
                        } else {
                            strError = "BLS verification failed";
                            if( log.id != optsSignU256.details.id )
                                log.error( strLogPrefixB, "BLS verification failure:", strError );

                            optsSignU256.details.error( strLogPrefixB,
                                "BLS verification failure:", strError );
                        }
                    }
                } else {
                    strError = "BLS u256 glue failed, no glue result arrived";
                    if( log.id != optsSignU256.details.id ) {
                        log.error( strLogPrefixB, "Problem(1) in BLS u256 sign result handler: ",
                            log.em( strError ) );
                    }
                    optsSignU256.details.error( strLogPrefixB,
                        "Problem(1) in BLS u256 sign result handler: ", log.em( strError ) );
                }
                optsSignU256.details.trace( "Will call signed-256 answer-sending callback ",
                    ( strError ? ( cc.debug( " with error " ) + log.v( strError ) ) : "" ),
                    ", u256 is ", log.v( optsSignU256.u256 ),
                    ", glue result is ", log.v( joGlueResult ) );
                optsSignU256.fn(
                    strError, optsSignU256.u256, joGlueResult )
                    .catch( ( err ) => {
                        if( log.id != optsSignU256.details.id ) {
                            log.critical( "Problem(2) in BLS u256 sign result handler: ",
                                log.em( owaspUtils.extractErrorMessage( err ) ) );
                        }
                        optsSignU256.details.critical(
                            "Problem(2) in BLS u256 sign result handler: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                        optsSignU256.errGathering =
                            "Problem(2) in BLS u256 sign result handler: " +
                            owaspUtils.extractErrorMessage( err );
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
                    optsSignU256.joGatheringTracker.nCountErrors +
                    " errors(s) for " + optsSignU256.jarrNodes.length + " node(s)",
                    optsSignU256.u256,
                    null
                ).catch( ( err ) => {
                    if( log.id != optsSignU256.details.id ) {
                        log.critical( "Problem(3) in BLS u256 sign result handler, ",
                            "not enough successful BLS signature parts(", cntSuccess,
                            " when all attempts done, error optsSignU256.details: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                    }
                    optsSignU256.details.critical( "Problem(3) in BLS u256 sign result handler, ",
                        "not enough successful BLS signature parts(", cntSuccess,
                        " when all attempts done, error optsSignU256.details: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    optsSignU256.errGathering =
                        "Problem(3) in BLS u256 sign result handler, " +
                        "not enough successful BLS signature parts(" +
                        cntSuccess + " when all attempts done, error optsSignU256.details: " +
                        owaspUtils.extractErrorMessage( err );
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
                    optsSignU256.joGatheringTracker.nCountErrors +
                    " errors(s) for " + optsSignU256.jarrNodes.length + " node(s)",
                    optsSignU256.u256,
                    null
                ).catch( ( err ) => {
                    if( log.id != optsSignU256.details.id ) {
                        log.error( "Problem(4) in BLS u256 sign result handler, ",
                            "not enough successful BLS signature parts(", cntSuccess,
                            ") and timeout reached, error optsSignU256.details: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                    }
                    optsSignU256.details.error( "Problem(4) in BLS u256 sign result handler, ",
                        "not enough successful BLS signature parts(", cntSuccess,
                        ") and timeout reached, error optsSignU256.details: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    optsSignU256.errGathering =
                        "Problem(4) in BLS u256 sign result handler, " +
                        "not enough successful BLS signature parts(" +
                        cntSuccess + ") and timeout reached, error optsSignU256.details: " +
                        owaspUtils.extractErrorMessage( err );
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
    optsSignU256.details.trace( optsSignU256.strLogPrefix, "Invoking signing u256 procedure " );
    optsSignU256.fn = optsSignU256.fn || function() {};
    if( !(
        optsSignU256.imaState.strPathBlsGlue.length > 0 &&
        optsSignU256.imaState.joSChainNetworkInfo
    ) ) {
        optsSignU256.details.warning( optsSignU256.strLogPrefix,
            "BLS u256 signing is unavailable" );
        await optsSignU256.fn( "BLS u256 signing is unavailable", optsSignU256.u256, null );
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
        if( log.id != optsSignU256.details.id ) {
            log.critical( "Failed to verify BLS and send message : ",
                log.em( owaspUtils.extractErrorMessage( err ) ) );
        }
        optsSignU256.details.critical( "Failed to verify BLS and send message : ",
            log.em( owaspUtils.extractErrorMessage( err ) ) );
    } );
    if( optsSignU256.errGathering ) {
        if( log.id != optsSignU256.details.id ) {
            log.error( "Failed BLS u256 sign result awaiting: ",
                log.em( optsSignU256.errGathering.toString() ) );
        }
        optsSignU256.details.error( "Failed BLS u256 sign result awaiting: ",
            log.em( optsSignU256.errGathering.toString() ) );
        return;
    }
    optsSignU256.details.information( optsSignU256.strLogPrefix,
        "Completed signing u256 procedure " );
}

export async function doVerifyReadyHash(
    strMessageHash,
    nZeroBasedNodeIndex,
    signature,
    isExposeOutput
) {
    const imaState = state.get();
    const strDirection = "RAW";
    const strLogPrefix = strDirection + "/BLS/#" + nZeroBasedNodeIndex + ": ";
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
        details.trace( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " - hashed verify message is ", log.v( strMessageHash ) );
        const joMsg = {
            "message": strMessageHash
        };
        details.debug( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " - composed  ", log.v( joMsg ), " using hash ", log.v( strMessageHash ), " and glue ",
            log.v( joResultFromNode ), " and public key ", log.v( joPublicKey ) );
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
        details.trace( strLogPrefix, "Will execute node #" + nZeroBasedNodeIndex,
            " BLS verify command:", "\n", log.v( strVerifyCommand ) );
        strOutput = childProcessModule.execSync( strVerifyCommand, { cwd: strActionDir } );
        details.trace( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,
            " verify output is:", "\n", log.v( strOutput ) );
        details.success( strLogPrefix, "BLS node #", nZeroBasedNodeIndex,+" verify success" );
        fnShellRestore();
        isSuccess = true;
    } catch ( err ) {
        if( log.id != details.id ) {
            log.critical( strLogPrefix, "BLS node #",
                nZeroBasedNodeIndex, " verify error, error description is: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n" + log.s( err.stack ) );
            log.critical( strLogPrefix, "BLS node#",
                nZeroBasedNodeIndex, " verify output is:", "\n",
                log.em( strOutput ) );
        }
        details.critical( strLogPrefix, "BLS node #",
            nZeroBasedNodeIndex, " verify error, error description is: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n" + log.s( err.stack ) );
        details.critical( strLogPrefix, "BLS node #" ,
            nZeroBasedNodeIndex, " verify output is:", "\n",
            log.em( strOutput ) );
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
        details.debug( strLogPrefix, "Will BLS-sign ready hash." );
        details.trace( strLogPrefix, "Discovered BLS threshold is ", nThreshold, "." );
        details.trace( strLogPrefix, "Discovered number of BLS participants is ",
            nParticipants, "." );
        details.trace( strLogPrefix, "hash value to sign is ", log.v( strMessageHash ) );
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
                    log.error( strLogPrefix,
                        "JSON RPC call(doSignReadyHash) to SGX failed, ",
                        "RPC call was not created, error is: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                }
                details.error( trLogPrefix,
                    "JSON RPC call(doSignReadyHash) to SGX failed, ",
                    "RPC call was not created, error is: ",
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
                if( joCall )
                    await joCall.disconnect();
                throw new Error(
                    "JSON RPC call to SGX failed, " +
                    "RPC call(doSignReadyHash) was not created, error is: " +
                    owaspUtils.extractErrorMessage( err )
                );
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
            details.trace( strLogPrefix, "Will invoke ", "SGX with call data ",
                log.v( joCallSGX ) );
            await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                if( err ) {
                    const jsErrorObject = new Error(
                        "JSON RPC call(doSignReadyHash) to SGX failed, RPC call reported error: " +
                        owaspUtils.extractErrorMessage( err )
                    );
                    if( log.id != details.id ) {
                        log.error( strLogPrefix, "JSON RPC call(doSignReadyHash) ",
                            "to SGX failed, RPC call reported error: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ),
                            ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                    }
                    details.error( strLogPrefix, "JSON RPC call(doSignReadyHash) ",
                        "to SGX failed, RPC call reported error: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                    await joCall.disconnect();
                    throw jsErrorObject;
                }
                details.trace( strLogPrefix, "Call to ", "SGX done, answer is: ",
                    log.v( joOut ) );
                joSignResult = joOut;
                if( joOut.result != null && joOut.result != undefined &&
                    typeof joOut.result == "object" )
                    joSignResult = joOut.result;
                if( joOut.signResult != null && joOut.signResult != undefined &&
                    typeof joOut.signResult == "object" )
                    joSignResult = joOut.signResult;
                if( "errorMessage" in joSignResult &&
                    typeof joSignResult.errorMessage == "string" &&
                    joSignResult.errorMessage.length > 0
                ) {
                    const strError =
                        "BLS signing finished with error: " + joSignResult.errorMessage;
                    joRetVal.error = strError;
                    if( log.id != details.id ) {
                        log.error( strLogPrefix, "BLS signing(1) finished with error: ",
                            log.em( joSignResult.errorMessage ) );
                    }
                    details.error( strLogPrefix, "BLS signing(1) finished with error: ",
                        log.em( joSignResult.errorMessage ) );
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
            log.error( strLogPrefix, "BLS-raw-signer error: ", log.em( strError ),
                ", stack is:", "\n", log.s( err.stack ) );
        }
        details.error( strLogPrefix, "BLS-raw-signer error: ", log.em( strError ),
            ", stack is:", "\n", log.s( err.stack ) );
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
    optsHandleVerifyAndSign.details.debug( optsHandleVerifyAndSign.strLogPrefix,
        "Will verify and sign ", log.v( optsHandleVerifyAndSign.joCallData ) );
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
    optsHandleVerifyAndSign.details.trace( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ),
        " verification algorithm will work for transfer from chain ",
        log.v( optsHandleVerifyAndSign.strFromChainName ), "/",
        log.v( optsHandleVerifyAndSign.strFromChainID ), " to chain",
        log.v( optsHandleVerifyAndSign.strToChainName ), "/",
        log.v( optsHandleVerifyAndSign.strToChainID ),
        " and work with array of message(s) ",
        log.v( optsHandleVerifyAndSign.jarrMessages ) );
    optsHandleVerifyAndSign.nThreshold =
        discoverBlsThreshold( optsHandleVerifyAndSign.imaState.joSChainNetworkInfo );
    optsHandleVerifyAndSign.nParticipants =
        discoverBlsParticipants( optsHandleVerifyAndSign.imaState.joSChainNetworkInfo );
    optsHandleVerifyAndSign.details.debug( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ),
        " verification algorithm discovered BLS threshold is ",
        log.v( optsHandleVerifyAndSign.nThreshold ), "." );
    optsHandleVerifyAndSign.details.debug( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ) +
        " verification algorithm discovered number of BLS participants is ",
        log.v( optsHandleVerifyAndSign.nParticipants ), "." );
    if( ! checkBlsThresholdAndBlsParticipants(
        optsHandleVerifyAndSign.nThreshold,
        optsHandleVerifyAndSign.nParticipants,
        "prepare handling of skale_imaVerifyAndSign",
        optsHandleVerifyAndSign.details ) )
        return false;
    optsHandleVerifyAndSign.strMessageHash =
        owaspUtils.removeStarting0x(
            keccak256Message(
                optsHandleVerifyAndSign.jarrMessages,
                optsHandleVerifyAndSign.nIdxCurrentMsgBlockStart,
                optsHandleVerifyAndSign.strFromChainName
            )
        );
    optsHandleVerifyAndSign.details.debug( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ),
        " verification algorithm message hash to sign is ",
        log.v( optsHandleVerifyAndSign.strMessageHash ) );
    return true;
}

async function prepareS2sOfSkaleImaVerifyAndSign( optsHandleVerifyAndSign ) {
    const strSChainNameSrc = optsHandleVerifyAndSign.joCallData.params.srcChainName;
    const strSChainNameDst = optsHandleVerifyAndSign.joCallData.params.dstChainName;
    optsHandleVerifyAndSign.details.trace( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ),
        " verification algorithm will use for source chain name ", log.v( strSChainNameSrc ),
        " and destination chain name ", log.v( strSChainNameDst ) );
    const arrSChainsCached = skaleObserver.getLastCachedSChains();
    if( ( !arrSChainsCached ) || arrSChainsCached.length == 0 ) {
        throw new Error(
            "Could not handle " + optsHandleVerifyAndSign.strDirection +
            " skale_imaVerifyAndSign(1), no S-Chains in SKALE NETWORK " +
            "observer cached yet, try again later"
        );
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
        throw new Error(
            "Could not handle " + optsHandleVerifyAndSign.strDirection +
            " skale_imaVerifyAndSign(2), failed to discover source " +
            "chain access parameters, try again later" );
    }
    optsHandleVerifyAndSign.details.trace( optsHandleVerifyAndSign.strLogPrefix,
        log.v( optsHandleVerifyAndSign.strDirection ),
        " verification algorithm discovered source chain URL is ", log.u( strUrlSrcSChain ),
        ", chain name is ", log.v( joSChainSrc.data.computed.computedSChainId ),
        ", chain id is ", log.v( joSChainSrc.data.computed.chainId ) );
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
        optsHandleVerifyAndSign.details.debug( optsHandleVerifyAndSign.strLogPrefix,
            "Will BLS-sign verified messages." );
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
                    log.error( optsHandleVerifyAndSign.strLogPrefix,
                        log.v( optsHandleVerifyAndSign.strDirection ),
                        "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, ",
                        "RPC call was not created, error is: " ,
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                }
                optsHandleVerifyAndSign.details.error( optsHandleVerifyAndSign.strLogPrefix,
                    log.v( optsHandleVerifyAndSign.strDirection ),
                    "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, ",
                    "RPC call was not created, error is: " ,
                    log.em( owaspUtils.extractErrorMessage( err ) ) );
                if( joCall )
                    await joCall.disconnect();
                throw new Error(
                    "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, " +
                    "RPC call was not created, error is: " +
                    owaspUtils.extractErrorMessage( err )
                );
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
            optsHandleVerifyAndSign.details.trace( optsHandleVerifyAndSign.strLogPrefix,
                log.v( optsHandleVerifyAndSign.strDirection ),
                " verification algorithm will invoke ", "SGX with call data ",
                log.v( joCallSGX ) );
            await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                if( err ) {
                    const strError =
                        "JSON RPC call(handleSkaleImaVerifyAndSign) " +
                        "to SGX failed, RPC call reported error: " +
                        owaspUtils.extractErrorMessage( err );
                    optsHandleVerifyAndSign.joRetVal.error = strError;
                    const jsErrorObject = new Error( strError );
                    if( log.id != optsHandleVerifyAndSign.details.id ) {
                        log.error( optsHandleVerifyAndSign.strLogPrefix,
                            "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, ",
                            "RPC call reported error: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ),
                            ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                    }
                    optsHandleVerifyAndSign.details.error( optsHandleVerifyAndSign.strLogPrefix,
                        "JSON RPC call(handleSkaleImaVerifyAndSign) to SGX failed, ",
                        "RPC call reported error: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ),
                        ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                    await joCall.disconnect();
                    throw jsErrorObject;
                }
                optsHandleVerifyAndSign.details.trace( optsHandleVerifyAndSign.strLogPrefix,
                    log.v( optsHandleVerifyAndSign.strDirection ) +
                    " Call to SGX done, answer is: ", log.v( joOut ) );
                let joSignResult = joOut;
                if( joOut.result != null && joOut.result != undefined &&
                    typeof joOut.result == "object" )
                    joSignResult = joOut.result;
                if( joOut.signResult != null && joOut.signResult != undefined &&
                    typeof joOut.signResult == "object" )
                    joSignResult = joOut.signResult;
                if( "qa" in optsHandleVerifyAndSign.joCallData )
                    optsHandleVerifyAndSign.joRetVal.qa = optsHandleVerifyAndSign.joCallData.qa;
                if( "errorMessage" in joSignResult &&
                    typeof joSignResult.errorMessage == "string" &&
                    joSignResult.errorMessage.length > 0
                ) {
                    optsHandleVerifyAndSign.isSuccess = false;
                    const strError =
                        "BLS signing finished with error: " + joSignResult.errorMessage;
                    optsHandleVerifyAndSign.joRetVal.error = strError;
                    if( log.id != optsHandleVerifyAndSign.details.id ) {
                        log.error( optsHandleVerifyAndSign.strLogPrefix,
                            "BLS signing(2) finished with error: ",
                            log.em( joSignResult.errorMessage ) );
                    }
                    optsHandleVerifyAndSign.details.error( optsHandleVerifyAndSign.strLogPrefix,
                        "BLS signing(2) finished with error: ",
                        log.em( joSignResult.errorMessage ) );
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
            log.critical( optsHandleVerifyAndSign.strLogPrefix,
                "IMA messages verifier/signer error: ", log.em( strError ),
                ", stack is:", "\n", log.s( err.stack ) );
        }
        optsHandleVerifyAndSign.details.critical( optsHandleVerifyAndSign.strLogPrefix,
            "IMA messages verifier/signer error: ", log.em( strError ),
            ", stack is:", "\n", log.s( err.stack ) );
    }
    optsHandleVerifyAndSign.details.exposeDetailsTo(
        log, "IMA messages verifier/signer", optsHandleVerifyAndSign.isSuccess );
    optsHandleVerifyAndSign.details.close();
    return optsHandleVerifyAndSign.joRetVal;
}

async function handleSkaleImaBSU256Prepare( optsBSU256 ) {
    optsBSU256.details.debug( optsBSU256.strLogPrefix +
        "Will U256-BLS-sign ", log.v( optsBSU256.joCallData ) );
    optsBSU256.nThreshold =
        discoverBlsThreshold( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.nParticipants =
        discoverBlsParticipants( optsBSU256.imaState.joSChainNetworkInfo );
    optsBSU256.details.trace( optsBSU256.strLogPrefix,
        "Discovered BLS threshold is ", optsBSU256.nThreshold, "." );
    optsBSU256.details.trace( optsBSU256.strLogPrefix,
        "Discovered number of BLS participants is ", optsBSU256.nParticipants, "." );
    if( ! checkBlsThresholdAndBlsParticipants(
        optsHandleVerifyAndSign.nThreshold,
        optsHandleVerifyAndSign.nParticipants,
        "handle BSU256Prepare",
        optsBSU256.details ) )
        return false;
    optsBSU256.u256 = optsBSU256.joCallData.params.valueToSign;
    optsBSU256.details.trace( optsBSU256.strLogPrefix,
        "U256 original value is ", log.v( optsBSU256.u256 ) );
    optsBSU256.strMessageHash = keccak256U256.u256( optsBSU256.u256, true );
    optsBSU256.details.trace( optsBSU256.strLogPrefix,
        "hash of U256 value to sign is ", log.v( optsBSU256.strMessageHash ) );
    optsBSU256.details.trace( optsBSU256.strLogPrefix, "Will BLS-sign U256." );
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
                        log.error( optsBSU256.strLogPrefix,
                            "JSON RPC call(handleSkaleImaBSU256) to SGX failed, ",
                            "RPC call was not created, error is: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ) );
                    }
                    optsBSU256.details.error( optsBSU256.strLogPrefix,
                        "JSON RPC call(handleSkaleImaBSU256) to SGX failed, ",
                        "RPC call was not created, error is: ",
                        log.em( owaspUtils.extractErrorMessage( err ) ) );
                    if( joCall )
                        await joCall.disconnect();
                    throw new Error( "JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                        "RPC call was not created, error is: " +
                        owaspUtils.extractErrorMessage( err ) );
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
                optsBSU256.details.trace( optsBSU256.strLogPrefix,
                    "Will invoke SGX with call data ", log.v( joCallSGX ) );
                await joCall.call( joCallSGX, async function( joIn, joOut, err ) {
                    if( err ) {
                        const jsErrorObject = new Error(
                            "JSON RPC call(handleSkaleImaBSU256) to SGX failed, " +
                            "RPC call reported error: " +
                            owaspUtils.extractErrorMessage( err ) );
                        if( log.id != optsBSU256.details.id ) {
                            log.error( optsBSU256.strLogPrefix,
                                "JSON RPC call(handleSkaleImaBSU256) to SGX failed, ",
                                "RPC call reported error: ",
                                log.em( owaspUtils.extractErrorMessage( err ) ),
                                ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                        }
                        optsBSU256.details.error( optsBSU256.strLogPrefix,
                            "JSON RPC call(handleSkaleImaBSU256) to SGX failed, ",
                            "RPC call reported error: ",
                            log.em( owaspUtils.extractErrorMessage( err ) ),
                            ", stack is:", "\n", log.s( jsErrorObject.stack ) );
                        await joCall.disconnect();
                        throw jsErrorObject;
                    }
                    optsBSU256.details.trace( optsBSU256.strLogPrefix,
                        "Call to SGX done, answer is: ", log.v( joOut ) );
                    let joSignResult = joOut;
                    if( joOut.result != null && joOut.result != undefined &&
                        typeof joOut.result == "object" )
                        joSignResult = joOut.result;
                    if( joOut.signResult != null && joOut.signResult != undefined &&
                        typeof joOut.signResult == "object" )
                        joSignResult = joOut.signResult;
                    if( "errorMessage" in joSignResult &&
                        typeof joSignResult.errorMessage == "string" &&
                        joSignResult.errorMessage.length > 0 ) {
                        optsBSU256.isSuccess = false;
                        const strError =
                            "BLS signing finished with error: " + joSignResult.errorMessage;
                        optsBSU256.joRetVal.error = strError;
                        if( log.id != optsBSU256.details.id ) {
                            log.error( optsBSU256.strLogPrefix,
                                "BLS signing(3) finished with error: ",
                                log.em( joSignResult.errorMessage ) );
                        }
                        optsBSU256.details.error( optsBSU256.strLogPrefix,
                            "BLS signing(3) finished with error: ",
                            log.em( joSignResult.errorMessage ) );
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
            log.critical( optsBSU256.strLogPrefix,
                "U256-BLS-signer error: ", log.em( strError ),
                ", stack is:", "\n", log.s( err.stack ) );
        }
        optsBSU256.details.critical( optsBSU256.strLogPrefix,
            "U256-BLS-signer error: ", log.em( strError ),
            ", stack is:", "\n", log.s( err.stack ) );
    }
    optsBSU256.details.exposeDetailsTo( log, "U256-BLS-signer", optsBSU256.isSuccess );
    optsBSU256.details.close();
    return optsBSU256.joRetVal;
}
