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
 * @file imaOracleOperations.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaOracle from "./oracle.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";

let gFlagIsEnabledOracle = false;

export function getEnabledOracle( isEnabled ) {
    return ( !!gFlagIsEnabledOracle );
}
export function setEnabledOracle( isEnabled ) {
    gFlagIsEnabledOracle = ( !!isEnabled );
}

async function prepareOracleGasPriceSetup( optsGasPriseSetup ) {
    optsGasPriseSetup.strActionName =
        "prepareOracleGasPriceSetup.optsGasPriseSetup.latestBlockNumber()";
    optsGasPriseSetup.latestBlockNumber =
        await optsGasPriseSetup.ethersProviderMainNet.getBlockNumber();
    optsGasPriseSetup.details.trace( "Latest block on Main Net is ",
        log.v( optsGasPriseSetup.latestBlockNumber ) );
    optsGasPriseSetup.strActionName =
        "prepareOracleGasPriceSetup.optsGasPriseSetup.bnTimestampOfBlock()";
    optsGasPriseSetup.latestBlock =
        await optsGasPriseSetup.ethersProviderMainNet
            .getBlock( optsGasPriseSetup.latestBlockNumber );
    optsGasPriseSetup.bnTimestampOfBlock =
        owaspUtils.toBN( optsGasPriseSetup.latestBlock.timestamp );
    optsGasPriseSetup.details.trace( "Local timestamp on Main Net is ",
        log.v( optsGasPriseSetup.bnTimestampOfBlock.toString() ), "=",
        log.v( owaspUtils.ensureStartsWith0x(
            optsGasPriseSetup.bnTimestampOfBlock.toHexString() ) ),
        " (original)" );
    optsGasPriseSetup.bnTimeZoneOffset = owaspUtils.toBN( parseInt( new Date( parseInt(
        optsGasPriseSetup.bnTimestampOfBlock.toString(), 10 ) ).getTimezoneOffset(), 10 ) );
    optsGasPriseSetup.details.trace( "Local time zone offset is ",
        log.v( optsGasPriseSetup.bnTimeZoneOffset.toString() ), "=",
        log.v( owaspUtils.ensureStartsWith0x(
            optsGasPriseSetup.bnTimeZoneOffset.toHexString() ) ),
        " (original)" );
    optsGasPriseSetup.bnTimestampOfBlock =
        optsGasPriseSetup.bnTimestampOfBlock.add( optsGasPriseSetup.bnTimeZoneOffset );
    optsGasPriseSetup.details.trace( "UTC timestamp on Main Net is ",
        log.v( optsGasPriseSetup.bnTimestampOfBlock.toString() ), "=",
        log.v( owaspUtils.ensureStartsWith0x(
            optsGasPriseSetup.bnTimestampOfBlock.toHexString() ) ),
        " (original)" );
    const bnValueToSubtractFromTimestamp = owaspUtils.toBN( 60 );
    optsGasPriseSetup.details.trace( "Value to subtract from timestamp is ",
        log.v( bnValueToSubtractFromTimestamp ), "=",
        log.v( owaspUtils.ensureStartsWith0x( bnValueToSubtractFromTimestamp.toHexString() ) ),
        " (to adjust it to past a bit)" );
    optsGasPriseSetup.bnTimestampOfBlock =
        optsGasPriseSetup.bnTimestampOfBlock.sub( bnValueToSubtractFromTimestamp );
    optsGasPriseSetup.details.trace( "Timestamp on Main Net is ",
        log.v( optsGasPriseSetup.bnTimestampOfBlock.toHexString() ), "=",
        log.v( owaspUtils.ensureStartsWith0x(
            optsGasPriseSetup.bnTimestampOfBlock.toHexString() ) ),
        " (adjusted to past a bit)" );
    optsGasPriseSetup.strActionName = "prepareOracleGasPriceSetup.getGasPrice()";
    optsGasPriseSetup.gasPriceOnMainNet = null;
    if( getEnabledOracle() ) {
        const oracleOpts = {
            url: owaspUtils.ethersProviderToUrl( optsGasPriseSetup.ethersProviderSChain ),
            callOpts: { },
            nMillisecondsSleepBefore: 1000,
            nMillisecondsSleepPeriod: 3000,
            cntAttempts: 40,
            isVerbose: ( log.verboseGet() >= log.verboseReversed().information ) ? true : false,
            isVerboseTraceDetails:
                ( log.verboseGet() >= log.verboseReversed().debug ) ? true : false
        };
        optsGasPriseSetup.details.debug(
            "Will fetch Main Net gas price via call to Oracle with options ",
            log.v( oracleOpts ), "..." );
        try {
            optsGasPriseSetup.gasPriceOnMainNet = owaspUtils.ensureStartsWith0x(
                ( await imaOracle.oracleGetGasPrice(
                    oracleOpts, optsGasPriseSetup.details ) ).toString( 16 ) );
        } catch ( err ) {
            optsGasPriseSetup.gasPriceOnMainNet = null;
            optsGasPriseSetup.details.error(
                "Failed to fetch Main Net gas price via call to Oracle, error is: {}, " +
                "stack is: {}{}", log.em( owaspUtils.extractErrorMessage( err ) ),
                "\n", log.s( err.stack ) );
        }
    }
    if( optsGasPriseSetup.gasPriceOnMainNet === null ) {
        optsGasPriseSetup.details.debug( "Will fetch Main Net gas price directly..." );
        optsGasPriseSetup.gasPriceOnMainNet = owaspUtils.ensureStartsWith0x(
            owaspUtils.toBN(
                await optsGasPriseSetup.ethersProviderMainNet.getGasPrice() ).toHexString() );
    }
    optsGasPriseSetup.details.success( "Done, Oracle did computed new Main Net gas price =",
        log.v( owaspUtils.toBN( optsGasPriseSetup.gasPriceOnMainNet ).toString() ),
        "=", log.v( optsGasPriseSetup.gasPriceOnMainNet ) );
    const joGasPriceOnMainNetOld =
        await optsGasPriseSetup.joCommunityLocker.callStatic.mainnetGasPrice(
            { from: optsGasPriseSetup.joAccountSC.address() } );
    const bnGasPriceOnMainNetOld = owaspUtils.toBN( joGasPriceOnMainNetOld );
    optsGasPriseSetup.details.trace(
        "Previous Main Net gas price saved and kept in CommunityLocker =",
        log.v( bnGasPriceOnMainNetOld.toString() ), "=",
        log.v( bnGasPriceOnMainNetOld.toHexString() ) );
    if( bnGasPriceOnMainNetOld.eq( owaspUtils.toBN( optsGasPriseSetup.gasPriceOnMainNet ) ) ) {
        optsGasPriseSetup.details.trace( "Previous Main Net gas price is equal to new one, " +
            " will skip setting it in CommunityLocker" );
        if( log.exposeDetailsGet() )
            optsGasPriseSetup.details.exposeDetailsTo( log, "doOracleGasPriceSetup", true );
        optsGasPriseSetup.details.close();
        return;
    }
}

