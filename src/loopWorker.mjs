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
 * @file loopWorker.mjs
 * @copyright SKALE Labs 2019-Present
 */

import { parentPort, workerData } from "worker_threads";
import * as networkLayer from "./socket.mjs";
import { SocketServer } from "./socketServer.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as loop from "./loop.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as skaleObserver from "./observer.mjs";
import * as imaCLI from "./cli.mjs";
import * as state from "./state.mjs";
import * as pwa from "./pwa.mjs";
import * as log from "./log.mjs";
import * as threadInfo from "./threadInfo.mjs";

let imaState = state.get();

parentPort.on( "message", jo => {
    if( networkLayer.inWorkerAPIs.onMessage( jo ) )
        return;
} );

function doSendMessage( type, endpoint, workerUUID, data ) {
    const jo = networkLayer.socketReceivedDataReverseMarshall( data );
    const joSend = {
        "workerMessageType":
            ( type && typeof type == "string" && type.length > 0 )
                ? type
                : "inWorkerMessage",
        "workerEndPoint": endpoint,
        "workerUUID": workerUUID,
        "data": jo
    };
    parentPort.postMessage( networkLayer.socketSentDataMarshall( joSend ) );
}

class ObserverServer extends SocketServer {
    constructor( acceptor ) {
        super( acceptor );
        const self = this;
        self.initComplete = false;
        log.enableColorization( workerData.colorization.isEnabled );
        self.opts = null;
        self.intervalPeriodicSchainsCaching = null;
        self.bIsPeriodicCachingStepInProgress = false;
        self.mapApiHandlers.init = function( joMessage, joAnswer, eventData, socket ) {
            joAnswer.message = {
                "method": "" + joMessage.method,
                "error": null
            };
            if( self.initComplete )
                return joAnswer;
            self.log = function() {
                const args = Array.prototype.slice.call( arguments );
                const jo = {
                    "method": "log",
                    "error": null,
                    "message": args.join( " " )
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            };
            self.initLogMethods();
            self.opts = JSON.parse( JSON.stringify( joMessage.message.opts ) );
            self.opts.details = {
                "write": self.log,
                "fatal": self.fatal,
                "critical": self.critical,
                "error": self.error,
                "warning": self.warning,
                "attention": self.attention,
                "information": self.information,
                "info": self.info,
                "notice": self.notice,
                "note": self.note,
                "debug": self.debug,
                "trace": self.trace,
                "success": self.success
            };
            log.enableColorization( joMessage.message.colorization.isEnabled );
            log.verboseSet( self.opts.imaState.verbose_ );
            log.exposeDetailsSet( self.opts.imaState.expose_details_ );
            imaTransferErrorHandling.saveTransferEvents.on( "error", function( eventData ) {
                const jo = {
                    "method": "saveTransferError",
                    "message": eventData.detail
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            } );
            imaTransferErrorHandling.saveTransferEvents.on( "success", function( eventData ) {
                const jo = {
                    "method": "saveTransferSuccess",
                    "message": eventData.detail
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            } );
            if( ! self.opts.imaState.optsLoop.enableStepS2S )
                threadInfo.joCustomThreadProperties.isSChainsCacheNeeded = false;
            if( threadInfo.joCustomThreadProperties.isSChainsCacheNeeded )
                log.debug( "Loop worker {} will save cached S-Chains...", workerData.url );
            skaleObserver.setLastCachedSChains( self.opts.imaState.arrSChainsCached );
            self.opts.imaState.chainProperties.mn.joAccount.address = owaspUtils.fnAddressImpl_;
            self.opts.imaState.chainProperties.sc.joAccount.address = owaspUtils.fnAddressImpl_;
            if( self.opts.imaState.chainProperties.mn.strURL &&
                typeof self.opts.imaState.chainProperties.mn.strURL == "string" &&
                self.opts.imaState.chainProperties.mn.strURL.length > 0
            ) {
                const u = self.opts.imaState.chainProperties.mn.strURL;
                self.opts.imaState.chainProperties.mn.ethersProvider =
                    owaspUtils.getEthersProviderFromURL( u );
            } else {
                self.warning(
                    "WARNING: No Main-net URL specified in command line arguments(needed for " +
                    "particular operations only) in {}", threadInfo.threadDescription() );
            }

            if( self.opts.imaState.chainProperties.sc.strURL &&
                typeof self.opts.imaState.chainProperties.sc.strURL == "string" &&
                self.opts.imaState.chainProperties.sc.strURL.length > 0
            ) {
                const u = self.opts.imaState.chainProperties.sc.strURL;
                self.opts.imaState.chainProperties.sc.ethersProvider =
                    owaspUtils.getEthersProviderFromURL( u );
            } else {
                self.warning(
                    "WARNING: No Main-net URL specified in command line arguments(needed for " +
                    "particular operations only) in {}", threadInfo.threadDescription() );
            }

            self.opts.imaState.optsLoop.joRuntimeOpts.isInsideWorker = true;
            imaState = self.opts.imaState;
            imaState.chainProperties.mn.ethersProvider = null;
            imaState.chainProperties.sc.ethersProvider = null;
            imaState.chainProperties.tc.ethersProvider = null;
            imaState.chainProperties.mn.transactionCustomizer =
                imaTx.getTransactionCustomizerForMainNet();
            imaState.chainProperties.sc.transactionCustomizer =
                imaTx.getTransactionCustomizerForSChain();
            imaState.chainProperties.tc.transactionCustomizer =
                imaTx.getTransactionCustomizerForSChainTarget();
            state.set( imaState );
            imaCLI.initContracts();
            self.initComplete = true;
            self.information( "IMA loop worker ", workerData.url,
                " will do the following work:\n    Oracle operations.....",
                log.yn( self.opts.imaState.optsLoop.enableStepOracle ), "\n",
                "    M2S", log.fmtDebug( " transfers........." ),
                log.yn( self.opts.imaState.optsLoop.enableStepM2S ), "\n" +
                "    S2M", log.fmtDebug( " transfers........." ),
                log.yn( self.opts.imaState.optsLoop.enableStepS2M ), "\n",
                "    S2S", log.fmtDebug( " transfers........." ),
                log.yn( self.opts.imaState.optsLoop.enableStepS2S ) );
            /* await */
            loop.runTransferLoop( self.opts.imaState.optsLoop );
            self.information( "Full init compete for in-worker IMA loop {} in {}",
                workerData.url, threadInfo.threadDescription() );
            return joAnswer;
        };
        self.mapApiHandlers.spreadUpdatedSChainNetwork =
            function( joMessage, joAnswer, eventData, socket ) {
                self.initLogMethods();
                self.debug(
                    "New own S-Chains network information is arrived to {} loop worker " +
                    "in {}: {}, this own S-Chain update is {}", workerData.url,
                    threadInfo.threadDescription(), joMessage.joSChainNetworkInfo,
                    log.posNeg( joMessage.isFinal, "final", "partial" ) );
                imaState.joSChainNetworkInfo = joMessage.joSChainNetworkInfo;
            };
        self.mapApiHandlers.schainsCached = function( joMessage, joAnswer, eventData, socket ) {
            self.initLogMethods();
            if( threadInfo.joCustomThreadProperties.isSChainsCacheNeeded ) {
                self.debug( "S-Chains cache did arrived to {} loop worker in {}: {}",
                    workerData.url, threadInfo.threadDescription(),
                    joMessage.message.arrSChainsCached );
            }
            skaleObserver.setLastCachedSChains( joMessage.message.arrSChainsCached );
        };
        // eslint-disable-next-line dot-notation
        self.mapApiHandlers["skale_imaNotifyLoopWork"] =
            function( joMessage, joAnswer, eventData, socket ) {
                self.initLogMethods();
                pwa.handleLoopStateArrived( // NOTICE: no await here, executed async
                    imaState,
                    owaspUtils.toInteger( joMessage.params.nNodeNumber ),
                    joMessage.params.strLoopWorkType,
                    joMessage.params.nIndexS2S,
                    ( !!( joMessage.params.isStart ) ),
                    owaspUtils.toInteger( joMessage.params.ts ),
                    joMessage.params.signature
                );
            };
        console.log( "Initialized in-worker IMA loop {} server in {}",
            workerData.url, threadInfo.threadDescription() );
    }
    dispose() {
        const self = this;
        self.isDisposing = true;
        if( self.intervalPeriodicSchainsCaching ) {
            clearInterval( self.intervalPeriodicSchainsCaching );
            self.intervalPeriodicSchainsCaching = null;
        }
        super.dispose();
    }
    initLogMethods() {
        const self = this;
        if( "fatal" in self && self.fatal && typeof self.fatal == "function" )
            return;
        self.fatal = function() {
            if( log.verboseGet() >= log.verboseReversed().fatal ) {
                self.log( log.getLogLinePrefixFatal() +
                    log.fmtFatal( ...arguments ) );
            }
        };
        self.critical = function() {
            if( log.verboseGet() >= log.verboseReversed().critical ) {
                self.log( log.getLogLinePrefixCritical() +
                log.fmtCritical( ...arguments ) );
            }
        };
        self.error = function() {
            if( log.verboseGet() >= log.verboseReversed().error ) {
                self.log( log.getLogLinePrefixError() +
                log.fmtError( ...arguments ) );
            }
        };
        self.warning = function() {
            if( log.verboseGet() >= log.verboseReversed().warning ) {
                self.log( log.getLogLinePrefixWarning() +
                log.fmtWarning( ...arguments ) );
            }
        };
        self.attention = function() {
            if( log.verboseGet() >= log.verboseReversed().attention ) {
                self.log( log.getLogLinePrefixAttention() +
                log.fmtAttention( ...arguments ) );
            }
        };
        self.information = function() {
            if( log.verboseGet() >= log.verboseReversed().information ) {
                self.log( log.getLogLinePrefixInformation() +
                log.fmtInformation( ...arguments ) );
            }
        };
        self.info = function() {
            if( log.verboseGet() >= log.verboseReversed().information ) {
                self.log( log.getLogLinePrefixInformation() +
                log.fmtInformation( ...arguments ) );
            }
        };
        self.notice = function() {
            if( log.verboseGet() >= log.verboseReversed().notice ) {
                self.log( log.getLogLinePrefixNotice() +
                log.fmtNotice( ...arguments ) );
            }
        };
        self.note = function() {
            if( log.verboseGet() >= log.verboseReversed().notice ) {
                self.log( log.getLogLinePrefixNote() +
                log.fmtNote( ...arguments ) );
            }
        };
        self.debug = function() {
            if( log.verboseGet() >= log.verboseReversed().debug ) {
                self.log( log.getLogLinePrefixDebug() +
                log.fmtDebug( ...arguments ) );
            }
        };
        self.trace = function() {
            if( log.verboseGet() >= log.verboseReversed().trace ) {
                self.log( log.getLogLinePrefixTrace() +
                log.fmtTrace( ...arguments ) );
            }
        };
        self.success = function() {
            if( log.verboseGet() >= log.verboseReversed().information ) {
                self.log( log.getLogLinePrefixSuccess() +
                log.fmtSuccess( ...arguments ) );
            }
        };
    }
};

const acceptor = new networkLayer.InWorkerSocketServerAcceptor( workerData.url, doSendMessage );
const server = new ObserverServer( acceptor );
server.on( "dispose", function() {
    const self = server;
    self.debug( "Disposed in-worker in {} IMA loop {}",
        threadInfo.threadDescription(), workerData.url );
} );
