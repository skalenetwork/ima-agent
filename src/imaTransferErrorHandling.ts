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
 * @file imaTransferErrorHandling.ts
 * @copyright SKALE Labs 2019-Present
 */

import { UniversalDispatcherEvent, EventDispatcher }
    from "./eventDispatcher";

export function verifyTransferErrorCategoryName( strCategory ) {
    return "" + ( strCategory ? strCategory : "default" );
}

const gMaxLastTransferErrors: number = 20;
const gArrLastTransferErrors: any = [];
let gMapTransferErrorCategories: any = { };

export const saveTransferEvents = new EventDispatcher();

export function saveTransferError( strCategory: string, textLog: any, ts?: any ) : void {
    ts = ts || Math.round( ( new Date() ).getTime() / 1000 );
    const c = verifyTransferErrorCategoryName( strCategory );
    const joTransferEventError: any = {
        "ts": ts,
        "category": "" + c,
        "textLog": "" + textLog.toString()
    };
    gArrLastTransferErrors.push( joTransferEventError );
    while( gArrLastTransferErrors.length > gMaxLastTransferErrors )
        gArrLastTransferErrors.shift();
    gMapTransferErrorCategories["" + c] = true;
    saveTransferEvents.dispatchEvent(
        new UniversalDispatcherEvent(
            "error",
            { "detail": joTransferEventError } ) );
}

export function saveTransferSuccess( strCategory: string ) : void {
    const c = verifyTransferErrorCategoryName( strCategory );
    try { delete gMapTransferErrorCategories["" + c]; } catch ( err ) { }
    saveTransferEvents.dispatchEvent(
        new UniversalDispatcherEvent(
            "success",
            { "detail": { "category": strCategory } } ) );
}

export function saveTransferSuccessAll() : void {
    // clear all transfer error categories, out of time frame
    gMapTransferErrorCategories = { };
}

export function getLastTransferErrors( isIncludeTextLog: boolean ) : any[] {
    if( typeof isIncludeTextLog == "undefined" )
        isIncludeTextLog = true;
    const jarr = JSON.parse( JSON.stringify( gArrLastTransferErrors ) );
    if( ! isIncludeTextLog ) {
        for( let i = 0; i < jarr.length; ++ i ) {
            const jo: any = jarr[i];
            if( "textLog" in jo )
                delete jo.textLog;
        }
    }
    return jarr;
}

export function getLastErrorCategories() : string[] {
    return Object.keys( gMapTransferErrorCategories );
}

let gFlagIsEnabledProgressiveEventsScan = true;

export function getEnabledProgressiveEventsScan() : boolean {
    return ( !!gFlagIsEnabledProgressiveEventsScan );
}
export function setEnabledProgressiveEventsScan( isEnabled: boolean ) : void {
    gFlagIsEnabledProgressiveEventsScan = ( !!isEnabled );
}
