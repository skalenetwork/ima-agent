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
 * @file imaOracleOperations.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as imaOracle from "./oracle.js";
import * as imaTx from "./imaTx.js";
import * as imaGasUsage from "./imaGasUsageOperations.js";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.js";
import type * as state from "./state.js";
import type * as IMA from "./imaCore.js";

export type TFunctionSignMsgOracle =
    ( u256: owaspUtils.ethersMod.BigNumber,
        details: log.TLogger,
        fnAfter: IMA.TFunctionAfterSigningMessages
    ) => Promise <void>;

export interface TGasPriceSetupOptions {
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider
    transactionCustomizerSChain: imaTx.TransactionCustomizer
    joCommunityLocker: owaspUtils.ethersMod.Contract
    joAccountSC: state.TAccount
    chainIdMainNet: string
    chainIdSChain: string
    fnSignMsgOracle: TFunctionSignMsgOracle
    details: log.TLogger
    jarrReceipts: any[]
    strLogPrefix: string
    strActionName: string
    latestBlockNumber: owaspUtils.ethersMod.BigNumber | null
    latestBlock: any | null
    bnTimestampOfBlock: owaspUtils.ethersMod.BigNumber | null
    bnTimeZoneOffset: owaspUtils.ethersMod.BigNumber | null
    gasPriceOnMainNet: string | null
}

let gFlagIsEnabledOracle: boolean = false;

export function getEnabledOracle(): boolean {
    return ( !!gFlagIsEnabledOracle );
}
export function setEnabledOracle( isEnabled: boolean ): void {
    gFlagIsEnabledOracle = ( !!isEnabled );
}

