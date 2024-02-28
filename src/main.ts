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
 * @file main.ts
 * @copyright SKALE Labs 2019-Present
 */

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import bodyParser from "body-parser";
import * as ws from "ws";
import * as owaspUtils from "./owaspUtils.js";
import * as log from "./log.js";
import * as imaCLI from "./cli.js";
import * as loop from "./loop.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.js";
import * as imaBLS from "./bls.js";
import * as pwa from "./pwa.js";
import * as clpTools from "./clpTools.js";
import * as discoveryTools from "./discoveryTools.js";
import * as skaleObserver from "./observer.js";

import * as state from "./state.js";

// allow self-signed wss and https
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

process.on( "unhandledRejection", function( reason: any, p: any ): void {
    log.fatal(
        "CRITICAL ERROR: unhandled rejection with reason {} and promise {}",
        reason, p );
} ).on( "uncaughtException", function( err: any ): void {
    log.fatal(
        "CRITICAL ERROR: uncaught exception: {err}, stack is:\n{stack}",
        err, err );
    process.exit( 1 );
} );

function parseCommandLine(): void {
    const imaState: state.TIMAState = state.get();
    log.autoEnableColorizationFromCommandLineArgs();
    const strPrintedArguments = process.argv.join( " " );
    imaCLI.parse( {
        register: clpTools.commandLineTaskRegister,
        register1: clpTools.commandLineTaskRegister1,
        "check-registration": clpTools.commandLineTaskCheckRegistration,
        "check-registration1": clpTools.commandLineTaskCheckRegistration1,
        "mint-erc20": clpTools.commandLineTaskMintErc20,
        "mint-erc721": clpTools.commandLineTaskMintErc721,
        "mint-erc1155": clpTools.commandLineTaskMintErc1155,
        "burn-erc20": clpTools.commandLineTaskBurnErc20,
        "burn-erc721": clpTools.commandLineTaskBurnErc721,
        "burn-erc1155": clpTools.commandLineTaskBurnErc1155,
        "show-balance": clpTools.commandLineTaskShowBalance,
        "m2s-payment": clpTools.commandLineTaskPaymentM2S,
        "s2m-payment": clpTools.commandLineTaskPaymentS2M,
        "s2s-payment": clpTools.commandLineTaskPaymentS2S,
        "s2m-receive": clpTools.commandLineTaskReceiveS2M,
        "s2m-view": clpTools.commandLineTaskViewS2M,
        "m2s-transfer": clpTools.commandLineTaskTransferM2S,
        "s2m-transfer": clpTools.commandLineTaskTransferS2M,
        "s2s-transfer": clpTools.commandLineTaskTransferS2S,
        transfer: clpTools.commandLineTaskTransfer,
        loop: clpTools.commandLineTaskLoop,
        "simple-loop": clpTools.commandLineTaskLoopSimple,
        "browse-s-chain": clpTools.commandLineTaskBrowseSChain
    } );
    let haveReimbursementCommands = false;
    if( imaState.isShowReimbursementBalance ) {
        haveReimbursementCommands = true;
        log.trace( "Will require reimbursement chain name to show reimbursement balance" );
        clpTools.commandLineTaskReimbursementShowBalance();
    }
    if( imaState.isReimbursementEstimate ) {
        haveReimbursementCommands = true;
        log.trace( "Will require reimbursement chain name to do reimbursement estimation" );
        clpTools.commandLineTaskReimbursementEstimateAmount();
    }
    if( imaState.nReimbursementRecharge &&
        imaState.nReimbursementRecharge.gt( owaspUtils.toBN( 0 ) ) ) {
        haveReimbursementCommands = true;
        log.trace( "Will require reimbursement chain name to do reimbursement recharge" );
        clpTools.commandLineTaskReimbursementRecharge();
    }
    if( imaState.nReimbursementWithdraw &&
        imaState.nReimbursementWithdraw.gt( owaspUtils.toBN( 0 ) ) ) {
        haveReimbursementCommands = true;
        log.trace( "Will require reimbursement chain name to do reimbursement withdraw" );
        clpTools.commandLineTaskReimbursementWithdraw();
    }
    if( haveReimbursementCommands ) {
        if( imaState.strReimbursementChain == "" ) {
            log.fatal( "Runtime init error: missing value for reimbursement-chain parameter, " +
                "must be non-empty chain name" );
            process.exit( 163 );
        }
    }
    if( imaState.nReimbursementRange >= 0 )
        clpTools.commandLineTaskReimbursementSetRange();
    if( imaState.nAutoExitAfterSeconds > 0 ) {
        log.warning( "Automatic exit after {} second(s) is requested.",
            imaState.nAutoExitAfterSeconds );
        const iv = owaspUtils.setInterval2( function(): void {
            log.warning( "Performing automatic exit after {} second(s)...",
                imaState.nAutoExitAfterSeconds );
            owaspUtils.clearInterval2( iv );
            process.exit( 0 );
        }, imaState.nAutoExitAfterSeconds * 1000 );
    } else
        log.warning( "Automatic exit was not requested, skipping it." );
    if( imaState.strLogFilePath.length > 0 ) {
        log.information( "Will print message to file {}", imaState.strLogFilePath );
        log.add( imaState.strLogFilePath, imaState.nLogMaxSizeBeforeRotation,
            imaState.nLogMaxFilesCount );
    }
    if( imaState.isPrintSecurityValues ) {
        log.information( "Agent was started with {} command line argument(s) as: {}",
            process.argv.length, strPrintedArguments );
    }
    if( imaState.bIsNeededCommonInit ) {
        imaCLI.commonInit();
        imaCLI.initContracts();
    }
    if( imaState.bShowConfigMode ) {
    // just show configuration values and exit
        process.exit( 0 );
    }
}

