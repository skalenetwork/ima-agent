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
 * @file imaTx.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as path from "path";
import * as url from "url";
import * as childProcessModule from "child_process";
import type * as state from "./state.js";

import Redis from "ioredis";
import * as ethereumJsUtilModule from "ethereumjs-util";

import * as log from "./log.js";

import * as owaspUtils from "./owaspUtils.js";
import * as imaUtils from "./utils.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaEventLogScan from "./imaEventLogScan.js";

import * as threadInfo from "./threadInfo.js";

export interface TCustomPayedCallOptions {
    isCheckTransactionToSchain?: boolean
}

export interface TRunTimePayedCallOptions {
    details: log.TLogger
    ethersProvider: owaspUtils.ethersMod.providers.JsonRpcProvider
    strContractName: string
    joContract: owaspUtils.ethersMod.Contract
    strMethodName: string
    arrArguments: any[]
    joAccount: state.TAccount
    strActionName: string
    gasPrice: any
    estimatedGas: any
    weiHowMuch: any
    opts: TCustomPayedCallOptions
    strContractCallDescription: string
    strLogPrefix: string
    joACI: any | null
    unsignedTx: any | null
    rawTx: any | null
    txHash: any | null
    joReceipt: any | null
    callOpts: any
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname: string = path.dirname( url.fileURLToPath( import.meta.url ) );

let redis: any = null;

let gFlagDryRunIsEnabled: boolean = true;

export function dryRunIsEnabled(): boolean {
    return ( !!gFlagDryRunIsEnabled );
}
export function dryRunEnable( isEnable: any ): boolean {
    gFlagDryRunIsEnabled = ( isEnable != null && isEnable != undefined )
        ? ( !!isEnable )
        : true;
    return ( !!gFlagDryRunIsEnabled );
}

let gFlagDryRunIsIgnored = true;

export function dryRunIsIgnored(): boolean {
    return ( !!gFlagDryRunIsIgnored );
}

export function dryRunIgnore( isIgnored: boolean ): boolean {
    gFlagDryRunIsIgnored = ( isIgnored != null && isIgnored != undefined )
        ? ( !!isIgnored )
        : true;
    return ( !!gFlagDryRunIsIgnored );
}

export async function dryRunCall(
    details: log.TLogger,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    strContractName: string, joContract: owaspUtils.ethersMod.ethers.Contract,
    strMethodName: string, arrArguments: any[],
    joAccount: state.TAccount, strActionName: string, isDryRunResultIgnore: boolean,
    gasPrice: any, gasValue: any, weiHowMuch?: any,
    opts?: any
): Promise<string | null> {
    if( !dryRunIsEnabled() )
        return null; // success
    isDryRunResultIgnore = ( isDryRunResultIgnore != null && isDryRunResultIgnore != undefined )
        ? ( !!isDryRunResultIgnore )
        : false;
    const strContractMethodDescription = log.fmtDebug( "{p}({}).{sunny}",
        strContractName, joContract.address, strMethodName );
    let strArgumentsDescription = "";
    if( arrArguments.length > 0 ) {
        strArgumentsDescription += log.fmtDebug( "( " );
        for( let i = 0; i < arrArguments.length; ++i ) {
            if( i > 0 )
                strArgumentsDescription += log.fmtDebug( ", " );
            strArgumentsDescription += log.fmtInformation( "{}", arrArguments[i] );
        }
        strArgumentsDescription += log.fmtDebug( " )" );
    } else
        strArgumentsDescription += log.fmtDebug( "()" );
    const strContractCallDescription = strContractMethodDescription + strArgumentsDescription;
    const strLogPrefix = `${strContractMethodDescription} `;
    try {
        details.trace( "Dry-run of action {bright}...", strActionName );
        details.trace( "Will dry-run {}...", strContractCallDescription );
        const strAccountWalletAddress = joAccount.address();
        const callOpts: any = {
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
        details.trace( "{p}dry-run success: {}", strLogPrefix, joDryRunResult );
        return null; // success
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        details.error( "{p}dry-run error: {err}", strLogPrefix, err );
        if( dryRunIsIgnored() )
            return null;
        return strError;
    }
}

async function payedCallPrepare( optsPayedCall: TRunTimePayedCallOptions ): Promise<void> {
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
    optsPayedCall.details.trace(
        "{p}payed-call of action {bright} will do payed-call {p} with call options {} " +
        "via {sunny}-sign-and-send using from address {}...", optsPayedCall.strLogPrefix,
        optsPayedCall.strActionName, optsPayedCall.strContractCallDescription,
        optsPayedCall.callOpts, optsPayedCall.joACI.strType, optsPayedCall.joAccount.address() );
    optsPayedCall.unsignedTx =
        await optsPayedCall.joContract.populateTransaction[optsPayedCall.strMethodName](
            ...optsPayedCall.arrArguments, optsPayedCall.callOpts );
    optsPayedCall.unsignedTx.nonce = owaspUtils.toBN(
        await optsPayedCall.ethersProvider.getTransactionCount(
            optsPayedCall.joAccount.address() ) );
    if( optsPayedCall.opts?.isCheckTransactionToSchain ) {
        optsPayedCall.unsignedTx = await checkTransactionToSchain(
            optsPayedCall.unsignedTx, optsPayedCall.details,
            optsPayedCall.ethersProvider, optsPayedCall.joAccount );
    }
    optsPayedCall.details.trace( "{p}populated transaction: {}", optsPayedCall.strLogPrefix,
        optsPayedCall.unsignedTx );
    optsPayedCall.rawTx =
        owaspUtils.ethersMod.ethers.utils.serializeTransaction( optsPayedCall.unsignedTx );
    optsPayedCall.details.trace( "{p}taw transaction: {}", optsPayedCall.strLogPrefix,
        optsPayedCall.rawTx );
    optsPayedCall.txHash = owaspUtils.ethersMod.ethers.utils.keccak256( optsPayedCall.rawTx );
    optsPayedCall.details.trace( "{p}transaction hash: {}", optsPayedCall.strLogPrefix,
        optsPayedCall.txHash );
}

async function payedCallTM( optsPayedCall: TRunTimePayedCallOptions ): Promise<any> {
    const txAdjusted: any =
        optsPayedCall.unsignedTx; // JSON.parse( JSON.stringify( optsPayedCall.rawTx ) );
    const arrNamesConvertToHex = [ "gas", "gasLimit", "optsPayedCall.gasPrice", "value" ];
    for( let idxName = 0; idxName < arrNamesConvertToHex.length; ++idxName ) {
        const strName = arrNamesConvertToHex[idxName];
        if( strName in txAdjusted && typeof txAdjusted[strName] === "object" &&
            typeof txAdjusted[strName].toHexString === "function" )
            txAdjusted[strName] = owaspUtils.toHexStringSafe( txAdjusted[strName] );
    }
    if( "gasLimit" in txAdjusted )
        delete txAdjusted.gasLimit;
    if( "chainId" in txAdjusted )
        delete txAdjusted.chainId;
    const { chainId } = await optsPayedCall.ethersProvider.getNetwork();
    txAdjusted.chainId = chainId;
    optsPayedCall.details.trace( "{p}Adjusted transaction: {}", optsPayedCall.strLogPrefix,
        txAdjusted );
    if( redis == null )
        redis = new Redis( optsPayedCall.joAccount.strTransactionManagerURL );
    const priority = optsPayedCall.joAccount.nTmPriority || 5;
    optsPayedCall.details.trace( "{p}TM priority: {}", optsPayedCall.strLogPrefix, priority );
    try {
        const [ idTransaction, joReceiptFromTM ] = await tmEnsureTransaction(
            optsPayedCall.details, optsPayedCall.ethersProvider, priority, txAdjusted );
        optsPayedCall.joReceipt = joReceiptFromTM;
        optsPayedCall.details.trace( "{p}ID of TM-transaction: {}",
            optsPayedCall.strLogPrefix, idTransaction );
        const txHashSent = optsPayedCall.joReceipt.transactionHash;
        optsPayedCall.details.trace( "{p}Hash of sent TM-transaction: {}",
            optsPayedCall.strLogPrefix, txHashSent );
        return optsPayedCall.joReceipt;
    } catch ( err ) {
        optsPayedCall.details.critical(
            "{p}TM-transaction was not sent, underlying error is: {err}",
            optsPayedCall.strLogPrefix, err );
        throw err;
    }
}

async function payedCallSGX( optsPayedCall: TRunTimePayedCallOptions ): Promise<void> {
    const tx = optsPayedCall.unsignedTx;
    let { chainId } = await optsPayedCall.ethersProvider.getNetwork();
    if( typeof chainId === "string" && chainId )
        chainId = owaspUtils.parseIntOrHex( chainId );
    optsPayedCall.details.trace( "{p}Chain ID is: {}",
        optsPayedCall.strLogPrefix, chainId );
    const strCmd = process.argv[0] + " --no-warnings ./imaSgxExternalSigner.js " +
        ( log.isEnabledColorization() ? "true" : "false" ) + " " +
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
        ? optsPayedCall.joAccount.strPathSslCert
        : "" ) + "\" " +
        "\"" + ( optsPayedCall.joAccount.strPathSslKey
        ? optsPayedCall.joAccount.strPathSslKey
        : "" ) + "\" " +
        "";
    const joSpawnOptions: any = {
        shell: true,
        cwd: __dirname,
        env: {},
        encoding: "utf-8"
    };
    const rv = childProcessModule.spawnSync( strCmd, joSpawnOptions );
    const strStdOutFromExternalInvocation = rv.stdout.toString();
    optsPayedCall.joReceipt = JSON.parse( strStdOutFromExternalInvocation.toString() );
    optsPayedCall.details.trace( "{p}Result from external SGX signer is: {}",
        optsPayedCall.strLogPrefix, optsPayedCall.joReceipt );
    postConvertBN( optsPayedCall.joReceipt, "gasUsed" );
    postConvertBN( optsPayedCall.joReceipt, "cumulativeGasUsed" );
    postConvertBN( optsPayedCall.joReceipt, "effectiveGasPrice" );
}

function postConvertBN( jo: any, name: any ): void {
    if( !jo )
        return;
    if( !( name in jo ) )
        return;
    if( typeof jo[name] === "object" )
        return;
    jo[name] = owaspUtils.toBN( jo[name] );
}

async function payedCallDirect( optsPayedCall: TRunTimePayedCallOptions ): Promise<void> {
    const ethersWallet = new owaspUtils.ethersMod.ethers.Wallet(
        owaspUtils.ensureStartsWith0x( optsPayedCall.joAccount.privateKey ),
        optsPayedCall.ethersProvider );
    let { chainId } = await optsPayedCall.ethersProvider.getNetwork();
    if( typeof chainId === "string" && chainId )
        chainId = owaspUtils.parseIntOrHex( chainId );
    optsPayedCall.details.trace( "{p}Chain ID is: {}", optsPayedCall.strLogPrefix, chainId );
    if( ( !( chainId in optsPayedCall.unsignedTx ) ) ||
        ( !optsPayedCall.unsignedTx.chainId )
    ) {
        optsPayedCall.unsignedTx.chainId = chainId;
        optsPayedCall.details.trace( "{p}TX with chainId: {}",
            optsPayedCall.strLogPrefix, optsPayedCall.unsignedTx );
    }
    const joSignedTX = await ethersWallet.signTransaction( optsPayedCall.unsignedTx );
    optsPayedCall.details.trace( "{p}Signed transaction: {}", optsPayedCall.strLogPrefix,
        joSignedTX );
    const sr = await optsPayedCall.ethersProvider.sendTransaction(
        owaspUtils.ensureStartsWith0x( joSignedTX ) );
    optsPayedCall.details.trace( "{p}Raw-sent transaction result: {}",
        optsPayedCall.strLogPrefix, sr );
    optsPayedCall.joReceipt =
        await optsPayedCall.ethersProvider.waitForTransaction( sr.hash );
    optsPayedCall.details.trace( "{p}Transaction receipt: {}", optsPayedCall.strLogPrefix,
        optsPayedCall.joReceipt );
}

export async function payedCall(
    details: log.TLogger, ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    strContractName: string, joContract: owaspUtils.ethersMod.ethers.Contract,
    strMethodName: any, arrArguments: any[],
    joAccount: state.TAccount, strActionName: string,
    gasPrice: any, estimatedGas: any, weiHowMuch?: any,
    opts?: any
): Promise<any> {
    const optsPayedCall: TRunTimePayedCallOptions = {
        details,
        ethersProvider,
        strContractName,
        joContract,
        strMethodName,
        arrArguments,
        joAccount,
        strActionName,
        gasPrice,
        estimatedGas,
        weiHowMuch,
        opts,
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
    const strContractMethodDescription = log.fmtDebug( "{p}({}).{sunny}",
        optsPayedCall.strContractName, optsPayedCall.joContract.address,
        optsPayedCall.strMethodName );
    let strArgumentsDescription = "";
    if( optsPayedCall.arrArguments.length > 0 ) {
        strArgumentsDescription += log.fmtDebug( "( " );
        for( let i = 0; i < optsPayedCall.arrArguments.length; ++i ) {
            if( i > 0 )
                strArgumentsDescription += log.fmtDebug( ", " );
            strArgumentsDescription += log.fmtInformation( "{}", optsPayedCall.arrArguments[i] );
        }
        strArgumentsDescription += log.fmtDebug( " )" );
    } else
        strArgumentsDescription += log.fmtDebug( "()" );
    optsPayedCall.strContractCallDescription =
        strContractMethodDescription + strArgumentsDescription;
    optsPayedCall.strLogPrefix = `${strContractMethodDescription} `;
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
            const strErrorPrefix = "Transaction sign and send error(INNER FLOW): ";
            optsPayedCall.details.critical(
                "{p}bad credentials information specified, no explicit SGX and no explicit " +
                    "private key found", strErrorPrefix );
            throw new Error( `${strErrorPrefix} bad credentials information specified, ` +
                    "no explicit SGX and no explicit private key found" );
        } // NOTICE: "break;" is not needed here because of "throw" above
        } // switch( optsPayedCall.joACI.strType )
    } catch ( err ) {
        const strErrorPrefix = "Transaction sign and send error(outer flow):";
        optsPayedCall.details.critical( "{p}{} {err}, stack is:\n{stack}",
            optsPayedCall.strLogPrefix, strErrorPrefix, err, err );
        throw new Error( `${strErrorPrefix} invoking ` +
            `the ${optsPayedCall.strContractCallDescription}, ` +
            `error is: ${owaspUtils.extractErrorMessage( err )}` );
    }
    optsPayedCall.details.success( "{p}Done, TX was {sunny}-signed-and-sent, receipt is {}",
        optsPayedCall.strLogPrefix, optsPayedCall.joACI ? optsPayedCall.joACI.strType : "N/A",
        optsPayedCall.joReceipt );
    try {
        const bnGasSpent = owaspUtils.toBN( optsPayedCall.joReceipt.cumulativeGasUsed );
        const gasSpent = bnGasSpent.toString();
        const ethSpent = owaspUtils.ethersMod.ethers.utils.formatEther(
            optsPayedCall.joReceipt.cumulativeGasUsed.mul( optsPayedCall.unsignedTx.gasPrice ) );
        optsPayedCall.joReceipt.summary = {
            bnGasSpent,
            gasSpent,
            ethSpent
        };
        optsPayedCall.details.trace( "{p}gas spent: {}", optsPayedCall.strLogPrefix, gasSpent );
        optsPayedCall.details.trace( "{p}ETH spent: {}", optsPayedCall.strLogPrefix, ethSpent );
    } catch ( err ) {
        optsPayedCall.details.warning( "{p}TX stats computation error {err}, stack is:\n{stack}",
            optsPayedCall.strLogPrefix, err, err );
    }
    return optsPayedCall.joReceipt;
}