async function prepareOracleGasPriceSetup(
    optsGasPriceSetup: TGasPriceSetupOptions
): Promise<void> {
    optsGasPriceSetup.strActionName =
        "prepareOracleGasPriceSetup.optsGasPriceSetup.latestBlockNumber()";
    optsGasPriceSetup.latestBlockNumber =
        owaspUtils.toBN( await optsGasPriceSetup.ethersProviderMainNet.getBlockNumber() );
    optsGasPriceSetup.details.trace( "Latest block on Main Net is {}",
        optsGasPriceSetup.latestBlockNumber );
    optsGasPriceSetup.strActionName =
        "prepareOracleGasPriceSetup.optsGasPriceSetup.bnTimestampOfBlock()";
    optsGasPriceSetup.latestBlock =
        await optsGasPriceSetup.ethersProviderMainNet
            .getBlock( optsGasPriceSetup.latestBlockNumber.toString() );
    optsGasPriceSetup.bnTimestampOfBlock =
        owaspUtils.toBN( optsGasPriceSetup.latestBlock.timestamp );
    optsGasPriceSetup.details.trace( "Local timestamp on Main Net is {}={} (original)",
        optsGasPriceSetup.bnTimestampOfBlock.toString(),
        owaspUtils.ensureStartsWith0x( optsGasPriceSetup.bnTimestampOfBlock.toHexString() ) );
    optsGasPriceSetup.bnTimeZoneOffset = owaspUtils.toBN( new Date( parseInt(
        optsGasPriceSetup.bnTimestampOfBlock.toString(), 10 ) ).getTimezoneOffset() );
    optsGasPriceSetup.details.trace( "Local time zone offset is {}={} (original)",
        optsGasPriceSetup.bnTimeZoneOffset.toString(),
        owaspUtils.ensureStartsWith0x( optsGasPriceSetup.bnTimeZoneOffset.toHexString() ) );
    optsGasPriceSetup.bnTimestampOfBlock =
        optsGasPriceSetup.bnTimestampOfBlock.add( optsGasPriceSetup.bnTimeZoneOffset );
    optsGasPriceSetup.details.trace( "UTC timestamp on Main Net is {}={} (original)",
        optsGasPriceSetup.bnTimestampOfBlock.toString(),
        owaspUtils.ensureStartsWith0x( optsGasPriceSetup.bnTimestampOfBlock.toHexString() ) );
    const bnValueToSubtractFromTimestamp = owaspUtils.toBN( 60 );
    optsGasPriceSetup.details.trace(
        "Value to subtract from timestamp is {}={}(to adjust it to past a bit)",
        bnValueToSubtractFromTimestamp,
        owaspUtils.ensureStartsWith0x( bnValueToSubtractFromTimestamp.toHexString() ) );
    optsGasPriceSetup.bnTimestampOfBlock =
        optsGasPriceSetup.bnTimestampOfBlock.sub( bnValueToSubtractFromTimestamp );
    optsGasPriceSetup.details.trace( "Timestamp on Main Net is {}={} (adjusted to past a bit)",
        optsGasPriceSetup.bnTimestampOfBlock.toHexString(),
        owaspUtils.ensureStartsWith0x( optsGasPriceSetup.bnTimestampOfBlock.toHexString() ) );
    optsGasPriceSetup.strActionName = "prepareOracleGasPriceSetup.getGasPrice()";
    optsGasPriceSetup.gasPriceOnMainNet = null;
    if( getEnabledOracle() ) {
        const oracleOpts = {
            url: owaspUtils.ethersProviderToUrl( optsGasPriceSetup.ethersProviderSChain ),
            callOpts: { },
            nMillisecondsSleepBefore: 1000,
            nMillisecondsSleepPeriod: 3000,
            cntAttempts: 40,
            isVerbose:
                ( log.verboseGet() >= log.verboseName2Number( "information" ) ),
            isVerboseTraceDetails:
                ( log.verboseGet() >= log.verboseName2Number( "debug" ) )
        };
        optsGasPriceSetup.details.debug(
            "Will fetch Main Net gas price via call to Oracle with options {}...", oracleOpts );
        try {
            optsGasPriceSetup.gasPriceOnMainNet = owaspUtils.ensureStartsWith0x(
                ( await imaOracle.oracleGetGasPrice(
                    oracleOpts, optsGasPriceSetup.details ) ).toHexString() );
        } catch ( err ) {
            optsGasPriceSetup.gasPriceOnMainNet = null;
            optsGasPriceSetup.details.error( "Failed to fetch Main Net gas price via call " +
                "to Oracle, error is: {err}, stack is:\n{stack}", err, err );
        }
    }
    if( optsGasPriceSetup.gasPriceOnMainNet === null ) {
        optsGasPriceSetup.details.debug( "Will fetch Main Net gas price directly..." );
        optsGasPriceSetup.gasPriceOnMainNet = owaspUtils.ensureStartsWith0x(
            owaspUtils.toBN(
                await optsGasPriceSetup.ethersProviderMainNet.getGasPrice() ).toHexString() );
    }
    optsGasPriceSetup.details.success( "Done, Oracle did computed new Main Net gas price={}={}",
        owaspUtils.toBN( optsGasPriceSetup.gasPriceOnMainNet ).toString(),
        optsGasPriceSetup.gasPriceOnMainNet );
    const joGasPriceOnMainNetOld =
        await optsGasPriceSetup.joCommunityLocker.callStatic.mainnetGasPrice(
            { from: optsGasPriceSetup.joAccountSC.address() } );
    const bnGasPriceOnMainNetOld = owaspUtils.toBN( joGasPriceOnMainNetOld );
    optsGasPriceSetup.details.trace(
        "Previous Main Net gas price saved and kept in CommunityLocker={}={}",
        bnGasPriceOnMainNetOld.toString(), bnGasPriceOnMainNetOld.toHexString() );
    if( bnGasPriceOnMainNetOld.eq( owaspUtils.toBN( optsGasPriceSetup.gasPriceOnMainNet ) ) ) {
        optsGasPriceSetup.details.trace( "Previous Main Net gas price is equal to new one, " +
            " will skip setting it in CommunityLocker" );
        if( log.exposeDetailsGet() ) {
            optsGasPriceSetup.details.exposeDetailsTo(
                log.globalStream(), "doOracleGasPriceSetup", true );
        }
        optsGasPriceSetup.details.close();
    }
}

