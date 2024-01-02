// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE COOL SOCKET
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option)  any later version.
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
 * @file socket.ts
 * @copyright SKALE Labs 2019-Present
 */

import { UniversalDispatcherEvent, EventDispatcher } from "./eventDispatcher.js";
import { settings } from "./socketSettings.js";
import * as utils from "./socketUtils.js";

export let httpsModule: any = null; // server side only
export let wsModule: any = null; // server side only
export let webRtcModule: any = null; // server side only

export function setHttpsModule( mod: any ): void {
    httpsModule = mod || null;
}
export function setWsModule( mod: any ): void {
    wsModule = mod || null;
}
export function setWebRtcModule( mod: any ): void {
    webRtcModule = mod || null;
}

export const gMapLocalServers: any = { }; // used both for local and in-worker servers

export const socketSentDataMarshall = function( data?: any ): any {
    const s = data
        ? ( ( typeof data === "string" )
            ? data
            : ( ( typeof data === "object" ) ? JSON.stringify( data ) : data.toString() )
        )
        : "";
    return s;
};
export const socketReceivedDataReverseMarshall = function( data?: any ): any {
    try {
        const jo: any = data
            ? ( ( typeof data === "object" )
                ? data
                : ( ( typeof data === "string" ) ? JSON.parse( data ) : data )
            )
            : { };
        return jo;
    } catch ( err ) {
        return {
            error: true,
            message: "data un-marshal error",
            data
        };
    }
};

export const updateSocketDataStatsForMessage = function( joMessage: any, joStats: any ): void {
    let strMethod = "_N/A_";
    if( "method" in joMessage &&
        joMessage.method &&
        typeof joMessage.method === "string"
    )
        strMethod = "" + joMessage.method;
    if( strMethod in joStats )
        joStats[strMethod]++;
    else
        joStats[strMethod] = 1;
};
export const generateSocketDataStatsJSON = function( jo: any ): any {
    const joStats: any = {};
    if( "arrPackedMessages" in jo &&
        jo.arrPackedMessages &&
        typeof jo.arrPackedMessages === "object"
    ) {
        for( const joMessage of jo.arrPackedMessages )
            updateSocketDataStatsForMessage( joMessage, joStats );
    } else
        updateSocketDataStatsForMessage( jo, joStats );
    return joStats;
};

export class BasicServerAcceptor extends EventDispatcher {
    socketType: string;
    socketSubtype: string;
    isListening: boolean;
    strEndPoint: string | null
    nextClientNumber: number;
    mapClients: any;
    url?: string;
    constructor () {
        super();
        this.socketType = "BasicAcceptor";
        this.socketSubtype = "acceptor";
        this.isListening = false;
        this.strEndPoint = null;
        this.nextClientNumber = 1;
        this.mapClients = { };
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.nextClientNumber = 1;
        this.isListening = false;
        this.disposeNotifyClients();
        super.dispose();
    }
    disposeNotifyClients(): void {
        for( const [ /* keyWalk */, entryWalk ] of Object.entries( this.mapClients ) ) {
            const entry: any = entryWalk;
            if( ( "serverPipe" in entry ) && ( "clientPipe" in entry ) ) {
                const pair: any = entry;
                pair.serverPipe.handleServerDisposed();
                pair.clientPipe.handleServerDisposed();
                pair.serverPipe = null;
                pair.clientPipe = null;
            } else {
                const pipe = entry;
                pipe.handleServerDisposed();
            }
        }
        this.mapClients = { };
    }
    unregisterClientByKey( key: any ): void {
        if( key in this.mapClients ) {
            const entry = this.mapClients[key];
            if( entry ) {
                if( ( "serverPipe" in entry ) && ( "clientPipe" in entry ) ) {
                    const pair = entry;
                    pair.serverPipe = null;
                    pair.clientPipe = null;
                }
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.mapClients[key];
            }
        }
    }
    flush(): void {
        if( this.isDisposing || this.isDisposed )
            return;
        for( const [ /* keyWalk */, entryWalk ] of Object.entries( this.mapClients ) ) {
            const entry: any = entryWalk;
            if( ( "serverPipe" in entry ) && ( "clientPipe" in entry ) ) {
                const pair: any = entry;
                pair.serverPipe.flush();
            } else {
                const pipe = entry;
                pipe.flush();
            }
        }
    }
    newDirectConnection(): DirectPipe | null {
        if( this.isDisposing || this.isDisposed )
            return null;
        if( !this.isListening )
            return null;
        const clientPipe: DirectPipe = new DirectPipe( null, false );
        const serverPipe: DirectPipe = new DirectPipe( clientPipe, false );
        serverPipe.acceptor = this;
        this.mapClients["" + serverPipe.clientPort] = serverPipe;
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            serverPipe.dispatchEvent(
                new UniversalDispatcherEvent( "open", { socket: serverPipe } ) );
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "connection",
                    { socket: serverPipe, remoteAddress: "" + self.url } ) );
            clientPipe.dispatchEvent(
                new UniversalDispatcherEvent( "open", { socket: clientPipe } ) );
        }, 0 );
        return clientPipe;
    }
};

export class BasicSocketPipe extends EventDispatcher {
    socketType: string;
    socketSubtype: string;
    url: string;
    isConnected: boolean;
    arrAccumulatedMessages: any[];
    maxAccumulatedMessagesCount: number;
    relayClientSocket: any;
    mapImpersonatedEntries: any; // for external in-app usage only
    acceptor: any;
    clientPort: any;
    logicalInitComplete: any; // for external use
    errorLogicalInit: any; // for external use
    constructor () {
        super();
        this.socketType = "N/A";
        this.socketSubtype = "N/A";
        this.url = "N/A";
        this.isConnected = true;
        this.arrAccumulatedMessages = [];
        this.maxAccumulatedMessagesCount = 0 + settings.net.pipe.maxAccumulatedMessagesCount;
        this.relayClientSocket = null; // for relay only
        this.mapImpersonatedEntries = { }; // for external in-app usage only
    }
    dispose(): void {
        if( this.relayClientSocket ) {
            this.relayClientSocket.dispose();
            this.relayClientSocket = null;
        }
        this.disposeImpersonatedEntries(); // for external in-app usage only
        this.disconnect();
        this.arrAccumulatedMessages = [];
        super.dispose();
    }
    disposeImpersonatedEntries(): void { // for external in-app usage only
        for( const [ /* keyWalk */, entryWalk ] of Object.entries( this.mapImpersonatedEntries ) ) {
            const entry: any = entryWalk;
            try {
                if( entry && "dispose" in entry && typeof entry.dispose === "function" )
                    entry.dispose();
            } catch ( err ) {
            }
        }
        this.mapImpersonatedEntries = { }; // for app usage
    }
    implSend( data: any ): void {
        throw new Error(
            "BasicSocketPipe.implSend() must be overridden but calling it was attempted" );
    }
    isAutoFlush(): boolean {
        if( this.maxAccumulatedMessagesCount <= 1 )
            return true;
        const cnt = this.arrAccumulatedMessages.length;
        if( cnt == 0 || cnt < this.maxAccumulatedMessagesCount )
            return false;
        return true;
    }
    socketDescription(): string {
        return "" +
            // + this.socketType
            // + " "
            // + this.socketSubtype
            // + " "
            this.url;
    }
    socketLoggingTextPrefix( strLogEventName: string ): string {
        return "" + strLogEventName + " " + this.socketDescription() + " -";
    }
    send( data: any, isFlush?: boolean ): void {
        if( this.isDisposed || ( !this.isConnected ) )
            return;
        if( this.isAutoFlush() ) {
            if( settings.logging.net.socket.send || settings.logging.net.socket.flush )
                console.log( this.socketLoggingTextPrefix( "send+flush" ), data );
            this.implSend( data );
            return;
        }
        isFlush = ( isFlush == undefined || isFlush == null ) ? true : ( !!( isFlush ) );
        const jo: any = socketReceivedDataReverseMarshall( data );
        if( settings.logging.net.socket.accumulate )
            console.log( this.socketLoggingTextPrefix( "accumulate" ), data );
        this.arrAccumulatedMessages.push( jo );
        if( isFlush )
            this.flush();
    }
    flush(): void {
        if( this.isDisposed || ( !this.isConnected ) )
            return;
        const cnt = this.arrAccumulatedMessages.length;
        if( cnt == 0 )
            return;
        if( settings.logging.net.socket.flushCount )
            console.log( this.socketLoggingTextPrefix( "flush-count(" + cnt + ")" ) );
        let joSend: any = null;
        if( cnt == 1 ) {
            joSend = this.arrAccumulatedMessages[0];
            if( settings.logging.net.socket.flushOne || settings.logging.net.socket.flush )
                console.log( this.socketLoggingTextPrefix( "flush-one" ), joSend );
        } else {
            joSend = { arrPackedMessages: this.arrAccumulatedMessages };
            if( settings.logging.net.socket.flushBlock || settings.logging.net.socket.flush )
                console.log( this.socketLoggingTextPrefix( "flush-block(" + cnt + ")" ), joSend );
        }
        if( settings.logging.net.socket.flushMethodStats ) {
            console.log(
                this.socketLoggingTextPrefix( "flush-method-stats(" + cnt + ")" ),
                generateSocketDataStatsJSON( joSend )
            );
        }
        this.implSend( joSend );
        this.arrAccumulatedMessages = [];
        if( this.relayClientSocket )
            this.relayClientSocket.flush();
    }
    implReceive( data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.dispatchEvent(
            new UniversalDispatcherEvent( "message", { socket: this, message: jo } ) );
    }
    receive( data: any ): void {
        if( settings.logging.net.socket.receiveBlock )
            console.log( this.socketLoggingTextPrefix( "receive-block" ), data );
        const jo: any = socketReceivedDataReverseMarshall( data );
        if( "arrPackedMessages" in jo &&
            jo.arrPackedMessages &&
            typeof jo.arrPackedMessages === "object"
        ) {
            const cnt = jo.arrPackedMessages.length;
            if( settings.logging.net.socket.receiveCount )
                console.log( this.socketLoggingTextPrefix( "receive-count(" + cnt + ")" ) );
            if( settings.logging.net.socket.receiveMethodStats ) {
                console.log(
                    this.socketLoggingTextPrefix( "receive-method-stats(" + cnt + ")" ),
                    generateSocketDataStatsJSON( jo )
                );
            }
            for( let i = 0; i < cnt; ++i ) {
                const joMessage = jo.arrPackedMessages[i];
                if( settings.logging.net.socket.receive )
                    console.log( this.socketLoggingTextPrefix( "receive" ), joMessage );
                this.implReceive( joMessage );
            }
            return;
        }
        if( settings.logging.net.socket.receiveCount )
            console.log( this.socketLoggingTextPrefix( "receive-count(" + 1 + ")" ) );
        if( settings.logging.net.socket.receiveMethodStats ) {
            console.log(
                this.socketLoggingTextPrefix(
                    "receive-method-stats(" + 1 + ")" ), generateSocketDataStatsJSON( jo ) );
        }
        if( settings.logging.net.socket.receive )
            console.log( this.socketLoggingTextPrefix( "receive" ), jo );
        this.implReceive( jo );
    }
    disconnect(): void {
        this.isConnected = false;
    }
    reconnect(): void {
    }
    checkItself(): void {
    }
};

export class NullSocketPipe extends BasicSocketPipe {
    constructor() {
        super();
        this.socketType = "NULL";
        this.socketSubtype = "pipe";
        this.url = "NullUrl";
        this.isConnected = true;
    }
    dispose(): void {
        this.isConnected = false;
        super.dispose();
    }
    implSend( data: any ): void {
    }
    implReceive( data: any ): void {
    }
    send( data: any ): void {
    }
    receive( data: any ): void {
    }
    flush(): void {
    }
};

export const isRunningInWorker = function(): boolean {
    if( self.document === undefined )
        return true;
    return false;
};

// in-worker clients in connecting state
export const gMapAwaitingInWorkerClients: Record < string, any > = { };
// in-worker clients in connecting state
export const gMapConnectedInWorkerClients: Record < string, any > = { };

export const outOfWorkerAPIs: any = {
    onMessage: function( worker: any, data: any ): boolean {
        const jo: any = socketReceivedDataReverseMarshall( data );
        if( !( "workerMessageType" in jo ) ||
            typeof jo.workerMessageType !== "string" ||
            jo.workerMessageType.length == 0 )
            return false; // not a socket message
        if( !( "workerEndPoint" in jo ) ||
        typeof jo.workerEndPoint !== "string" ||
        jo.workerEndPoint.length == 0 )
            return false; // TO-DO: send error answer and return true
        if( !( "workerUUID" in jo ) || typeof jo.workerUUID !== "string" ||
            jo.workerUUID.length == 0 )
            return false; // TO-DO: send error answer and return true
        switch ( jo.workerMessageType ) {
        case "inWorkerConnect": {
            if( !( jo.workerUUID in gMapAwaitingInWorkerClients ) )
                return false;
            const pipe: any = gMapAwaitingInWorkerClients["" + jo.workerUUID]
            pipe.performSuccessfulConnection();
        } return true;
        case "inWorkerDisconnect": {
            if( !( jo.workerUUID in gMapConnectedInWorkerClients ) )
                return false;
            const pipe: any = gMapConnectedInWorkerClients[jo.workerUUID];
            pipe.performDisconnect();
        } return true;
        case "inWorkerMessage": {
            if( !( jo.workerUUID in gMapConnectedInWorkerClients ) )
                return false;
            const pipe: any = gMapConnectedInWorkerClients[jo.workerUUID];
            pipe.receive( jo.data );
        } return true;
        default:
            return false; // TO-DO: send error answer and return true
        } // switch( jo.workerMessageType )
    },
    onSendMessage: function(
        worker: any, type: any, endpoint: any, workerUUID: any, data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        const joSend: any = {
            workerMessageType:
                ( type && typeof type === "string" && type.length > 0 )
                    ? type
                    : "inWorkerMessage",
            workerEndPoint: endpoint,
            workerUUID,
            data: jo
        };
        // worker.postMessage( socketReceivedDataReverseMarshall( joSend ) );
        worker.postMessage( socketSentDataMarshall( joSend ) );
    }
};
export const inWorkerAPIs: any = {
    onMessage: function( data: any ) {
        const jo: any = socketReceivedDataReverseMarshall( data );
        if( !( "workerMessageType" in jo ) ||
            typeof jo.workerMessageType !== "string" ||
            jo.workerMessageType.length == 0 )
            return false; // not a socket message
        if( !( "workerEndPoint" in jo ) ||
            typeof jo.workerEndPoint !== "string" ||
            jo.workerEndPoint.length == 0 )
            return false; // TO-DO: send error answer and return true
        if( !( "workerUUID" in jo ) ||
            typeof jo.workerUUID !== "string" ||
            jo.workerUUID.length == 0 )
            return false; // TO-DO: send error answer and return true
        if( !( jo.workerEndPoint in gMapLocalServers ) )
            return false; // TO-DO: send error answer and return true
        const acceptor = gMapLocalServers[jo.workerEndPoint];
        switch ( jo.workerMessageType ) {
        case "inWorkerConnect":
            return acceptor.performAccept( jo );
        case "inWorkerDisconnect":
            return acceptor.performDisconnect( jo );
        case "inWorkerMessage":
            return acceptor.receiveForClientPort( jo.workerUUID, jo.data );
        default:
            return false; // TO-DO: send error answer and return true
        } // switch( jo.workerMessageType )
    },
    onSendMessage: function( type: any, endpoint: any, workerUUID: any, data: any ) {
        const jo: any = socketReceivedDataReverseMarshall( data );
        const joSend: any = {
            workerMessageType:
                ( type && typeof type === "string" && type.length > 0 )
                    ? type
                    : "inWorkerMessage",
            workerEndPoint: endpoint,
            workerUUID,
            data: jo
        };
        // postMessage( socketReceivedDataReverseMarshall( joSend ) );
        postMessage( socketSentDataMarshall( joSend ) );
    }
};

