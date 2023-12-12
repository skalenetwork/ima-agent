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
 * @file loop.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as worker_threads from "worker_threads";
import * as log from "./log.js";

const Worker = worker_threads.Worker;
export { Worker };

const joCustomThreadProperties: any = { };
export { joCustomThreadProperties };

export const sleep = ( milliseconds: number ) : Promise<void> => {
    return new Promise( resolve => setTimeout( resolve, milliseconds ) );
};

export function getCurrentThreadID() : number {
    return worker_threads.threadId;
}

export function isMainThread() : boolean {
    return ( !!( worker_threads.isMainThread ) );
}

export function threadDescription( isColorized?: boolean ) : string {
    if( typeof isColorized == "undefined" )
        isColorized = true;
    const tid: number = getCurrentThreadID();
    const st: string = isMainThread() ? "main" : "worker";
    return isColorized
        ? ( log.fmtAttention( st ) + log.fmtDebug( " thread " ) +
                log.fmtInformation( tid ) )
        : ( st + " thread " + tid );
}
