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
 * @file contracts.ts
 * @copyright SKALE Labs 2025-Present
 */

import * as fs from 'fs';
import * as log from "./log.js";

export enum ProjectType {
    MANAGER = 'skale_manager_address',
    MAINNET_IMA = 'test_address',
    SCHAIN_IMA = 'test_address'
}

export function getMainContractAddress(
    abiFilepath: string,
    projectType: ProjectType
): string | null {
    try {
        if (!fs.existsSync(abiFilepath)) {
            log.error("ABI file not found: {}", abiFilepath);
            return null;
        }
        const abiContent = fs.readFileSync(abiFilepath, 'utf8');
        const abiJson = JSON.parse(abiContent);
        return abiJson[projectType];
    } catch (error) {
        log.error("Error parsing ABI file: {}", error);
        return null;
    }
}