export class InWorkerServerPipe extends BasicSocketPipe {
    fnSend: any;
    constructor ( acceptor: any, clientPort: string, fnSend: any ) {
        super();
        this.socketType = "InWorker";
        this.socketSubtype = "server";
        this.isConnected = true;
        this.acceptor = acceptor;
        this.clientPort = "" + clientPort;
        this.fnSend = fnSend || inWorkerAPIs.onSendMessage;
        this.url = "in_worker_server_pipe://" + acceptor.strEndPoint + ":" + clientPort;
        this.acceptor.mapClients[this.clientPort] = this;
        this.fnSend( "inWorkerConnect", this.acceptor.strEndPoint, this.clientPort, {} );
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
            self.acceptor.dispatchEvent(
                new UniversalDispatcherEvent(
                    "connection", { socket: self, remoteAddress: "" + self.url } ) );
        }, 0 );
    }
    dispose(): void {
        this.performDisconnect();
        super.dispose();
    }
    handleServerDisposed(): void {
        this.performDisconnect();
        this.isConnected = false;
        this.dispatchEvent( new UniversalDispatcherEvent( "close", { socket: this } ) );
        this.acceptor = null;
        this.fnSend = null;
        this.url = "";
        this.dispose();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.fnSend( "inWorkerDisconnect", this.acceptor.strEndPoint, this.clientPort, {} );
        this.isConnected = false;
        if( this.acceptor )
            this.acceptor.unregisterClientByKey( this.clientPort );
        this.dispatchEvent( new UniversalDispatcherEvent( "close", { socket: this } ) );
        this.acceptor = null;
        this.fnSend = null;
        this.url = "";
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.fnSend ) || typeof this.fnSend !== "function" ) {
            const s = "Cannot send messages to disconnected in-worker server pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.fnSend( "inWorkerMessage", this.acceptor.strEndPoint, this.clientPort, jo );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
};

export class InWorkerSocketServerAcceptor extends BasicServerAcceptor {
    fnSend: any;
    constructor ( strEndPoint: string, fnSend: any ) {
        super();
        this.socketType = "InWorker";
        this.strEndPoint =
            ( strEndPoint && typeof strEndPoint === "string" && strEndPoint.length > 0 )
                ? strEndPoint
                : "default_local_endpoint";
        if( this.strEndPoint in gMapLocalServers ) {
            const s =
                "Cannot start in-worker socket server on already listening \"" +
                this.strEndPoint + "\" endpoint";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        gMapLocalServers[this.strEndPoint] = this;
        this.fnSend = fnSend || inWorkerAPIs.onSendMessage;
        this.isListening = true;
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
        }, 0 );
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.disposeNotifyClients();
        if( this.strEndPoint &&
            typeof this.strEndPoint === "string" &&
            this.strEndPoint.length > 0
        ) {
            if( this.strEndPoint in gMapLocalServers )
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete gMapLocalServers[this.strEndPoint];
        }
        super.dispose();
    }
    performAccept( jo: any ): boolean {
        if( jo.workerUUID in this.mapClients )
            return false; // TO-DO: send error answer and return true
        const p: InWorkerServerPipe =
            new InWorkerServerPipe( this, "" + jo.workerUUID, this.fnSend );
        p.checkItself();
        return true;
    }
    performDisconnect( jo: any ): boolean {
        if( !( jo.workerUUID in this.mapClients ) )
            return false; // TO-DO: send error answer and return true
        const pipe = this.mapClients[jo.workerUUID];
        pipe.performDisconnect();
        return true;
    }
    receiveForClientPort( clientPort: any, jo: any ): boolean {
        if( !( clientPort in this.mapClients ) )
            return false; // TO-DO: send error answer and return true
        const pipe = this.mapClients[clientPort];
        pipe.receive( jo );
        return true;
    }
};

export class OutOfWorkerSocketClientPipe extends BasicSocketPipe {
    worker: any;
    fnSend: any;
    strEndPoint: string;
    constructor ( strEndPoint: string, worker: any, fnSend?: any ) {
        super();
        this.socketType = "InWorker";
        this.socketSubtype = "client";
        this.isConnected = false;
        this.worker = worker;
        this.clientPort = utils.UUIDv4();
        this.strEndPoint =
            ( strEndPoint &&
            typeof strEndPoint === "string" &&
            strEndPoint.length > 0
            )
                ? strEndPoint
                : "default_in_worker_endpoint";
        this.url = "out_of_worker_client_pipe://" + this.strEndPoint + ":" + this.clientPort;
        this.fnSend = fnSend || outOfWorkerAPIs.onSendMessage;
        this.fnSend( this.worker, "inWorkerConnect", this.strEndPoint, this.clientPort, {} );
        gMapAwaitingInWorkerClients["" + this.clientPort] = this;
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.performDisconnect();
        if( this.clientPort in gMapAwaitingInWorkerClients )
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete gMapAwaitingInWorkerClients[this.clientPort];
        super.dispose();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.isConnected = false;
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete gMapConnectedInWorkerClients["" + this.clientPort];
        this.fnSend( this.worker, "inWorkerDisconnect", this.strEndPoint, this.clientPort, {} );
        this.dispatchEvent( new UniversalDispatcherEvent( "close", { socket: this } ) );
        this.worker = null;
        this.clientPort = "";
        this.strEndPoint = "";
        this.url = "";
    }
    performSuccessfulConnection(): void {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete gMapAwaitingInWorkerClients[this.clientPort];
        gMapConnectedInWorkerClients["" + this.clientPort] = this;
        this.isConnected = true;
        this.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: this } ) );
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) ||
            ( !this.worker ) ||
            ( !this.fnSend ) ||
            typeof this.fnSend !== "function"
        ) {
            const s = "Cannot send messages to disconnected in-worker client pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    { socket: this, message: "" + s } )
            );
            throw new Error( s );
        }
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.fnSend( this.worker, "inWorkerMessage", this.strEndPoint, this.clientPort, jo );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
};

export class OutOfWorkerRelay extends EventDispatcher {
    strRelayName?: string;
    isAutoFlushIncoming?: boolean;
    isAutoFlushOutgoing?: boolean;
    acceptor: any;
    fnCreateClient: any;
    onConnection_: any;
    // eslint-disable-next-line max-lines-per-function
    constructor (
        strRelayName: string, acceptor: any, fnCreateClient: any,
        isAutoFlushIncoming: boolean, isAutoFlushOutgoing: boolean ) {
        super();
        const self = this;
        self.strRelayName = ( strRelayName != null && strRelayName != undefined &&
            typeof strRelayName === "string" && strRelayName.length > 0 )
            ? ( "" + strRelayName )
            : "unnamed";
        self.isAutoFlushIncoming =
            ( isAutoFlushIncoming == null || isAutoFlushIncoming == undefined )
                ? true
                : ( !!isAutoFlushIncoming );
        self.isAutoFlushOutgoing =
            ( isAutoFlushOutgoing == null || isAutoFlushOutgoing == undefined )
                ? true
                : ( !!( isAutoFlushOutgoing ) );
        if( !acceptor ) {
            throw new Error( `OutOfWorkerRelay ${self.strRelayName} needs acceptor ` +
                "for normal functionality" );
        }
        if( typeof fnCreateClient !== "function" ) {
            throw new Error( `OutOfWorkerRelay ${self.strRelayName} needs callback ` +
                "to create connections to target server" );
        }
        self.acceptor = acceptor;
        self.fnCreateClient = fnCreateClient;
        // eslint-disable-next-line max-lines-per-function
        self.onConnection_ = function( eventData: any ) {
            const pipeIncoming: any = eventData.socket;
            let pipeOutgoing: any = null;
            if( ( !( "remoteAddress" in eventData ) ) ||
                eventData.remoteAddress == null || eventData.remoteAddress == undefined )
                pipeIncoming.strSavedRemoteAddress = pipeIncoming.constructor.name;
            else
                pipeIncoming.strSavedRemoteAddress = "" + eventData.remoteAddress;
            if( settings.logging.net.relay.connect ) {
                console.log( "Relay \"" + self.strRelayName +
                    "\" got new external-client connection \"" +
                    pipeIncoming.strSavedRemoteAddress + "\"" );
            }
            self.dispatchEvent( new UniversalDispatcherEvent(
                "connection", {
                    relay: self,
                    socket: pipeIncoming,
                    remoteAddress: "" + pipeIncoming.strSavedRemoteAddress
                } ) );
            // 1) configure incoming pipe
            let _offAllPipeEventListeners: any = null;
            let _onExternalPipeClose: any = function(): void {
                if( settings.logging.net.relay.disconnect ) {
                    console.warn( "Relay \"" + self.strRelayName +
                        "\" external-client socket closed \"" +
                        pipeIncoming.strSavedRemoteAddress + "\"" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "close", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: true
                    } ) );
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
            };
            let _onRelayPipeClose: any = function(): void {
                if( settings.logging.net.relay.disconnect ) {
                    console.warn( "Relay \"" + self.strRelayName +
                        "\" relay-client socket closed \"" +
                        pipeIncoming.strSavedRemoteAddress + "\"" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "close", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: false
                    } ) );
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
            };
            let _onExternalPipeError: any = function( eventData: any ) {
                if( settings.logging.net.relay.error ) {
                    console.warn( "Relay client  \"" + self.strRelayName +
                        "\" external-client socket error \"" +
                        pipeIncoming.strSavedRemoteAddress + "\"" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "error", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: true
                    } ) );
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
            };
            let _onRelayPipeError: any = function( eventData: any ) {
                if( settings.logging.net.relay.error ) {
                    console.warn( "Relay client  \"" + self.strRelayName +
                        "\" relay-client socket error \"" +
                        pipeIncoming.strSavedRemoteAddress + "\"" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "error", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: false
                    } ) );
                if( _offAllPipeEventListeners ) {
                    _offAllPipeEventListeners();
                    _offAllPipeEventListeners = null;
                }
            };
            let _onExternalPipeMessage: any = function( eventData: any ) {
                if( settings.logging.net.relay.rawMessage ) {
                    console.log( "Relay \"" + self.strRelayName + "\" external-client socket \"" +
                        eventData.strSavedRemoteAddress + "\" raw message", eventData );
                }
                const joMessage = eventData.message;
                if( settings.logging.net.relay.message ) {
                    console.log( "Relay \"" + self.strRelayName + "\" external-client socket \"" +
                        pipeIncoming.strSavedRemoteAddress + "\" message ", joMessage );
                }
                if( !pipeOutgoing ) {
                    throw new Error( `Relay ${self.strRelayName} is not completely initialized ` +
                        "and cannot transfer messages" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "message", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: true,
                        message: joMessage
                    } ) );
                pipeOutgoing.send( joMessage );
                if( self.isAutoFlushIncoming )
                    pipeOutgoing.flush();
            };
            let _onRelayPipeMessage: any = function( eventData: any ) {
                if( settings.logging.net.relay.rawMessage ) {
                    console.log( "Relay \"" + self.strRelayName + "\" relay-client socket \"" +
                        eventData.strSavedRemoteAddress + "\" raw message", eventData );
                }
                const joMessage = eventData.message;
                if( settings.logging.net.relay.message ) {
                    console.log( "Relay \"" + self.strRelayName + "\" relay-client socket \"" +
                        pipeIncoming.strSavedRemoteAddress + "\" message ", joMessage );
                }
                if( !pipeOutgoing ) {
                    throw new Error( `Relay ${self.strRelayName} is not completely initialized ` +
                        "and cannot transfer messages" );
                }
                self.dispatchEvent( new UniversalDispatcherEvent(
                    "message", {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: false,
                        message: joMessage
                    } ) );
                pipeOutgoing.send( joMessage );
                if( self.isAutoFlushOutgoing )
                    pipeOutgoing.flush();
            };
            _offAllPipeEventListeners = function(): void {
                if( _onExternalPipeClose ) {
                    pipeIncoming.off( "close", _onExternalPipeClose );
                    _onExternalPipeClose = null;
                }
                if( _onExternalPipeError ) {
                    pipeIncoming.off( "error", _onExternalPipeError );
                    _onExternalPipeError = null;
                }
                if( _onExternalPipeMessage ) {
                    pipeIncoming.off( "message", _onExternalPipeMessage );
                    _onExternalPipeMessage = null;
                }
                if( pipeOutgoing.relayClientSocket ) {
                    if( _onRelayPipeClose ) {
                        pipeOutgoing.off( "close", _onRelayPipeClose );
                        _onRelayPipeClose = null;
                    }
                    if( _onRelayPipeError ) {
                        pipeOutgoing.off( "error", _onRelayPipeError );
                        _onRelayPipeError = null;
                    }
                    if( _onRelayPipeMessage ) {
                        pipeOutgoing.off( "message", _onRelayPipeMessage );
                        _onRelayPipeMessage = null;
                    }
                    pipeOutgoing.disconnect();
                    pipeOutgoing.dispose();
                }
                pipeIncoming.disconnect();
                pipeIncoming.dispose();
            };
            pipeIncoming.on( "close", _onExternalPipeClose );
            pipeIncoming.on( "error", _onExternalPipeError );
            pipeIncoming.on( "message", _onExternalPipeMessage );
            // 2) configure outgoing relay client pipe
            pipeOutgoing = pipeIncoming.relayClientSocket = self.fnCreateClient();
            if( !pipeOutgoing ) {
                pipeIncoming.dispose();
                throw new Error( `Relay ${self.strRelayName} failed to initialize ` +
                    "relay-client socket to target server" );
            }
            pipeOutgoing.on( "close", _onRelayPipeClose );
            pipeOutgoing.on( "error", _onRelayPipeError );
            pipeOutgoing.on( "message", _onRelayPipeMessage );
        };
        self.acceptor.on( "connection", self.onConnection_ );
    }
    dispose(): void {
        this.isDisposing = true;
        if( this.acceptor )
            this.acceptor.off( "connection", this.onConnection_ );
        this.onConnection_ = null;
        super.dispose();
    }
    flush(): void {
        if( this.acceptor )
            this.acceptor.flush();
    }
};

