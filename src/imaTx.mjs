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
 * @file imaTx.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as path from "path";
import * as url from "url";
import * as childProcessModule from "child_process";

import Redis from "ioredis";
import * as ethereumJsUtilModule from "ethereumjs-util";

import * as log from "./log.mjs";
import * as cc from "./cc.mjs";

import * as owaspUtils from "./owaspUtils.mjs";
import * as imaUtils from "./utils.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaEventLogScan from "./imaEventLogScan.mjs";

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );

let redis = null;

let gFlagDryRunIsEnabled = true;

export function dryRunIsEnabled() {
    return ( !!gFlagDryRunIsEnabled );
}
export function dryRunEnable( isEnable ) {
    gFlagDryRunIsEnabled = ( isEnable != null && isEnable != undefined )
        ? ( !!isEnable ) : true;
    return ( !!gFlagDryRunIsEnabled );
}

let gFlagDryRunIsIgnored = true;

export function dryRunIsIgnored() {
    return ( !!gFlagDryRunIsIgnored );
}

export function dryRunIgnore( isIgnored ) {
    gFlagDryRunIsIgnored = ( isIgnored != null && isIgnored != undefined )
        ? ( !!isIgnored ) : true;
    return ( !!gFlagDryRunIsIgnored );
}

export async function dryRunCall(
    details,
    ethersProvider,
    strContractName, joContract, strMethodName, arrArguments,
    joAccount, strActionName, isDryRunResultIgnore,
    gasPrice, gasValue, weiHowMuch,
    opts
) {
    if( ! dryRunIsEnabled() )
        return null; // success
    isDryRunResultIgnore = ( isDryRunResultIgnore != null && isDryRunResultIgnore != undefined )
        ? ( !!isDryRunResultIgnore ) : false;
    const strContractMethodDescription =
        cc.notice( strContractName ) + cc.debug( "(" ) + cc.info( joContract.address ) +
        cc.debug( ")." ) + cc.notice( strMethodName );
    let strArgumentsDescription = "";
    if( arrArguments.length > 0 ) {
        strArgumentsDescription += cc.debug( "( " );
        for( let i = 0; i < arrArguments.length; ++ i ) {
            if( i > 0 )
                strArgumentsDescription += cc.debug( ", " );
            strArgumentsDescription += cc.j( arrArguments[i] );
        }
        strArgumentsDescription += cc.debug( " )" );
    } else
        strArgumentsDescription += cc.debug( "()" );
    const strContractCallDescription = strContractMethodDescription + strArgumentsDescription;
    const strLogPrefix = strContractMethodDescription + " ";
    try {
        details.trace( "Dry-run of action ", cc.info( strActionName ), "..." );
        details.trace( "Will dry-run ", strContractCallDescription, "..." );
        const strAccountWalletAddress = joAccount.address();
        const callOpts = {
            from: strAccountWalletAddress
        };
        if( gasPrice )
            callOpts.gasPrice = owaspUtils.toBN( gasPrice ).toHexString();
        if( gasValue )
            callOpts.gasLimit = owaspUtils.toBN( gasValue ).toHexString();
        if( weiHowMuch )
            callOpts.value = owaspUtils.toBN( weiHowMuch ).toHexString();
        const joDryRunResult =
            await joContract.callStatic[strMethodName]( ...arrArguments, callOpts );
        details.trace( strLogPrefix, "dry-run success: ", cc.j( joDryRunResult ) );
        return null; // success
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        details.error( strLogPrefix, "dry-run error: ", cc.warning( strError ) );
        if( dryRunIsIgnored() )
            return null;
        return strError;
    }
}

