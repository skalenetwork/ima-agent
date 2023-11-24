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
 * @file observerWorker.mjs
 * @copyright SKALE Labs 2019-Present
 */

import {
    parentPort
} from "worker_threads";
import * as networkLayer from "./socket.mjs";
import { SocketServer } from "./socketServer.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as skaleObserver from "./observer.mjs";
import * as log from "./log.mjs";
import * as threadInfo from "./threadInfo.mjs";

const gURL = "skale_observer_worker_server";

parentPort.on( "message", jo => {
    if( networkLayer.inWorkerAPIs.onMessage( jo ) )
        return;
} );

function doSendMessage( type, endpoint, workerUUID, data ) {
    const jo = networkLayer.socketReceivedDataReverseMarshall( data );
    const joSend = {
        "workerMessageType":
            ( type && typeof type == "string" && type.length > 0 ) ? type : "inWorkerMessage",
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
            self.opts.imaState.chainProperties.mn.joAccount.address =
                owaspUtils.fnAddressImpl_;
            self.opts.imaState.chainProperties.sc.joAccount.address =
                owaspUtils.fnAddressImpl_;
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
            self.opts.imaState.joNodes = new owaspUtils.ethersMod.ethers.Contract(
                self.opts.imaState.joAbiSkaleManager.nodes_address,
                self.opts.imaState.joAbiSkaleManager.nodes_abi,
                self.opts.imaState.chainProperties.mn.ethersProvider );
            self.opts.imaState.joSChains = new owaspUtils.ethersMod.ethers.Contract(
                self.opts.imaState.joAbiSkaleManager.schains_address,
                self.opts.imaState.joAbiSkaleManager.schains_abi,
                self.opts.imaState.chainProperties.mn.ethersProvider );
            self.opts.imaState.joSChainsInternal = new owaspUtils.ethersMod.ethers.Contract(
                self.opts.imaState.joAbiSkaleManager.schains_internal_address,
                self.opts.imaState.joAbiSkaleManager.schains_internal_abi,
                self.opts.imaState.chainProperties.mn.ethersProvider );
            self.opts.imaState.joMessageProxySChain = new owaspUtils.ethersMod.ethers.Contract(
                self.opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_address,
                self.opts.imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                self.opts.imaState.chainProperties.sc.ethersProvider );
            self.initComplete = true;
            self.information( log.fmtInformation(
                "Full init compete for in-worker SNB server in {}, U={}",
                threadInfo.threadDescription(), gURL ) );
            return joAnswer;
        };
        self.mapApiHandlers.periodicCachingStart =
            function( joMessage, joAnswer, eventData, socket ) {
                self.initLogMethods();
                self.opts.details.debug( "{} will start periodic SNB refresh ...",
                    threadInfo.threadDescription() );
                self.periodicCachingStart( socket,
                    joMessage.message.secondsToReDiscoverSkaleNetwork,
                    joMessage.message.strChainNameConnectedTo,
                    joMessage.message.isForceMultiAttemptsUntilSuccess );
                joAnswer.message = {
                    "method": "" + joMessage.method,
                    "error": null
                };
                return joAnswer;
            };
        self.mapApiHandlers.periodicCachingStop =
            function( joMessage, joAnswer, eventData, socket ) {
                self.initLogMethods();
                self.periodicCachingStop();
                joAnswer.message = {
                    "method": "" + joMessage.method,
                    "error": null
                };
                return joAnswer;
            };
        console.log( log.fmtInformation(
            "Initialized in-worker SNB server in {}, U={}",
            threadInfo.threadDescription(), gURL ) );
    }
    dispose() {
        const self = this;
        self.isDisposing = true;
        if( self.intervalPeriodicSchainsCaching ) {
            owaspUtils.clearInterval2( self.intervalPeriodicSchainsCaching );
            self.intervalPeriodicSchainsCaching = null;
        }
        super.dispose();
    }
    async periodicCachingDoNow(
        socket,
        secondsToReDiscoverSkaleNetwork,
        strChainNameConnectedTo,
        isForceMultiAttemptsUntilSuccess
    ) {
        const self = this;
        if( self.bIsPeriodicCachingStepInProgress )
            return null;
        let strError = null;
        self.bIsPeriodicCachingStepInProgress = true;
        self.opts.details.debug( "{} thread will invoke S-Chains caching in {} mode...",
            threadInfo.threadDescription(), ( isForceMultiAttemptsUntilSuccess
                ? log.fmtWarning( "forced" ) : log.fmtSuccess( "normal" ) ) );
        for( let idxAttempt = 0;
            // eslint-disable-next-line no-unmodified-loop-condition
            idxAttempt < 10 || isForceMultiAttemptsUntilSuccess;
            ++ idxAttempt
        ) {
            try {
                self.opts.details.debug( "{} thread will invoke S-Chains caching(attempt {})...",
                    threadInfo.threadDescription(), idxAttempt );
                strError = await skaleObserver.cacheSChains( strChainNameConnectedTo, self.opts );
                if( ! strError )
                    break;
            } catch ( err ) {
                strError = owaspUtils.extractErrorMessage( err );
                if( ! strError ) {
                    strError = "runtime error without description in " +
                        threadInfo.threadDescription( false );
                }
            }
            await threadInfo.sleep( 5 * 1000 );
        }
        self.bIsPeriodicCachingStepInProgress = false;
        if( strError ) {
            self.error( "Parallel periodic SNB caching came across with error: {err} in {}",
                strError, threadInfo.threadDescription() );
            return strError;
        }
        self.debug( "Parallel periodic SNB caching in {} will notify main thread now",
            threadInfo.threadDescription() );
        const arrSChains = skaleObserver.getLastCachedSChains();
        const jo = {
            "method": "periodicCachingDoNow",
            "error": null,
            "message": arrSChains
        };
        const isFlush = true;
        socket.send( jo, isFlush );
        self.debug( "Parallel periodic SNB caching in {} did notified main thread now",
            threadInfo.threadDescription() );
        return null;
    }
    async periodicCachingStart(
        socket,
        secondsToReDiscoverSkaleNetwork,
        strChainNameConnectedTo,
        isForceMultiAttemptsUntilSuccess
    ) {
        const self = this;
        await self.periodicCachingStop();
        if( secondsToReDiscoverSkaleNetwork <= 0 )
            return false;
        self.opts.details.debug(
            "SKALE Observer in {} will do pre-configured periodic SNB refresh each {} " +
            "second(s)...", threadInfo.threadDescription(), secondsToReDiscoverSkaleNetwork );
        const fnAsyncHandler = async function() {
            try {
                self.opts.details.debug(
                    "SKALE Observer in {} will do immediate periodic SNB refresh (one of each {} " +
                    "second(s))...", threadInfo.threadDescription(),
                    secondsToReDiscoverSkaleNetwork );
                while( true ) {
                    const strError = await self.periodicCachingDoNow(
                        socket,
                        secondsToReDiscoverSkaleNetwork,
                        strChainNameConnectedTo,
                        ( !!isForceMultiAttemptsUntilSuccess ) );
                    if( strError && isForceMultiAttemptsUntilSuccess )
                        continue;
                    isForceMultiAttemptsUntilSuccess = false;
                    break;
                }
            } catch ( err ) {
                self.error( "Periodic SNB caching(async) error in {}: {err}",
                    threadInfo.threadDescription(), strError );
            }
        };
        const fnPeriodicCaching = function() {
            try {
                if( self.bIsPeriodicCachingStepInProgress )
                    return;
                fnAsyncHandler()
                    .then( () => {
                    } ).catch( ( err ) => {
                        self.error( "Periodic SNB caching(sync-delayed) in {} error: {err}",
                            threadInfo.threadDescription(), err );
                    } );
            } catch ( err ) {
                self.error( "Periodic SNB caching(sync) in {} error: {err}",
                    threadInfo.threadDescription(), err );
            }
        };
        await fnPeriodicCaching();
        self.opts.details.debug( "SKALE Observer in {} did invoked periodic SNB refresh",
            threadInfo.threadDescription() );
        self.intervalPeriodicSchainsCaching = owaspUtils.setInterval2(
            fnPeriodicCaching, secondsToReDiscoverSkaleNetwork * 1000 );
        fnAsyncHandler(); // initial async call
        return true;
    }
    async periodicCachingStop() {
        const self = this;
        if( ! self.intervalPeriodicSchainsCaching )
            return false;
        owaspUtils.clearInterval2( self.intervalPeriodicSchainsCaching );
        self.intervalPeriodicSchainsCaching = null;
        self.bIsPeriodicCachingStepInProgress = false;
        return true;
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

const acceptor = new networkLayer.InWorkerSocketServerAcceptor( gURL, doSendMessage );
const server = new ObserverServer( acceptor );
server.on( "dispose", function() {
    const self = server;
    self.debug( "Disposed in-worker in {} SNB server U=", threadInfo.threadDescription(), gURL );
} );