async function handleOracleSigned(
    optsGasPriceSetup: TGasPriceSetupOptions, strError: Error | string | null,
    u256: owaspUtils.ethersMod.BigNumber, joGlueResult: any | null ): Promise<void> {
    if( strError ) {
        optsGasPriceSetup.details.critical(
            "{p}Error in doOracleGasPriceSetup() during {bright}: {err}",
            optsGasPriceSetup.strLogPrefix, optsGasPriceSetup.strActionName, strError );
        optsGasPriceSetup.details.exposeDetailsTo(
            log.globalStream(), "doOracleGasPriceSetup", false );
        imaTransferErrorHandling.saveTransferError(
            "oracle", optsGasPriceSetup.details.toString() );
        optsGasPriceSetup.details.close();
        return;
    }
    optsGasPriceSetup.strActionName = "doOracleGasPriceSetup.formatSignature";
    let signature: owaspUtils.TXYSignature | null = joGlueResult ? joGlueResult.signature : null;
    if( !signature )
        signature = { X: "0", Y: "0" };
    let hashPoint = joGlueResult ? joGlueResult.hashPoint : null;
    if( !hashPoint )
        hashPoint = { X: "0", Y: "0" };
    let hint = joGlueResult ? joGlueResult.hint : null;
    if( !hint )
        hint = "0";
    const sign: owaspUtils.TBLSSignature = {
        blsSignature: [ signature.X, signature.Y ], // BLS glue of signatures
        hashA: hashPoint.X, // G1.X from joGlueResult.hashSrc
        hashB: hashPoint.Y, // G1.Y from joGlueResult.hashSrc
        counter: hint
    };
    optsGasPriceSetup.strActionName =
        "Oracle gas price setup via CommunityLocker.setGasPrice()";
    const arrArgumentsSetGasPrice = [
        u256,
        owaspUtils.ensureStartsWith0x(
            optsGasPriceSetup.bnTimestampOfBlock
                ? optsGasPriceSetup.bnTimestampOfBlock.toHexString()
                : "0"
        ),
        sign // bls signature components
    ];
    const joDebugArgs = [
        [ signature.X, signature.Y ], // BLS glue of signatures
        hashPoint.X, // G1.X from joGlueResult.hashSrc
        hashPoint.Y, // G1.Y from joGlueResult.hashSrc
        hint
    ];
    optsGasPriceSetup.details.debug( "{p}....debug args for : {}",
        optsGasPriceSetup.strLogPrefix, joDebugArgs );
    const gasPrice = await optsGasPriceSetup.transactionCustomizerSChain.computeGasPrice(
        optsGasPriceSetup.ethersProviderSChain, owaspUtils.toBN( 200000000000 ) );
    optsGasPriceSetup.details.trace( "{p}Using computed gasPrice={}",
        optsGasPriceSetup.strLogPrefix, gasPrice );
    const estimatedGasSetGasPrice = await optsGasPriceSetup.transactionCustomizerSChain.computeGas(
        optsGasPriceSetup.details, optsGasPriceSetup.ethersProviderSChain,
        "CommunityLocker", optsGasPriceSetup.joCommunityLocker,
        "setGasPrice", arrArgumentsSetGasPrice, optsGasPriceSetup.joAccountSC,
        optsGasPriceSetup.strActionName, gasPrice, owaspUtils.toBN( 10000000 ) );
    optsGasPriceSetup.details.trace( "{p}Using estimated gas={}",
        optsGasPriceSetup.strLogPrefix, estimatedGasSetGasPrice );
    const isIgnoreSetGasPrice = false;
    const strErrorOfDryRun = await imaTx.dryRunCall( optsGasPriceSetup.details,
        optsGasPriceSetup.ethersProviderSChain,
        "CommunityLocker", optsGasPriceSetup.joCommunityLocker,
        "setGasPrice", arrArgumentsSetGasPrice,
        optsGasPriceSetup.joAccountSC, optsGasPriceSetup.strActionName,
        isIgnoreSetGasPrice, gasPrice, estimatedGasSetGasPrice );
    if( strErrorOfDryRun )
        throw new Error( strErrorOfDryRun );
    const opts: imaTx.TCustomPayedCallOptions = {
        isCheckTransactionToSchain: ( optsGasPriceSetup.chainIdSChain !== "Mainnet" )
    };
    const joReceipt = await imaTx.payedCall( optsGasPriceSetup.details,
        optsGasPriceSetup.ethersProviderSChain,
        "CommunityLocker", optsGasPriceSetup.joCommunityLocker,
        "setGasPrice", arrArgumentsSetGasPrice,
        optsGasPriceSetup.joAccountSC, optsGasPriceSetup.strActionName,
        gasPrice, estimatedGasSetGasPrice, undefined, opts );
    if( joReceipt ) {
        optsGasPriceSetup.jarrReceipts.push( {
            description: "doOracleGasPriceSetup/setGasPrice",
            receipt: joReceipt
        } );
        imaGasUsage.printGasUsageReportFromArray(
            "(intermediate result) ORACLE GAS PRICE SETUP ",
            optsGasPriceSetup.jarrReceipts, optsGasPriceSetup.details );
    }
    imaTransferErrorHandling.saveTransferSuccess( "oracle" );
}