async function payedCallPrepare( optsPayedCall ) {
    optsPayedCall.joACI = getAccountConnectivityInfo( optsPayedCall.joAccount );
    if( optsPayedCall.gasPrice ) {
        optsPayedCall.callOpts.gasPrice =
            owaspUtils.toBN( optsPayedCall.gasPrice ).toHexString();
    }
    if( optsPayedCall.estimatedGas ) {
        optsPayedCall.callOpts.gasLimit =
            owaspUtils.toBN( optsPayedCall.estimatedGas ).toHexString();
    }
    if( optsPayedCall.weiHowMuch ) {
        optsPayedCall.callOpts.value =
            owaspUtils.toBN( optsPayedCall.weiHowMuch ).toHexString();
    }
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Payed-call of action ", cc.info( optsPayedCall.strActionName ),
        " will do payed-call ", optsPayedCall.strContractCallDescription,
        " with call options ", cc.j( optsPayedCall.callOpts ),
        " via ", cc.attention( optsPayedCall.joACI.strType ),
        "-sign-and-send using from address ",
        cc.notice( optsPayedCall.joAccount.address() ), "..." );
    optsPayedCall.unsignedTx =
        await optsPayedCall.joContract.populateTransaction[optsPayedCall.strMethodName](
            ...optsPayedCall.arrArguments, optsPayedCall.callOpts );
    optsPayedCall.unsignedTx.nonce =
        owaspUtils.toBN( await optsPayedCall.ethersProvider.getTransactionCount(
            optsPayedCall.joAccount.address() )
        );
    if( optsPayedCall.opts && optsPayedCall.opts.isCheckTransactionToSchain ) {
        optsPayedCall.unsignedTx = await checkTransactionToSchain(
            optsPayedCall.unsignedTx, optsPayedCall.details,
            optsPayedCall.ethersProvider, optsPayedCall.joAccount );
    }
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "populated transaction: ", cc.j( optsPayedCall.unsignedTx ) );
    optsPayedCall.rawTx =
        owaspUtils.ethersMod.ethers.utils.serializeTransaction( optsPayedCall.unsignedTx );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Raw transaction: ", cc.j( optsPayedCall.rawTx ) );
    optsPayedCall.txHash = owaspUtils.ethersMod.ethers.utils.keccak256( optsPayedCall.rawTx );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Transaction hash: ", cc.j( optsPayedCall.txHash ) );
}

async function payedCallTM( optsPayedCall ) {
    const promiseComplete = new Promise( function( resolve, reject ) {
        const doTM = async function() {
            const txAdjusted =
                optsPayedCall.unsignedTx; // JSON.parse( JSON.stringify( optsPayedCall.rawTx ) );
            const arrNamesConvertToHex = [ "gas", "gasLimit", "optsPayedCall.gasPrice", "value" ];
            for( let idxName = 0; idxName < arrNamesConvertToHex.length; ++ idxName ) {
                const strName = arrNamesConvertToHex[idxName];
                if( strName in txAdjusted &&
                    typeof txAdjusted[strName] == "object" &&
                    typeof txAdjusted[strName].toHexString == "function"
                )
                    txAdjusted[strName] = owaspUtils.toHexStringSafe( txAdjusted[strName] );
            }
            if( "gasLimit" in txAdjusted )
                delete txAdjusted.gasLimit;
            if( "chainId" in txAdjusted )
                delete txAdjusted.chainId;
            const { chainId } = await optsPayedCall.ethersProvider.getNetwork();
            txAdjusted.chainId = chainId;
            optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
                "Adjusted transaction: ", cc.j( txAdjusted ) );
            if( redis == null )
                redis = new Redis( optsPayedCall.joAccount.strTransactionManagerURL );
            const priority = optsPayedCall.joAccount.nTmPriority || 5;
            optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
                "TM priority: ", cc.j( priority ) );
            try {
                const [ idTransaction, joReceiptFromTM ] =
                    await tmEnsureTransaction(
                        optsPayedCall.details, optsPayedCall.ethersProvider, priority, txAdjusted );
                optsPayedCall.joReceipt = joReceiptFromTM;
                optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
                    "ID of TM-transaction : ", cc.j( idTransaction ) );
                const txHashSent = "" + optsPayedCall.joReceipt.transactionHash;
                optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
                    "Hash of sent TM-transaction: ", cc.j( txHashSent ) );
                resolve( optsPayedCall.joReceipt );
            } catch ( err ) {
                const strError = cc.fatal( "BAD ERROR:" ) + " " +
                    cc.error( "TM-transaction was not sent, underlying error is: " ) +
                    cc.warning( err.toString() );
                optsPayedCall.details.critical( optsPayedCall.strLogPrefix, strError );
                if( log.id != optsPayedCall.details.id )
                    log.critical( optsPayedCall.strLogPrefix, strError );
                reject( err );
            }
        };
        doTM();
    } );
    await Promise.all( [ promiseComplete ] );
}

