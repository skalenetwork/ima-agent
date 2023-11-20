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
 * @file main.mjs
 * @copyright SKALE Labs 2019-Present
 */

import express from "express";
import bodyParser from "body-parser";
import * as ws from "ws";
import * as owaspUtils from "./owaspUtils.mjs";
import * as log from "./log.mjs";
import * as imaCLI from "./cli.mjs";
import * as loop from "./loop.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as imaBLS from "./bls.mjs";
import * as pwa from "./pwa.mjs";
import * as clpTools from "./clpTools.mjs";
import * as discoveryTools from "./discoveryTools.mjs";
import * as skaleObserver from "./observer.mjs";

import * as state from "./state.mjs";

// allow self-signed wss and https
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

function parseCommandLine() {
    const imaState = state.get();
    log.autoEnableColorizationFromCommandLineArgs();
    const strPrintedArguments = process.argv.join( " " );
    imaCLI.parse( {
        "register": clpTools.commandLineTaskRegister,
        "register1": clpTools.commandLineTaskRegister1,
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
        "transfer": clpTools.commandLineTaskTransfer,
        "loop": clpTools.commandLineTaskLoop,
        "simple-loop": clpTools.commandLineTaskLoopSimple,
        "browse-s-chain": clpTools.commandLineTaskBrowseSChain,
        "browse-skale-network": clpTools.commandLineTaskBrowseSkaleNetwork,
        "browse-connected-schains": clpTools.commandLineTaskBrowseConnectedSChains,
        "discover-cid": clpTools.commandLineTaskDiscoverChainId
    } );
    let haveReimbursementCommands = false;
    if( imaState.isShowReimbursementBalance ) {
        haveReimbursementCommands = true;
        clpTools.commandLineTaskReimbursementShowBalance();
    }
    if( imaState.nReimbursementEstimate ) {
        haveReimbursementCommands = true;
        clpTools.commandLineTaskReimbursementEstimateAmount();
    }
    if( imaState.nReimbursementRecharge ) {
        haveReimbursementCommands = true;
        clpTools.commandLineTaskReimbursementRecharge();
    }
    if( imaState.nReimbursementWithdraw ) {
        haveReimbursementCommands = true;
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
        const iv = owaspUtils.setInterval2( function() {
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
    log.information( "Agent was started with {} command line argument(s) as: {}",
        process.argv.length, strPrintedArguments );
    if( imaState.bIsNeededCommonInit ) {
        imaCLI.commonInit();
        imaCLI.initContracts();
    }
    if( imaState.bShowConfigMode ) {
        // just show configuration values and exit
        process.exit( 0 );
    }
}

let gServerMonitoringWS = null;

function initMonitoringServer() {
    const imaState = state.get();
    if( imaState.nMonitoringPort <= 0 )
        return;
    const strLogPrefix = "Monitoring: ";
    if( imaState.bLogMonitoringServer ) {
        log.trace( "{p}Will start monitoring WS server on port {}",
            strLogPrefix, imaState.nMonitoringPort );
    }
    gServerMonitoringWS = new ws.WebSocketServer( { port: 0 + imaState.nMonitoringPort } );
    gServerMonitoringWS.on( "connection", function( wsPeer, req ) {
        let ip = req.socket.remoteAddress;
        if( "headers" in req && req.headers && typeof req.headers == "object" &&
            "x-forwarded-for" in req.headers && req.headers["x-forwarded-for"] )
            ip = req.headers["x-forwarded-for"]; // better under NGINX
        if( ( !ip ) && "_socket" in req && req._socket && "remoteAddress" in req._socket )
            ip = req._socket.remoteAddress;
        if( !ip )
            ip = "N/A";
        if( imaState.bLogMonitoringServer )
            log.debug( "{p}New connection from {}", strLogPrefix, ip );
        wsPeer.on( "message", function( message ) {
            const joAnswer = {
                "method": null,
                "id": null,
                "error": null
            };
            try {
                const joMessage = JSON.parse( message );
                if( imaState.bLogMonitoringServer )
                    log.trace( "{p}<<< message from {}: {}", strLogPrefix, ip, joMessage );

                if( ! ( "method" in joMessage ) )
                    throw new Error( "\"method\" field was not specified" );
                joAnswer.method = joMessage.method;
                if( ! ( "id" in joMessage ) )
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
                        for( const param_name of arrRuntimeParamNames ) {
                            if( param_name in imaState )
                                joAnswer.runtime_params[param_name] = imaState[param_name];

                        }
                    } break;
                case "get_last_transfer_errors":
                    joAnswer.last_transfer_errors = imaTransferErrorHandling.getLastTransferErrors(
                        ( ( "isIncludeTextLog" in joMessage ) && joMessage.isIncludeTextLog )
                            ? true : false );
                    joAnswer.last_error_categories =
                        imaTransferErrorHandling.getLastErrorCategories();
                    break;
                default:
                    throw new Error( `Unknown method name ${joMessage.method} was specified` );
                } // switch( joMessage.method )
            } catch ( err ) {
                const strError = owaspUtils.extractErrorMessage( err );
                log.error( "{p}Bad message from {}: {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, ip, message, strError, err.stack );
            }
            try {
                if( imaState.bLogMonitoringServer )
                    log.trace( "{p}>>> answer to {}: {}", strLogPrefix, ip, joAnswer );
                wsPeer.send( JSON.stringify( joAnswer ) );
            } catch ( err ) {
                const strError = owaspUtils.extractErrorMessage( err );
                log.error( "{p}Failed to sent answer to {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, ip, strError, err.stack );
            }
        } );
    } );
}

let gExpressJsonRpcAppIMA = null;

function initJsonRpcServer() {
    const imaState = state.get();
    if( imaState.nJsonRpcPort <= 0 )
        return;
    const strLogPrefix = "JSON RPC: ";
    gExpressJsonRpcAppIMA = express();
    gExpressJsonRpcAppIMA.use( bodyParser.urlencoded( { extended: true } ) );
    gExpressJsonRpcAppIMA.use( bodyParser.json() );
    gExpressJsonRpcAppIMA.post( "/", async function( req, res ) {
        const isSkipMode = false;
        const message = JSON.stringify( req.body );
        const ip = req.connection.remoteAddress.split( ":" ).pop();
        const fnSendAnswer = function( joAnswer ) {
            try {
                res.header( "Content-Type", "application/json" );
                res.status( 200 ).send( JSON.stringify( joAnswer ) );
                log.trace( "{p}>>> did sent answer to {}: ", strLogPrefix, ip, joAnswer );
            } catch ( err ) {
                const strError = owaspUtils.extractErrorMessage( err );
                log.error( "{p}Failed to sent answer {} to {}, error is: {err}, stack is:\n{stack}",
                    strLogPrefix, joAnswer, ip, strError, err.stack );
            }
        };
        let joAnswer = {
            "method": null,
            "id": null,
            "error": null
        };
        try {
            const joMessage = JSON.parse( message );
            log.trace( "{p}<<< Peer message from {}: ", strLogPrefix, ip, joMessage );
            if( ! ( "method" in joMessage ) )
                throw new Error( "\"method\" field was not specified" );
            joAnswer.method = joMessage.method;
            if( ! ( "id" in joMessage ) )
                throw new Error( "\"id\" field was not specified" );
            if( "id" in joMessage )
                joAnswer.id = joMessage.id;
            if( "method" in joMessage )
                joAnswer.method = "" + joMessage.method;
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
                    joMessage.params.signature
                ) )
                    await loop.spreadArrivedStateOfPendingWorkAnalysis( joMessage );

                break;
            case "skale_getCachedSNB":
                joAnswer.arrSChainsCached = skaleObserver.getLastCachedSChains();
                break;
            case "skale_historySNB":
                joAnswer.arrCacheHistory = skaleObserver.getLastCachedHistory();
                break;
            case "skale_refreshSNB":
                {
                    const opts = {
                        imaState: imaState,
                        "details": log,
                        "bStopNeeded": false,
                        "secondsToReDiscoverSkaleNetwork":
                            imaState.optsS2S.secondsToReDiscoverSkaleNetwork,
                        "secondsToWaitForSkaleNetworkDiscovered":
                            imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered,
                        "chain": imaState.chainProperties.sc,
                        "bParallelModeRefreshSNB":
                            ( !!( imaState.optsS2S.bParallelModeRefreshSNB ) ),
                        "isForceMultiAttemptsUntilSuccess": false
                    };
                    skaleObserver.refreshNowSNB( opts ); // async call, no await here
                    joAnswer.result = "Done";
                }
                break;
            default:
                joAnswer.error = `Unknown method name ${joMessage.method} was specified`;
                break;
            } // switch( joMessage.method )
            if( ( !joAnswer ) || typeof joAnswer != "object" ) {
                joAnswer = {};
                joAnswer.error = "internal error, null data returned";
            }
        } catch ( err ) {
            const strError = owaspUtils.extractErrorMessage( err );
            log.error( "{p}Bad message from {}: {}, error is: {err}, stack is:\n{stack}",
                strLogPrefix, ip, message, strError, err.stack );
        }
        if( ! isSkipMode )
            fnSendAnswer( joAnswer );
    } );
    gExpressJsonRpcAppIMA.listen( imaState.nJsonRpcPort );
}

