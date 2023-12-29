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
 * @file loopWorker.ts
 * @copyright SKALE Labs 2019-Present
 */

import { parentPort, workerData } from "worker_threads";
import * as networkLayer from "./socket.js";
import { SocketServer } from "./socketServer.js";
import * as owaspUtils from "./owaspUtils.js";
import * as loop from "./loop.js";
import * as imaTx from "./imaTx.js";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.js";
import * as imaCLI from "./cli.js";
import * as state from "./state.js";
import * as pwa from "./pwa.js";
import * as log from "./log.js";
import * as threadInfo from "./threadInfo.js";

let imaState: state.TIMAState = state.get();

if( parentPort ) {
    parentPort.on( "message", jo => {
        if( networkLayer.inWorkerAPIs.onMessage( jo ) )
            return;
    } );
}

function doSendMessage( type: any, endpoint: any, workerUUID: any, data: any ) {
    const jo: any = networkLayer.socketReceivedDataReverseMarshall( data );
    const joSend: any = {
        workerMessageType:
            ( type && typeof type == "string" && type.length > 0 )
                ? type
                : "inWorkerMessage",
        workerEndPoint: endpoint,
        workerUUID,
        data: jo
    };
    if( parentPort )
        parentPort.postMessage( networkLayer.socketSentDataMarshall( joSend ) );
}

