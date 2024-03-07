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
 * @file eventDispatcher.ts
 * @copyright SKALE Labs 2019-Present
 */

export type TType = any;
export type TListener = any;
export type TData = any;

export class UniversalDispatcherEvent {
    type: TType;
    constructor ( type: TType, jo: any ) {
        this.type = type;
        for( const [ key, value ] of Object.entries( jo ) ) {
            if( key in this ) {
                console.warn( "UniversalDispatcherEvent will skip", key, "data field" );
                continue;
            }
            const anyThis: any = this;
            anyThis[key] = value;
        }
    }
};

export class EventDispatcher {
    // see https://stackoverflow.com/questions/36675693/eventtarget-interface-in-safari
    _listeners: TListener[];
    isDisposing: boolean;
    isDisposed: boolean;
    constructor () {
        this._listeners = [];
        this.isDisposed = false;
        this.isDisposing = false;
    }

    dispose(): void {
        if( this.isDisposed )
            return;
        this.isDisposing = true;
        this.isDisposed = true;
        this.dispatchEvent(
            new UniversalDispatcherEvent( "dispose", { detail: { ref: this } } )
        );
        this.removeAllEventListeners();
    }

    hasEventListener( type: TType, listener: TListener ): boolean {
        return this._listeners.some( item => item.type === type && item.listener === listener );
    }

    addEventListener( type: TType, listener: TListener ): EventDispatcher {
        if( !this.hasEventListener( type, listener ) ) {
            this._listeners.push( {
                type,
                listener,
                options: { once: false }
            } );
        }
        return this;
    }

    removeEventListener( type: TType, listener: TListener ): EventDispatcher {
        while( true ) {
            const index = ( listener != undefined )
                ? this._listeners.findIndex(
                    item => item.type === type && item.listener === listener )
                : this._listeners.findIndex(
                    item => item.type === type );
            if( index >= 0 ) {
                this._listeners.splice( index, 1 );
                continue;
            }
            break;
        }
        return this;
    }

    removeAllEventListeners(): EventDispatcher {
        this._listeners = [];
        return this;
    }

    on( type: TType, listener: TListener ): EventDispatcher {
        return this.addEventListener( type, listener );
    }

    off( type: TType, listener: TListener ): EventDispatcher {
        return this.removeEventListener( type, listener );
    }

    offAll(): EventDispatcher {
        return this.removeAllEventListeners();
    }

    dispatchEvent( evt: TData ): EventDispatcher {
        const a = this._listeners.filter( item => item.type === evt.type );
        for( const item of a ) {
            const {
                type,
                listener,
                options: { once }
            } = item;
            listener.call( this, evt );
            if( once === true )
                this.removeEventListener( type, listener );
        }
        return this;
    }
};