export class OneToOneRelay extends EventDispatcher {
    strRelayName?: string;
    isAutoFlushIncoming?: boolean;
    isAutoFlushOutgoing?: boolean;
    pipeIncoming: any;
    pipeOutgoing: any;
    // eslint-disable-next-line max-lines-per-function
    constructor (
        strRelayName: string, pipeIncoming: any, pipeOutgoing: any,
        isAutoFlushIncoming: boolean, isAutoFlushOutgoing: boolean
    ) {
        super();
        const self = this;
        self.strRelayName =
            ( strRelayName != null && strRelayName != undefined &&
            typeof strRelayName === "string" && strRelayName.length > 0 )
                ? ( "" + strRelayName )
                : "unnamed";
        self.isAutoFlushIncoming =
            ( isAutoFlushIncoming == null || isAutoFlushIncoming == undefined )
                ? true
                : ( !!isAutoFlushIncoming );
        self.isAutoFlushOutgoing =
            ( isAutoFlushOutgoing == null || isAutoFlushOutgoing == undefined )
                ? true
                : ( !!isAutoFlushIncoming );
        self.pipeIncoming = pipeIncoming;
        self.pipeOutgoing = pipeOutgoing;
        if( ( !( "strSavedRemoteAddress" in pipeIncoming ) ) ||
            pipeIncoming.strSavedRemoteAddress == null ||
            pipeIncoming.strSavedRemoteAddress == undefined )
            pipeIncoming.strSavedRemoteAddress = "" + pipeIncoming.constructor.name;
        if( ( !( "strSavedRemoteAddress" in pipeOutgoing ) ) ||
            pipeOutgoing.strSavedRemoteAddress == null ||
            pipeOutgoing.strSavedRemoteAddress == undefined )
            pipeOutgoing.strSavedRemoteAddress = "" + pipeOutgoing.constructor.name;

        // 1) configure incoming pipe
        let _offAllPipeEventListeners: any = null;
        let _onIncomingPipeClose: any = function(): void {
            if( settings.logging.net.relay.disconnect ) {
                console.warn(
                    "Relay \"" + self.strRelayName + "\" incoming-client socket closed \"" +
                    pipeIncoming.strSavedRemoteAddress + "\""
                );
            }
            self.dispatchEvent( new UniversalDispatcherEvent(
                "close",
                {
                    relay: self,
                    socket: pipeIncoming,
                    remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                    isExternalSocket: true
                } )
            );
            if( _offAllPipeEventListeners ) {
                _offAllPipeEventListeners();
                _offAllPipeEventListeners = null;
            }
        };
        let _onOutgoingPipeClose: any = function(): void {
            if( settings.logging.net.relay.disconnect ) {
                console.warn(
                    "Relay \"" + self.strRelayName + "\" outgoing-client socket closed \"" +
                    pipeIncoming.strSavedRemoteAddress + "\""
                );
            }
            self.dispatchEvent( new UniversalDispatcherEvent(
                "close",
                {
                    relay: self,
                    socket: pipeIncoming,
                    remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                    isExternalSocket: false
                } )
            );
            if( _offAllPipeEventListeners ) {
                _offAllPipeEventListeners();
                _offAllPipeEventListeners = null;
            }
        };
        let _onIncomingPipeError: any = function( eventData: any ) {
            if( settings.logging.net.relay.error ) {
                console.warn(
                    "Relay client  \"" + self.strRelayName +
                    "\" incoming-client socket error \"" +
                    pipeIncoming.strSavedRemoteAddress + "\""
                );
            }
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: true
                    } )
            );
            if( _offAllPipeEventListeners ) {
                _offAllPipeEventListeners();
                _offAllPipeEventListeners = null;
            }
        };
        let _onOutgoingPipeError: any = function( eventData: any ) {
            if( settings.logging.net.relay.error ) {
                console.warn(
                    "Relay client  \"" + self.strRelayName +
                    "\" outgoing-client socket error \"" +
                    pipeIncoming.strSavedRemoteAddress + "\""
                );
            }
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: false
                    } )
            );
            if( _offAllPipeEventListeners ) {
                _offAllPipeEventListeners();
                _offAllPipeEventListeners = null;
            }
        };
        let _onIncomingPipeMessage: any = function( eventData: any ) {
            if( settings.logging.net.relay.rawMessage ) {
                console.log(
                    "Relay \"" + self.strRelayName + "\" incoming-client socket \"" +
                    eventData.strSavedRemoteAddress + "\" raw message", eventData
                );
            }
            const joMessage = eventData.message;
            if( settings.logging.net.relay.message ) {
                console.log(
                    "Relay \"" + self.strRelayName + "\" incoming-client socket \"" +
                    pipeIncoming.strSavedRemoteAddress + "\" message ", joMessage
                );
            }
            if( !pipeOutgoing ) {
                throw new Error( `Relay  ${self.strRelayName} is not completely initialized ` +
                    "and cannot transfer messages" );
            }
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "message",
                    {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: true,
                        message: joMessage
                    } )
            );
            pipeOutgoing.send( joMessage );
            if( self.isAutoFlushIncoming )
                pipeOutgoing.flush();
        };
        let _onOutgoingPipeMessage: any = function( eventData: any ) {
            if( settings.logging.net.relay.rawMessage ) {
                console.log(
                    `Relay  ${self.strRelayName}` + "\" outgoing-client socket \"" +
                    eventData.strSavedRemoteAddress + "\" raw message", eventData
                );
            }
            const joMessage = eventData.message;
            if( settings.logging.net.relay.message ) {
                console.log(
                    `Relay  ${self.strRelayName}` + "\" outgoing-client socket \"" +
                    pipeIncoming.strSavedRemoteAddress + "\" message ", joMessage
                );
            }
            if( !pipeOutgoing ) {
                throw new Error( `Relay  ${self.strRelayName} is not completely initialized ` +
                    "and cannot transfer messages" );
            }
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "message",
                    {
                        relay: self,
                        socket: pipeIncoming,
                        remoteAddress: "" + pipeIncoming.strSavedRemoteAddress,
                        isExternalSocket: false,
                        message: joMessage
                    } )
            );
            pipeIncoming.send( joMessage );
            if( self.isAutoFlushOutgoing )
                pipeIncoming.flush();
        };
        _offAllPipeEventListeners = function(): void {
            if( _onIncomingPipeClose ) {
                pipeIncoming.off( "close", _onIncomingPipeClose );
                _onIncomingPipeClose = null;
            }
            if( _onIncomingPipeError ) {
                pipeIncoming.off( "error", _onIncomingPipeError );
                _onIncomingPipeError = null;
            }
            if( _onIncomingPipeMessage ) {
                pipeIncoming.off( "message", _onIncomingPipeMessage );
                _onIncomingPipeMessage = null;
            }
            if( pipeOutgoing.relayClientSocket ) {
                if( _onOutgoingPipeClose ) {
                    pipeOutgoing.off( "close", _onOutgoingPipeClose );
                    _onOutgoingPipeClose = null;
                }
                if( _onOutgoingPipeError ) {
                    pipeOutgoing.off( "error", _onOutgoingPipeError );
                    _onOutgoingPipeError = null;
                }
                if( _onOutgoingPipeMessage ) {
                    pipeOutgoing.off( "message", _onOutgoingPipeMessage );
                    _onOutgoingPipeMessage = null;
                }
                pipeOutgoing.disconnect();
                pipeOutgoing.dispose();
            }
            pipeIncoming.disconnect();
            pipeIncoming.dispose();
        };
        pipeIncoming.on( "close", _onIncomingPipeClose );
        pipeIncoming.on( "error", _onIncomingPipeError );
        pipeIncoming.on( "message", _onIncomingPipeMessage );

        // 2) configure outgoing relay client pipe
        pipeOutgoing.on( "close", _onOutgoingPipeClose );
        pipeOutgoing.on( "error", _onOutgoingPipeError );
        pipeOutgoing.on( "message", _onOutgoingPipeMessage );
    }
    dispose(): void {
        this.isDisposing = true;
        super.dispose();
    }
    flush(): void {
        if( this.pipeIncoming )
            this.pipeIncoming.flush();
        if( this.pipeOutgoing )
            this.pipeOutgoing.flush();
    }
};

export class DirectPipe extends BasicSocketPipe {
    socketType: string;
    socketSubtype: string;
    isConnected: boolean;
    acceptor: any;
    counterPipe: any;
    strEndPoint: string;
    clientPort: number;
    url: string;
    constructor ( counterPipe: any, isBroadcastOpenEvents: boolean ) {
        super();
        isBroadcastOpenEvents = ( !!isBroadcastOpenEvents );
        this.socketType = "Direct";
        this.socketSubtype = "direct.not.initialized.yet";
        this.isConnected = false;
        this.acceptor = null;
        this.counterPipe = ( counterPipe != null && counterPipe != undefined )
            ? counterPipe
            : null; // set outside after this constructor call
        this.strEndPoint = this.counterPipe
            ? ( "2-" + this.counterPipe.strEndPoint )
            : ( "1-" + utils.randomDirectPipeID() );
        this.clientPort = this.counterPipe ? 2 : 1;
        this.socketSubtype = "direct." + this.clientPort;
        this.url = "direct_pipe://" + this.strEndPoint + ":" + this.clientPort;
        if( this.counterPipe ) {
            this.counterPipe.counterPipe = this;
            this.isConnected = true;
            this.counterPipe.isConnected = true;
            if( isBroadcastOpenEvents ) {
                const self = this;
                const iv = setTimeout( function(): void {
                    clearTimeout( iv );
                    self.dispatchEvent( new UniversalDispatcherEvent(
                        "open", { socket: self } ) );
                    self.counterPipe.dispatchEvent(
                        new UniversalDispatcherEvent(
                            "open", { socket: self.counterPipe } ) );
                }, 0 );
            }
        }
    }
    dispose(): void {
        this.performDisconnect();
        super.dispose();
    }
    handleServerDisposed(): void { // this method is for using in local client/server pipe pairs
        this.performDisconnect();
        this.isConnected = false;
        this.dispatchEvent( new UniversalDispatcherEvent( "close", { socket: this } ) );
        this.acceptor = null;
        this.counterPipe = null;
        this.clientPort = 0;
        this.url = "";
        this.dispose();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.isConnected = false;
        if( this.acceptor )
            this.acceptor.unregisterClientByKey( this.clientPort );
        this.dispatchEvent( new UniversalDispatcherEvent( "close", { socket: this } ) );
        this.counterPipe.performDisconnect();
        this.acceptor = null;
        this.counterPipe = null;
        this.clientPort = 0;
        this.url = "";
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.counterPipe?.isConnected ) ) {
            const s = "Cannot send messages to disconnected local server pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        const s = socketSentDataMarshall( data );
        const jo: any = socketReceivedDataReverseMarshall( s );
        this.counterPipe.receive( jo );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
};

export class LocalSocketServerPipe extends DirectPipe {
    constructor( counterPipe: any, acceptor: any, clientPort: number ) {
        super( counterPipe, false );
        this.socketType = "Local";
        this.socketSubtype = "server";
        this.isConnected = true;
        this.acceptor = acceptor;
        this.clientPort = 0 + clientPort;
        this.url = "local_server_pipe://" + acceptor.strEndPoint + ":" + clientPort;
        this.acceptor.mapClients["" + clientPort] = this;
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
        }, 0 );
    }
    dispose(): void {
        super.dispose();
    }
};

export class LocalSocketServerAcceptor extends BasicServerAcceptor {
    nextClientPort: number;
    constructor ( strEndPoint: string ) {
        super();
        this.socketType = "Local";
        this.nextClientPort = 1;
        this.strEndPoint =
            ( strEndPoint && typeof strEndPoint === "string" && strEndPoint.length > 0 )
                ? strEndPoint
                : "default_local_endpoint";
        if( this.strEndPoint in gMapLocalServers ) {
            const s =
                "Cannot start local socket server on already listening \"" +
                this.strEndPoint + "\" endpoint";
            this.dispatchEvent( new UniversalDispatcherEvent(
                "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        gMapLocalServers[this.strEndPoint] = this;
        this.isListening = true;
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent(
                new UniversalDispatcherEvent( "open", { socket: self } ) );
        }, 0 );
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.disposeNotifyClients();
        if( this.strEndPoint &&
            typeof this.strEndPoint === "string" &&
            this.strEndPoint.length > 0
        ) {
            if( this.strEndPoint in gMapLocalServers )
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete gMapLocalServers[this.strEndPoint];
        }
        super.dispose();
    }
};

export class LocalSocketClientPipe extends DirectPipe {
    constructor( strEndPoint: string ) {
        super( null, false );
        this.socketType = "Local";
        this.socketSubtype = "client";
        this.isConnected = false;
        this.clientPort = 0;
        this.acceptor = null;
        this.counterPipe = null;
        this.strEndPoint =
            ( strEndPoint && typeof strEndPoint === "string" && strEndPoint.length > 0 )
                ? strEndPoint
                : "default_local_endpoint";
        if( !( this.strEndPoint in gMapLocalServers ) ) {
            const s =
                "Cannot connect to local socket server \"" + this.strEndPoint +
                "\" endpoint, no such server";
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        this.acceptor = gMapLocalServers[this.strEndPoint];
        this.clientPort = 0 + this.acceptor.nextClientPort;
        ++this.acceptor.nextClientPort;
        this.url = "local_client_pipe://" + this.strEndPoint + ":" + this.clientPort;
        this.isConnected = true;
        const serverPipe = new LocalSocketServerPipe( this, this.acceptor, 0 + this.clientPort );
        serverPipe.counterPipe = this;
        this.counterPipe = serverPipe;
        this.acceptor.mapClients[0 + this.clientPort] = {
            serverPipe,
            clientPipe: this
        };
        const self = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
            self.acceptor.dispatchEvent(
                new UniversalDispatcherEvent(
                    "connection",
                    { socket: serverPipe, remoteAddress: "" + self.url } )
            );
        }, 0 );
    }
    dispose(): void {
        super.dispose();
    }
};