async function payedCallSGX( optsPayedCall ) {
    const tx = optsPayedCall.unsignedTx;
    let { chainId } = await optsPayedCall.ethersProvider.getNetwork();
    if( chainId == "string" )
        chainId = owaspUtils.parseIntOrHex( chainId );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Chain ID is: ", cc.info( chainId ) );
    const strCmd = "" + process.argv[0] + " --no-warnings ./imaSgxExternalSigner.mjs " +
        ( cc.isEnabled() ? "true" : "false" ) + " " +
        "\"" + optsPayedCall.joAccount.strSgxURL + "\" " +
        "\"" + optsPayedCall.joAccount.strSgxKeyName + "\" " +
        "\"" + owaspUtils.ethersProviderToUrl( optsPayedCall.ethersProvider ) + "\" " +
        "\"" + chainId + "\" " +
        "\"" + ( tx.data ? tx.data : "" ) + "\" " +
        "\"" + tx.to + "\" " +
        "\"" + owaspUtils.toHexStringSafe( tx.value ) + "\" " +
        "\"" + owaspUtils.toHexStringSafe( tx.gasPrice ) + "\" " +
        "\"" + owaspUtils.toHexStringSafe( tx.gasLimit ) + "\" " +
        "\"" + owaspUtils.toHexStringSafe( tx.nonce ) + "\" " +
        "\"" + ( optsPayedCall.joAccount.strPathSslCert
        ? optsPayedCall.joAccount.strPathSslCert : "" ) + "\" " +
        "\"" + ( optsPayedCall.joAccount.strPathSslKey
        ? optsPayedCall.joAccount.strPathSslKey : "" ) + "\" " +
        "";
    const joSpawnOptions = {
        shell: true,
        cwd: __dirname,
        env: {},
        encoding: "utf-8"
    };
    const rv = childProcessModule.spawnSync( strCmd, joSpawnOptions );
    const strStdOutFromExternalInvocation = rv.stdout.toString( "utf8" );
    optsPayedCall.joReceipt = JSON.parse( strStdOutFromExternalInvocation.toString( "utf8" ) );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Result from external SGX signer is: ", cc.j( optsPayedCall.joReceipt ) );
    postConvertBN( optsPayedCall.joReceipt, "gasUsed" );
    postConvertBN( optsPayedCall.joReceipt, "cumulativeGasUsed" );
    postConvertBN( optsPayedCall.joReceipt, "effectiveGasPrice" );
}

function postConvertBN( jo, name ) {
    if( ! jo )
        return;
    if( ! ( name in jo ) )
        return;
    if( typeof jo[name] == "object" )
        return;
    jo[name] = owaspUtils.toBN( jo[name] );
}

async function payedCallDirect( optsPayedCall ) {
    const ethersWallet =
        new owaspUtils.ethersMod.ethers.Wallet(
            owaspUtils.ensureStartsWith0x(
                optsPayedCall.joAccount.privateKey ),
            optsPayedCall.ethersProvider );

    let { chainId } = await optsPayedCall.ethersProvider.getNetwork();
    if( chainId == "string" )
        chainId = owaspUtils.parseIntOrHex( chainId );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix, "Chain ID is: ", cc.info( chainId ) );
    if( ( !( chainId in optsPayedCall.unsignedTx ) ) ||
        ( !optsPayedCall.unsignedTx.chainId )
    ) {
        optsPayedCall.unsignedTx.chainId = chainId;
        optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
            "TX with chainId: ", cc.j( optsPayedCall.unsignedTx ) );
    }
    const joSignedTX = await ethersWallet.signTransaction( optsPayedCall.unsignedTx );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Signed transaction: ", cc.j( joSignedTX ) );
    const sr = await optsPayedCall.ethersProvider.sendTransaction(
        owaspUtils.ensureStartsWith0x( joSignedTX ) );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Raw-sent transaction result: ", cc.j( sr ) );
    optsPayedCall.joReceipt =
        await optsPayedCall.ethersProvider.waitForTransaction( sr.hash );
    optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
        "Transaction receipt:", cc.j( optsPayedCall.joReceipt ) );
}

