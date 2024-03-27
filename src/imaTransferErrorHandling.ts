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
    from "./eventDispatcher.js";

export function verifyTransferErrorCategoryName( strCategory: string ): string {
    return ( strCategory ?? "default" );
}

export interface TTransferEventErrorDescription {
    ts: number
    category: string
    textLog?: string
};
export type TMapTransferErrorCategories = Record<string, boolean>; ;

const gMaxLastTransferErrors: number = 20;
const gArrLastTransferErrors: TTransferEventErrorDescription[] = [];
let gMapTransferErrorCategories: TMapTransferErrorCategories = { };

export const saveTransferEvents = new EventDispatcher();

export function saveTransferError( strCategory: string, textLog: string, ts?: number ): void {
    ts = ts ?? Math.round( ( new Date() ).getTime() / 1000 );
    const catName = verifyTransferErrorCategoryName( strCategory );
    const joTransferEventError: TTransferEventErrorDescription = {
        ts,
        category: catName.toString(),
        textLog: textLog.toString()
    };
    gArrLastTransferErrors.push( joTransferEventError );
    while( gArrLastTransferErrors.length > gMaxLastTransferErrors )
        gArrLastTransferErrors.shift();
    gMapTransferErrorCategories[catName] = true;
    saveTransferEvents.dispatchEvent(
        new UniversalDispatcherEvent(
            "error",
            { detail: joTransferEventError } ) );
}

export function saveTransferSuccess( strCategory: string ): void {
    const catName = verifyTransferErrorCategoryName( strCategory );
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    try { delete gMapTransferErrorCategories[catName]; } catch ( err ) { }
    saveTransferEvents.dispatchEvent(
        new UniversalDispatcherEvent(
            "success",
            { detail: { category: strCategory } } ) );
}

export function saveTransferSuccessAll(): void {
    // clear all transfer error categories, out of time frame
    gMapTransferErrorCategories = { };
}

export function getLastTransferErrors(
    isIncludeTextLog: boolean ): TTransferEventErrorDescription[] {
    if( typeof isIncludeTextLog === "undefined" )
        isIncludeTextLog = true;
    const jarr: TTransferEventErrorDescription[] =
        JSON.parse( JSON.stringify( gArrLastTransferErrors ) );
    if( !isIncludeTextLog ) {
        for( let i = 0; i < jarr.length; ++i ) {
            const jo: TTransferEventErrorDescription = jarr[i];
            if( "textLog" in jo )
                delete jo.textLog;
        }
    }
    return jarr;
}

export function getLastErrorCategories(): string[] {
    return Object.keys( gMapTransferErrorCategories );
}

let gFlagIsEnabledProgressiveEventsScan = true;

export function getEnabledProgressiveEventsScan(): boolean {
    return !!gFlagIsEnabledProgressiveEventsScan;
}
export function setEnabledProgressiveEventsScan( isEnabled: boolean ): void {
    gFlagIsEnabledProgressiveEventsScan = !!isEnabled;
}