export async function checkTransactionToSchain(
    unsignedTx: any,
    details: log.TLogger,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joAccount: state.TAccount
): Promise<any> {
    const strLogPrefix = "PoW-mining: ";
    try {
        const strFromAddress = joAccount.address(); // unsignedTx.from;
        const requiredBalance = unsignedTx.gasPrice.mul( unsignedTx.gasLimit );
        const balance = owaspUtils.toBN( await ethersProvider.getBalance( strFromAddress ) );
        details.trace(
            "{p}Will check whether PoW-mining  is needed for sender {} with balance {} using " +
            "required balance {}, gas limit is {} gas, checked unsigned transaction is {}",
            strLogPrefix, strFromAddress, owaspUtils.toHexStringSafe( balance ),
            owaspUtils.toHexStringSafe( requiredBalance ),
            owaspUtils.toHexStringSafe( unsignedTx.gasLimit ), unsignedTx
        );
        if( balance.lt( requiredBalance ) ) {
            details.warning( "{p}Insufficient funds for {}, will run PoW-mining to get {} of gas",
                strLogPrefix, strFromAddress, owaspUtils.toHexStringSafe( unsignedTx.gasLimit ) );
            const powNumberBuffer = await calculatePowNumber(
                strFromAddress, owaspUtils.toBN( unsignedTx.nonce ).toHexString(),
                owaspUtils.toHexStringSafe( unsignedTx.gasLimit ), details, strLogPrefix );
            details.debug( "{p}Returned PoW-mining number {}", strLogPrefix, powNumberBuffer );
            let powNumber: string = powNumberBuffer.toString( "utf8" ).trim();
            powNumber = imaUtils.replaceAll( powNumber, "\r", "" );
            powNumber = imaUtils.replaceAll( powNumber, "\n", "" );
            powNumber = imaUtils.replaceAll( powNumber, "\t", "" );
            powNumber = powNumber.trim();
            details.trace( "{p}Trimmed PoW-mining number is {}", strLogPrefix, powNumber );
            if( !powNumber )
                throw new Error( "Failed to compute gas price with PoW-mining(1), got empty text" );
            powNumber = owaspUtils.toBN( owaspUtils.ensureStartsWith0x( powNumber ) );
            details.trace( "{p}BN PoW-mining number is {}", strLogPrefix, powNumber );
            const powNumberBN = owaspUtils.toBN( powNumber );
            if( powNumberBN.eq( owaspUtils.toBN( "0" ) ) )
                throw new Error( "Failed to compute gas price with PoW-mining(2), got zero value" );
            unsignedTx.gasPrice = owaspUtils.toBN( powNumberBN.toHexString() );
            details.success( "{p}Success, finally (after PoW-mining) modified unsigned " +
                "transaction is {}", strLogPrefix, unsignedTx );
        } else {
            details.success( "{p}Have sufficient funds for {}, PoW-mining is not needed and " +
                "will be skipped", strLogPrefix, strFromAddress );
        }
    } catch ( err ) {
        details.critical( "{p}PoW-mining error(checkTransactionToSchain): exception occur before " +
            "PoW-mining, error is: {err}, stack is:\n{stack}", strLogPrefix, err, err );
    }
    return unsignedTx;
}