let gServerMonitoringWS: ws.WebSocketServer | null = null;

function initMonitoringServer(): void {
    const imaState: state.TIMAState = state.get();
    if( imaState.nMonitoringPort <= 0 )
        return;
    const strLogPrefix = "Monitoring: ";
    if( imaState.bLogMonitoringServer ) {
        log.trace( "{p}Will start monitoring WS server on port {}",
            strLogPrefix, imaState.nMonitoringPort );
    }
    try {
        gServerMonitoringWS = new ws.WebSocketServer( { port: imaState.nMonitoringPort } );
    } catch ( err ) {
        log.error( "Failed start monitoring WS server on port {}, error is: {err}",
            imaState.nMonitoringPort, err );
        return;
    }
    gServerMonitoringWS.on( "connection", function( wsPeer: any, req: any ): void {
        let ip = req.socket.remoteAddress;
        if( "headers" in req && req.headers && typeof req.headers === "object" &&
            "x-forwarded-for" in req.headers && req.headers["x-forwarded-for"] )
            ip = req.headers["x-forwarded-for"]; // better under NGINX
        if( ( !ip ) && "_socket" in req && req._socket && "remoteAddress" in req._socket )
            ip = req._socket.remoteAddress;
        if( !ip )
            ip = "N/A";
        if( imaState.bLogMonitoringServer )
            log.debug( "{p}New connection from {}", strLogPrefix, ip );
        wsPeer.on( "message", function( message: any ): void {
            const joAnswer: any = {
                method: null,
                id: null,
                error: null
            };
            try {
                const joMessage: any = JSON.parse( message );
                if( imaState.bLogMonitoringServer )
                    log.trace( "{p}<<< message from {}: {}", strLogPrefix, ip, joMessage );

                if( !( "method" in joMessage ) )
                    throw new Error( "\"method\" field was not specified" );
                joAnswer.method = joMessage.method;
                if( !( "id" in joMessage ) )
                    throw new Error( "\"id\" field was not specified" );
                joAnswer.id = joMessage.id;
                switch ( joMessage.method ) {
                case "echo":
                case "ping":
                    break;
                case "get_schain_network_info":
                    joAnswer.schain_network_info = imaState.joSChainNetworkInfo;
                    break;
                case "get_runtime_params":
                    {
                        joAnswer.runtime_params = {};
                        const arrRuntimeParamNames = [
                            "bNoWaitSChainStarted",
                            "nMaxWaitSChainAttempts",

                            "nTransferBlockSizeM2S",
                            "nTransferBlockSizeS2M",
                            "nTransferBlockSizeS2S",
                            "nTransferStepsM2S",
                            "nTransferStepsS2M",
                            "nTransferStepsS2S",
                            "nMaxTransactionsM2S",
                            "nMaxTransactionsS2M",
                            "nMaxTransactionsS2S",

                            "nBlockAwaitDepthM2S",
                            "nBlockAwaitDepthS2M",
                            "nBlockAwaitDepthS2S",
                            "nBlockAgeM2S",
                            "nBlockAgeS2M",
                            "nBlockAgeS2S",

                            "nLoopPeriodSeconds",

                            "nNodeNumber",
                            "nNodesCount",
                            "nTimeFrameSeconds",
                            "nNextFrameGap",

                            "isPWA",

                            "nMonitoringPort"
                        ];
                        for( const paramName of arrRuntimeParamNames ) {
                            if( paramName in imaState )
                                joAnswer.runtime_params[paramName] = ( imaState as any )[paramName];
                        }
                    } break;
                case "get_last_transfer_errors":
                    joAnswer.last_transfer_errors = imaTransferErrorHandling.getLastTransferErrors(
                        !!( ( ( "isIncludeTextLog" in joMessage ) &&
                            joMessage.isIncludeTextLog ) ) );
                    joAnswer.last_error_categories =
                        imaTransferErrorHandling.getLastErrorCategories();
                    break;
                default:
                    throw new Error( `Unknown method name ${joMessage.method} was specified` );
                } // switch( joMessage.method )
            } catch ( err ) {
                log.error( "{p}Bad message from {}: {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, ip, message, err, err );
            }
            try {
                if( imaState.bLogMonitoringServer )
                    log.trace( "{p}>>> answer to {}: {}", strLogPrefix, ip, joAnswer );
                wsPeer.send( JSON.stringify( joAnswer ) );
            } catch ( err ) {
                log.error( "{p}Failed to sent answer to {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, ip, err, err );
            }
        } );
    } );
}

let gExpressJsonRpcAppIMA: Express | null = null;

function initJsonRpcServer(): void {
    if( gExpressJsonRpcAppIMA )
        return;
    const imaState: state.TIMAState = state.get();
    if( imaState.nJsonRpcPort <= 0 )
        return;
    const strLogPrefix = "JSON RPC: ";
    gExpressJsonRpcAppIMA = express();
    gExpressJsonRpcAppIMA.use( bodyParser.urlencoded( { extended: true } ) );
    gExpressJsonRpcAppIMA.use( bodyParser.json() );
    const errorHandler = function(
        err: Error, req: Request, res: Response, next: NextFunction ): void {
        if( err ) {
            log.error(
                "IMA-to-IMA network error, error is {err}, request is {}, response is {}",
                err, req, res );
            if( next )
                next( err );
        }
    };
    gExpressJsonRpcAppIMA.use( errorHandler );
    const postHandler = async function( req: Request, res: Response ): Promise<void> {
        const isSkipMode = false;
        const message = JSON.stringify( req.body );
        const ip = req.socket.remoteAddress
            ? req.socket.remoteAddress.split( ":" ).pop()
            : "N/A-network-address";
        req.on( "error", function() {
            log.error( "IMA-to-IMA peer {} connection error, cannot process request", ip );
        } );
        res.on( "error", function() {
            log.error( "IMA-to-IMA peer {} connection error, cannot send responses", ip );
        } );
        const fnSendAnswer: any = function( joAnswer: any ): void {
            try {
                res.header( "Content-Type", "application/json" );
                res.status( 200 ).send( JSON.stringify( joAnswer ) );
                log.trace( "{p}>>> did sent answer to {}: ", strLogPrefix, ip, joAnswer );
            } catch ( err ) {
                log.error( "{p}Failed to sent answer {} to {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, joAnswer, ip, err, err );
            }
        };
        let joAnswer: any = {
            method: null,
            id: null,
            error: null
        };
        try {
            const joMessage: any = JSON.parse( message );
            log.trace( "{p}<<< Peer message from {}: ", strLogPrefix, ip, joMessage );
            if( !( "method" in joMessage ) )
                throw new Error( "\"method\" field was not specified" );
            joAnswer.method = joMessage.method;
            if( !( "id" in joMessage ) )
                throw new Error( "\"id\" field was not specified" );
            if( "id" in joMessage )
                joAnswer.id = joMessage.id;
            if( "method" in joMessage )
                joAnswer.method = joMessage.method.toString();
            switch ( joMessage.method ) {
            case "echo":
                joAnswer.result = "echo";
                fnSendAnswer( joAnswer );
                break;
            case "ping":
                joAnswer.result = "pong";
                fnSendAnswer( joAnswer );
                break;
            case "skale_imaVerifyAndSign":
                joAnswer = await imaBLS.handleSkaleImaVerifyAndSign( joMessage );
                break;
            case "skale_imaBSU256":
                joAnswer = await imaBLS.handleSkaleImaBSU256( joMessage );
                break;
            case "skale_imaNotifyLoopWork":
                if( await pwa.handleLoopStateArrived(
                    imaState,
                    owaspUtils.toInteger( joMessage.params.nNodeNumber ),
                    joMessage.params.strLoopWorkType,
                    joMessage.params.nIndexS2S,
                    ( !!( joMessage.params.isStart ) ),
                    owaspUtils.toInteger( joMessage.params.ts ),
                    joMessage.params.signature ) )
                    await loop.spreadArrivedStateOfPendingWorkAnalysis( joMessage );
                break;
            case "skale_getCachedSNB":
                joAnswer.arrSChainsCached = skaleObserver.getLastCachedSChains();
                break;
            default:
                joAnswer.error = `Unknown method name ${joMessage.method} was specified`;
                break;
            } // switch( joMessage.method )
            if( ( !joAnswer ) || typeof joAnswer !== "object" ) {
                joAnswer = {};
                joAnswer.error = "internal error, null data returned";
            }
        } catch ( err ) {
            log.error( "{p}Bad message from {}: {}, error is: {err}, stack is:\n{stack}",
                strLogPrefix, ip, message, err, err );
        }
        if( !isSkipMode )
            fnSendAnswer( joAnswer );
    };
    gExpressJsonRpcAppIMA.post( "/", function( req: Request, res: Response ): void {
        postHandler( req, res ).then( function(): void {} ).catch( function(): void {} );
    } );
    gExpressJsonRpcAppIMA.listen( imaState.nJsonRpcPort );
}

async function doTheJob(): Promise<void> {
    const imaState: state.TIMAState = state.get();
    const strLogPrefix = "Job 1: ";
    let idxAction = 0;
    const cntActions = imaState.arrActions.length;
    let cntFalse = 0;
    let cntTrue = 0;
    for( idxAction = 0; idxAction < cntActions; ++idxAction ) {
        log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
        const joAction = imaState.arrActions[idxAction];
        log.debug( "{p}Will execute action: {bright} ({} of {})",
            strLogPrefix, joAction.name, idxAction + 1, cntActions );
        try {
            if( await joAction.fn() ) {
                ++cntTrue;
                log.success( "{p}Succeeded action: {bright}", strLogPrefix, joAction.name );
            } else {
                ++cntFalse;
                log.error( "{p}Failed action: {bright}", strLogPrefix, joAction.name );
            }
        } catch ( err ) {
            ++cntFalse;
            log.critical( "{p}Exception occurred while executing action: {err}, stack is:\n{stack}",
                strLogPrefix, err, err );
        }
    }
    log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    log.information( "{p}{}", strLogPrefix, "FINISH:" );
    log.information( "{p}task(s) executed {}", strLogPrefix, cntActions );
    log.information( "{p}{}{}", strLogPrefix, cntTrue, log.fmtSuccess( " task(s) succeeded" ) );
    log.information( "{p}{}{}", strLogPrefix, cntFalse, log.fmtError( " task(s) failed" ) );
    log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    process.exitCode = ( cntFalse > 0 ) ? cntFalse : 0;
    if( !state.isPreventExitAfterLastAction() )
        process.exit( process.exitCode );
}

function handleFirstSChainDiscoveryAttemptDone(
    err: any, joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo,
    isSilentReDiscovery: boolean, fnOnPeriodicDiscoveryResultAvailable: any ): void {
    if( err ) {
    // error information is printed by discoveryTools.discoverSChainNetwork()
        process.exit( 166 );
    }
    log.success( "S-Chain network was discovered: {}", joSChainNetworkInfo );
    const imaState: state.TIMAState = state.get();
    imaState.joSChainNetworkInfo = joSChainNetworkInfo;
    discoveryTools.continueSChainDiscoveryInBackgroundIfNeeded(
        isSilentReDiscovery, function(): void {
            discoveryTools.doPeriodicSChainNetworkDiscoveryIfNeeded(
                isSilentReDiscovery, fnOnPeriodicDiscoveryResultAvailable )
                .then( function(): void {} ).catch( function(): void {} );
        } ).then( function(): void {} ).catch( function(): void {} );
    imaState.joSChainNetworkInfo = joSChainNetworkInfo;
}

async function main(): Promise<void> {
    log.autoEnableColorizationFromCommandLineArgs();
    const imaState: state.TIMAState = state.get();
    const strTmpAddressFromEnvMainNet =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_ETHEREUM );
    const strTmpAddressFromEnvSChain =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_SCHAIN );
    const strTmpAddressFromEnvSChainTarget =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_SCHAIN_TARGET );
    if( strTmpAddressFromEnvMainNet &&
        typeof strTmpAddressFromEnvMainNet === "string" &&
        strTmpAddressFromEnvMainNet.length > 0 )
        imaState.chainProperties.mn.joAccount.address_ = strTmpAddressFromEnvMainNet.toString();
    if( strTmpAddressFromEnvSChain &&
        typeof strTmpAddressFromEnvSChain === "string" &&
        strTmpAddressFromEnvSChain.length > 0 )
        imaState.chainProperties.sc.joAccount.address_ = strTmpAddressFromEnvSChain.toString();
    if( strTmpAddressFromEnvSChainTarget &&
        typeof strTmpAddressFromEnvSChainTarget === "string" &&
        strTmpAddressFromEnvSChainTarget.length > 0 ) {
        imaState.chainProperties.tc.joAccount.address_ =
            strTmpAddressFromEnvSChainTarget.toString();
    }
    parseCommandLine();
    initMonitoringServer();
    initJsonRpcServer();
    const isSilentReDiscovery = imaState.isPrintSecurityValues
        ? false
        : imaState.joSChainDiscovery.isSilentReDiscovery;
    const fnOnPeriodicDiscoveryResultAvailable = function( isFinal: boolean ): void {
        loop.spreadUpdatedSChainNetwork( isFinal )
            .then( function(): void {} ).catch( function(): void {} );
    };
    if( imaState.bSignMessages ) {
        if( imaState.strPathBlsGlue.length == 0 ) {
            log.fatal( "Please specify {} command line parameter.", "--bls-glue" );
            process.exit( 164 );
        }
        if( imaState.strPathHashG1.length == 0 ) {
            log.fatal( "Please specify {} command line parameter.", "--hash-g1" );
            process.exit( 165 );
        }
        log.information( "S-Chain network was discovery uses {} mode",
            ( isSilentReDiscovery
                ? log.fmtWarning( "silent" )
                : log.fmtSuccess( "exposed details" ) ) );
        if( !imaState.bNoWaitSChainStarted ) {
            await discoveryTools.waitUntilSChainStarted();
            if( !isSilentReDiscovery ) {
                log.information(
                    "This S-Chain discovery will be done for command line task handler" );
            }
            const nCountToWait = -1;
            discoveryTools.discoverSChainNetwork(
                function( err?: Error | string | null,
                    joSChainNetworkInfo?: discoveryTools.TSChainNetworkInfo | null ): void {
                    if( joSChainNetworkInfo ) {
                        handleFirstSChainDiscoveryAttemptDone(
                            err, joSChainNetworkInfo, isSilentReDiscovery,
                            fnOnPeriodicDiscoveryResultAvailable );
                    }
                    doTheJob().then( function(): void {} ).catch( function(): void {} );
                    // Finish of IMA Agent startup,
                    // everything else is in async calls executed later
                }, isSilentReDiscovery, imaState.joSChainNetworkInfo, nCountToWait
            ).catch( function( err: Error | string ): void {
                const strError = owaspUtils.extractErrorMessage( err );
                log.critical( "S-Chain network discovery failed: {err}", strError );
                doTheJob().then( function(): void {} ).catch( function(): void {} );
            } );
        }
    } else {
        discoveryTools.doPeriodicSChainNetworkDiscoveryIfNeeded(
            isSilentReDiscovery, fnOnPeriodicDiscoveryResultAvailable )
            .then( function(): void {} ).catch( function(): void {} );
        doTheJob().then( function(): void {} ).catch( function(): void {} );
    // Finish of IMA Agent startup,
    // everything else is in async calls executed later,
    // skip exit here to avoid early termination while tasks ase still running
    }
}

main().then( function(): void {} ).catch( function(): void {} );
