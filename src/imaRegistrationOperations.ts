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
 * @file imaRegistrationOperations.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaTx from "./imaTx.js";
import * as threadInfo from "./threadInfo.js";

export async function invokeHasChain(
    details: any,
    ethersProvider: any, // Main-Net or S-Chin
    joLinker: any, // Main-Net or S-Chin
    joAccount: any, // Main-Net or S-Chin
    chainIdSChain: string
) {
    const strLogPrefix = "Wait for added chain status: ";
    const strActionName = "invokeHasChain(hasSchain): joLinker.hasSchain";
    try {
        details.debug( "{p}Will call {bright}...", strLogPrefix, strActionName );
        const addressFrom = joAccount.address();
        const bHasSchain =
            await joLinker.callStatic.hasSchain( chainIdSChain, { from: addressFrom } );
        details.success( "{p}Got joLinker.hasSchain() status is: {}", strLogPrefix, bHasSchain );
        return bHasSchain;
    } catch ( err ) {
        details.critical( "{p}Error in invokeHasChain() during {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
    }
    return false;
}

export async function waitForHasChain(
    details: any,
    ethersProvider: any, // Main-Net or S-Chin
    joLinker: any, // Main-Net or S-Chin
    joAccount: any, // Main-Net or S-Chin
    chainIdSChain: string,
    cntWaitAttempts?: number,
    nSleepMilliseconds?: number
) {
    if( ! cntWaitAttempts )
        cntWaitAttempts = 100;
    if( ! nSleepMilliseconds )
        nSleepMilliseconds = 5;
    for( let idxWaitAttempts = 0; idxWaitAttempts < cntWaitAttempts; ++ idxWaitAttempts ) {
        if( await invokeHasChain( details, ethersProvider, joLinker, joAccount, chainIdSChain ) )
            return true;
        details.trace( "Sleeping {} milliseconds...", nSleepMilliseconds );
        await threadInfo.sleep( nSleepMilliseconds );
    }
    return false;
}

//
// register direction for money transfer
// main-net.DepositBox call: function addSchain(string schainName, address tokenManagerAddress)
//
export async function checkIsRegisteredSChainInDepositBoxes( // step 1
    ethersProviderMainNet: any,
    joLinker: any,
    joAccountMN: any,
    chainIdSChain: string
) {
    const details = log.createMemoryStream();
    details.debug( "Main-net Linker address is...........{}", joLinker.address );
    details.debug( "S-Chain  ID is.......................{}", chainIdSChain );
    const strLogPrefix = "RegChk S in depositBox: ";
    details.debug( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    details.debug( "{p}{p}", strLogPrefix, "checkIsRegisteredSChainInDepositBoxes(reg-step1)" );
    details.debug( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
    let strActionName = "";
    try {
        strActionName = "checkIsRegisteredSChainInDepositBoxes(reg-step1)";
        const addressFrom = joAccountMN.address();
        const bIsRegistered =
            await joLinker.callStatic.hasSchain( chainIdSChain, { from: addressFrom } );
        details.success( "{p}checkIsRegisteredSChainInDepositBoxes(reg-step1) status is: {}",
            strLogPrefix, bIsRegistered );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log, "checkIsRegisteredSChainInDepositBoxes", true );
        details.close();
        return bIsRegistered;
    } catch ( err ) {
        details.critical(
            "{p}Error in checkIsRegisteredSChainInDepositBoxes(reg-step1)() during {bright}: " +
            "{err}, stack is:\n{stack}", strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log, "checkIsRegisteredSChainInDepositBoxes", false );
        details.close();
    }
    return false;
}

export async function registerSChainInDepositBoxes( // step 1
    ethersProviderMainNet: any,
    joLinker: any,
    joAccountMN: any,
    joTokenManagerETH: any, // only s-chain
    joTokenManagerERC20: any, // only s-chain
    joTokenManagerERC721: any, // only s-chain
    joTokenManagerERC1155: any, // only s-chain
    joTokenManagerERC721WithMetadata: any, // only s-chain
    joCommunityLocker: any, // only s-chain
    joTokenManagerLinker: any,
    chainNameSChain: string,
    chainNameMainNet: string,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer,
    cntWaitAttempts?: number,
    nSleepMilliseconds?: number
) {
    const details = log.createMemoryStream();
    const jarrReceipts: any[] = [];
    details.debug( "Main-net Linker address is..........{}", joLinker.address );
    details.debug( "S-Chain ID is.......................{}", chainNameSChain );
    const strLogPrefix = "Reg S in depositBoxes: ";
    details.debug( "{p}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    details.debug( "{p}reg-step1:registerSChainInDepositBoxes", strLogPrefix );
    details.debug( "{p}{}", strLogPrefix, imaHelperAPIs.longSeparator );
    let strActionName = "";
    try {
        strActionName = "Register S-chain in deposit boxes, step 1, connectSchain";
        details.debug( "{p}Will register S-Chain in lock_and_data on Main-net", strLogPrefix );
        const arrArguments = [
            chainNameSChain, [
                joTokenManagerLinker.address, // call params
                joCommunityLocker.address, // call params
                joTokenManagerETH.address, // call params
                joTokenManagerERC20.address, // call params
                joTokenManagerERC721.address, // call params
                joTokenManagerERC1155.address, // call params
                joTokenManagerERC721WithMetadata.address // call params
            ] ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas( details,
            ethersProviderMainNet, "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName, gasPrice, 3000000, weiHowMuch );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall( details, ethersProviderMainNet,
            "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName, isIgnore,
            gasPrice, estimatedGas, weiHowMuch );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "Linker", joLinker, "connectSchain", arrArguments,
            joAccountMN, strActionName,
            gasPrice, estimatedGas, weiHowMuch );
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
        details.critical( "{p}Error in registerSChainInDepositBoxes() during {bright}: {err}" +
            ", stack is:\n{stack}", strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log, "registerSChainInDepositBoxes", false );
        details.close();
        return null;
    }
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "registerSChainInDepositBoxes", true );
    details.close();
    return jarrReceipts;
}