export async function payedCall(
    details,
    ethersProvider,
    strContractName, joContract, strMethodName, arrArguments,
    joAccount, strActionName,
    gasPrice, estimatedGas, weiHowMuch,
    opts
) {
    const optsPayedCall = {
        details: details,
        ethersProvider: ethersProvider,
        strContractName: strContractName,
        joContract: joContract,
        strMethodName: strMethodName,
        arrArguments: arrArguments,
        joAccount: joAccount,
        strActionName: strActionName,
        gasPrice: gasPrice,
        estimatedGas: estimatedGas,
        weiHowMuch: weiHowMuch,
        opts: opts,
        strContractCallDescription: "",
        strLogPrefix: "",
        joACI: null,
        unsignedTx: null,
        rawTx: null,
        txHash: null,
        joReceipt: null,
        callOpts: {
        }
    };
    const strContractMethodDescription = cc.notice( optsPayedCall.strContractName ) +
        cc.debug( "(" ) + cc.info( optsPayedCall.joContract.address ) +
        cc.debug( ")." ) + cc.info( optsPayedCall.strMethodName );
    let strArgumentsDescription = "";
    if( optsPayedCall.arrArguments.length > 0 ) {
        strArgumentsDescription += cc.debug( "( " );
        for( let i = 0; i < optsPayedCall.arrArguments.length; ++ i ) {
            if( i > 0 )
                strArgumentsDescription += cc.debug( ", " );
            strArgumentsDescription += cc.j( optsPayedCall.arrArguments[i] );
        }
        strArgumentsDescription += cc.debug( " )" );
    } else
        strArgumentsDescription += cc.debug( "()" );
    optsPayedCall.strContractCallDescription =
        strContractMethodDescription + strArgumentsDescription;
    optsPayedCall.strLogPrefix = strContractMethodDescription + " ";
    try {
        await payedCallPrepare( optsPayedCall );
        switch ( optsPayedCall.joACI.strType ) {
        case "tm":
            await payedCallTM( optsPayedCall );
            break;
        case "sgx":
            await payedCallSGX( optsPayedCall );
            break;
        case "direct":
            await payedCallDirect( optsPayedCall );
            break;
        default: {
            const strErrorPrefix = "CRITICAL TRANSACTION SIGN AND SEND ERROR(INNER FLOW):";
            const s = cc.fatal( strErrorPrefix ) + " " +
                cc.error( "bad credentials information specified, " +
                    "no explicit SGX and no explicit private key found" );
            optsPayedCall.details.critical( s );
            if( log.id != optsPayedCall.details.id )
                log.critical( s );
            throw new Error( strErrorPrefix + " bad credentials information specified, " +
                "no explicit SGX and no explicit private key found" );
        } // NOTICE: "break;" is not needed here because of "throw" above
        } // switch( optsPayedCall.joACI.strType )
    } catch ( err ) {
        const strErrorPrefix = "CRITICAL TRANSACTION SIGN AND SEND ERROR(OUTER FLOW):";
        const s =
            optsPayedCall.strLogPrefix + cc.error( strErrorPrefix ) + " " +
            cc.warning( owaspUtils.extractErrorMessage( err ) ) +
            cc.error( ", stack is: " ) + "\n" + cc.stack( err.stack );
        optsPayedCall.details.critical( s );
        if( log.id != optsPayedCall.details.id )
            log.critical( s );
        throw new Error( strErrorPrefix +
            " invoking the " + optsPayedCall.strContractCallDescription +
            ", error is: " + owaspUtils.extractErrorMessage( err ) );
    }
    optsPayedCall.details.success( optsPayedCall.strLogPrefix, "Done, TX was ",
        cc.attention( optsPayedCall.joACI ? optsPayedCall.joACI.strType : "N/A" ),
        "-signed-and-sent, receipt is ", cc.j( optsPayedCall.joReceipt ) );
    try {
        const bnGasSpent = owaspUtils.toBN( optsPayedCall.joReceipt.cumulativeGasUsed );
        const gasSpent = bnGasSpent.toString();
        const ethSpent =
            owaspUtils.ethersMod.ethers.utils.formatEther(
                optsPayedCall.joReceipt.cumulativeGasUsed.mul(
                    optsPayedCall.unsignedTx.gasPrice ) );
        optsPayedCall.joReceipt.summary = {
            bnGasSpent: bnGasSpent,
            gasSpent: gasSpent,
            ethSpent: ethSpent
        };
        optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
            cc.debug( "gas spent: " ), cc.info( gasSpent ) );
        optsPayedCall.details.trace( optsPayedCall.strLogPrefix,
            cc.debug( "ETH spent: " ), cc.info( ethSpent ) );
    } catch ( err ) {
        optsPayedCall.details.warning(
            optsPayedCall.strLogPrefix, cc.error( "WARNING: " ),
            "TX stats computation error ", cc.error( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", + "\n" + cc.stack( err.stack ) );
    }
    return optsPayedCall.joReceipt;
}

export async function checkTransactionToSchain(
    unsignedTx,
    details,
    ethersProvider,
    joAccount
) {
    const strLogPrefix = cc.attention( "PoW-mining:" ) + " ";
    try {
        const strFromAddress = joAccount.address(); // unsignedTx.from;
        const requiredBalance = unsignedTx.gasPrice.mul( unsignedTx.gasLimit );
        const balance = owaspUtils.toBN( await ethersProvider.getBalance( strFromAddress ) );
        details.trace( strLogPrefix, "Will check whether PoW-mining  is needed for sender ",
            cc.notice( strFromAddress ), " with balance ",
            cc.info( owaspUtils.toHexStringSafe( balance ) ), " using required balance ",
            cc.info( owaspUtils.toHexStringSafe( requiredBalance ) ), ", gas limit is ",
            cc.info( owaspUtils.toHexStringSafe( unsignedTx.gasLimit ) ),
            " gas, checked unsigned transaction is ", cc.j( unsignedTx ) );
        if( balance.lt( requiredBalance ) ) {
            details.warning( strLogPrefix, "Insufficient funds for ",
                cc.notice( strFromAddress ), ", will run PoW-mining to get ",
                cc.info( owaspUtils.toHexStringSafe( unsignedTx.gasLimit ) ),
                " of gas" );
            let powNumber =
                await calculatePowNumber(
                    strFromAddress,
                    owaspUtils.toBN( unsignedTx.nonce ).toHexString(),
                    owaspUtils.toHexStringSafe( unsignedTx.gasLimit ),
                    details,
                    strLogPrefix
                );
            details.debug( strLogPrefix, "Returned PoW-mining number ",
                cc.sunny( powNumber ) );
            powNumber = powNumber.toString().trim();
            powNumber = imaUtils.replaceAll( powNumber, "\r", "" );
            powNumber = imaUtils.replaceAll( powNumber, "\n", "" );
            powNumber = imaUtils.replaceAll( powNumber, "\t", "" );
            powNumber = powNumber.trim();
            details.trace( strLogPrefix, "Trimmed PoW-mining number is ", cc.sunny( powNumber ) );
            if( ! powNumber ) {
                throw new Error(
                    "Failed to compute gas price with PoW-mining (1), got empty text" );
            }
            powNumber = owaspUtils.toBN( owaspUtils.ensureStartsWith0x( powNumber ) );
            details.trace( strLogPrefix, "BN PoW-mining number is ", cc.j( powNumber ) );
            if( powNumber.eq( owaspUtils.toBN( "0" ) ) ) {
                throw new Error(
                    "Failed to compute gas price with PoW-mining (2), got zero value" );
            }
            unsignedTx.gasPrice = owaspUtils.toBN( powNumber.toHexString() );
            details.success( strLogPrefix, "Success, finally (after PoW-mining) " +
                "modified unsigned transaction is ", cc.j( unsignedTx ) );
        } else {
            details.success( strLogPrefix, "Have sufficient funds for ",
                cc.notice( strFromAddress ), ", PoW-mining is not needed and will be skipped" );
        }
    } catch ( err ) {
        details.critical( strLogPrefix,
            cc.fatal( "CRITICAL PoW-mining ERROR(checkTransactionToSchain):" ),
            " exception occur before PoW-mining, error is: ",
            cc.warning( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", cc.stack( err.stack ) );
    }
    return unsignedTx;
}

export async function calculatePowNumber( address, nonce, gas, details, strLogPrefix ) {
    try {
        let _address = owaspUtils.ensureStartsWith0x( address );
        _address = ethereumJsUtilModule.toChecksumAddress( _address );
        _address = owaspUtils.removeStarting0x( _address );
        const _nonce = owaspUtils.parseIntOrHex( nonce );
        const _gas = owaspUtils.parseIntOrHex( gas );
        const powScriptPath = path.join( __dirname, "pow" );
        const cmd = `${powScriptPath} ${_address} ${_nonce} ${_gas}`;
        details.trace( strLogPrefix, "Will run PoW-mining command: ", cc.notice( cmd ) );
        const res = childProcessModule.execSync( cmd );
        details.trace( strLogPrefix, "Got PoW-mining execution result: ", cc.notice( res ) );
        return res;
    } catch ( err ) {
        details.critical( strLogPrefix,
            cc.fatal( "CRITICAL PoW-mining ERROR(calculatePowNumber):" ),
            " exception occur during PoW-mining, error is: ",
            cc.warning( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", cc.stack( err.stack ) );
        throw err;
    }
}

export function getAccountConnectivityInfo( joAccount ) {
    const joACI = {
        "isBad": true,
        "strType": "bad",
        "isAutoSend": false
    };
    if( "strTransactionManagerURL" in joAccount &&
        typeof joAccount.strTransactionManagerURL == "string" &&
        joAccount.strTransactionManagerURL.length > 0
    ) {
        joACI.isBad = false;
        joACI.strType = "tm";
        joACI.isAutoSend = true;
    } else if( "strSgxURL" in joAccount &&
        typeof joAccount.strSgxURL == "string" &&
        joAccount.strSgxURL.length > 0 &&
        "strSgxKeyName" in joAccount &&
        typeof joAccount.strSgxKeyName == "string" &&
        joAccount.strSgxKeyName.length > 0
    ) {
        joACI.isBad = false;
        joACI.strType = "sgx";
    } else if( "privateKey" in joAccount &&
        typeof joAccount.privateKey == "string" &&
        joAccount.privateKey.length > 0
    ) {
        joACI.isBad = false;
        joACI.strType = "direct";
    } else {
        // bad by default
    }
    return joACI;
}

const gTransactionManagerPool = "transactions";

const tmGenerateRandomHex =
    size => [ ...Array( size ) ]
        .map( () => Math.floor( Math.random() * 16 ).toString( 16 ) ).join( "" );

function tmMakeId( details ) {
    const prefix = "tx-";
    const unique = tmGenerateRandomHex( 16 );
    const id = prefix + unique + "js";
    details.trace( "TM - Generated id: ", cc.notice( id ) );
    return id;
}

function tmMakeRecord( tx = {}, score ) {
    const status = "PROPOSED";
    return JSON.stringify( {
        "score": score,
        "status": status,
        ...tx
    } );
}

function tmMakeScore( priority ) {
    const ts = imaHelperAPIs.currentTimestamp();
    return priority * Math.pow( 10, ts.toString().length ) + ts;
}

async function tmSend( details, tx, priority = 5 ) {
    details.trace( "TM - sending tx ", cc.j( tx ), " ts: ",
        cc.info( imaHelperAPIs.currentTimestamp() ) );
    const id = tmMakeId( details );
    const score = tmMakeScore( priority );
    const record = tmMakeRecord( tx, score );
    details.trace( "TM - Sending score: ", cc.info( score ), ", record: ", cc.info( record ) );
    const expiration = 24 * 60 * 60; // 1 day;
    await redis.multi()
        .set( id, record, "EX", expiration )
        .zadd( gTransactionManagerPool, score, id )
        .exec();
    return id;
}

function tmIsFinished( record ) {
    if( record == null )
        return null;
    return [ "SUCCESS", "FAILED", "DROPPED" ].includes( record.status );
}

async function tmGetRecord( txId ) {
    const r = await redis.get( txId );
    if( r != null )
        return JSON.parse( r );
    return null;
}

async function tmWait( details, txId, ethersProvider, nWaitSeconds = 36000 ) {
    const strPrefixDetails = cc.debug( "(gathered details)" ) + " ";
    const strPrefixLog = cc.debug( "(immediate log)" ) + " ";
    let strMsg =
        cc.debug( "TM - will wait TX " ) + cc.info( txId ) +
        cc.debug( " to complete for " ) + cc.info( nWaitSeconds ) +
        cc.debug( " second(s) maximum" );
    details.debug( strPrefixDetails, strMsg );
    if( log.id != details.id )
        log.debug( strPrefixLog, strMsg );
    const startTs = imaHelperAPIs.currentTimestamp();
    while( ! tmIsFinished( await tmGetRecord( txId ) ) &&
                ( imaHelperAPIs.currentTimestamp() - startTs ) < nWaitSeconds )
        await imaHelperAPIs.sleep( 500 );
    const r = await tmGetRecord( txId );
    strMsg = cc.debug( "TM - TX " ) + cc.info( txId ) + cc.debug( " record is " ) +
        cc.info( JSON.stringify( r ) );
    details.debug( strPrefixDetails, strMsg );
    if( log.id != details.id )
        log.debug( strPrefixLog, strMsg );
    if( ( !r ) ) {
        strMsg = cc.error( "TM - TX " ) + cc.info( txId ) + cc.error( " status is " ) +
            cc.warning( "NULL RECORD" );
        details.error( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.error( strPrefixLog, strMsg );
    } else if( r.status == "SUCCESS" ) {
        strMsg = cc.success( "TM - TX " ) + cc.info( txId ) + cc.success( " success" );
        details.information( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.information( strPrefixLog, strMsg );
    } else {
        strMsg = cc.error( "TM - TX " ) + cc.info( txId ) + cc.error( " status is " ) +
            cc.warning( r.status );
        details.error( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.error( strPrefixLog, strMsg );
    }
    if( ( !tmIsFinished( r ) ) || r.status == "DROPPED" ) {
        strMsg = cc.error( "TM - TX " ) + cc.info( txId ) +
            cc.error( " was unsuccessful, wait failed" ) + "\n";
        details.error( strMsg );
        if( log.id != details.id )
            log.error( strMsg );
        return null;
    }
    const joReceipt = await imaEventLogScan.safeGetTransactionReceipt(
        details, 10, ethersProvider, r.tx_hash );
    if( !joReceipt ) {
        strMsg = cc.error( "TM - TX " ) + cc.info( txId ) +
            cc.error( " was unsuccessful, failed to fetch transaction receipt" );
        details.error( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.error( strPrefixLog, strMsg );
        return null;
    }
    return joReceipt;
}

async function tmEnsureTransaction(
    details, ethersProvider, priority, txAdjusted, cntAttempts, sleepMilliseconds
) {
    cntAttempts = cntAttempts || 1;
    sleepMilliseconds = sleepMilliseconds || ( 30 * 1000 );
    let txId = "";
    let joReceipt = null;
    let idxAttempt = 0;
    const strPrefixDetails = cc.debug( "(gathered details)" ) + " ";
    const strPrefixLog = cc.debug( "(immediate log)" ) + " ";
    for( ; idxAttempt < cntAttempts; ++idxAttempt ) {
        txId = await tmSend( details, txAdjusted, priority );
        let strMsg = cc.debug( "TM - next TX " ) + cc.info( txId );
        details.debug( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.debug( strPrefixLog, strMsg );
        joReceipt = await tmWait( details, txId, ethersProvider );
        if( joReceipt )
            break;
        strMsg =
            cc.warning( "TM - unsuccessful TX " ) + cc.info( txId ) +
            cc.warning( " sending attempt " ) + cc.info( idxAttempt ) +
            cc.warning( " of " ) + cc.info( cntAttempts ) +
            cc.debug( " receipt: " ) + cc.info( joReceipt );
        details.error( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.error( strPrefixLog, strMsg );
        await imaHelperAPIs.sleep( sleepMilliseconds );
    }
    if( !joReceipt ) {
        const strMsg =
            cc.fatal( "BAD ERROR:" ) + " " + cc.error( "TM TX " ) + cc.info( txId ) +
            cc.error( " transaction has been dropped" );
        details.error( strPrefixDetails, strMsg );
        if( log.id != details.id )
            log.error( strPrefixLog, strMsg );
        throw new Error( "TM unsuccessful transaction " + txId );
    }
    const strMsg =
        cc.success( "TM - successful TX " ) + cc.info( txId ) +
        cc.success( ", sending attempt " ) + cc.info( idxAttempt ) +
        cc.success( " of " ) + cc.info( cntAttempts );
    details.information( strPrefixDetails, strMsg );
    if( log.id != details.id )
        log.information( strPrefixLog, strMsg );
    return [ txId, joReceipt ];
}

export class TransactionCustomizer {
    constructor( gasPriceMultiplier, gasMultiplier ) {
        this.gasPriceMultiplier = gasPriceMultiplier
            ? ( 0.0 + gasPriceMultiplier )
            : null; // null means use current gasPrice or recommendedGasPrice
        this.gasMultiplier = gasMultiplier ? ( 0.0 + gasMultiplier ) : 1.25;
    }
    async computeGasPrice( ethersProvider, maxGasPrice ) {
        const gasPrice =
            owaspUtils.parseIntOrHex(
                owaspUtils.toBN(
                    await ethersProvider.getGasPrice() ).toHexString() );
        if( gasPrice == 0 ||
            gasPrice == null ||
            gasPrice == undefined ||
            gasPrice <= 1000000000
        )
            return owaspUtils.toBN( "1000000000" ).toHexString();
        else if(
            this.gasPriceMultiplier != null &&
            this.gasPriceMultiplier != undefined &&
            this.gasPriceMultiplier >= 0 &&
            maxGasPrice != null &&
            maxGasPrice != undefined
        ) {
            let gasPriceMultiplied = gasPrice * this.gasPriceMultiplier;
            if( gasPriceMultiplied > maxGasPrice )
                gasPriceMultiplied = maxGasPrice;
            return owaspUtils.toBN( maxGasPrice );
        } else
            return gasPrice;
    }
    async computeGas(
        details,
        ethersProvider,
        strContractName, joContract, strMethodName, arrArguments,
        joAccount, strActionName,
        gasPrice, gasValueRecommended, weiHowMuch,
        opts
    ) {
        let estimatedGas = 0;
        const strContractMethodDescription =
            cc.notice( strContractName ) + cc.debug( "(" ) + cc.info( joContract.address ) +
            cc.debug( ")." ) + cc.notice( strMethodName );
        let strArgumentsDescription = "";
        if( arrArguments.length > 0 ) {
            strArgumentsDescription += cc.debug( "( " );
            for( let i = 0; i < arrArguments.length; ++ i ) {
                if( i > 0 )
                    strArgumentsDescription += cc.debug( ", " );
                strArgumentsDescription += cc.j( arrArguments[i] );
            }
            strArgumentsDescription += cc.debug( " )" );
        } else
            strArgumentsDescription += cc.debug( "()" );
        const strContractCallDescription =
            strContractMethodDescription + strArgumentsDescription;
        const strLogPrefix = strContractMethodDescription + " ";
        try {
            const promiseComplete = new Promise( function( resolve, reject ) {
                const doEstimation = async function() {
                    try {
                        details.trace( "Estimate-gas of action ",
                            cc.info( strActionName ), "..." );
                        details.trace( "Will estimate-gas ",
                            strContractCallDescription, "..." );
                        const strAccountWalletAddress = joAccount.address();
                        const callOpts = {
                            from: strAccountWalletAddress
                        };
                        if( gasPrice ) {
                            callOpts.gasPrice =
                                owaspUtils.toBN( gasPrice ).toHexString();
                        }
                        if( gasValueRecommended ) {
                            callOpts.gasLimit =
                                owaspUtils.toBN( gasValueRecommended ).toHexString();
                        }
                        if( weiHowMuch )
                            callOpts.value = owaspUtils.toBN( weiHowMuch ).toHexString();
                        details.trace( "Call options for estimate-gas ", cc.j( callOpts ) );
                        estimatedGas =
                            await joContract.estimateGas[strMethodName](
                                ...arrArguments, callOpts );
                        details.success( strLogPrefix, "estimate-gas success: ",
                            cc.j( estimatedGas ) );
                        resolve( estimatedGas );
                    } catch ( err ) {
                        reject( err );
                    }
                };
                doEstimation();
            } );
            await Promise.all( [ promiseComplete ] );
        } catch ( err ) {
            const strError = owaspUtils.extractErrorMessage( err );
            details.error( strLogPrefix, "Estimate-gas error: ",
                cc.warning( strError ),
                ", default recommended gas value " +
                    "will be used instead of estimated",
                ", stack is: ", "\n", cc.stack( err.stack ) );
        }
        estimatedGas = owaspUtils.parseIntOrHex( owaspUtils.toBN( estimatedGas ).toString() );
        if( estimatedGas == 0 ) {
            estimatedGas = gasValueRecommended;
            details.warning( strLogPrefix, "Will use recommended gas ",
                cc.j( estimatedGas ), " instead of estimated" );
        }
        if( this.gasMultiplier > 0.0 ) {
            estimatedGas =
                owaspUtils.parseIntOrHex( ( estimatedGas * this.gasMultiplier ).toString() );
        }
        details.trace( strLogPrefix, "Final amount of gas is ", cc.j( estimatedGas ) );
        return estimatedGas;
    }
};

let gTransactionCustomizerMainNet = null;
let gTransactionCustomizerSChain = null;
let gTransactionCustomizerSChainTarget = null;

export function getTransactionCustomizerForMainNet() {
    if( gTransactionCustomizerMainNet )
        return gTransactionCustomizerMainNet;
    gTransactionCustomizerMainNet = new TransactionCustomizer( 1.25, 1.25 );
    return gTransactionCustomizerMainNet;
}

export function getTransactionCustomizerForSChain() {
    if( gTransactionCustomizerSChain )
        return gTransactionCustomizerSChain;
    gTransactionCustomizerSChain = new TransactionCustomizer( null, 1.25 );
    return gTransactionCustomizerSChain;
}

export function getTransactionCustomizerForSChainTarget() {
    if( gTransactionCustomizerSChainTarget )
        return gTransactionCustomizerSChainTarget;
    gTransactionCustomizerSChainTarget = new TransactionCustomizer( null, 1.25 );
    return gTransactionCustomizerSChainTarget;
}