async function doTheJob() {
    const imaState = state.get();
    const strLogPrefix = "Job 1: ";
    let idxAction = 0;
    const cntActions = imaState.arrActions.length;
    let cntFalse = 0;
    let cntTrue = 0;
    for( idxAction = 0; idxAction < cntActions; ++idxAction ) {
        log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
        const joAction = imaState.arrActions[idxAction];
        log.debug( "{p}Will execute action: {bright} ({} of {})" ,
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
                strLogPrefix, err, err.stack );
        }
    }
    log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    log.information( "{p}{}", strLogPrefix, "FINISH:" );
    log.information( "{p}task(s) executed {}", strLogPrefix, cntActions );
    log.information( "{p}{}{}", strLogPrefix, cntTrue, log.fmtSuccess( " task(s) succeeded" ) );
    log.information( "{p}{}{}", strLogPrefix, cntFalse, log.fmtError( " task(s) failed" ) );
    log.information( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    process.exitCode = ( cntFalse > 0 ) ? cntFalse : 0;
    if( ! state.isPreventExitAfterLastAction() )
        process.exit( process.exitCode );
}

async function main() {
    log.autoEnableColorizationFromCommandLineArgs();
    const imaState = state.get();
    const strTmpAddressFromEnvMainNet =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_ETHEREUM );
    const strTmpAddressFromEnvSChain =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_SCHAIN );
    const strTmpAddressFromEnvSChainTarget =
        owaspUtils.toEthPrivateKey( process.env.ACCOUNT_FOR_SCHAIN_TARGET );
    if( strTmpAddressFromEnvMainNet &&
        typeof strTmpAddressFromEnvMainNet == "string" &&
        strTmpAddressFromEnvMainNet.length > 0 )
        imaState.chainProperties.mn.joAccount.address_ = "" + strTmpAddressFromEnvMainNet;
    if( strTmpAddressFromEnvSChain &&
        typeof strTmpAddressFromEnvSChain == "string" &&
        strTmpAddressFromEnvSChain.length > 0 )
        imaState.chainProperties.sc.joAccount.address_ = "" + strTmpAddressFromEnvSChain;
    if( strTmpAddressFromEnvSChainTarget &&
        typeof strTmpAddressFromEnvSChainTarget == "string" &&
        strTmpAddressFromEnvSChainTarget.length > 0 )
        imaState.chainProperties.tc.joAccount.address_ = "" + strTmpAddressFromEnvSChainTarget;
    parseCommandLine();
    initMonitoringServer();
    initJsonRpcServer();
    const isSilentReDiscovery = imaState.isPrintSecurityValues
        ? false : imaState.joSChainDiscovery.isSilentReDiscovery;
    const fnOnPeriodicDiscoveryResultAvailable = function( isFinal ) {
        loop.spreadUpdatedSChainNetwork( isFinal );
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
                ? log.fmtWarning( "silent" ) : log.fmtSuccess( "exposed details" ) ) );
        if( ! imaState.bNoWaitSChainStarted ) {
            await discoveryTools.waitUntilSChainStarted().then( function() {
                // uses call to discoveryTools.discoverSChainNetwork()
                if( ! isSilentReDiscovery ) {
                    log.information(
                        "This S-Chain discovery will be done for command line task handler" );
                }
                const nCountToWait = -1;
                discoveryTools.discoverSChainNetwork( function( err, joSChainNetworkInfo ) {
                    if( err ) {
                        // error information is printed by discoveryTools.discoverSChainNetwork()
                        process.exit( 166 );
                    }
                    log.success( "S-Chain network was discovered: {}", joSChainNetworkInfo );
                    imaState.joSChainNetworkInfo = joSChainNetworkInfo;
                    discoveryTools.continueSChainDiscoveryInBackgroundIfNeeded(
                        isSilentReDiscovery, function() {
                            discoveryTools.doPeriodicSChainNetworkDiscoveryIfNeeded(
                                isSilentReDiscovery, fnOnPeriodicDiscoveryResultAvailable );
                        } );
                    doTheJob();
                    // Finish of IMA Agent startup,
                    // everything else is in async calls executed later
                    return 0;
                }, isSilentReDiscovery, imaState.joSChainNetworkInfo, nCountToWait
                ).catch( ( err ) => {
                    const strError = owaspUtils.extractErrorMessage( err );
                    log.critical( "S-Chain network discovery failed: {err}", strError );
                } );
            } );
        }
    } else {
        discoveryTools.doPeriodicSChainNetworkDiscoveryIfNeeded(
            isSilentReDiscovery, fnOnPeriodicDiscoveryResultAvailable );
        doTheJob();
        // Finish of IMA Agent startup,
        // everything else is in async calls executed later,
        // skip exit here to avoid early termination while tasks ase still running
    }

}

main();