export class WebSocketServerPipe extends BasicSocketPipe {
    clientNumber: number;
    wsConnection: any;
    remoteAddress: string;
    _onWsClose: any;
    _onWsError: any;
    _onWsMessage: any;
    _removeWsEventListeners: any;
    constructor ( acceptor: any, wsConnection: any, remoteAddress: string ) {
        super();
        this.socketType = "WS";
        this.socketSubtype = "server";
        const self = this;
        this.isConnected = true;
        this.acceptor = acceptor;
        this.clientNumber = 0 + acceptor.nextClientNumber;
        this.clientPort = 0 + this.clientNumber;
        ++acceptor.nextClientNumber;
        this.wsConnection = wsConnection;
        this.remoteAddress = "" + remoteAddress;
        this.url = "ws_server_pipe(" + this.clientNumber + ")://" + remoteAddress;
        this._onWsClose = function(): void {
            self.dispatchEvent(
                new UniversalDispatcherEvent( "close", { socket: self } ) );
        };
        this._onWsError = function( event: any ): void {
            self.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: self, message: event } ) );
        };
        this._onWsMessage = function( event: any ): void {
            self.receive( event.data );
        };
        this._removeWsEventListeners = function(): void {
            if( self._onWsClose ) {
                wsConnection.removeEventListener( "close", self._onWsClose );
                self._onWsClose = null;
            }
            if( self._onWsError ) {
                wsConnection.removeEventListener( "error", self._onWsError );
                self._onWsError = null;
            }
            if( self._onWsMessage ) {
                wsConnection.removeEventListener( "message", self._onWsMessage );
                self._onWsMessage = null;
            }
        };
        wsConnection.addEventListener( "close", this._onWsClose );
        wsConnection.addEventListener( "error", this._onWsError );
        wsConnection.addEventListener( "message", this._onWsMessage );
        this.acceptor.mapClients["" + this.clientPort] = this;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
            self.acceptor.dispatchEvent(
                new UniversalDispatcherEvent(
                    "connection",
                    { socket: self, remoteAddress: "" + remoteAddress } )
            );
        }, 0 );
    }
    dispose(): void {
        this.performDisconnect();
        super.dispose();
    }
    handleServerDisposed(): void {
        this.isConnected = false;
        this.clientNumber = 0;
        this.acceptor = null;
        this.wsConnection = null;
        this.url = "";
        this.remoteAddress = "";
        this.dispose();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.isConnected = false;
        if( this._removeWsEventListeners ) {
            this._removeWsEventListeners();
            this._removeWsEventListeners = null;
        }
        if( this.wsConnection ) {
            try {
                this.wsConnection.terminate();
            } catch ( err ) {
                console.warn( "Web socket server pipe termination error", err );
            }
            this.wsConnection = null;
        }
        if( this.acceptor )
            this.acceptor.unregisterClientByKey( this.clientPort );
        this.clientNumber = 0;
        this.acceptor = null;
        this.url = "";
        this.remoteAddress = "";
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.wsConnection ) ) {
            const s = "Cannot send messages to disconnected web socket server pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        const s = socketSentDataMarshall( data );
        this.wsConnection.send( s );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
    implReceive( data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.dispatchEvent(
            new UniversalDispatcherEvent( "message", { socket: this, message: jo } ) );
    }
};

export class WebSocketServerAcceptor extends BasicServerAcceptor {
    wsServer: any;
    httpsModule: any;
    constructor ( nTcpPort: null, key?: string, cert?: string ) {
        super();
        this.socketType = "WS";
        this.wsServer = null;
        if( key != null && key != undefined && typeof key === "string" && key.length > 0 &&
            cert != null && cert != undefined && typeof cert === "string" && cert.length > 0
        ) {
            const server = httpsModule.createServer( {
                key: "" + key,
                cert: "" + cert
                // , ca: ...
            } );
            server.listen( nTcpPort );
            this.wsServer = new wsModule.WebSocketServer( { server } );
        } else
            this.wsServer = new wsModule.WebSocketServer( { port: nTcpPort } );

        const self = this;
        self.wsServer.on( "connection", function( wsConnection: any, req: any ) {
            wsConnection.strSavedRemoteAddress = "" + req.connection.remoteAddress;
            wsConnection.serverPipe =
                new WebSocketServerPipe( self, wsConnection, req.connection.remoteAddress );
        } );
        this.isListening = true;
        const iv = setTimeout( function(): void {
            clearTimeout( iv );
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
        }, 0 );
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.disposeNotifyClients();
        super.dispose();
    }
};

export class WebSocketClientPipe extends BasicSocketPipe {
    wsConnection: any;
    _onWsOpen: any;
    _onWsClose: any;
    _onWsError: any;
    _onWsMessage: any;
    urlWS: string | null
    _removeWsEventListeners: any;
    constructor ( url: string | URL | null ) {
        super();
        this.socketType = "WS";
        this.socketSubtype = "client";
        this.isConnected = false;
        this.wsConnection = null;
        this._onWsOpen = null;
        this._onWsClose = null;
        this._onWsError = null;
        this._onWsMessage = null;
        this.urlWS =
            "" + ( ( url != null && url != undefined && typeof url === "string" ) ? url : "" );
        this.url = "ws_client_pipe-" + this.urlWS;
        this.reconnect();
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.performDisconnect();
        this.urlWS = null;
        super.dispose();
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.wsConnection ) ) {
            const s = "Cannot send messages to disconnected web socket client pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        const s = socketSentDataMarshall( data );
        this.wsConnection.send( s );
    }
    reconnect(): void {
        this.performDisconnect();
        this.wsConnect( "" + this.urlWS );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.wsDisconnect();
    }
    wsConnectAttempt( url: string, reconnectAfterMilliseconds?: number, iv?: any ): boolean {
        const self = this;
        try {
            if( this.isConnected || this.wsConnection )
                this.wsDisconnect();
            this.wsConnection = wsModule
                ? new wsModule.WebSocket(
                    url,
                    { tlsOptions: { rejectUnauthorized: false } }
                ) // server side
                : new WebSocket( url ); // client side
            this.url = "" + url;
            this._onWsOpen = function(): void {
                self.isConnected = true;
                self.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "open", { socket: self } ) );
            };
            this._onWsClose = function( event: any ) {
                // alert( JSON.stringify( event ) );
                self.isConnected = false;
                self.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "close", { socket: self, message: event } ) );
            };
            this._onWsError = function( event: any ) {
                // alert( JSON.stringify( event ) );
                self.isConnected = false;
                self.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "error", { socket: self, message: event } ) );
            };
            this._onWsMessage = function( event: any ) {
                self.receive( event.data );
            };
            this._removeWsEventListeners = function(): void {
                if( self._onWsOpen ) {
                    self.wsConnection.removeEventListener( "open", self._onWsOpen );
                    self._onWsOpen = null;
                }
                if( self._onWsClose ) {
                    self.wsConnection.removeEventListener( "close", self._onWsClose );
                    self._onWsClose = null;
                }
                if( self._onWsError ) {
                    self.wsConnection.removeEventListener( "error", self._onWsError );
                    self._onWsError = null;
                }
                if( self._onWsMessage ) {
                    self.wsConnection.removeEventListener( "message", self._onWsMessage );
                    self._onWsMessage = null;
                }
            };
            this.wsConnection.addEventListener( "open", this._onWsOpen );
            this.wsConnection.addEventListener( "close", this._onWsClose );
            this.wsConnection.addEventListener( "error", this._onWsError );
            this.wsConnection.addEventListener( "message", this._onWsMessage );
            if( iv )
                clearTimeout( iv );
            return true;
        } catch ( err ) {
            console.warn( "WS client connect error:", err );
        }
        if( reconnectAfterMilliseconds != null && reconnectAfterMilliseconds != undefined ) {
            if( reconnectAfterMilliseconds > 0 && ( !iv ) ) {
                const iv = setTimeout( function(): void {
                    try {
                        if( self.wsConnectAttempt( url, reconnectAfterMilliseconds, iv ) )
                            clearTimeout( iv );
                    } catch ( err ) {
                    }
                }, reconnectAfterMilliseconds );
            }
        }
        return false;
    }
    wsConnect( url: string ): void {
        if( url.length == 0 ) {
            const s = "Cannot connect web socket server \"" + url + "\", bad url";
            this.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: this, message: "" + s } ) );
            throw new Error( s );
        }
        this.wsConnectAttempt( url, settings.net.ws.client.reconnectAfterMilliseconds, null );
    }
    wsDisconnect(): void {
        if( this._removeWsEventListeners ) {
            this._removeWsEventListeners();
            this._removeWsEventListeners = null;
        }
        if( this.wsConnection ) {
            let bPass = false; let anyError = null;
            try {
                this.wsConnection.close();
                bPass = true;
            } catch ( err ) {
                anyError = err;
            }
            if( !bPass ) {
                try {
                    this.wsConnection.terminate();
                    bPass = true;
                } catch ( err ) {
                    anyError = err;
                }
            }
            if( !bPass )
                console.warn( "Web socket client pipe termination error", anyError );
            this.wsConnection = null;
        }
        this.isConnected = false;
        this.url = "";
    }
    implReceive( data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.dispatchEvent(
            new UniversalDispatcherEvent( "message", { socket: this, message: jo } ) );
    }
};

export class RTCConnection extends EventDispatcher {
    strSignalingServerURL: string | null
    idRtcParticipant: string | null
    wasIdentified: boolean;
    iceComplete: any;
    pc: any;
    dc: any;
    constructor ( strSignalingServerURL?: string, idRtcParticipant?: string ) {
        super();
        this.strSignalingServerURL = utils.makeValidSignalingServerURL( strSignalingServerURL );
        this.idRtcParticipant = "" +
            ( ( idRtcParticipant != null && idRtcParticipant != undefined &&
                typeof idRtcParticipant === "string" && idRtcParticipant.length > 0 )
                ? idRtcParticipant
                : utils.UUIDv4() );
        this.wasIdentified = false;
        this.iceComplete = false;
        this.pc = null;
        this.dc = null;
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.closeDataChannel();
        this.closePeer();
        this.dc = null;
        this.wasIdentified = false;
        this.iceComplete = false;
        this.idRtcParticipant = null;
        super.dispose();
    }
    describe( strInstanceType?: string, arrAdditionalProps?: any[] ): string {
        let strInstanceDescription =
            ( strInstanceType == null || strInstanceType == undefined ||
                ( typeof strInstanceType !== "string" ) || strInstanceType.length == 0 )
                ? "participant"
                : ( "" + strInstanceType );
        if( typeof this.idRtcParticipant === "string" && this.idRtcParticipant.length > 0 )
            strInstanceDescription += " " + this.idRtcParticipant;
        const arrProps: any[] = [];
        if( this.isDisposed )
            arrProps.push( "disposed" );
        if( this.wasIdentified )
            arrProps.push( "identified" );
        if( this.pc )
            arrProps.push( "pc" );
        if( this.dc )
            arrProps.push( "dc" );
        if( arrAdditionalProps != null &&
            arrAdditionalProps != undefined &&
            arrAdditionalProps.length > 0
        ) {
            for( let i = 0; i < arrAdditionalProps.length; ++i )
                arrProps.push( arrAdditionalProps[i] );
        }
        if( arrProps.length > 0 )
            strInstanceDescription += "(" + arrProps.join( ", " ) + ")";
        return strInstanceDescription;
    }
    closeDataChannel(): void {
        if( this.dc ) {
            try {
                this.dc.ondatachannel = null;
                this.dc.close();
                if( settings.logging.net.rtc.closeDataChannel )
                    console.warn( this.describe() + " did closed RTC data channel" );
            } catch ( err ) {
                if( settings.logging.net.rtc.error )
                    console.warn( this.describe() + " error closing RTC data channel:", err );
            }
            this.dc = null;
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "dataChannelClose", { detail: { actor: this } } ) );
        }
    }
    closePeer(): void {
        if( this.pc ) {
            try {
                this.pc.onicecandidate = null;
                this.pc.oniceconnectionstatechange = null;
                this.pc.close();
                if( settings.logging.net.rtc.closePeer )
                    console.warn( this.describe() + " did closed RTC peer" );
            } catch ( err ) {
                if( settings.logging.net.rtc.error )
                    console.warn( this.describe() + " error closing RTC peer:", err );
            }
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "peerClose", { detail: { actor: this } } ) );
            this.pc = null;
        }
    }
    onError( err: any ): void {
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "rtcParticipantError", { detail: { actor: this, error: err } } ) );
        if( settings.logging.net.rtc.error )
            console.warn( " !!! " + this.describe() + " error:", err );
        this.closeDataChannel();
        this.closePeer();
    }
    send( data: any ): void {
        const s = socketSentDataMarshall( data );
        if( !this.dc ) {
            this.onError( `Attempt to send message to uninitialized RTC data channel: ${s}` );
            return;
        }
        try {
            this.dc.send( s );
        } catch ( err: any ) {
            this.onError( `Failed to send message to RTC data channel: ${err}` );
        }
    }
    onDataChannelOpen( event: any ): void {
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "dataChannelOpen", { detail: { actor: this } } ) );
    }
    onDataChannelClose( even: any ): void {
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "dataChannelClose", { detail: { actor: this } } ) );
    }
    onDataChannelError( event: any ): void {
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "dataChannelError", { detail: { actor: this } } ) );
        this.onError( "Data channel error " + event.toString() );
    }
    onDataChannelMessage( event: any ): void {
        if( event.data.size ) {
            if( settings.logging.net.rtc.error ) {
                console.warn(
                    this.describe() + " will ignore file transfer message of size", event.data.size
                );
            }
        } else {
            if( event.data.charCodeAt( 0 ) == 2 )
                return;
            const data = JSON.parse( event.data );
            if( data.type === "file" ) {
                if( settings.logging.net.rtc.error )
                    console.warn( this.describe() + " will ignore file transfer message" );
            } else {
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "dataChannelMessage", { detail: { actor: this, data } } ) );
            }
        }
    }
    onIceComplete( event: any ): void {
    }
    onIceConnectionStateChange( event: any ): void {
    // handler for self.pc.oniceconnectionstatechange,
    // see https://developer.mozilla.org/en-US/docs/
    //              Web/API/RTCPeerConnection/oniceconnectionstatechange
        if( settings.logging.net.rtc.iceConnectionStateChange ) {
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE connection state changed to \"" +
                this.pc.iceConnectionState + "\", event is:", event
            );
        } else if( settings.logging.net.rtc.iceConnectionStateName ) {
            // similar to previous but prints only connection state name
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE connection state changed to \"" + this.pc.iceConnectionState + "\""
            );
        }
        if( this.pc.iceConnectionState === "failed" ||
            this.pc.iceConnectionState === "closed" ||
            this.pc.iceConnectionState === "disconnected"
        ) {
            this.onError(
                "ICE connection state(oniceconnectionstatechange) changed to " +
                this.pc.iceConnectionState
            );
        }
    }
    onIceGatheringStateChange( event: any ): void {
    // handler for self.pc.onicegatheringstatechange - this is recommended to handle
    // in a same way as oniceconnectionstatechange,
    // see https://developer.mozilla.org/en-US/docs/
    //             Web/API/RTCPeerConnection/onicegatheringstatechange
        if( !this.pc ) {
            console.log(
                "WARNING: Participant \"" + this.idRtcParticipant +
                "\" ICE gathering state changed event with no pc\", event is:", event
            );
            return
        }
        if( settings.logging.net.rtc.iceGatheringStateChange ) {
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE gathering state changed to \"" + this.pc.iceGatheringState +
                "\", event is:", event
            );
        } else if( settings.logging.net.rtc.iceGatheringStateName ) {
            // similar to previous but prints only gathering state name
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE gathering state changed to \"" +
                this.pc.iceGatheringState + "\""
            );
        }
        if( this.pc.iceConnectionState === "failed" ||
            this.pc.iceConnectionState === "closed" ||
            this.pc.iceConnectionState === "disconnected"
        ) {
            this.onError(
                "ICE connection state(onicegatheringstatechange) changed to " +
                this.pc.iceConnectionState
            );
        }
    }
    onIceIdentifyResult( event: any ): void {
    // handler for self.pc.onidentityresult,
    // see https://developer.mozilla.org/en-US/docs/Web/API/RTCIdentityEvent
        if( settings.logging.net.rtc.iceIceIdentifyResult ) {
            if( "assertion" in event ) {
                console.warn(
                    "Participant \"" + this.idRtcParticipant +
                    "\" ICE identify result event with new identity assertion (blob: '" +
                    event.assertion + "') has been generated."
                );
            } else {
                console.warn(
                    "Participant \"" + this.idRtcParticipant +
                    "\" ICE identify result event is:", event
                );
            }
        }
    }
    onIceSignalingStateChange( event: any ): void {
    // handler for self.pc.onsignalingstatechange, see
    // https://developer.mozilla.org/en-US/docs/
    //                 Web/API/RTCPeerConnection/onsignalingstatechange
        if( settings.logging.net.rtc.iceSignalingStateChange ) {
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE signaling state changed to \"" +
                ( ( this.pc && "signalingState" in this.pc ) ? this.pc.signalingState : "N/A" ) +
                "\", event is:", event );
        }
    }
    onIceNegotiationNeeded( event: any ): void {
    // handler for self.pc.onnegotiationneeded,
    // see https://developer.mozilla.org/en-US/docs/
    //            Web/API/RTCPeerConnection/onnegotiationneeded
    // TO-DO: improve this
        if( settings.logging.net.rtc.iceNegotiationNeeded ) {
            console.log(
                "Participant \"" + this.idRtcParticipant +
                "\" ICE negotiation needed event is:", event
            );
        }
    }
};