export async function doOracleGasPriceSetup(
    ethersProviderMainNet,
    ethersProviderSChain,
    transactionCustomizerSChain,
    joCommunityLocker,
    joAccountSC,
    chainIdMainNet,
    chainIdSChain,
    fnSignMsgOracle
) {
    if( ! getEnabledOracle() )
        return;
    const optsGasPriseSetup = {
        ethersProviderMainNet: ethersProviderMainNet,
        ethersProviderSChain: ethersProviderSChain,
        transactionCustomizerSChain: transactionCustomizerSChain,
        joCommunityLocker: joCommunityLocker,
        joAccountSC: joAccountSC,
        chainIdMainNet: chainIdMainNet,
        chainIdSChain: chainIdSChain,
        fnSignMsgOracle: fnSignMsgOracle,
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

    if( optsGasPriseSetup.fnSignMsgOracle == null ||
        optsGasPriseSetup.fnSignMsgOracle == undefined ) {
        optsGasPriseSetup.details.trace( optsGasPriseSetup.strLogPrefix,
            "Using internal u256 signing stub function" );
        optsGasPriseSetup.fnSignMsgOracle = async function( u256, details, fnAfter ) {
            details.trace( optsGasPriseSetup.strLogPrefix,
                "u256 signing callback was not provided" );
            await fnAfter( null, u256, null ); // null - no error, null - no signatures
        };
    } else {
        optsGasPriseSetup.details.trace( optsGasPriseSetup.strLogPrefix,
            "Using externally provided u256 signing function" );
    }
    try {
        await prepareOracleGasPriceSetup( optsGasPriseSetup );
        optsGasPriseSetup.strActionName =
            "doOracleGasPriceSetup.optsGasPriseSetup.fnSignMsgOracle()";
        await optsGasPriseSetup.fnSignMsgOracle(
            optsGasPriseSetup.gasPriceOnMainNet, optsGasPriseSetup.details,
            async function( strError, u256, joGlueResult ) {
                if( strError ) {
                    if( log.id != optsGasPriseSetup.details.id ) {
                        log.critical( "{}Error in doOracleGasPriceSetup() during {}: {}",
                            optsGasPriseSetup.strLogPrefix, optsGasPriseSetup.strActionName,
                            log.em( strError ) );
                    }
                    optsGasPriseSetup.details.critical(
                        "{}Error in doOracleGasPriceSetup() during {}: {}",
                        optsGasPriseSetup.strLogPrefix, optsGasPriseSetup.strActionName,
                        log.em( strError ) );
                    optsGasPriseSetup.details.exposeDetailsTo(
                        log, "doOracleGasPriceSetup", false );
                    imaTransferErrorHandling.saveTransferError(
                        "oracle", optsGasPriseSetup.details.toString() );
                    optsGasPriseSetup.details.close();
                    return;
                }
                optsGasPriseSetup.strActionName = "doOracleGasPriceSetup.formatSignature";
                let signature = joGlueResult ? joGlueResult.signature : null;
                if( ! signature )
                    signature = { X: "0", Y: "0" };
                let hashPoint = joGlueResult ? joGlueResult.hashPoint : null;
                if( ! hashPoint )
                    hashPoint = { X: "0", Y: "0" };
                let hint = joGlueResult ? joGlueResult.hint : null;
                if( ! hint )
                    hint = "0";
                const sign = {
                    blsSignature: [ signature.X, signature.Y ], // BLS glue of signatures
                    hashA: hashPoint.X, // G1.X from joGlueResult.hashSrc
                    hashB: hashPoint.Y, // G1.Y from joGlueResult.hashSrc
                    counter: hint
                };
                optsGasPriseSetup.strActionName =
                    "Oracle gas price setup via CommunityLocker.setGasPrice()";
                const arrArgumentsSetGasPrice = [
                    u256,
                    owaspUtils.ensureStartsWith0x(
                        optsGasPriseSetup.bnTimestampOfBlock.toHexString() ),
                    sign // bls signature components
                ];
                const joDebugArgs = [
                    [ signature.X, signature.Y ], // BLS glue of signatures
                    hashPoint.X, // G1.X from joGlueResult.hashSrc
                    hashPoint.Y, // G1.Y from joGlueResult.hashSrc
                    hint
                ];
                optsGasPriseSetup.details.debug( optsGasPriseSetup.strLogPrefix,
                    "....debug args for : ", log.v( joDebugArgs ) );
                const weiHowMuch = undefined;
                const gasPrice =
                    await optsGasPriseSetup.transactionCustomizerSChain.computeGasPrice(
                        optsGasPriseSetup.ethersProviderSChain, 200000000000 );
                optsGasPriseSetup.details.trace( optsGasPriseSetup.strLogPrefix,
                    "Using computed gasPrice =", log.v( gasPrice ) );
                const estimatedGasSetGasPrice =
                    await optsGasPriseSetup.transactionCustomizerSChain.computeGas(
                        optsGasPriseSetup.details, optsGasPriseSetup.ethersProviderSChain,
                        "CommunityLocker", optsGasPriseSetup.joCommunityLocker,
                        "setGasPrice", arrArgumentsSetGasPrice, optsGasPriseSetup.joAccountSC,
                        optsGasPriseSetup.strActionName, gasPrice, 10000000, weiHowMuch, null );
                optsGasPriseSetup.details.trace( optsGasPriseSetup.strLogPrefix,
                    "Using estimated gas =", log.v( estimatedGasSetGasPrice ) );
                const isIgnoreSetGasPrice = false;
                const strErrorOfDryRun = await imaTx.dryRunCall( optsGasPriseSetup.details,
                    optsGasPriseSetup.ethersProviderSChain,
                    "CommunityLocker", optsGasPriseSetup.joCommunityLocker,
                    "setGasPrice", arrArgumentsSetGasPrice,
                    optsGasPriseSetup.joAccountSC, optsGasPriseSetup.strActionName,
                    isIgnoreSetGasPrice, gasPrice,
                    estimatedGasSetGasPrice, weiHowMuch, null );
                if( strErrorOfDryRun )
                    throw new Error( strErrorOfDryRun );
                const opts = {
                    isCheckTransactionToSchain:
                        ( optsGasPriseSetup.chainIdSChain !== "Mainnet" ) ? true : false
                };
                const joReceipt = await imaTx.payedCall( optsGasPriseSetup.details,
                    optsGasPriseSetup.ethersProviderSChain,
                    "CommunityLocker", optsGasPriseSetup.joCommunityLocker,
                    "setGasPrice", arrArgumentsSetGasPrice,
                    optsGasPriseSetup.joAccountSC, optsGasPriseSetup.strActionName,
                    gasPrice, estimatedGasSetGasPrice, weiHowMuch,
                    opts );
                if( joReceipt && typeof joReceipt == "object" ) {
                    optsGasPriseSetup.jarrReceipts.push( {
                        "description": "doOracleGasPriceSetup/setGasPrice",
                        "receipt": joReceipt
                    } );
                    imaGasUsage.printGasUsageReportFromArray(
                        "(intermediate result) ORACLE GAS PRICE SETUP ",
                        optsGasPriseSetup.jarrReceipts, optsGasPriseSetup.details );
                }
                imaTransferErrorHandling.saveTransferSuccess( "oracle" );
            } );
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != optsGasPriseSetup.details.id ) {
            log.critical( "{}Error in doOracleGasPriceSetup() during {}: {}" +
                ", stack is: {}{}", optsGasPriseSetup.strLogPrefix,
            optsGasPriseSetup.strActionName, log.em( strError ),
            "\n", log.s( err.stack ) );
            optsGasPriseSetup.details.critical(
                "{}Error in doOracleGasPriceSetup() during {}: {}, stack is: {}{}",
                optsGasPriseSetup.strLogPrefix, optsGasPriseSetup.strActionName,
                log.em( strError ), "\n", log.s( err.stack ) );
        }
        optsGasPriseSetup.details.exposeDetailsTo( log, "doOracleGasPriceSetup", false );
        imaTransferErrorHandling.saveTransferError(
            "oracle", optsGasPriseSetup.details.toString() );
        optsGasPriseSetup.details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray( "ORACLE GAS PRICE SETUP ",
        optsGasPriseSetup.jarrReceipts, optsGasPriseSetup.details );
    if( log.exposeDetailsGet() )
        optsGasPriseSetup.details.exposeDetailsTo( log, "doOracleGasPriceSetup", true );
    optsGasPriseSetup.details.close();
    return true;
}
