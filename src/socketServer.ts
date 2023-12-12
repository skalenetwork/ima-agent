// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE COOL SOCKET
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
 * @file socketServer.ts
 * @copyright SKALE Labs 2019-Present
 */

import { EventDispatcher, UniversalDispatcherEvent } from "./eventDispatcher.js";
import * as utils from "./socketUtils.js";
import * as log from "./log.js";

export class SocketServer extends EventDispatcher {
    log: any;
    acceptor: any;
    mapApiHandlers: any;
    mapAcceptedPipes: any;
    isLogAcceptedSocket?: boolean;
    isLogSocketErrors?: boolean;
    isLogSocketTraffic?: boolean;
    isLogSocketTrafficRaw?: boolean;
    constructor( acceptor: any ) {
        super();
        if( acceptor == null || acceptor == undefined || typeof acceptor != "object" )
            throw new Error( "Cannot create server on bad acceptor" );
        const self = this;
        self.log = console.log;
        self.acceptor = acceptor;
        self.mapApiHandlers = {};
        self.mapAcceptedPipes = { };
        self.isLogAcceptedSocket = false;
        self.isLogSocketErrors = true;
        self.isLogSocketTraffic = false;
        self.isLogSocketTrafficRaw = false;
        acceptor.on( "connection", function( eventData: any ) {
            const socket = eventData.socket;
            if( ( ! ( "remoteAddress" in eventData ) ) ||
                eventData.remoteAddress == null ||
                eventData.remoteAddress == undefined )
                socket.strSavedRemoteAddress = socket.constructor.name;
            else
                socket.strSavedRemoteAddress = "" + eventData.remoteAddress;
            if( self.isLogAcceptedSocket ) {
                self.log( log.fmtInformation( "New socket {url} was {bright}",
                    socket.strSavedRemoteAddress, "accepted" ) );
            }
            self.mapAcceptedPipes[socket] = { };
            let _offAllPipeEventListeners: any = null;
            let _onPipeClose: any = function() {
                if( self.isLogAcceptedSocket ) {
                    self.log( log.fmtInformation( "Socket {url} was {bright}",
                        socket.strSavedRemoteAddress, "closed" ) );
                }
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
                delete self.mapAcceptedPipes[socket];
            };
            let _onPipeError: any = function( eventData: any ) {
                if( self.isLogSocketErrors ) {
                    self.log( log.fmtError( "Socket {url} error {err}",
                        socket.strSavedRemoteAddress, eventData ) );
                }
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
                delete self.mapAcceptedPipes[socket];
            };
            let _onPipeMessage: any = function( eventData: any ) {
                if( self.isLogSocketTrafficRaw ) {
                    self.log( log.fmtInformation( "Socket {url} did received {sunny} {}",
                        socket.strSavedRemoteAddress, "raw-message", eventData ) );
                }
                const joMessage = eventData.message;
                if( self.isLogAcceptedSocket ) {
                    self.log( log.fmtInformation( "Socket {url} did received {sunny} {}",
                        socket.strSavedRemoteAddress, "JSON-message", joMessage ) );
                }
                let joAnswer: any = null;
                let isFlush = false;
                try {
                    if( joMessage.method in self.mapApiHandlers ) {
                        joAnswer = utils.prepareAnswerJSON( joMessage );
                        joAnswer = self.mapApiHandlers[joMessage.method](
                            joMessage, joAnswer, eventData, socket );
                        if( joAnswer )
                            isFlush = true;
                    } else {
                        joAnswer = utils.prepareAnswerJSON( joMessage );
                        joAnswer.error = "Unhandled message";
                        joAnswer.joMessage = joMessage; // send it back ))
                        if( self.isLogSocketTraffic ) {
                            self.log( log.fmtError( "Socket {url} had unhandled message {}",
                                socket.strSavedRemoteAddress, joMessage ) );
                        }
                        isFlush = true;
                    }
                } catch ( err ) {
                    if( self.isLogSocketErrors ) {
                        self.log( log.fmtError(
                            "Server method {} RPC exception: {err}, stack is: {stack}",
                            joMessage.method, err, err ) );
                    }
                    joAnswer = utils.prepareAnswerJSON( joMessage );
                    joAnswer.error = "" + err;
                }

                if( joAnswer != null && joAnswer != undefined ) {
                    if( typeof joAnswer.error == "string" && joAnswer.error.length > 0 ) {
                        if( self.isLogSocketErrors ) {
                            self.log( log.fmtError( "Socket {url} will send {sunny} {err}",
                                socket.strSavedRemoteAddress, "error-answer", joAnswer ) );
                        }
                    } else {
                        if( self.isLogSocketTraffic ) {
                            self.log( log.fmtError( "Socket {url} will send {sunny} {err}",
                                socket.strSavedRemoteAddress, "answer", joAnswer ) );
                        }
                    }
                    socket.send( joAnswer, isFlush );
                }
            };
            _offAllPipeEventListeners = function() {
                if( _onPipeClose ) {
                    socket.off( "close", _onPipeClose );
                    _onPipeClose = null;
                }
                if( _onPipeError ) {
                    socket.off( "error", _onPipeError );
                    _onPipeError = null;
                }
                if( _onPipeMessage ) {
                    socket.off( "message", _onPipeMessage );
                    _onPipeMessage = null;
                }
                socket.disposeImpersonatedEntries();
            };
            socket.on( "close", _onPipeClose );
            socket.on( "error", _onPipeError );
            socket.on( "message", _onPipeMessage );
        } );
        this.dispatchEvent(
            new UniversalDispatcherEvent( "initialized", { "detail": { "ref": this } } ) );
    }
    dispose() : void {
        this.isDisposing = true;
        super.dispose();
    }
};