export class RTCActor extends RTCConnection {
    idSomebodyCreator: string | null
    bWasImpersonated: boolean;
    isCreator: boolean;
    isJoiner: boolean;
    offerOptions: any;
    signalingOptions: any;
    signalingPipe: any;
    constructor (
        strSignalingServerURL: string, idRtcParticipant: string,
        offerOptions: any, signalingOptions: any
    ) {
        super( strSignalingServerURL, idRtcParticipant );
        this.isDisposed = false;
        this.idSomebodyCreator = null;
        this.bWasImpersonated = false;
        this.isCreator = false;
        this.isJoiner = false;
        this.offerOptions = {
            optional: [],
            // offer to the remote peer the opportunity to try to send audio
            offerToReceiveAudio: false,
            // offer to the remote peer the opportunity to try to send video
            offerToReceiveVideo: false,
            voiceActivityDetection: false,
            iceRestart: false
        };
        if( offerOptions ) {
            this.offerOptions.offerToReceiveAudio =
                !!( ( "offerToReceiveAudio" in offerOptions && offerOptions.offerToReceiveAudio ) );
            this.offerOptions.offerToReceiveVideo =
                !!( ( "offerToReceiveVideo" in offerOptions && offerOptions.offerToReceiveVideo ) );
            this.offerOptions.voiceActivityDetection =
                !!( ( "voiceActivityDetection" in offerOptions &&
                offerOptions.voiceActivityDetection ) );
            this.offerOptions.iceRestart =
                !!( ( "iceRestart" in offerOptions && offerOptions.iceRestart ) );
        }

        this.signalingOptions = {
            idCategory: "" + settings.rtcSpace.defaultSpaceCategory,
            idSpace: "" + settings.rtcSpace.defaultSpaceName
        };
        if( signalingOptions ) {
            if( "idCategory" in signalingOptions &&
            typeof signalingOptions.idCategory === "string" &&
            signalingOptions.idCategory.length > 0
            )
                this.signalingOptions.idCategory = "" + signalingOptions.idCategory;
            if( "idSpace" in signalingOptions &&
                typeof signalingOptions.idSpace === "string" &&
                signalingOptions.idSpace.length > 0
            )
                this.signalingOptions.idSpace = "" + signalingOptions.idSpace;
        }
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.signalingPipeClose();
        this.idSomebodyCreator = null;
        this.strSignalingServerURL = null;
        this.bWasImpersonated = false;
        super.dispose();
    }
    describe( strInstanceType?: string, arrAdditionalProps?: any[] ): string {
        strInstanceType =
            ( strInstanceType == null ||
                strInstanceType == undefined ||
                ( typeof strInstanceType !== "string" ) ||
                strInstanceType.length == 0 )
                ? ( this.isCreator ? "creator" : ( this.isJoiner ? "joiner" : "actor" ) )
                : strInstanceType;
        return super.describe( strInstanceType, arrAdditionalProps );
    }
    onError( err: any ): void {
        super.onError( err );
    }
    signalingPipeOpen(): void {
        try {
            const self = this;
            self.signalingPipeClose();
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingWillStart", { detail: { actor: this } } ) );
            self.signalingPipe = new WebSocketClientPipe( self.strSignalingServerURL );
            self.signalingPipe.on(
                "open", function( eventData: any ) { self.signalingPipeOnOpen( eventData ); } );
            self.signalingPipe.on(
                "close", function( eventData: any ) { self.signalingPipeOnClose( eventData ); } );
            self.signalingPipe.on(
                "error", function( eventData: any ) { self.signalingPipeOnError( eventData ); } );
            self.signalingPipe.on(
                "message", function( eventData: any ) {
                    self.signalingPipeOnRawMessage( eventData );
                } );
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingDidStarted", { detail: { actor: this } } ) );
        } catch ( err ) {
            if( settings.logging.net.signaling.error )
                console.warn( this.describe() + " error starting signaling pipe:", err );
            this.onError( err );
        }
    }
    signalingPipeClose(): void {
        if( this.signalingPipe ) {
            try {
                if( settings.logging.net.signaling.disconnect )
                    console.warn( this.describe() + " will close signaling pipe" );
                this.signalingPipe.offAll();
                this.signalingPipe.disconnect();
                if( settings.logging.net.signaling.disconnect )
                    console.warn( this.describe() + " did closed signaling pipe" );
            } catch ( err ) {
                if( settings.logging.net.signaling.error )
                    console.warn( this.describe() + " error closing signaling pipe:", err );
            }
            this.signalingPipe = null;
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingClosed", { detail: { actor: this } } ) );
        }
    }
    signalingPipeOnOpen( eventData: any ): void {
        try {
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingOpened", { detail: { actor: this } } ) );
            if( settings.logging.net.signaling.connect ) {
                console.log(
                    "+++ " + this.describe() + " did connected to " + this.strSignalingServerURL
                );
            }
            const joImpersonateMessage = {
                id: utils.randomCallID(),
                method: "signalingImpersonate",
                idCategory: "" + this.signalingOptions.idCategory,
                idSpace: "" + this.signalingOptions.idSpace,
                idRtcParticipant: "" + this.idRtcParticipant,
                role: this.isCreator ? "creator" : "joiner"
            };
            if( settings.logging.net.signaling.message )
                console.log( " <<< " + this.describe() + " message out", joImpersonateMessage );
            this.signalingPipe.send( joImpersonateMessage );
        } catch ( err ) {
            if( settings.logging.net.signaling.error ) {
                console.warn(
                    this.describe() + " error sending impersonation to signaling pipe:", err
                );
            }
            this.onError( err );
        }
    }
    signalingPipeOnClose( eventData: any ): void {
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "signalingPipeClose", { detail: { actor: this } } ) );
        if( settings.logging.net.signaling.disconnect ) {
            console.warn(
                " !!! " + this.describe() + " signaling pipe closed for " +
                this.strSignalingServerURL
            );
        }
        this.signalingPipeClose();
    }
    signalingPipeOnError( eventData: any ): void {
    // alert( JSON.stringify( eventData ) );
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "signalingPipeError", { detail: { actor: this, error: eventData } } ) );
        if( settings.logging.net.signaling.error ) {
            console.warn(
                " !!! " + this.describe() + " signaling pipe error for " +
                this.strSignalingServerURL + ", error is:", eventData
            );
        }
        this.onError( eventData );
        this.signalingPipeClose();
    }
    signalingPipeOnRawMessage( eventData: any ): void {
        try {
            if( settings.logging.net.signaling.rawMessage ) {
                console.log(
                    " >>> " + this.describe() + " raw signaling message received", eventData );
            }
            const joMessage = eventData.message;
            if( settings.logging.net.signaling.message ) {
                console.log(
                    " >>> " + this.describe() + " signaling message received", joMessage );
            }
            this.signalingPipeOnMessage( joMessage );
        } catch ( err ) {
            if( settings.logging.net.signaling.error )
                console.warn( "Error handling raw message in " + this.describe() + ":", err );
            this.onError( err );
        }
    }
    signalingPipeOnMessage( joMessage: any ): void {
        switch ( joMessage.method ) {
        case "signalingImpersonate":
            if( joMessage.error == null ) {
                // OKay, impersonated
                this.bWasImpersonated = true;
                if( settings.logging.net.signaling.generic ) {
                    console.log(
                        "Success, " + this.describe() + " impersonated on signaling server"
                    );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingPassedImpersonation", { detail: { actor: this } } ) );
                this.onImpersonationComplete();
            } else {
                if( settings.logging.net.signaling.error ) {
                    console.warn(
                        " >>> " + this.describe() + " signaling impersonation error",
                        joMessage.error
                    );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingFailedImpersonation",
                        { detail: { actor: this, error: joMessage.error } } )
                );
                this.onError( joMessage.error );
            }
            break;
        default:
            if( settings.logging.net.signaling.error ) {
                console.warn(
                    " >>> " + this.describe() + " unhandled signaling message",
                    joMessage
                );
            }
            break;
        } // switch( joMessage.method )
    }
    onImpersonationComplete(): void { }
    // generic implementation should never be called
    onOtherSideIdentified( idSomebodyOtherSide: any, idOffer: any ): void { }
};