export async function doOracleGasPriceSetup(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    transactionCustomizerSChain: imaTx.TransactionCustomizer,
    joCommunityLocker: owaspUtils.ethersMod.Contract,
    joAccountSC: state.TAccount,
    chainIdMainNet: string,
    chainIdSChain: string,
    fnSignMsgOracle: TFunctionSignMsgOracle
): Promise<boolean> {
    if( !getEnabledOracle() )
        return true;
    const optsGasPriceSetup: TGasPriceSetupOptions = {
        ethersProviderMainNet,
        ethersProviderSChain,
        transactionCustomizerSChain,
        joCommunityLocker,
        joAccountSC,
        chainIdMainNet,
        chainIdSChain,
        fnSignMsgOracle,
        details: log.createMemoryStream(),
        jarrReceipts: [],
        strLogPrefix: "Oracle gas price setup: ",
        strActionName: "",
        latestBlockNumber: null,
        latestBlock: null,
        bnTimestampOfBlock: null,
        bnTimeZoneOffset: null,
        gasPriceOnMainNet: null
    };
    if( optsGasPriceSetup.fnSignMsgOracle == null ||
        optsGasPriceSetup.fnSignMsgOracle == undefined ) {
        optsGasPriceSetup.details.trace( "{p}Using internal u256 signing stub function",
            optsGasPriceSetup.strLogPrefix );
        optsGasPriceSetup.fnSignMsgOracle =
            async function( u256: owaspUtils.ethersMod.BigNumber, details: log.TLogger,
                fnAfter: IMA.TFunctionAfterSigningMessages ): Promise<void> {
                details.trace( "{p}u256 signing callback was not provided",
                    optsGasPriceSetup.strLogPrefix );
                await fnAfter( null, [ u256 ], null ); // null - no error, null - no signatures
            };
    } else {
        optsGasPriceSetup.details.trace( "{p}Using externally provided u256 signing function",
            optsGasPriceSetup.strLogPrefix );
    }
    try {
        await prepareOracleGasPriceSetup( optsGasPriceSetup );
        optsGasPriceSetup.strActionName =
            "doOracleGasPriceSetup.optsGasPriceSetup.fnSignMsgOracle()";
        await optsGasPriceSetup.fnSignMsgOracle(
            owaspUtils.toBN( optsGasPriceSetup.gasPriceOnMainNet ?? "0" ),
            optsGasPriceSetup.details,
            async function(
                strError: Error | string | null,
                jarrMessages: any[], // u256: owaspUtils.ethersMod.BigNumber,
                joGlueResult: any | null
            ): Promise<void> {
                const u256: owaspUtils.ethersMod.BigNumber =
                    jarrMessages[0] as owaspUtils.ethersMod.BigNumber;
                await handleOracleSigned( optsGasPriceSetup, strError, u256, joGlueResult );
            } );
    } catch ( err ) {
        optsGasPriceSetup.details.critical(
            "{p}Error in doOracleGasPriceSetup() during {bright}: {err}, stack is:\n{stack}",
            optsGasPriceSetup.strLogPrefix, optsGasPriceSetup.strActionName,
            err, err );
        optsGasPriceSetup.details.exposeDetailsTo(
            log.globalStream(), "doOracleGasPriceSetup", false );
        imaTransferErrorHandling.saveTransferError(
            "oracle", optsGasPriceSetup.details.toString() );
        optsGasPriceSetup.details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray( "ORACLE GAS PRICE SETUP ",
        optsGasPriceSetup.jarrReceipts, optsGasPriceSetup.details );
    if( log.exposeDetailsGet() ) {
        optsGasPriceSetup.details.exposeDetailsTo(
            log.globalStream(), "doOracleGasPriceSetup", true );
    }
    optsGasPriceSetup.details.close();
    return true;
}