export async function calculatePowNumber(
    address: string, nonce: any, gas: any, details: log.TLogger, strLogPrefix: string
): Promise<any> {
    try {
        let _address = owaspUtils.ensureStartsWith0x( address );
        _address = ethereumJsUtilModule.toChecksumAddress( _address );
        _address = owaspUtils.removeStarting0x( _address );
        const _nonce = owaspUtils.parseIntOrHex( nonce );
        const _gas = owaspUtils.parseIntOrHex( gas );
        const powScriptPath = path.join( __dirname, "pow" );
        const cmd = `${powScriptPath} ${_address} ${_nonce} ${_gas}`;
        details.trace( "{p}Will run PoW-mining command: {}", strLogPrefix, cmd );
        const res = childProcessModule.execSync( cmd );
        details.trace( "{p}Got PoW-mining execution result: {}", strLogPrefix, res );
        return res;
    } catch ( err ) {
        details.critical( "{p}PoW-mining error(calculatePowNumber): exception occur during " +
            "PoW-mining, error is: {err}, stack is:\n{stack}", strLogPrefix, err, err );
        throw err;
    }
}

export function getAccountConnectivityInfo( joAccount: state.TAccount ): object {
    const joACI: any = {
        isBad: true,
        strType: "bad",
        isAutoSend: false
    };
    if( "strTransactionManagerURL" in joAccount &&
        typeof joAccount.strTransactionManagerURL === "string" &&
        joAccount.strTransactionManagerURL.length > 0
    ) {
        joACI.isBad = false;
        joACI.strType = "tm";
        joACI.isAutoSend = true;
    } else if( "strSgxURL" in joAccount &&
        typeof joAccount.strSgxURL === "string" &&
        joAccount.strSgxURL.length > 0 &&
        "strSgxKeyName" in joAccount &&
        typeof joAccount.strSgxKeyName === "string" &&
        joAccount.strSgxKeyName.length > 0
    ) {
        joACI.isBad = false;
        joACI.strType = "sgx";
    } else if( "privateKey" in joAccount &&
        typeof joAccount.privateKey === "string" &&
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

function tmGenerateRandomHex( size: number ): string {
    return [ ...Array( size ) ]
        .map( () => Math.floor( Math.random() * 16 ).toString( 16 ) ).join( "" );
}

function tmMakeId( details: log.TLogger ): string {
    const prefix = "tx-";
    const unique = tmGenerateRandomHex( 16 );
    const id = prefix + unique + "js";
    details.trace( "TM - Generated id: {}", id );
    return id;
}

function tmMakeRecord( tx: any = {}, score: any ): any {
    const status = "PROPOSED";
    return JSON.stringify( {
        score,
        status,
        ...tx
    } );
}

function tmMakeScore( priority: number ): number {
    const ts = imaHelperAPIs.currentTimestamp();
    return priority * Math.pow( 10, ts.toString().length ) + ts;
}

async function tmSend( details: log.TLogger, tx: any, priority: number = 5 ): Promise<string> {
    details.trace( "TM - sending tx {} ts: {}", tx, imaHelperAPIs.currentTimestamp() );
    const id = tmMakeId( details );
    const score = tmMakeScore( priority );
    const record = tmMakeRecord( tx, score );
    details.trace( "TM - Sending score: {}, record: {}", score, record );
    const expiration = 24 * 60 * 60; // 1 day;
    await redis.multi()
        .set( id, record, "EX", expiration )
        .zadd( gTransactionManagerPool, score, id )
        .exec();
    return id;
}

function tmIsFinished( record: any ): boolean {
    if( !record )
        return false;
    return [ "SUCCESS", "FAILED", "DROPPED" ].includes( record.status );
}

async function tmGetRecord( txId: any ): Promise<any | null> {
    const r = await redis.get( txId );
    if( r != null )
        return JSON.parse( r );
    return null;
}

async function tmWait(
    details: log.TLogger,
    txId: any,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    nWaitSeconds: number = 36000 ): Promise<any | null> {
    const strLogPrefix = log.fmtDebug( "(gathered details)" ) + " ";
    details.debug( "{p}TM - will wait TX {} to complete for {} second(s) maximum",
        strLogPrefix, txId, nWaitSeconds );
    const startTs = imaHelperAPIs.currentTimestamp();
    while( !tmIsFinished( await tmGetRecord( txId ) ) &&
                ( imaHelperAPIs.currentTimestamp() - startTs ) < nWaitSeconds )
        await threadInfo.sleep( 500 );
    const r = await tmGetRecord( txId );
    details.debug( "{p}TM - TX {} record is {}", strLogPrefix, txId, r );
    if( ( !r ) )
        details.error( "{p}TM - TX {} status is NULL RECORD", strLogPrefix, txId );
    else if( r.status == "SUCCESS" )
        details.success( "{p}TM - TX {} success", strLogPrefix, txId );
    else
        details.error( "{p}TM - TX {} status is {err}", strLogPrefix, txId, r.status );

    if( ( !tmIsFinished( r ) ) || r.status == "DROPPED" ) {
        details.error( "{p}TM - TX {} was unsuccessful, wait failed", strLogPrefix, txId );
        return null;
    }
    const joReceipt: any = await imaEventLogScan.safeGetTransactionReceipt(
        details, 10, ethersProvider, r.tx_hash );
    if( !joReceipt ) {
        details.error( "{p}TM - TX {} was unsuccessful, failed to fetch transaction receipt",
            strLogPrefix, txId );
        return null;
    }
    return joReceipt;
}

async function tmEnsureTransaction(
    details: log.TLogger, ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    priority: any, txAdjusted: any,
    cntAttempts?: number, sleepMilliseconds?: number
): Promise<any> {
    cntAttempts = cntAttempts ?? 1;
    sleepMilliseconds = sleepMilliseconds ?? ( 30 * 1000 );
    let txId = "";
    let joReceipt = null;
    let idxAttempt = 0;
    const strLogPrefix = log.fmtDebug( "(gathered details)" ) + " ";
    for( ; idxAttempt < cntAttempts; ++idxAttempt ) {
        txId = await tmSend( details, txAdjusted, priority );
        details.debug( "{p}TM - next TX {}", strLogPrefix, txId );
        joReceipt = await tmWait( details, txId, ethersProvider );
        if( joReceipt )
            break;
        details.error( "{p}TM - unsuccessful TX {} sending attempt {} of {} receipt: {}",
            strLogPrefix, txId, idxAttempt, cntAttempts, joReceipt );
        await threadInfo.sleep( sleepMilliseconds );
    }
    if( !joReceipt ) {
        details.error( "{p}TM TX {} transaction has been dropped", strLogPrefix, txId );
        throw new Error( `TM unsuccessful transaction ${txId}` );
    }
    details.information( "{p}TM - successful TX {}, sending attempt {} of {}",
        strLogPrefix, txId, idxAttempt, cntAttempts );
    return [ txId, joReceipt ];
}

export class TransactionCustomizer {
    gasPriceMultiplier: any;
    gasMultiplier: any;
    constructor ( gasPriceMultiplier: any, gasMultiplier: any ) {
        this.gasPriceMultiplier = gasPriceMultiplier
            ? owaspUtils.toFloat( gasPriceMultiplier )
            : null; // null means use current gasPrice or recommendedGasPrice
        this.gasMultiplier = gasMultiplier ? owaspUtils.toFloat( gasMultiplier ) : 1.25;
    }

    async computeGasPrice(
        ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
        maxGasPrice: any ): Promise<any> {
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
        details: log.TLogger,
        ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
        strContractName: string, joContract: owaspUtils.ethersMod.ethers.Contract,
        strMethodName: string, arrArguments: any[],
        joAccount: state.TAccount, strActionName: string,
        gasPrice: any, gasValueRecommended: any, weiHowMuch?: any,
        opts?: any
    ): Promise<any> {
        let estimatedGas: any = 0;
        const strContractMethodDescription = log.fmtDebug( "{p}({}).{sunny}",
            strContractName, joContract.address, strMethodName );
        let strArgumentsDescription = "";
        if( arrArguments.length > 0 ) {
            strArgumentsDescription += log.fmtDebug( "( " );
            for( let i = 0; i < arrArguments.length; ++i ) {
                if( i > 0 )
                    strArgumentsDescription += log.fmtDebug( ", " );
                strArgumentsDescription += log.fmtInformation( "{}", arrArguments[i] );
            }
            strArgumentsDescription += log.fmtDebug( " )" );
        } else
            strArgumentsDescription += log.fmtDebug( "()" );
        const strContractCallDescription =
            strContractMethodDescription + strArgumentsDescription;
        const strLogPrefix = `${strContractMethodDescription} `;
        try {
            details.trace( "Estimate-gas of action {bright}...", strActionName );
            details.trace( "Will estimate-gas {}...", strContractCallDescription );
            const strAccountWalletAddress = joAccount.address();
            const callOpts: any = { from: strAccountWalletAddress };
            if( gasPrice )
                callOpts.gasPrice = owaspUtils.toBN( gasPrice ).toHexString();
            if( gasValueRecommended )
                callOpts.gasLimit = owaspUtils.toBN( gasValueRecommended ).toHexString();
            if( weiHowMuch )
                callOpts.value = owaspUtils.toBN( weiHowMuch ).toHexString();
            details.trace( "Call options for estimate-gas {}", callOpts );
            estimatedGas = await joContract.estimateGas[strMethodName]( ...arrArguments, callOpts );
            details.success( "{p}estimate-gas success: {}", strLogPrefix, estimatedGas );
        } catch ( err ) {
            details.error(
                "{p}Estimate-gas error: {err}, default recommended gas value will be used " +
                "instead of estimated, stack is:\n{stack}", strLogPrefix, err, err );
        }
        estimatedGas = owaspUtils.parseIntOrHex( owaspUtils.toBN( estimatedGas ).toString() );
        if( estimatedGas == 0 ) {
            estimatedGas = gasValueRecommended;
            details.warning( "{p}Will use recommended gas {} instead of estimated",
                strLogPrefix, estimatedGas );
        }
        if( this.gasMultiplier > 0.0 ) {
            estimatedGas =
                owaspUtils.parseIntOrHex( ( estimatedGas * this.gasMultiplier ).toString() );
        }
        details.trace( "{p}Final amount of gas is {}", strLogPrefix, estimatedGas );
        return estimatedGas;
    }
};

let gTransactionCustomizerMainNet: TransactionCustomizer | null = null;
let gTransactionCustomizerSChain: TransactionCustomizer | null = null;
let gTransactionCustomizerSChainTarget: TransactionCustomizer | null = null;

export function getTransactionCustomizerForMainNet(): TransactionCustomizer {
    if( gTransactionCustomizerMainNet )
        return gTransactionCustomizerMainNet;
    gTransactionCustomizerMainNet = new TransactionCustomizer( 1.25, 1.25 );
    return gTransactionCustomizerMainNet;
}

export function getTransactionCustomizerForSChain(): TransactionCustomizer {
    if( gTransactionCustomizerSChain )
        return gTransactionCustomizerSChain;
    gTransactionCustomizerSChain = new TransactionCustomizer( null, 1.25 );
    return gTransactionCustomizerSChain;
}

export function getTransactionCustomizerForSChainTarget(): TransactionCustomizer {
    if( gTransactionCustomizerSChainTarget )
        return gTransactionCustomizerSChainTarget;
    gTransactionCustomizerSChainTarget = new TransactionCustomizer( null, 1.25 );
    return gTransactionCustomizerSChainTarget;
}