export class RTCServerPeer extends RTCConnection {
    rtcCreator: any;
    idSomebodyOtherSide: string | null
    idOffer: number;
    tsOfferCreated: any;
    isPublishing: boolean;
    isSignalingNegotiation: boolean;
    isPublishTimeout: boolean;
    isSignalingNegotiationTimeout: boolean;
    timerPublishing: any;
    timerSignalingNegotiation: any;
    timeToPublishMilliseconds: any;
    timeToSignalingNegotiationMilliseconds: number;
    peerConfiguration: any;
    peerAdditionalOptions: any;
    localMediaStream: any;
    isOfferPublishedOnSignalingServer: boolean;
    offerOptions: any;
    serverPipe: any;
    constructor (
        rtcCreator: any,
        timeToPublishMilliseconds: number, timeToSignalingNegotiationMilliseconds: number,
        peerConfiguration: any, peerAdditionalOptions: any, localMediaStream?: any
    ) {
        super();
        this.rtcCreator = rtcCreator;
        this.idSomebodyOtherSide = null;
        this.idOffer = this.rtcCreator.idOfferNext++;
        this.tsOfferCreated = null;
        if( settings.logging.net.signaling.offerRegister )
            console.log( "Register offer", this.idOffer, "(RTCServerPeer constructor)" );
        this.rtcCreator.mapServerOffers[0 + this.idOffer] = this;
        this.isPublishing = false;
        this.isSignalingNegotiation = false;
        this.isPublishTimeout = false;
        this.isSignalingNegotiationTimeout = false;
        this.timerPublishing = null;
        this.timerSignalingNegotiation = null;
        this.timeToPublishMilliseconds = timeToPublishMilliseconds ||
            settings.net.rtc.timeToPublishMilliseconds;
        this.timeToSignalingNegotiationMilliseconds = timeToSignalingNegotiationMilliseconds ||
            settings.net.rtc.timeToSignalingNegotiationMilliseconds;
        this.peerConfiguration =
            ( peerConfiguration && typeof peerConfiguration === "object" )
                ? peerConfiguration
                : settings.net.rtc.peerConfiguration;
        this.peerAdditionalOptions =
            ( peerAdditionalOptions && typeof peerAdditionalOptions === "object" )
                ? peerAdditionalOptions
                : settings.net.rtc.peerAdditionalOptions;
        this.localMediaStream =
            ( localMediaStream != null && localMediaStream != undefined &&
                typeof localMediaStream === "object" )
                ? localMediaStream
                : null;
        this.isOfferPublishedOnSignalingServer = false;
        this.initPeer();
        this.publish();
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.publishCancel();
        this.signalingNegotiationCancel();
        if( this.rtcCreator ) {
            if( this.idOffer && this.idOffer in this.rtcCreator.mapServerOffers ) {
                if( settings.logging.net.signaling.offerUnregister )
                    console.log( "Unregister offer", this.idOffer, "(RTCServerPeer dispose)" );
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.rtcCreator.mapServerOffers[this.idOffer];
            }
            this.idOffer = 0;
        }
        this.idOffer = 0;
        if( this.idSomebodyOtherSide != null ) {
            if( this.idSomebodyOtherSide in this.rtcCreator.mapServerPeers )
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.rtcCreator.mapServerPeers[this.idSomebodyOtherSide];
            this.idSomebodyOtherSide = null;
        }
        this.rtcCreator = null;
        this.tsOfferCreated = null;
        super.dispose();
    }
    describe( strInstanceType?: string, arrAdditionalProps?: any[] ): string {
        strInstanceType =
            ( strInstanceType == null || strInstanceType == undefined ||
                ( typeof strInstanceType !== "string" ) || strInstanceType.length == 0 )
                ? "server-peer"
                : strInstanceType;
        return super.describe( strInstanceType, arrAdditionalProps );
    }
    initPeer(): void {
        if( this.isDisposed )
            return;
        const self = this;
        if( self.pc )
            return;
        self.pc =
            new webRtcModule.RTCPeerConnection(
                self.peerConfiguration, self.peerAdditionalOptions );
        if( self.localMediaStream ) {
            for( const track of self.localMediaStream.getTracks() )
                self.pc.addTrack( track, self.localMediaStream );
        } else {
            self.dc =
                self.pc.createDataChannel(
                    settings.net.rtc.dataChannel.label, settings.net.rtc.dataChannel.opts );
            self.dc.addEventListener(
                "open", function( event: any ) { self.onDataChannelOpen( event ); } );
            self.dc.addEventListener(
                "close", function( event: any ) { self.onDataChannelClose( event ); } );
            self.dc.addEventListener(
                "error", function( event: any ) { self.onDataChannelError( event ); } );
            self.dc.addEventListener(
                "message", function( event: any ) { self.onDataChannelMessage( event ); } );
        }
    }
    publishCancel(): void {
        if( !this.isPublishing )
            return;
        this.isOfferPublishedOnSignalingServer = false;
        this.isPublishing = false;
        if( this.timerPublishing ) {
            clearTimeout( this.timerPublishing );
            this.timerPublishing = null;
        }
        this.signalingNegotiationCancel(); // mutual cancel
    }
    signalingNegotiationCancel(): void {
        if( !this.isSignalingNegotiation )
            return;
        this.isSignalingNegotiation = false;
        if( this.timerSignalingNegotiation ) {
            clearTimeout( this.timerSignalingNegotiation );
            this.timerSignalingNegotiation = null;
        }
        this.publishCancel(); // mutual cancel
    }
    publish(): void {
        if( this.isDisposed || this.isPublishing || this.isSignalingNegotiation ||
            ( !this.rtcCreator?.signalingPipe ) )
            return;
        const self = this;
        self.isPublishing = true;
        if( self.timeToPublishMilliseconds > 0 ) {
            self.isSignalingNegotiation = false;
            self.timerPublishing = setTimeout( function(): void {
                self.publishCancel();
                self.signalingNegotiationCancel();
                self.isPublishTimeout = true;
                if( settings.logging.net.signaling.publishTimeout ) {
                    console.warn(
                        " !!! " + self.describe() + " offer publish timeout " +
                        self.timeToPublishMilliseconds + " milliseconds reached"
                    );
                }
                self.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "publishTimeout",
                        { detail: { participant: self } } )
                );
                if( self.rtcCreator ) {
                    self.rtcCreator.dispatchEvent(
                        new UniversalDispatcherEvent( "publishTimeout",
                            { detail: { participant: self } } )
                    );
                }
            }, self.timeToPublishMilliseconds );
        }
        self.dispatchEvent(
            new UniversalDispatcherEvent(
                "publishStart", { detail: { participant: self } } ) );
        self.pc.oniceconnectionstatechange =
            function( event: any ) { self.onIceConnectionStateChange( event ); };
        self.pc.onicegatheringstatechange =
            function( event: any ) { self.onIceGatheringStateChange( event ); };
        self.pc.onidentityresult =
            function( event: any ) { self.onIceIdentifyResult( event ); };
        self.pc.onsignalingstatechange =
            function( event: any ) { self.onIceSignalingStateChange( event ); };
        self.pc.onnegotiationneeded =
            function( event: any ) { self.onIceNegotiationNeeded( event ); };
        self.pc.createOffer( self.offerOptions ).then(
            function( offerDescription: any ) {
                // success
                self.tsOfferCreated = new Date();
                if( settings.logging.net.signaling.offer ) {
                    console.log(
                        " <<< " + self.describe() + " offer created at " +
                        utils.formatDateTime( self.tsOfferCreated ) +
                        " with description:", offerDescription
                    );
                }
                self.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "offerCreated", { detail: { participant: self } } ) );
                self.pc.setLocalDescription( offerDescription ).then(
                    function(): void {
                        // success
                        if( settings.logging.net.signaling.localDescription ) {
                            console.log(
                                " <<< " + self.describe() + " local description set:",
                                offerDescription
                            );
                        }
                        self.dispatchEvent(
                            new UniversalDispatcherEvent(
                                "localDescriptionSet",
                                { detail: { participant: self } } )
                        );
                        self.pc.onicecandidate = function( event: any ) {
                            self.iceComplete = true;
                            self.onIceComplete( event );
                        }; // onicecandidate
                    }, function( err: any ) {
                        // error of setLocalDescription
                        self.publishCancel();
                        self.signalingNegotiationCancel();
                        self.onError( "Failed to set local description: " + err );
                    } );
            }, function( err: any ) {
                self.publishCancel();
                self.signalingNegotiationCancel();
                // error of createOffer
                self.onError( "Failed to create offer:" + err );
            } );
    }
    onOtherSideIdentified( idSomebodyOtherSide: any ): void {
        this.publishCancel();
        this.signalingNegotiationCancel();
        this.idSomebodyOtherSide = "" + idSomebodyOtherSide;
        this.wasIdentified = true;
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "identified",
                {
                    detail: {
                        participant: this,
                        idSomebodyOtherSide: "" + idSomebodyOtherSide
                    }
                } )
        );
    }
    onError( err: any ): void {
        if( this.rtcCreator ) {
            this.rtcCreator.onRtcPeerError( this, err );
            if( this.idOffer && this.idOffer in this.rtcCreator.mapServerOffers ) {
                if( settings.logging.net.signaling.offerUnregister ) {
                    console.log(
                        "Unregister offer", this.idOffer, "due to RTCServerPeer error:", err );
                }
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.rtcCreator.mapServerOffers[this.idOffer];
            }
            this.idOffer = 0;
        }
        if( this.idSomebodyOtherSide != null ) {
            if( this.idSomebodyOtherSide in this.rtcCreator.mapServerPeers )
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete this.rtcCreator.mapServerPeers[this.idSomebodyOtherSide];
            this.idSomebodyOtherSide = null;
        }
        super.onError( err );
    }
    onImpersonationCompleteForCreator(): void { // specific for server peer
        if( settings.logging.net.signaling.creatorImpersonationComplete )
            console.log( "Creator impersonation complete" );
    }
    publishOfferOnSignalingServer(): void {
        const self = this;
        // eslint-disable-next-line no-useless-catch
        try {
            if( settings.logging.net.signaling.candidate )
                console.log( " <<< " + self.describe() + " got candidate", event );
            if( settings.logging.net.signaling.candidate )
                console.log( " <<< " + self.describe() + " got candidate", event );
            if( !self.rtcCreator.signalingPipe )
                throw new Error( "no connection to signaling server" );
            const joPublishOfferMessage = {
                id: utils.randomCallID(),
                method: "signalingPublishOffer",
                offer: self.pc.localDescription,
                idSomebodyCreator: "" + self.rtcCreator.idRtcParticipant,
                idOffer: 0 + ( self.idOffer || 0 )
            };
            if( settings.logging.net.signaling.message ) {
                console.log(
                    " <<< " + self.describe() + " signaling message out",
                    joPublishOfferMessage
                );
            }
            self.rtcCreator.signalingPipe.send( joPublishOfferMessage );
            self.publishCancel();
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingNegotiationStart", { detail: { participant: self } } ) );
            if( self.timeToSignalingNegotiationMilliseconds > 0 ) {
                self.isSignalingNegotiation = true;
                self.timerSignalingNegotiation = setTimeout( function(): void {
                    self.publishCancel();
                    self.signalingNegotiationCancel();
                    self.isSignalingNegotiationTimeout = true;
                    if( settings.logging.net.signaling.signalingNegotiationTimeout ) {
                        console.warn(
                            " !!! " + self.describe() + " signaling negotiation timeout " +
                            self.timeToSignalingNegotiationMilliseconds + " milliseconds reached"
                        );
                    }
                    self.dispatchEvent(
                        new UniversalDispatcherEvent(
                            "signalingNegotiationTimeout",
                            { detail: { participant: self } } )
                    );
                    if( self.rtcCreator ) {
                        self.rtcCreator.dispatchEvent(
                            new UniversalDispatcherEvent(
                                "signalingNegotiationTimeout",
                                { detail: { participant: self } } )
                        );
                    }
                }, self.timeToSignalingNegotiationMilliseconds );
            }
        } catch ( err ) {
            throw err;
        }
    }
    onIceComplete( event: any ): void {
        super.onIceComplete( event );
        const self = this;
        try {
            if( event.candidate == null ||
                settings.net.rtc.fastPublishMode.serverPeer
            ) {
                if( !self.isOfferPublishedOnSignalingServer ) {
                    self.isOfferPublishedOnSignalingServer = true;
                    self.publishOfferOnSignalingServer();
                }
            }
            if( event.candidate != null ) {
                if( settings.logging.net.signaling.candidateWalk ) {
                    console.log(
                        " <<< " + self.describe() + " got candidate", event
                    );
                }
            }
        } catch ( err: any ) {
            self.publishCancel();
            self.signalingNegotiationCancel();
            self.onError( "Failed to process ICE candidate: " + err );
        }
    }
};

