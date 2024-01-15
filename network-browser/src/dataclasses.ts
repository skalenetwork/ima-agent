/**
 * @license
 * SKALE network-browser
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file dataclasses.ts
 * @copyright SKALE Labs 2023-Present
 */

export enum SkaledPorts {
    PROPOSAL = 0,
    CATCHUP = 1,
    WS_JSON = 2,
    HTTP_JSON = 3,
    BINARY_CONSENSUS = 4,
    ZMQ_BROADCAST = 5,
    IMA_MONITORING = 6,
    WSS_JSON = 7,
    HTTPS_JSON = 8,
    INFO_HTTP_JSON = 9
}