class ObserverServer extends SocketServer {
    initComplete?: boolean;
    opts: loop.TParallelLoopRunOptions | null;
    intervalPeriodicSchainsCaching?: number | null
    bIsPeriodicCachingStepInProgress?: boolean;
    constructor ( acceptor: any ) {
        super( acceptor );
        this.opts = null;
        const self: any = this;
        self.initComplete = false;
        log.enableColorization( workerData.colorization.isEnabled );
        self.intervalPeriodicSchainsCaching = null;
        self.bIsPeriodicCachingStepInProgress = false;
        self.mapApiHandlers.init =
        function( joMessage: any, joAnswer: any, eventData: any, socket: any ) {
            joAnswer.message = {
                method: "" + joMessage.method,
                error: null
            };
            if( self.initComplete )
                return joAnswer;
            self.log = function() {
                const args = Array.prototype.slice.call( arguments );
                const jo: any = {
                    method: "log",
                    error: null,
                    message: args.join( " " )
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            };
            self.initLogMethods();
            self.opts = JSON.parse( JSON.stringify( joMessage.message.opts ) );
            self.opts.details = {
                write: self.log,
                fatal: self.fatal,
                critical: self.critical,
                error: self.error,
                warning: self.warning,
                attention: self.attention,
                information: self.information,
                info: self.info,
                notice: self.notice,
                note: self.note,
                debug: self.debug,
                trace: self.trace,
                success: self.success
            };
            log.enableColorization( joMessage.message.colorization.isEnabled );
            log.verboseSet( self.opts.imaState.verbose_ );
            log.exposeDetailsSet( self.opts.imaState.expose_details_ );
            imaTransferErrorHandling.saveTransferEvents.on( "error", function( eventData: any ) {
                const jo: any = {
                    method: "saveTransferError",
                    message: eventData.detail
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            } );
            imaTransferErrorHandling.saveTransferEvents.on( "success", function( eventData: any ) {
                const jo: any = {
                    method: "saveTransferSuccess",
                    message: eventData.detail
                };
                const isFlush = true;
                socket.send( jo, isFlush );
            } );
            self.opts.imaState.chainProperties.mn.joAccount.address =
                function() { return owaspUtils.fnAddressImpl_( this ); };
            self.opts.imaState.chainProperties.sc.joAccount.address =
                function() { return owaspUtils.fnAddressImpl_( this ); };
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
            loop.runTransferLoop( self.opts.imaState.optsLoop )
                .then( function() {} ).catch( function() {} );
            self.information( "Full init compete for in-worker IMA loop {} in {}",
                workerData.url, threadInfo.threadDescription() );
            return joAnswer;
        };
        self.mapApiHandlers.spreadUpdatedSChainNetwork =
            function( joMessage: any, joAnswer: any, eventData: any, socket: any ) {
                self.initLogMethods();
                self.debug(
                    "New own S-Chains network information is arrived to {} loop worker " +
                    "in {}: {}, this own S-Chain update is {}", workerData.url,
                    threadInfo.threadDescription(), joMessage.joSChainNetworkInfo,
                    log.posNeg( joMessage.isFinal, "final", "partial" ) );
                imaState.joSChainNetworkInfo = joMessage.joSChainNetworkInfo;
            };
        self.mapApiHandlers.skale_imaNotifyLoopWork =
            function( joMessage: any, joAnswer: any, eventData: any, socket: any ) {
                self.initLogMethods();
                pwa.handleLoopStateArrived( // NOTICE: no await here, executed async
                    imaState,
                    owaspUtils.toInteger( joMessage.params.nNodeNumber ),
                    joMessage.params.strLoopWorkType,
                    joMessage.params.nIndexS2S,
                    ( !!( joMessage.params.isStart ) ),
                    owaspUtils.toInteger( joMessage.params.ts ),
                    joMessage.params.signature
                ).then( function() {} ).catch( function() {} );
            }
        console.log( "Initialized in-worker IMA loop {} server in {}",
            workerData.url, threadInfo.threadDescription() );
    }
    dispose() {
        const self: any = this;
        self.isDisposing = true;
        if( self.intervalPeriodicSchainsCaching ) {
            clearInterval( self.intervalPeriodicSchainsCaching );
            self.intervalPeriodicSchainsCaching = null;
        }
        super.dispose();
    }
    initLogMethods() {
        const self: any = this;
        if( "fatal" in self && self.fatal && typeof self.fatal == "function" )
            return;
        self.fatal = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "fatal" ) ) {
                self.log( log.getLogLinePrefixFatal() +
                    log.fmtFatal( ...args ) );
            }
        };
        self.critical = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "critical" ) ) {
                self.log( log.getLogLinePrefixCritical() +
                log.fmtCritical( ...args ) );
            }
        };
        self.error = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "error" ) ) {
                self.log( log.getLogLinePrefixError() +
                log.fmtError( ...args ) );
            }
        };
        self.warning = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "warning" ) ) {
                self.log( log.getLogLinePrefixWarning() +
                log.fmtWarning( ...args ) );
            }
        };
        self.attention = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "attention" ) ) {
                self.log( log.getLogLinePrefixAttention() +
                log.fmtAttention( ...args ) );
            }
        };
        self.information = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "information" ) ) {
                self.log( log.getLogLinePrefixInformation() +
                log.fmtInformation( ...args ) );
            }
        };
        self.info = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "information" ) ) {
                self.log( log.getLogLinePrefixInformation() +
                log.fmtInformation( ...args ) );
            }
        };
        self.notice = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "notice" ) ) {
                self.log( log.getLogLinePrefixNotice() +
                log.fmtNotice( ...args ) );
            }
        };
        self.note = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "notice" ) ) {
                self.log( log.getLogLinePrefixNote() +
                log.fmtNote( ...args ) );
            }
        };
        self.debug = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "debug" ) ) {
                self.log( log.getLogLinePrefixDebug() +
                log.fmtDebug( ...args ) );
            }
        };
        self.trace = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "trace" ) ) {
                self.log( log.getLogLinePrefixTrace() +
                log.fmtTrace( ...args ) );
            }
        };
        self.success = function( ...args: any[] ) {
            if( log.verboseGet() >= log.verboseName2Number( "information" ) ) {
                self.log( log.getLogLinePrefixSuccess() +
                log.fmtSuccess( ...args ) );
            }
        };
    }
};

const acceptor = new networkLayer.InWorkerSocketServerAcceptor( workerData.url, doSendMessage );
const server = new ObserverServer( acceptor );
server.on( "dispose", function() {
    const self: any = server;
    self.debug( "Disposed in-worker in {} IMA loop {}",
        threadInfo.threadDescription(), workerData.url );
} );