export class RTCCreator extends RTCActor {
    idOfferNext?: number;
    mapServerOffers: any;
    mapServerPeers: any;
    constructor (
        strSignalingServerURL: string, idRtcParticipant: string,
        offerOptions: any, signalingOptions: any
    ) {
        super( strSignalingServerURL, idRtcParticipant, offerOptions, signalingOptions );
        const self = this;
        self.idOfferNext = 1;
        self.isCreator = true;
        self.mapServerOffers = { }; // idOffer -> RTCServerPeer
        self.mapServerPeers = { }; // idSomebodyOtherSide -> RTCServerPeer
        self.signalingPipeOpen();
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        for( const [ idOfferWalk, rtcPeerWalk ] of Object.entries( this.mapServerOffers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            if( settings.logging.net.signaling.offerUnregister )
                console.log( "Unregister offer", idOfferWalk, "(one of all, RTCCreator dispose)" );
            rtcPeer.dispose();
        }
        for( const [ /* idSomebodyOtherSideWalk */, rtcPeerWalk ] of
            Object.entries( this.mapServerPeers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            rtcPeer.dispose();
        }
        this.mapServerOffers = { };
        super.dispose();
    }
    describe( strInstanceType?: string, arrAdditionalProps?: any[] ): string {
        strInstanceType =
            ( strInstanceType == null || strInstanceType == undefined ||
                ( typeof strInstanceType !== "string" ) || strInstanceType.length == 0 )
                ? "rtc-creator"
                : strInstanceType;
        return super.describe( strInstanceType, arrAdditionalProps );
    }
    onOtherSideIdentified(
        idSomebodyOtherSide: any, idOffer: any ): void { // server peer got result
        if( settings.logging.net.signaling.impersonate ) {
            console.log(
                this.describe() + " did identified other side RTC joiner \"" +
                idSomebodyOtherSide + "\" via offer ID " + idOffer.toString()
            );
        }
        if( !( idOffer in this.mapServerOffers ) ) {
            const strError = "not a registered pending offer(onOtherSideIdentified)";
            if( settings.logging.net.signaling.error ) {
                console.warn(
                    " >>> " + this.describe() +
                    " came across with incorrect other side identification for *somebody*",
                    idSomebodyOtherSide, "and offer ID", idOffer, ":", strError );
            }
            this.onError( strError );
            return;
        }
        const rtcPeer = this.mapServerOffers[idOffer];
        if( settings.logging.net.signaling.offerUnregister ) {
            console.log(
                "Unregister offer", idOffer, "(onOtherSideIdentified in RTCCreator)"
            );
        }
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.mapServerOffers[idOffer];
        this.mapServerPeers["" + idSomebodyOtherSide] = rtcPeer;
        rtcPeer.onOtherSideIdentified( "" + idSomebodyOtherSide );
    }
    onRtcPeerError( rtcPeer: any, err: any ): void {
        if( settings.logging.net.rtc.error )
            console.warn( " !!! " + this.describe() + " rtc peer error", err );
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "rtcPeerError",
                { detail: { actor: this, peer: rtcPeer, error: err } } )
        );
    }
    signalingPipeOnMessage( joMessage: any ): void {
        const self = this;
        switch ( joMessage.method ) {
        case "signalingPublishOffer":
            if( joMessage.error == null ) {
                // OKay, creator offer published
                if( settings.logging.net.signaling.offer )
                    console.log( "Success, " + this.describe() + " offer published (step 1)" );
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingPassedOfferPublish", { detail: { actor: this } } ) );
            } else {
                if( settings.logging.net.signaling.error ) {
                    console.warn(
                        " !!! " + this.describe() + " signaling offer publishing (step 1) error",
                        joMessage.error );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingFailedOfferPublish",
                        { detail: { actor: this, error: joMessage.error } } )
                );
                this.onError( joMessage.error );
            }
            break;
        case "signalingPublishAnswer": // server peer got result
            if( joMessage.error == null ) {
                const idSomebodyOtherSide = "" + joMessage.idSomebody_joiner;
                const idOffer = 0 + joMessage.idOffer;
                if( !( idOffer in this.mapServerOffers ) ) {
                    const strError = "not a registered pending offer(signalingPublishAnswer)";
                    if( settings.logging.net.signaling.error ) {
                        console.warn(
                            " !!! " + this.describe() +
                            " came across with incorrect " +
                            "signalingPublishAnswer message for *somebody*",
                            idSomebodyOtherSide, "and offer ID", idOffer, ":", strError
                        );
                    }
                    this.onError( strError );
                    return
                }
                const rtcPeer = this.mapServerOffers[idOffer];
                // OKay, finally got answer from candida
                if( settings.logging.net.signaling.generic ) {
                    console.log(
                        "Success, " + this.describe() + " got answer from candidate (step 3)"
                    );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingPassedPublishAnswer",
                        {
                            detail: {
                                actor: this,
                                idSomebodyOtherSide: "" + idSomebodyOtherSide,
                                idOffer: 0 + idOffer
                            }
                        } )
                );
                const answer = joMessage.answer;
                if( settings.logging.net.signaling.offer )
                    console.log( " >>> " + self.describe() + " got answer:", answer );
                const answerDescription = new webRtcModule.RTCSessionDescription( answer );
                if( settings.logging.net.signaling.offer ) {
                    console.log(
                        " >>> " + self.describe() + " got answer description:",
                        answerDescription
                    );
                }
                if( rtcPeer.pc.signalingState != "have-local-offer" ) {
                    if( settings.logging.net.signaling.offerSkipPublishedAnswer ) {
                        console.warn(
                            " >>> " + self.describe() + " in \"" + rtcPeer.pc.signalingState +
                            "\" state will skip setting remote description from answer",
                            answerDescription
                        );
                    }
                    return;
                }
                rtcPeer.pc.setRemoteDescription( answerDescription ).then(
                    function(): void {
                        // success
                        if( settings.logging.net.signaling.remoteDescription ) {
                            console.log(
                                " >>> " + self.describe() + "did set remote description:",
                                answerDescription
                            );
                        }
                        self.dispatchEvent(
                            new UniversalDispatcherEvent(
                                "remoteDescriptionSet",
                                { detail: { participant: self } } )
                        );
                        self.onOtherSideIdentified(
                            idSomebodyOtherSide, idOffer ); // server peer got result
                    }, function( err: any ) {
                        // error
                        self.onError( "Failed to set remote description: " + err );
                    } );
            } else {
                if( settings.logging.net.signaling.error ) {
                    console.warn(
                        " !!! " + this.describe() +
                        " error getting candidate answer (step 1) error",
                        joMessage.error );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingFailedPublishAnswer",
                        { detail: { actor: this, error: joMessage.error } } )
                );
                this.onError( joMessage.error );
            }
            break;
        default:
            super.signalingPipeOnMessage( joMessage );
            break
        } // switch( joMessage.method )
    }
    send( data: any ): void { // implementation in RTCCreator does send to all
        try {
            const s = socketSentDataMarshall( data );
            for( const [ /* idSomebodyOtherSideWalk */, rtcPeerWalk ]
                of Object.entries( this.mapServerPeers ) ) {
                const rtcPeer: any = rtcPeerWalk;
                try {
                    rtcPeer.send( s );
                } catch ( err ) {
                    this.onRtcPeerError( rtcPeer, err );
                }
            }
        } catch ( err ) {
            this.onError( err );
        }
    }
    onImpersonationComplete(): void {
        super.onImpersonationComplete();
        for( const [ /* idOfferWalk */, rtcPeerWalk ]
            of Object.entries( this.mapServerOffers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            rtcPeer.onImpersonationCompleteForCreator();
        }
        for( const [ /* idSomebodyOtherSideWalk */, rtcPeerWalk ]
            of Object.entries( this.mapServerPeers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            rtcPeer.onImpersonationCompleteForCreator();
        }
    }
};

export class RTCJoiner extends RTCActor {
    idSomebodyOtherSide: any;
    idOffer: number;
    tsAnswerCreated: any;
    isAnswerPublishedOnSignalingServer: boolean;
    peerConfiguration: any;
    peerAdditionalOptions: any;
    constructor (
        strSignalingServerURL: string, idRtcParticipant: string, offerOptions: any,
        signalingOptions: any, peerConfiguration: any, peerAdditionalOptions: any
    ) {
        super( strSignalingServerURL, idRtcParticipant, offerOptions, signalingOptions );
        this.idSomebodyOtherSide = null;
        this.idOffer = 0;
        this.isJoiner = true;
        this.tsAnswerCreated = null;
        this.isAnswerPublishedOnSignalingServer = false;
        this.signalingPipeOpen();
        this.peerConfiguration =
            ( peerConfiguration && typeof peerConfiguration === "object" )
                ? peerConfiguration
                : settings.net.rtc.peerConfiguration;
        this.peerAdditionalOptions =
            ( peerAdditionalOptions && typeof peerAdditionalOptions === "object" )
                ? peerAdditionalOptions
                : settings.net.rtc.peerAdditionalOptions;
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.idSomebodyOtherSide = null;
        this.idOffer = 0;
        this.tsAnswerCreated = null;
        this.isAnswerPublishedOnSignalingServer = false;
        super.dispose();
    }
    describe( strInstanceType?: string, arrAdditionalProps?: any[] ): string {
        strInstanceType =
            ( strInstanceType == null ||
                strInstanceType == undefined ||
                ( typeof strInstanceType !== "string" ) ||
                strInstanceType.length == 0 )
                ? "rtc-joiner"
                : strInstanceType;
        return super.describe( strInstanceType, arrAdditionalProps );
    }
    initPeer(): void {
        if( this.isDisposed )
            return;
        const self = this;
        if( self.pc )
            return;
        self.pc =
            new webRtcModule.RTCPeerConnection(
                self.peerConfiguration, self.peerAdditionalOptions );
        self.pc.addEventListener( "track", function( event: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "trackAvailable",
                    { detail: { participant: self, event } } ) );
        } );
        self.pc.oniceconnectionstatechange =
            function( event: any ) { self.onIceConnectionStateChange( event ); };
        self.pc.onicegatheringstatechange =
            function( event: any ) { self.onIceGatheringStateChange( event ); };
        self.pc.onidentityresult =
            function( event: any ) { self.onIceIdentifyResult( event ); };
        self.pc.onsignalingstatechange =
            function( event: any ) { self.onIceSignalingStateChange( event ); };
        self.pc.onnegotiationneeded =
            function( event: any ) { self.onIceNegotiationNeeded( event ); };
        self.pc.ondatachannel = function( event: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "dataChannelAvailable",
                    { detail: { participant: self, event } } )
            );
            const dataChannel = event.channel || event;
            self.dc = dataChannel;
            self.dc.addEventListener(
                "open",
                function( event: any ) { self.onDataChannelOpen( event ); } );
            self.dc.addEventListener(
                "close",
                function( event: any ) { self.onDataChannelClose( event ); } );
            self.dc.addEventListener(
                "error",
                function( event: any ) { self.onDataChannelError( event ); } );
            self.dc.addEventListener(
                "message",
                function( event: any ) { self.onDataChannelMessage( event ); } );
        };
        self.pc.onicecandidate = function( event: any ) {
            self.iceComplete = true;
            self.onIceComplete( event );
            try {
                if( !self.signalingPipe ) {
                    if( self.dc )
                        return; // already connected, ignore (Firefox fix)
                    throw new Error( "no connection to signaling server" );
                }
                if( !self.isAnswerPublishedOnSignalingServer ) {
                    self.publishSignalingAnswer( event );
                    self.isAnswerPublishedOnSignalingServer = true;
                }
                if( event.candidate != null ) {
                    if( settings.logging.net.signaling.candidateWalk ) {
                        console.log(
                            " <<< " + self.describe() + " got candidate",
                            event
                        );
                    }
                }
            } catch ( err: any ) {
                self.onError(
                    "Failed to process ICE candidate: " + err
                );
            }
        }; // onicecandidate
    }
    publishSignalingAnswer( event: any ): void {
        const self = this;
        // eslint-disable-next-line no-useless-catch
        try {
            if( event.candidate == null ||
                settings.net.rtc.fastPublishMode.joiner
            ) {
                if( settings.logging.net.signaling.candidate ) {
                    console.log(
                        " <<< " + self.describe() + " got candidate",
                        event
                    );
                }
                if( !self.signalingPipe )
                    throw new Error( "no connection to signaling server" );
                const joPublishAnswerMessage = {
                    id: utils.randomCallID(),
                    method: "signalingPublishAnswer",
                    answer: self.pc.localDescription,
                    idRtcParticipant: "" + self.idRtcParticipant,
                    idSomebodyCreator: "" + self.idSomebodyCreator,
                    idOffer: 0 + self.idOffer
                };
                if( settings.logging.net.signaling.message ) {
                    console.log(
                        " <<< " + self.describe() +
                        " signaling client message out",
                        joPublishAnswerMessage
                    );
                }
                self.signalingPipe.send( joPublishAnswerMessage );
            }
        } catch ( err ) {
            throw err;
        }
    }
    delayedInitPeer(): void {
        if( this.bWasImpersonated )
            this.initPeer();
    }
    onImpersonationComplete(): void {
        super.onImpersonationComplete();
        const joFetchOfferMessage = {
            id: utils.randomCallID(),
            method: "signalingFetchOffer"
        };
        if( settings.logging.net.signaling.message ) {
            console.log(
                " <<< " + this.describe() + " signaling client message out",
                joFetchOfferMessage
            );
        }
        this.signalingPipe.send( joFetchOfferMessage );
    }
    onIceComplete( event: any ): void {
        super.onIceComplete( event );
    }
    onOtherSideIdentified(
        idSomebodyOtherSide: any, idOffer: any ): void { // client peer got result
        if( settings.logging.net.signaling.impersonate ) {
            console.log(
                this.describe() + " did identified other side RTC creator \"" +
                idSomebodyOtherSide + "\" via offer ID " + idOffer.toString()
            );
        }
        this.idSomebodyOtherSide = "" + idSomebodyOtherSide;
        this.idOffer = 0 + idOffer;
        this.wasIdentified = true;
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "identified",
                {
                    detail: {
                        participant: this,
                        idSomebodyOtherSide: "" + idSomebodyOtherSide
                    }
                } ) );
    }
    signalingPipeOnMessage( joMessage: any ): void {
        const self = this;
        switch ( joMessage.method ) {
        case "signalingFetchOffer":
            if( joMessage.error == null ) {
                // OKay, fetched offer from creator
                this.delayedInitPeer();
                this.idSomebodyCreator = "" + joMessage.idSomebodyCreator;
                const idSomebodyOtherSide = "" + joMessage.idSomebodyCreator;
                const idOffer = 0 + joMessage.idOffer;
                if( settings.logging.net.signaling.generic ) {
                    console.log(
                        "Success, " + this.describe() + " fetched offer from creator (step 2)"
                    );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingPassedFetchOffer",
                        {
                            detail: {
                                actor: this,
                                idSomebodyOtherSide: "" + idSomebodyOtherSide,
                                idOffer: 0 + idOffer
                            }
                        } ) );
                const offer = joMessage.offer;
                if( settings.logging.net.signaling.offer )
                    console.log( " <<< " + self.describe() + " got offer:", offer );
                const offerDescription = new webRtcModule.RTCSessionDescription( offer );
                if( settings.logging.net.signaling.offer ) {
                    console.log(
                        " <<< " + self.describe() + " got offer description:", offerDescription
                    );
                }
                this.pc.setRemoteDescription( offerDescription ).then(
                    function(): void {
                        // success
                        if( settings.logging.net.signaling.remoteDescription ) {
                            console.log(
                                " <<< " + self.describe() + "did set remote description:",
                                offerDescription );
                        }
                        self.dispatchEvent(
                            new UniversalDispatcherEvent(
                                "remoteDescriptionSet",
                                { detail: { participant: self } } ) );
                        self.pc.createAnswer( self.offerOptions ).then(
                            function( answerDescription: any ) {
                                // success
                                self.tsAnswerCreated = new Date();
                                if( settings.logging.net.signaling.answer ) {
                                    console.log(
                                        " <<< " + self.describe() + "did created answer at " +
                                    utils.formatDateTime( self.tsAnswerCreated ) +
                                    " with description:", answerDescription );
                                }
                                self.dispatchEvent(
                                    new UniversalDispatcherEvent(
                                        "answerCreated",
                                        { detail: { participant: self } } ) );
                                self.pc.setLocalDescription( answerDescription ).then(
                                    function(): void {
                                        // success
                                        if( settings.logging.net.signaling.localDescription ) {
                                            console.log(
                                                " <<< " + self.describe() +
                                            " local description set:", answerDescription );
                                        }
                                        self.dispatchEvent(
                                            new UniversalDispatcherEvent(
                                                "localDescriptionSet",
                                                { detail: { participant: self } } ) );
                                        self.onOtherSideIdentified(
                                            idSomebodyOtherSide,
                                            idOffer ); // client peer got result
                                    }, function( err: any ) {
                                        // error of setLocalDescription
                                        self.onError(
                                            "Failed to set local description " +
                                        "(while fetching offer for \"" +
                                        idSomebodyOtherSide + "\"): " +
                                        err.toString() );
                                    } );
                            }, function( err: any ) {
                                // error of createAnswer
                                self.onError(
                                    "Failed to create answer (while fetching offer for \"" +
                                idSomebodyOtherSide + "\"): " + err );
                            } );
                    }, function( err: any ) {
                        // error of setLocalDescription
                        self.onError(
                            "Failed to set remote description: (while fetching offer for \"" +
                        idSomebodyOtherSide + "\"): " + err );
                    } );
            } else {
                if( settings.logging.net.signaling.error ) {
                    console.warn(
                        " !!! " + this.describe() +
                    " signaling offer publishing (step 1) error", joMessage.error );
                }
                this.dispatchEvent(
                    new UniversalDispatcherEvent(
                        "signalingFailedFetchOffer",
                        { detail: { actor: this, error: joMessage.error } } ) );
                this.onError( joMessage.error );
            }
            break;
        default:
            super.signalingPipeOnMessage( joMessage );
            break
        } // switch( joMessage.method )
    }
};

export class WebRTCServerPipe extends BasicSocketPipe {
    clientNumber?: number;
    rtcPeer: any;
    strSignalingServerURL?: string;
    constructor ( acceptor: any, rtcPeer: any, strSignalingServerURL: string ) {
        super();
        const self = this;
        self.socketType = "WebRTC";
        self.socketSubtype = "server";
        self.isConnected = true;
        self.acceptor = acceptor;
        self.clientNumber = 0 + acceptor.nextClientNumber;
        self.clientPort = 0 + ( self.clientNumber || 0 );
        ++acceptor.nextClientNumber;
        self.rtcPeer = rtcPeer;
        self.strSignalingServerURL =
            utils.makeValidSignalingServerURL( strSignalingServerURL );
        self.url = "rtc_server_pipe(" + self.clientNumber + ")://" + strSignalingServerURL;
        self.rtcPeer.on( "dataChannelOpen", function( jo: any ) {
            self.isConnected = true;
            self.acceptor.mapClients["" + self.clientPort] = self;
            self.dispatchEvent( new UniversalDispatcherEvent( "open", { socket: self } ) );
            self.acceptor.dispatchEvent(
                new UniversalDispatcherEvent(
                    "connection",
                    { socket: self, strSignalingServerURL: "" + strSignalingServerURL } ) );
        } );
        self.rtcPeer.on( "dataChannelMessage", function( jo: any ) {
            self.receive( jo.detail.data );
        } );
        self.rtcPeer.on( "rtcParticipantError", function( jo: any ) {
            self.isConnected = false;
            self.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: self, message: jo } ) );
        } );
        self.rtcPeer.on( "dataChannelError", function( jo: any ) {
            self.isConnected = false;
            self.dispatchEvent(
                new UniversalDispatcherEvent( "error", { socket: self, message: jo } ) );
        } );
        self.rtcPeer.on( "dataChannelClose", function( jo: any ) {
            self.isConnected = false;
            self.dispatchEvent(
                new UniversalDispatcherEvent( "close", { socket: self, message: jo } ) );
        } );
        self.rtcPeer.on( "peerClose", function( jo: any ) {
            self.isConnected = false;
            self.dispatchEvent(
                new UniversalDispatcherEvent( "close", { socket: self, message: jo } ) );
        } );
    }
    dispose(): void {
        this.performDisconnect();
        super.dispose();
    }
    handleServerDisposed(): void {
        this.performDisconnect();
        this.isConnected = false;
        this.clientNumber = 0;
        this.acceptor = null;
        this.rtcPeer = null;
        this.url = "";
        this.strSignalingServerURL = "";
        // super.handleServerDisposed();
        this.dispose();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.isConnected = false;
        if( this.acceptor )
            this.acceptor.unregisterClientByKey( this.clientPort );
        if( this.rtcPeer ) {
            this.rtcPeer.offAll();
            this.rtcPeer = null;
        }
        this.clientNumber = 0;
        this.acceptor = null;
        this.url = "";
        this.strSignalingServerURL = "";
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.rtcPeer ) ) {
            const err = "Cannot send messages to disconnected WebRTC socket server pipe";
            this.onError( err );
            throw new Error( err );
        }
        const s = socketSentDataMarshall( data );
        this.rtcPeer.send( s );
    }
    // eslint-disable-next-line n/handle-callback-err
    onError( err: any ): void {
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
    implReceive( data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.dispatchEvent(
            new UniversalDispatcherEvent( "message", { socket: this, message: jo } ) );
    }
};

