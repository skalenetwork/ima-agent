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
 * @file imaRegistrationOperations.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTx from "./imaTx.mjs";

export async function invokeHasChain(
    details,
    ethersProvider, // Main-Net or S-Chin
    joLinker, // Main-Net or S-Chin
    joAccount, // Main-Net or S-Chin
    chainIdSChain
) {
    const strLogPrefix = "Wait for added chain status: ";
    const strActionName = "invokeHasChain(hasSchain): joLinker.hasSchain";
    try {
        details.debug( "{}Will call {}...", strLogPrefix, strActionName );
        const addressFrom = joAccount.address();
        const bHasSchain =
            await joLinker.callStatic.hasSchain( chainIdSChain, { from: addressFrom } );
        details.success( "{}Got joLinker.hasSchain() status is: {}", strLogPrefix, bHasSchain );
        return bHasSchain;
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( "{}Error in invokeHasChain() during {}: {}, stack is: {}{}",
                strLogPrefix, strActionName, log.em( strError ), "\n", log.s( err.stack ) );
        }
        details.critical( "{}Error in invokeHasChain() during {}: {}, stack is: {}{}",
            strLogPrefix, strActionName, log.em( strError ), "\n", log.s( err.stack ) );
    }
    return false;
}

export async function waitForHasChain(
    details,
    ethersProvider, // Main-Net or S-Chin
    joLinker, // Main-Net or S-Chin
    joAccount, // Main-Net or S-Chin
    chainIdSChain,
    cntWaitAttempts,
    nSleepMilliseconds
) {
    if( cntWaitAttempts == null || cntWaitAttempts == undefined )
        cntWaitAttempts = 100;
    if( nSleepMilliseconds == null || nSleepMilliseconds == undefined )
        nSleepMilliseconds = 5;
    for( let idxWaitAttempts = 0; idxWaitAttempts < cntWaitAttempts; ++ idxWaitAttempts ) {
        if( await invokeHasChain(
            details, ethersProvider, joLinker, joAccount, chainIdSChain
        ) )
            return true;
        details.trace( "Sleeping {} milliseconds...", nSleepMilliseconds );
        await imaHelperAPIs.sleep( nSleepMilliseconds );
    }
    return false;
}

//
// register direction for money transfer
// main-net.DepositBox call: function addSchain(string schainName, address tokenManagerAddress)
//
export async function checkIsRegisteredSChainInDepositBoxes( // step 1
    ethersProviderMainNet,
    joLinker,
    joAccountMN,
    chainIdSChain
) {
    const details = log.createMemoryStream();
    details.debug( "Main-net Linker address is...........{}", joLinker.address );
    details.debug( "S-Chain  ID is.......................{}", chainIdSChain );
    const strLogPrefix = "RegChk S in depositBox: ";
    details.debug( "{}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    details.debug( "{}{}", strLogPrefix, "checkIsRegisteredSChainInDepositBoxes(reg-step1)" );
    details.debug( "{}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    let strActionName = "";
    try {
        strActionName = "checkIsRegisteredSChainInDepositBoxes(reg-step1)";
        const addressFrom = joAccountMN.address();
        const bIsRegistered =
            await joLinker.callStatic.hasSchain( chainIdSChain, { from: addressFrom } );
        details.success( "{}checkIsRegisteredSChainInDepositBoxes(reg-step1) status is: {}",
            strLogPrefix, bIsRegistered );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log, "checkIsRegisteredSChainInDepositBoxes", true );
        details.close();
        return bIsRegistered;
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( "{}Error in checkIsRegisteredSChainInDepositBoxes(reg-step1)() " +
                "during {}: {}, stack is: {}{}", strLogPrefix, strActionName, log.em( strError ),
            "\n", log.s( err.stack ) );
        }
        details.critical( "{}Error in checkIsRegisteredSChainInDepositBoxes(reg-step1)() " +
            "during {}: {}, stack is: {}{}", strLogPrefix, strActionName, log.em( strError ),
        "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "checkIsRegisteredSChainInDepositBoxes", false );
        details.close();
    }
    return false;
}

export async function registerSChainInDepositBoxes( // step 1
    ethersProviderMainNet,
    joLinker,
    joAccountMN,
    joTokenManagerETH, // only s-chain
    joTokenManagerERC20, // only s-chain
    joTokenManagerERC721, // only s-chain
    joTokenManagerERC1155, // only s-chain
    joTokenManagerERC721WithMetadata, // only s-chain
    joCommunityLocker, // only s-chain
    joTokenManagerLinker,
    chainNameSChain,
    chainNameMainNet,
    transactionCustomizerMainNet,
    cntWaitAttempts,
    nSleepMilliseconds
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    details.debug( "Main-net Linker address is..........{}", joLinker.address );
    details.debug( "S-Chain ID is.......................{}", chainNameSChain );
    const strLogPrefix = "Reg S in depositBoxes: ";
    details.debug( "{}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    details.debug( "{}reg-step1:registerSChainInDepositBoxes", strLogPrefix );
    details.debug( "{}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    let strActionName = "";
    try {
        strActionName = "Register S-chain in deposit boxes, step 1, connectSchain";
        details.debug( "{}Will register S-Chain in lock_and_data on Main-net", strLogPrefix );
        const arrArguments = [
            chainNameSChain,
            [
                joTokenManagerLinker.address, // call params
                joCommunityLocker.address, // call params
                joTokenManagerETH.address, // call params
                joTokenManagerERC20.address, // call params
                joTokenManagerERC721.address, // call params
                joTokenManagerERC1155.address, // call params
                joTokenManagerERC721WithMetadata.address // call params
            ]
        ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas( details,
            ethersProviderMainNet, "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName, gasPrice, 3000000, weiHowMuch, null );
        details.trace( "{}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall( details, ethersProviderMainNet,
            "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName, isIgnore,
            gasPrice, estimatedGas, weiHowMuch, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName,
            gasPrice, estimatedGas, weiHowMuch, null );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "registerSChainInDepositBoxes",
                "receipt": joReceipt
            } );
        }
        const isSChainStatusOKay = await waitForHasChain(
            details, ethersProviderMainNet,
            joLinker, joAccountMN, chainNameSChain,
            cntWaitAttempts, nSleepMilliseconds );
        if( ! isSChainStatusOKay )
            throw new Error( "S-Chain ownership status check timeout" );
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( "{}Error in registerSChainInDepositBoxes() during {}: {}" +
                ", stack is: {}{}", strLogPrefix, strActionName, log.em( strError ),
            "\n", log.s( err.stack ) );
        }
        details.critical( "{}Error in registerSChainInDepositBoxes() during {}: {}" +
            ", stack is: {}{}", strLogPrefix, strActionName, log.em( strError ),
        "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "registerSChainInDepositBoxes", false );
        details.close();
        return null;
    }
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "registerSChainInDepositBoxes", true );
    details.close();
    return jarrReceipts;
}