export class WebRTCServerAcceptor extends BasicServerAcceptor {
    strSignalingServerURL: string;
    idRtcParticipant: string;
    offerOptions: any;
    signalingOptions: any;
    peerConfiguration: any;
    peerAdditionalOptions: any;
    maxActiveOfferCount: number;
    mapPendingOffers: any;
    timeToPublishMilliseconds: number;
    timeToSignalingNegotiationMilliseconds: number;
    rtcCreator: any;
    isConnected?: false;
    constructor (
        strSignalingServerURL: string, idRtcParticipant: any, offerOptions: any,
        signalingOptions: any, maxActiveOfferCount?: number, timeToPublishMilliseconds?: number,
        timeToSignalingNegotiationMilliseconds?: number,
        peerConfiguration?: any, peerAdditionalOptions?: any
    ) {
        super();
        this.strSignalingServerURL = utils.makeValidSignalingServerURL( strSignalingServerURL );
        this.idRtcParticipant = "" +
            ( ( idRtcParticipant != null && idRtcParticipant != undefined &&
                typeof idRtcParticipant === "string" && idRtcParticipant.length > 0 )
                ? idRtcParticipant
                : utils.UUIDv4() );
        this.offerOptions = offerOptions || null;
        this.signalingOptions = signalingOptions || null;
        this.peerConfiguration =
            ( peerConfiguration && typeof peerConfiguration === "object" )
                ? peerConfiguration
                : settings.net.rtc.peerConfiguration;
        this.peerAdditionalOptions =
            ( peerAdditionalOptions && typeof peerAdditionalOptions === "object" )
                ? peerAdditionalOptions
                : settings.net.rtc.peerAdditionalOptions;
        this.socketType = "WebRTC";
        this.maxActiveOfferCount =
            ( maxActiveOfferCount != null && maxActiveOfferCount != undefined )
                ? maxActiveOfferCount
                : settings.net.rtc.maxActiveOfferCount;
        if( this.maxActiveOfferCount < 1 )
            this.maxActiveOfferCount = 1;
        this.mapPendingOffers = { }; // idOffer -> RTCServerPeer
        this.timeToPublishMilliseconds = timeToPublishMilliseconds ||
            settings.net.rtc.timeToPublishMilliseconds;
        this.timeToSignalingNegotiationMilliseconds = timeToSignalingNegotiationMilliseconds ||
            settings.net.rtc.timeToSignalingNegotiationMilliseconds;
        this.rtcCreator =
            new RTCCreator(
                "" + this.strSignalingServerURL,
                "" + this.idRtcParticipant,
                this.offerOptions,
                this.signalingOptions );
        this.isListening = true;
        const self = this;
        this.rtcCreator.on( "signalingPassedImpersonation", function( eventData: any ) {
            self.updateAllPendingOffers();
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingPassedImpersonation",
                    { detail: { acceptor: self } } ) );
        } );
        this.rtcCreator.on( "signalingFailedImpersonation", function( eventData: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "signalingFailedImpersonation",
                    { detail: { acceptor: self } } ) );
        } );
        this.rtcCreator.on( "error", function( eventData: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    {
                        detail: {
                            acceptor: self,
                            eventData,
                            errorType: "rtcCreatorError"
                        }
                    } ) );
        } );
        this.rtcCreator.on( "close", function( eventData: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "close",
                    { detail: { acceptor: self, eventData } } ) );
        } );
        self.rtcCreator.on( "signalingPipeError", function( jo: any ) {
            self.isConnected = false;
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    { socket: self, message: jo, errorType: "signalingPipeError" } ) );
        } );
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.removeAllPendingOffers();
        if( this.rtcCreator ) {
            this.rtcCreator.dispose();
            this.rtcCreator = null;
        }
        this.disposeNotifyClients();
        super.dispose();
    }
    addPendingOffer(): void {
        if( this.isDisposed )
            return;
        const rtcPeer =
            new RTCServerPeer(
                this.rtcCreator, this.timeToPublishMilliseconds,
                this.timeToSignalingNegotiationMilliseconds,
                this.peerConfiguration, this.peerAdditionalOptions );
        const self = this;
        rtcPeer.on( "identified", function( event: any ) {
            if( rtcPeer.isDisposing || rtcPeer.isDisposed )
                return;
            if( settings.logging.net.signaling.generic ) {
                console.log(
                    self.rtcCreator.describe() + " is now identified peer",
                    event.detail.idSomebodyOtherSide );
            }
            rtcPeer.serverPipe =
                new WebRTCServerPipe( self, rtcPeer, self.strSignalingServerURL );
            self.detachPendingOffer( rtcPeer.idOffer );
            self.dispatchEvent(
                new UniversalDispatcherEvent( "identified", { detail: { peer: rtcPeer } } ) );
            self.updateAllPendingOffers();
        } );
        rtcPeer.on( "localDescriptionSet", function( event: any ) {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "peerLocalDescriptionSet",
                    { detail: { acceptor: self, peerEvent: event } } ) );
        } );
        const onTimeoutHandler = function(): void {
            self.disposePendingOffer( rtcPeer.idOffer );
            self.updateAllPendingOffers();
        };
        rtcPeer.on( "publishTimeout", onTimeoutHandler );
        rtcPeer.on( "signalingNegotiationTimeout", onTimeoutHandler );
        rtcPeer.on( "signalingNegotiationStart", function(): void {
            self.updateAllPendingOffers();
        } );

        const retranslateError = function( eventData: any ): void {
            self.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    {
                        detail: {
                            acceptor: self,
                            rtcPeer,
                            eventData,
                            errorType: "rtcPeerError"
                        }
                    } ) );
        };
        rtcPeer.on( "error", retranslateError );
        rtcPeer.on( "rtcPeerError", retranslateError );

        this.mapPendingOffers[rtcPeer.idOffer] = rtcPeer;
    }
    detachPendingOffer( idOffer: any ): void {
        if( idOffer in this.mapPendingOffers )
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.mapPendingOffers[idOffer];
    }
    disposePendingOffer( idOffer: any ): void {
        if( idOffer in this.mapPendingOffers ) {
            const rtcPeer = this.mapPendingOffers[idOffer];
            rtcPeer.dispose();
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.mapPendingOffers[idOffer];
        }
    }
    removeAllPendingOffers(): void {
        for( const [ /* idOfferWalk */, rtcPeerWalk ]
            of Object.entries( this.rtcCreator.mapServerPeers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            const serverPipe = rtcPeer.serverPipe;
            serverPipe.dispose();
        }
        this.rtcCreator.mapServerPeers = { };
        for( const [ /* idOfferWalk */, rtcPeerWalk ]
            of Object.entries( this.rtcCreator.mapPendingOffers ) ) {
            const rtcPeer: any = rtcPeerWalk;
            rtcPeer.dispose();
        }
        this.mapPendingOffers = { };
    }
    updateAllPendingOffers(): void {
        if( this.isDisposed )
            return;
        for( let n = Object.keys( this.mapPendingOffers ).length;
            n < this.maxActiveOfferCount;
            ++n )
            this.addPendingOffer();
    }
};

export class WebRTCClientPipe extends BasicSocketPipe {
    strSignalingServerURL: string | null
    idRtcParticipant: string;
    offerOptions: any;
    signalingOptions: any;
    peerConfiguration: any;
    peerAdditionalOptions: any;
    rtcPeer: any;
    isAutoCloseSignalingPipeOnDataChannelOpen: boolean;
    constructor (
        strSignalingServerURL: string, idRtcParticipant: string, offerOptions: any,
        signalingOptions: any, peerConfiguration: any, peerAdditionalOptions: any
    ) {
        super();
        this.strSignalingServerURL = utils.makeValidSignalingServerURL( strSignalingServerURL );
        this.idRtcParticipant = "" +
            ( ( idRtcParticipant != null && idRtcParticipant != undefined &&
                typeof idRtcParticipant === "string" && idRtcParticipant.length > 0 )
                ? idRtcParticipant
                : utils.UUIDv4() );
        this.offerOptions = offerOptions || null;
        this.signalingOptions = signalingOptions || null;
        this.peerConfiguration =
            ( peerConfiguration && typeof peerConfiguration === "object" )
                ? peerConfiguration
                : settings.net.rtc.peerConfiguration;
        this.peerAdditionalOptions =
            ( peerAdditionalOptions && typeof peerAdditionalOptions === "object" )
                ? peerAdditionalOptions
                : settings.net.rtc.peerAdditionalOptions;
        this.socketType = "WebRTC";
        this.socketSubtype = "client";
        this.isConnected = false;
        this.rtcPeer = null;
        this.isAutoCloseSignalingPipeOnDataChannelOpen =
            ( !!( settings.net.rtc.isAutoCloseSignalingPipeOnDataChannelOpen ) );
        this.url = "rtc_client_pipe-" + this.strSignalingServerURL;
        this.reconnect();
    }
    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.performDisconnect();
        this.strSignalingServerURL = null;
        super.dispose();
    }
    implSend( data: any ): void {
        if( ( !this.isConnected ) || ( !this.rtcPeer ) ) {
            const s = "Cannot send messages to disconnected WebRTC socket client pipe";
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    { socket: this, message: "" + s, errorType: "dataSendError" } ) );
            throw new Error( s );
        }
        const s = socketSentDataMarshall( data );
        this.rtcPeer.send( s );
    }
    reconnect(): void {
        this.performDisconnect();
        this.rtcConnect( "" + this.strSignalingServerURL );
    }
    disconnect(): void {
        this.performDisconnect();
        super.disconnect();
    }
    performDisconnect(): void {
        if( !this.isConnected )
            return;
        this.rtcDisconnect();
    }
    rtcConnect( strSignalingServerURL: string ): void {
        if( strSignalingServerURL.length == 0 ) {
            const s = "Cannot connect signaling server \"" + strSignalingServerURL + "\", bad url";
            this.dispatchEvent(
                new UniversalDispatcherEvent(
                    "error",
                    { socket: this, message: "" + s, errorType: "badSignalingServerURL" } ) );
            throw new Error( s );
        }
        const self = this;
        while( true ) {
            try {
                if( self.isConnected || self.rtcPeer )
                    self.rtcDisconnect();
                self.rtcPeer =
                    new RTCJoiner(
                        "" + strSignalingServerURL, "" + self.idRtcParticipant,
                        self.offerOptions, self.signalingOptions,
                        self.peerConfiguration, self.peerAdditionalOptions
                    ); // client side
                self.strSignalingServerURL =
                    utils.makeValidSignalingServerURL( strSignalingServerURL );
                self.rtcPeer.on( "identified", function( event: any ) {
                    if( settings.logging.net.signaling.generic ) {
                        console.log(
                            self.rtcPeer.describe() + " is now identified peer",
                            event.detail.idSomebodyOtherSide
                        );
                    }
                } );
                self.rtcPeer.on( "dataChannelOpen", function( jo: any ) {
                    self.isConnected = true;
                    self.dispatchEvent(
                        new UniversalDispatcherEvent( "open", { socket: self } )
                    );
                    if( self.isAutoCloseSignalingPipeOnDataChannelOpen ) {
                        if( settings.logging.net.signaling.disconnect ) {
                            console.warn(
                                self.rtcPeer.describe() +
                                " will auto-close signaling pipe" +
                                "(inside socket \"dataChannelOpen\" handler)"
                            );
                        }
                        self.rtcPeer.signalingPipeClose();
                    }
                } );
                self.rtcPeer.on( "dataChannelMessage", function( jo: any ) {
                    self.receive( jo.detail.data );
                } );
                self.rtcPeer.on( "rtcParticipantError", function( jo: any ) {
                    self.isConnected = false;
                    self.dispatchEvent( new UniversalDispatcherEvent(
                        "error",
                        {
                            socket: self,
                            message: jo,
                            errorType: "rtcParticipantError"
                        } )
                    );
                } );
                self.rtcPeer.on( "dataChannelError", function( jo: any ) {
                    self.isConnected = false;
                    self.dispatchEvent( new UniversalDispatcherEvent(
                        "error",
                        {
                            socket: self,
                            message: jo,
                            errorType: "dataChannelError"
                        } )
                    );
                } );
                self.rtcPeer.on( "dataChannelClose", function( jo: any ) {
                    self.isConnected = false;
                    self.dispatchEvent( new UniversalDispatcherEvent(
                        "close",
                        { socket: self, message: jo } ) );
                } );
                self.rtcPeer.on( "signalingPipeError", function( jo: any ) {
                    self.isConnected = false;
                    self.dispatchEvent( new UniversalDispatcherEvent(
                        "error",
                        {
                            socket: self,
                            message: jo,
                            errorType: "signalingPipeError"
                        } )
                    );
                } );
                return;
            } catch ( err ) {
                console.warn( "WebRTC client connect error:", err );
                continue;
            }
        }
    }
    rtcDisconnect(): void {
        if( this.rtcPeer ) {
            this.rtcPeer.offAll();
            this.rtcPeer.dispose();
            this.rtcPeer = null;
        }
        this.isConnected = false;
        this.url = "";
    }
    implReceive( data: any ): void {
        const jo: any = socketReceivedDataReverseMarshall( data );
        this.dispatchEvent(
            new UniversalDispatcherEvent(
                "message",
                { socket: this, message: jo } ) );
    }
};
