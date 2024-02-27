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
 * @file imaTokenOperations.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaTx from "./imaTx.js";
import * as imaGasUsage from "./imaGasUsageOperations.js";
import * as imaEventLogScan from "./imaEventLogScan.js";
import * as threadInfo from "./threadInfo.js";
import type * as state from "./state.js";

export async function getBalanceErc20(
    isMainNet: boolean,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    joAccount: state.TAccount,
    strCoinName: string,
    joABI: any
): Promise<any> {
    const strLogPrefix = "getBalanceErc20() call ";
    try {
        if( !( ethersProvider && joAccount && strCoinName && joABI && ( strCoinName + "_abi" ) in
                joABI && ( strCoinName + "_address" ) in joABI ) )
            return "<no-data>";
        const strAddress = joAccount.address();
        const contractERC20 = new owaspUtils.ethersMod.ethers.Contract(
            joABI[strCoinName + "_address"],
            joABI[strCoinName + "_abi"],
            ethersProvider
        );
        const balance =
            await contractERC20.callStatic.balanceOf( strAddress, { from: strAddress } );
        return balance;
    } catch ( err ) {
        log.error( "{p}ERC20 balance fetching error: {err}, stack is:\n{stack}",
            strLogPrefix, err, err );
    }
    return "<no-data-or-error>";
}

export async function getOwnerOfErc721(
    isMainNet: boolean,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    joAccount: state.TAccount,
    strCoinName: string,
    joABI: any,
    idToken: any
): Promise<state.TAddress> {
    const strLogPrefix = "getOwnerOfErc721() call ";
    try {
        if( !( ethersProvider && joAccount && strCoinName && joABI && ( strCoinName + "_abi" ) in
                joABI && ( strCoinName + "_address" ) in joABI ) )
            return "<no-data>";
        const strAddress = joAccount.address();
        const contractERC721 = new owaspUtils.ethersMod.ethers.Contract(
            joABI[strCoinName + "_address"],
            joABI[strCoinName + "_abi"],
            ethersProvider
        );
        const owner = await contractERC721.callStatic.ownerOf( idToken, { from: strAddress } );
        return owner;
    } catch ( err ) {
        log.error( "{p}ERC721 owner fetching error: {err}, stack is:\n{stack}",
            strLogPrefix, err, err );
    }
    return ""; // no data, or error
}

export async function getBalanceErc1155(
    isMainNet: boolean,
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    joAccount: state.TAccount,
    strCoinName: string,
    joABI: any,
    idToken: any
): Promise<any> {
    const strLogPrefix = "getBalanceErc1155() call ";
    try {
        if( !( ethersProvider && joAccount && strCoinName && joABI && ( strCoinName + "_abi" ) in
                joABI && ( strCoinName + "_address" ) in joABI ) )
            return "<no-data>";
        const strAddress = joAccount.address();
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            joABI[strCoinName + "_address"],
            joABI[strCoinName + "_abi"],
            ethersProvider
        );
        const balance = await contractERC1155.callStatic.balanceOf(
            strAddress, idToken, { from: strAddress } );
        return balance;
    } catch ( err ) {
        log.error( "{p}ERC1155 balance fetching error: {err}, stack is:\n{stack}",
            strLogPrefix, err, err );
    }
    return "<no-data-or-error>";
}

export async function doErc721PaymentFromMainNet(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joDepositBoxERC721: owaspUtils.ethersMod.ethers.Contract,
    joMessageProxyMainNet: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    chainNameSChain: string,
    tokenId: any, // which ERC721 token id to send
    weiHowMuch: any, // how much ETH
    joTokenManagerERC721: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    strCoinNameErc721MainNet: string,
    erc721PrivateTestnetJsonMainNet: any,
    strCoinNameErc721SChain: string,
    erc721PrivateTestnetJsonSChain: any,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "M2S ERC721 Payment: ";
    try {
        strActionName = "ERC721 payment from Main Net, approve";
        const erc721ABI = erc721PrivateTestnetJsonMainNet[strCoinNameErc721MainNet + "_abi"];
        const erc721AddressMainNet =
            erc721PrivateTestnetJsonMainNet[strCoinNameErc721MainNet + "_address"];
        const contractERC721 = new owaspUtils.ethersMod.ethers.Contract(
            erc721AddressMainNet, erc721ABI, ethersProviderMainNet );
        const depositBoxAddress = joDepositBoxERC721.address;
        const arrArgumentsApprove = [
            depositBoxAddress,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const arrArgumentsDepositERC721 = [
            chainNameSChain,
            erc721AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );

        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc721PaymentFromMainNet/approve",
                receipt: joReceiptApprove
            } );
        }

        strActionName = "ERC721 payment from Main Net, depositERC721";
        const weiHowMuchDepositERC721 = undefined;
        gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasDeposit = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "DepositBoxERC721", joDepositBoxERC721, "depositERC721", arrArgumentsDepositERC721,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchDepositERC721, null );
        details.trace( "{p}Using estimated(deposit) gas={}", strLogPrefix, estimatedGasDeposit );
        const isIgnoreDepositERC721 = true;
        const strErrorOfDryRunDepositERC721 = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "DepositBoxERC721", joDepositBoxERC721,
            "depositERC721", arrArgumentsDepositERC721,
            joAccountSrc, strActionName, isIgnoreDepositERC721,
            gasPrice, estimatedGasDeposit, weiHowMuchDepositERC721, null );
        if( strErrorOfDryRunDepositERC721 )
            throw new Error( strErrorOfDryRunDepositERC721 );

        const joReceiptDeposit = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "DepositBoxERC721", joDepositBoxERC721, "depositERC721", arrArgumentsDepositERC721,
            joAccountSrc, strActionName, gasPrice, estimatedGasDeposit,
            weiHowMuchDepositERC721, null );
        if( joReceiptDeposit ) {
            jarrReceipts.push( {
                description: "doErc721PaymentFromMainNet/deposit",
                receipt: joReceiptDeposit
            } );
        }

        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxyMainNet ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxyMainNet.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderMainNet, joMessageProxyMainNet, strEventName,
                joReceiptDeposit.blockNumber, joReceiptDeposit.transactionHash,
                joMessageProxyMainNet.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxyMainNet.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxyMainNet.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc721PaymentFromMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-721 PAYMENT FROM MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc721PaymentFromMainNet", true );
    details.close();
    return true;
}

export async function doErc20PaymentFromMainNet(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joDepositBoxERC20: owaspUtils.ethersMod.ethers.Contract,
    joMessageProxyMainNet: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    chainNameSChain: string,
    tokenAmount: any, // how much ERC20 tokens to send
    weiHowMuch: any, // how much ETH
    joTokenManagerERC20: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    strCoinNameErc20MainNet: string,
    erc20MainNet: any,
    strCoinNameErc20SChain: string,
    erc20SChain: any,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "M2S ERC20 Payment: ";
    try {
        strActionName = "ERC20 payment from Main Net, approve";
        const erc20ABI = erc20MainNet[strCoinNameErc20MainNet + "_abi"];
        const erc20AddressMainNet =
            erc20MainNet[strCoinNameErc20MainNet + "_address"];
        const contractERC20 = new owaspUtils.ethersMod.ethers.Contract(
            erc20AddressMainNet, erc20ABI, ethersProviderMainNet );
        const depositBoxAddress = joDepositBoxERC20.address;
        const arrArgumentsApprove = [
            depositBoxAddress,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() )
        ];
        const arrArgumentsDepositERC20 = [
            chainNameSChain,
            erc20AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );

        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc20PaymentFromMainNet/approve",
                receipt: joReceiptApprove
            } );
        }

        strActionName = "ERC20 payment from Main Net, depositERC20";
        const weiHowMuchDepositERC20 = undefined;
        gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasDeposit = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "DepositBoxERC20", joDepositBoxERC20, "depositERC20", arrArgumentsDepositERC20,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchDepositERC20, null );
        details.trace( "{p}Using estimated(deposit) gas={}", strLogPrefix, estimatedGasDeposit );
        const isIgnoreDepositERC20 = true;
        const strErrorOfDryRunDepositERC20 = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "DepositBoxERC20", joDepositBoxERC20, "depositERC20", arrArgumentsDepositERC20,
            joAccountSrc, strActionName, isIgnoreDepositERC20,
            gasPrice, estimatedGasDeposit, weiHowMuchDepositERC20, null );
        if( strErrorOfDryRunDepositERC20 )
            throw new Error( strErrorOfDryRunDepositERC20 );

        const joReceiptDeposit = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "DepositBoxERC20", joDepositBoxERC20, "depositERC20", arrArgumentsDepositERC20,
            joAccountSrc, strActionName, gasPrice, estimatedGasDeposit,
            weiHowMuchDepositERC20, null );
        if( joReceiptDeposit ) {
            jarrReceipts.push( {
                description: "doErc20PaymentFromMainNet/deposit",
                receipt: joReceiptDeposit
            } );
        }

        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxyMainNet ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxyMainNet.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderMainNet, joMessageProxyMainNet, strEventName,
                joReceiptDeposit.blockNumber, joReceiptDeposit.transactionHash,
                joMessageProxyMainNet.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxyMainNet.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxyMainNet.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc20PaymentFromMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-20 PAYMENT FROM MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc20PaymentFromMainNet", true );
    details.close();
    return true;
}

export async function doErc1155PaymentFromMainNet(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joDepositBoxERC1155: owaspUtils.ethersMod.ethers.Contract,
    joMessageProxyMainNet: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    chainNameSChain: string,
    tokenId: any, // which ERC1155 token id to send
    tokenAmount: any, // which ERC1155 token id to send
    weiHowMuch: any, // how much ETH
    joTokenManagerERC1155: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    strCoinNameErc1155SMainNet: string,
    erc1155PrivateTestnetJsonMainNet: any,
    strCoinNameErc1155SChain: string,
    erc1155PrivateTestnetJsonSChain: any,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "M2S ERC1155 Payment: ";
    try {
        strActionName = "ERC1155 payment from Main Net, approve";
        const erc1155ABI =
            erc1155PrivateTestnetJsonMainNet[strCoinNameErc1155SMainNet + "_abi"];
        const erc1155AddressMainNet =
            erc1155PrivateTestnetJsonMainNet[strCoinNameErc1155SMainNet + "_address"];
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            erc1155AddressMainNet, erc1155ABI, ethersProviderMainNet );
        const depositBoxAddress = joDepositBoxERC1155.address;
        const arrArgumentsApprove = [
            depositBoxAddress,
            true
        ];
        const arrArgumentsDepositERC1155 = [
            chainNameSChain,
            erc1155AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() ),
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove =
            await transactionCustomizerMainNet.computeGas(
                details, ethersProviderMainNet,
                "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
                joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove =
            await imaTx.dryRunCall(
                details, ethersProviderMainNet,
                "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
                joAccountSrc, strActionName, isIgnoreApprove,
                gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove =
            await imaTx.payedCall(
                details, ethersProviderMainNet,
                "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
                joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove,
                null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentFromMainNet/approve",
                receipt: joReceiptApprove
            } );
        }
        strActionName = "ERC1155 payment from Main Net, depositERC1155";
        const weiHowMuchDepositERC1155 = undefined;
        gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasDeposit =
            await transactionCustomizerMainNet.computeGas(
                details, ethersProviderMainNet,
                "DepositBoxERC1155", joDepositBoxERC1155,
                "depositERC1155", arrArgumentsDepositERC1155,
                joAccountSrc, strActionName,
                gasPrice, 8000000, weiHowMuchDepositERC1155, null );
        details.trace( "{p}Using estimated(deposit) gas={}", strLogPrefix, estimatedGasDeposit );
        const isIgnoreDepositERC1155 = true;
        const strErrorOfDryRunDepositERC1155 =
            await imaTx.dryRunCall(
                details, ethersProviderMainNet,
                "DepositBoxERC1155", joDepositBoxERC1155,
                "depositERC1155", arrArgumentsDepositERC1155,
                joAccountSrc, strActionName, isIgnoreDepositERC1155,
                gasPrice, estimatedGasDeposit, weiHowMuchDepositERC1155, null );
        if( strErrorOfDryRunDepositERC1155 )
            throw new Error( strErrorOfDryRunDepositERC1155 );
        const joReceiptDeposit =
            await imaTx.payedCall(
                details, ethersProviderMainNet,
                "DepositBoxERC1155", joDepositBoxERC1155,
                "depositERC1155", arrArgumentsDepositERC1155,
                joAccountSrc, strActionName,
                gasPrice, estimatedGasDeposit, weiHowMuchDepositERC1155, null );
        if( joReceiptDeposit ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentFromMainNet/deposit",
                receipt: joReceiptDeposit
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxyMainNet ) {
            details.trace( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxyMainNet.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderMainNet, joMessageProxyMainNet, strEventName,
                joReceiptDeposit.blockNumber, joReceiptDeposit.transactionHash,
                joMessageProxyMainNet.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): ", strLogPrefix, strEventName,
                    joMessageProxyMainNet.address, joEvents );
            } else {
                throw new Error( "Verification failed for theOutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxyMainNet.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc1155PaymentFromMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-1155 PAYMENT FROM MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc1155PaymentFromMainNet", true );
    details.close();
    return true;
}

export async function doErc1155BatchPaymentFromMainNet(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string, chainIdSChain: string,
    joAccountSrc: state.TAccount, joAccountDst: state.TAccount,
    joDepositBoxERC1155: owaspUtils.ethersMod.ethers.Contract,
    joMessageProxyMainNet: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    chainNameSChain: string,
    arrTokenIds: any[], // which ERC1155 token id to send
    arrTokenAmounts: any[], // which ERC1155 token id to send
    weiHowMuch: any, // how much ETH
    joTokenManagerERC1155: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    strCoinNameErc1155SMainNet: string,
    erc1155PrivateTestnetJsonMainNet: any, strCoinNameErc1155SChain: string,
    erc1155PrivateTestnetJsonSChain: any,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "M2S ERC1155 Batch Payment: ";
    try {
        strActionName = "ERC1155 batch-payment from Main Net, approve";
        const erc1155ABI =
            erc1155PrivateTestnetJsonMainNet[strCoinNameErc1155SMainNet + "_abi"];
        const erc1155AddressMainNet =
            erc1155PrivateTestnetJsonMainNet[strCoinNameErc1155SMainNet + "_address"];
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            erc1155AddressMainNet, erc1155ABI, ethersProviderMainNet );
        const depositBoxAddress = joDepositBoxERC1155.address;
        const arrArgumentsApprove = [ depositBoxAddress, true ];
        const arrArgumentsDepositERC1155Batch = [
            chainNameSChain, erc1155AddressMainNet, arrTokenIds, arrTokenAmounts ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderMainNet, "ERC1155", contractERC1155,
            "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove, gasPrice, estimatedGasApprove,
            weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc1155BatchPaymentFromMainNet/approve",
                receipt: joReceiptApprove
            } );
        }
        strActionName = "ERC1155 batch-payment from Main Net, depositERC1155Batch";
        const weiHowMuchDepositERC1155Batch = undefined;
        gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasDeposit = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "DepositBoxERC1155", joDepositBoxERC1155,
            "depositERC1155Batch", arrArgumentsDepositERC1155Batch,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchDepositERC1155Batch, null );
        details.trace( "{p}Using estimated(deposit) gas={}", strLogPrefix, estimatedGasDeposit );
        const isIgnoreDepositERC1155Batch = true;
        const strErrorOfDryRunDepositERC1155Batch = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "DepositBoxERC1155", joDepositBoxERC1155,
            "depositERC1155Batch", arrArgumentsDepositERC1155Batch,
            joAccountSrc, strActionName, isIgnoreDepositERC1155Batch,
            gasPrice, estimatedGasDeposit, weiHowMuchDepositERC1155Batch, null );
        if( strErrorOfDryRunDepositERC1155Batch )
            throw new Error( strErrorOfDryRunDepositERC1155Batch );
        const joReceiptDeposit = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "DepositBoxERC1155", joDepositBoxERC1155,
            "depositERC1155Batch", arrArgumentsDepositERC1155Batch,
            joAccountSrc, strActionName,
            gasPrice, estimatedGasDeposit, weiHowMuchDepositERC1155Batch, null );
        if( joReceiptDeposit ) {
            jarrReceipts.push( {
                description: "doErc1155BatchPaymentFromMainNet/deposit",
                receipt: joReceiptDeposit
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxyMainNet ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxyMainNet.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderMainNet, joMessageProxyMainNet, strEventName,
                joReceiptDeposit.blockNumber, joReceiptDeposit.transactionHash,
                joMessageProxyMainNet.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxyMainNet.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxyMainNet.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc1155BatchPaymentFromMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-1155 PAYMENT FROM MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc1155BatchPaymentFromMainNet", true );
    details.close();
    return true;
}

export async function doErc20PaymentFromSChain(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joTokenManagerERC20: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    joMessageProxySChain: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    joDepositBox: owaspUtils.ethersMod.ethers.Contract, // only main net
    tokenAmount: any, // how much ERC20 tokens to send
    weiHowMuch: any, // how much ETH
    strCoinNameErc20MainNet: string,
    joErc20MainNet: any,
    strCoinNameErc20SChain: string,
    joErc20SChain: any,
    transactionCustomizerSChain: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "S2M ERC20 Payment: ";
    try {
        strActionName = "ERC20 payment from S-Chain, approve";
        const erc20ABI = joErc20SChain[strCoinNameErc20SChain + "_abi"];
        const erc20AddressSChain = joErc20SChain[strCoinNameErc20SChain + "_address"];
        const tokenManagerAddress = joTokenManagerERC20.address;
        const contractERC20 = new owaspUtils.ethersMod.ethers.Contract(
            erc20AddressSChain, erc20ABI, ethersProviderSChain );
        const arrArgumentsApprove = [
            tokenManagerAddress,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() ) ];
        const erc20AddressMainNet = joErc20MainNet[strCoinNameErc20MainNet + "_address"];
        const arrArgumentsExitToMainERC20 = [
            erc20AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() )
            // owaspUtils.ensureStartsWith0x( owaspUtils.toBN( weiHowMuch ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove, gasPrice, estimatedGasApprove,
            weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const opts: imaTx.TCustomPayedCallOptions = { isCheckTransactionToSchain: true };
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSChain,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, opts );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc20PaymentFromSChain/approve",
                receipt: joReceiptApprove
            } );
        }
        const nSleep = imaHelperAPIs.getSleepBetweenTransactionsOnSChainMilliseconds();
        if( nSleep > 0 ) {
            details.trace( "Sleeping {} milliseconds between transactions...", nSleep );
            await threadInfo.sleep( nSleep );
        }
        if( imaHelperAPIs.getWaitForNextBlockOnSChain() )
            await imaHelperAPIs.safeWaitForNextBlockToAppear( details, ethersProviderSChain );
        strActionName = "ERC20 payment from S-Chain, exitToMainERC20";
        const weiHowMuchExitToMainERC20 = undefined;
        const estimatedGasExitToMainERC20 = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "TokenManagerERC20", joTokenManagerERC20,
            "exitToMainERC20", arrArgumentsExitToMainERC20,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchExitToMainERC20, null );
        details.trace( "{p}Using estimated(approve) gas={}",
            strLogPrefix, estimatedGasExitToMainERC20 );
        gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const isIgnoreExitToMainERC20 = true;
        const strErrorOfDryRunExitToMainERC20 = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "TokenManagerERC20", joTokenManagerERC20,
            "exitToMainERC20", arrArgumentsExitToMainERC20,
            joAccountSrc, strActionName, isIgnoreExitToMainERC20,
            gasPrice, estimatedGasExitToMainERC20, weiHowMuchExitToMainERC20, null );
        if( strErrorOfDryRunExitToMainERC20 )
            throw new Error( strErrorOfDryRunExitToMainERC20 );
        opts.isCheckTransactionToSchain = true;
        const joReceiptExitToMainERC20 = await imaTx.payedCall(
            details, ethersProviderSChain,
            "TokenManagerERC20", joTokenManagerERC20,
            "exitToMainERC20", arrArgumentsExitToMainERC20,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasExitToMainERC20, weiHowMuchExitToMainERC20, opts );
        if( joReceiptExitToMainERC20 ) {
            jarrReceipts.push( {
                description: "doErc20PaymentFromSChain/exit-to-main",
                receipt: joReceiptExitToMainERC20
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxySChain ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxySChain.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderSChain, joMessageProxySChain, strEventName,
                joReceiptExitToMainERC20.blockNumber, joReceiptExitToMainERC20.transactionHash,
                joMessageProxySChain.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxySChain.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxySChain.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc20PaymentFromSChain", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-20 PAYMENT FROM S-CHAIN", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc20PaymentFromSChain", true );
    details.close();
    return true;
}

export async function doErc721PaymentFromSChain(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joTokenManagerERC721: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    joMessageProxySChain: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    joDepositBox: owaspUtils.ethersMod.ethers.Contract, // only main net
    tokenId: any, // which ERC721 token id to send
    weiHowMuch: any, // how much ETH
    strCoinNameErc721MainNet: string,
    joErc721MainNet: any,
    strCoinNameErc721SChain: string,
    joErc721SChain: any,
    transactionCustomizerSChain: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "S2M ERC721 Payment: ";
    try {
        strActionName = "ERC721 payment from S-Chain, approve";
        const erc721ABI = joErc721SChain[strCoinNameErc721SChain + "_abi"];
        const erc721AddressSChain = joErc721SChain[strCoinNameErc721SChain + "_address"];
        const tokenManagerAddress = joTokenManagerERC721.address;
        const contractERC721 = new owaspUtils.ethersMod.ethers.Contract(
            erc721AddressSChain, erc721ABI, ethersProviderSChain );
        const arrArgumentsApprove = [
            tokenManagerAddress,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const erc721AddressMainNet =
            joErc721MainNet[strCoinNameErc721MainNet + "_address"];
        const arrArgumentsExitToMainERC721 = [
            erc721AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(transfer from) gas={}",
            strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const opts: imaTx.TCustomPayedCallOptions = { isCheckTransactionToSchain: true };
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSChain,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, opts );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc721PaymentFromSChain/transfer-from",
                receipt: joReceiptApprove
            } );
        }
        const nSleep = imaHelperAPIs.getSleepBetweenTransactionsOnSChainMilliseconds();
        if( nSleep > 0 ) {
            details.trace( "Sleeping {} milliseconds between transactions...", nSleep );
            await threadInfo.sleep( nSleep );
        }
        if( imaHelperAPIs.getWaitForNextBlockOnSChain() )
            await imaHelperAPIs.safeWaitForNextBlockToAppear( details, ethersProviderSChain );
        strActionName = "ERC721 payment from S-Chain, exitToMainERC721";
        const weiHowMuchExitToMainERC721 = undefined;
        gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasExitToMainERC721 = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "TokenManagerERC721", joTokenManagerERC721,
            "exitToMainERC721", arrArgumentsExitToMainERC721,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchExitToMainERC721, null );
        details.trace( "{p}Using estimated(exit to main) gas={}",
            strLogPrefix, estimatedGasExitToMainERC721 );
        const isIgnoreExitToMainERC721 = true;
        const strErrorOfDryRunExitToMainERC721 = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "TokenManagerERC721", joTokenManagerERC721,
            "exitToMainERC721", arrArgumentsExitToMainERC721,
            joAccountSrc, strActionName, isIgnoreExitToMainERC721, gasPrice,
            estimatedGasExitToMainERC721, weiHowMuchExitToMainERC721, null );
        if( strErrorOfDryRunExitToMainERC721 )
            throw new Error( strErrorOfDryRunExitToMainERC721 );
        opts.isCheckTransactionToSchain = true;
        const joReceiptExitToMainERC721 = await imaTx.payedCall(
            details, ethersProviderSChain,
            "TokenManagerERC721", joTokenManagerERC721,
            "exitToMainERC721", arrArgumentsExitToMainERC721,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasExitToMainERC721, weiHowMuchExitToMainERC721, opts );
        if( joReceiptExitToMainERC721 ) {
            jarrReceipts.push( {
                description: "doErc721PaymentFromSChain/exit-to-main",
                receipt: joReceiptExitToMainERC721
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxySChain ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxySChain.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderSChain, joMessageProxySChain, strEventName,
                joReceiptExitToMainERC721.blockNumber,
                joReceiptExitToMainERC721.transactionHash,
                joMessageProxySChain.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxySChain.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy${joMessageProxySChain.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc721PaymentFromSChain", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-721 PAYMENT FROM S-CHAIN", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc721PaymentFromSChain", true );
    details.close();
    return true;
}

export async function doErc1155PaymentFromSChain(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joTokenManagerERC1155: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    joMessageProxySChain: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    joDepositBox: owaspUtils.ethersMod.ethers.Contract, // only main net
    tokenId: any, // which ERC1155 token id to send
    tokenAmount: any, // which ERC1155 token id to send
    weiHowMuch: any, // how much ETH
    strCoinNameErc1155SMainNet: string,
    joErc1155MainNet: any,
    strCoinNameErc1155SChain: string,
    joErc1155Chain: any,
    transactionCustomizerSChain: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "S2M ERC1155 Payment: ";
    try {
        strActionName = "ERC1155 payment from S-Chain, approve";
        const erc1155ABI = joErc1155Chain[strCoinNameErc1155SChain + "_abi"];
        const erc1155AddressSChain = joErc1155Chain[strCoinNameErc1155SChain + "_address"];
        const tokenManagerAddress = joTokenManagerERC1155.address;
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            erc1155AddressSChain, erc1155ABI, ethersProviderSChain );
        const arrArgumentsApprove = [ tokenManagerAddress, true ];
        const erc1155AddressMainNet =
            joErc1155MainNet[strCoinNameErc1155SMainNet + "_address"];
        const arrArgumentsExitToMainERC1155 = [
            erc1155AddressMainNet,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() ),
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenAmount ).toHexString() )
            // owaspUtils.ensureStartsWith0x( owaspUtils.toBN( weiHowMuch ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(transfer from) gas={}",
            strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const opts: imaTx.TCustomPayedCallOptions = { isCheckTransactionToSchain: true };
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, opts );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentFromSChain/transfer-from",
                receipt: joReceiptApprove
            } );
        }
        const nSleep = imaHelperAPIs.getSleepBetweenTransactionsOnSChainMilliseconds();
        if( nSleep > 0 ) {
            details.trace( "Sleeping {} milliseconds between transactions...", nSleep );
            await threadInfo.sleep( nSleep );
        }
        if( imaHelperAPIs.getWaitForNextBlockOnSChain() )
            await imaHelperAPIs.safeWaitForNextBlockToAppear( details, ethersProviderSChain );
        strActionName = "ERC1155 payment from S-Chain, exitToMainERC1155";
        const weiHowMuchExitToMainERC1155 = undefined;
        gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasExitToMainERC1155 = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155", arrArgumentsExitToMainERC1155,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchExitToMainERC1155, null );
        details.trace( "{p}Using estimated(exit to main) gas={}",
            strLogPrefix, estimatedGasExitToMainERC1155 );
        const isIgnoreExitToMainERC1155 = true;
        const strErrorOfDryRunExitToMainERC1155 = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155", arrArgumentsExitToMainERC1155,
            joAccountSrc, strActionName, isIgnoreExitToMainERC1155,
            gasPrice, estimatedGasExitToMainERC1155, weiHowMuchExitToMainERC1155, null );
        if( strErrorOfDryRunExitToMainERC1155 )
            throw new Error( strErrorOfDryRunExitToMainERC1155 );
        opts.isCheckTransactionToSchain = true;
        const joReceiptExitToMainERC1155 = await imaTx.payedCall(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155", arrArgumentsExitToMainERC1155,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasExitToMainERC1155, weiHowMuchExitToMainERC1155, opts );
        if( joReceiptExitToMainERC1155 ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentFromSChain/exit-to-main",
                receipt: joReceiptExitToMainERC1155
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxySChain ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxySChain.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderSChain, joMessageProxySChain, strEventName,
                joReceiptExitToMainERC1155.blockNumber,
                joReceiptExitToMainERC1155.transactionHash,
                joMessageProxySChain.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxySChain.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy${joMessageProxySChain.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc1155PaymentFromSChain", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-1155 PAYMENT FROM S-CHAIN", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc1155PaymentFromSChain", true );
    details.close();
    return true;
}

export async function doErc1155BatchPaymentFromSChain(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdMainNet: string,
    chainIdSChain: string,
    joAccountSrc: state.TAccount,
    joAccountDst: state.TAccount,
    joTokenManagerERC1155: owaspUtils.ethersMod.ethers.Contract, // only s-chain
    joMessageProxySChain: owaspUtils.ethersMod.ethers.Contract, // for checking logs
    joDepositBox: owaspUtils.ethersMod.ethers.Contract, // only main net
    arrTokenIds: any[], // which ERC1155 token ids to send
    arrTokenAmounts: any[], // which ERC1155 token amounts to send
    weiHowMuch: any, // how much ETH
    strCoinNameErc1155SMainNet: string,
    joErc1155MainNet: any,
    strCoinNameErc1155SChain: string,
    joErc1155Chain: any,
    transactionCustomizerSChain: imaTx.TransactionCustomizer
): Promise<boolean> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "S2M ERC1155 Batch Payment: ";
    try {
        strActionName = "ERC1155 payment from S-Chain, approve";
        const erc1155ABI = joErc1155Chain[strCoinNameErc1155SChain + "_abi"];
        const erc1155AddressSChain = joErc1155Chain[strCoinNameErc1155SChain + "_address"];
        const tokenManagerAddress = joTokenManagerERC1155.address;
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            erc1155AddressSChain, erc1155ABI, ethersProviderSChain );
        const arrArgumentsApprove = [ tokenManagerAddress, true ];
        const erc1155AddressMainNet =
            joErc1155MainNet[strCoinNameErc1155SMainNet + "_address"];
        const arrArgumentsExitToMainERC1155Batch = [
            erc1155AddressMainNet, arrTokenIds, arrTokenAmounts ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(transfer from) gas={}",
            strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const opts: imaTx.TCustomPayedCallOptions = { isCheckTransactionToSchain: true };
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSChain,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, opts );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: "doErc1155BatchPaymentFromSChain/transfer-from",
                receipt: joReceiptApprove
            } );
        }
        const nSleep = imaHelperAPIs.getSleepBetweenTransactionsOnSChainMilliseconds();
        if( nSleep > 0 ) {
            details.trace( "Sleeping {} milliseconds between transactions...", nSleep );
            await threadInfo.sleep( nSleep );
        }
        if( imaHelperAPIs.getWaitForNextBlockOnSChain() )
            await imaHelperAPIs.safeWaitForNextBlockToAppear( details, ethersProviderSChain );
        strActionName = "ERC1155 batch-payment from S-Chain, exitToMainERC1155Batch";
        const weiHowMuchExitToMainERC1155Batch = undefined;
        gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasExitToMainERC1155Batch = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155Batch", arrArgumentsExitToMainERC1155Batch,
            joAccountSrc, strActionName, gasPrice, 8000000,
            weiHowMuchExitToMainERC1155Batch, null );
        details.trace( "{p}Using estimated(exit to main) gas={}",
            strLogPrefix, estimatedGasExitToMainERC1155Batch );
        const isIgnoreExitToMainERC1155Batch = true;
        const strErrorOfDryRunExitToMainERC1155Batch = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155Batch", arrArgumentsExitToMainERC1155Batch,
            joAccountSrc, strActionName, isIgnoreExitToMainERC1155Batch, gasPrice,
            estimatedGasExitToMainERC1155Batch, weiHowMuchExitToMainERC1155Batch, null );
        if( strErrorOfDryRunExitToMainERC1155Batch )
            throw new Error( strErrorOfDryRunExitToMainERC1155Batch );
        opts.isCheckTransactionToSchain = true;
        const joReceiptExitToMainERC1155Batch = await imaTx.payedCall(
            details, ethersProviderSChain,
            "TokenManagerERC1155", joTokenManagerERC1155,
            "exitToMainERC1155Batch", arrArgumentsExitToMainERC1155Batch,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasExitToMainERC1155Batch, weiHowMuchExitToMainERC1155Batch, opts );
        if( joReceiptExitToMainERC1155Batch ) {
            jarrReceipts.push( {
                description: "doErc1155BatchPaymentFromSChain/exit-to-main",
                receipt: joReceiptExitToMainERC1155Batch
            } );
        }
        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxySChain ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract...",
                strLogPrefix, strEventName, joMessageProxySChain.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderSChain, joMessageProxySChain, strEventName,
                joReceiptExitToMainERC1155Batch.blockNumber,
                joReceiptExitToMainERC1155Batch.transactionHash,
                joMessageProxySChain.filters[strEventName]() );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{}" +
                    " contract, found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxySChain.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy${joMessageProxySChain.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "doErc1155BatchPaymentFromSChain", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "ERC-1155 PAYMENT FROM S-CHAIN", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "doErc1155BatchPaymentFromSChain", true );
    details.close();
    return true;
}

export async function doErc20PaymentS2S(
    isForward: boolean,
    ethersProviderSrc: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdSrc: string,
    strChainNameDst: string,
    joAccountSrc: state.TAccount,
    joTokenManagerERC20Src: owaspUtils.ethersMod.ethers.Contract,
    nAmountOfToken: any, // how much ERC20 tokens to send
    nAmountOfWei: any, // how much to send
    strCoinNameErc20Src: string,
    joSrcErc20: any,
    ercDstAddress20: any, // only reverse payment needs it
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    const isReverse = !isForward;
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = `S2S ERC20 Payment(${( isForward ? "forward" : "reverse" )}:): `;
    try {
        strActionName = `validateArgs/doErc20PaymentS2S/${( isForward ? "forward" : "reverse" )}`;
        if( !ethersProviderSrc )
            throw new Error( "No ethers provider specified for source of transfer" );
        if( !strChainNameDst )
            throw new Error( "No destination chain name provided" );
        if( !joAccountSrc )
            throw new Error( "No account or sign TX way provided" );
        if( !strCoinNameErc20Src )
            throw new Error( "Need full source ERC20 information, like ABI" );
        if( !joSrcErc20 )
            throw new Error( "No source ERC20 ABI provided" );
        if( isReverse ) {
            if( !ercDstAddress20 )
                throw new Error( "No destination ERC20 address provided" );
        }
        if( !tc )
            throw new Error( "No transaction customizer provided" );
        const ercSrcAbi20 = joSrcErc20[strCoinNameErc20Src + "_abi"];
        const ercSrcAddress20 = joSrcErc20[strCoinNameErc20Src + "_address"];
        details.trace( "{p}Token Manager ERC20 address on source chain....{}",
            strLogPrefix, joTokenManagerERC20Src.address );
        details.trace( "{p}Source ERC20 coin name.........................{}",
            strLogPrefix, strCoinNameErc20Src );
        details.trace( "{p}Source ERC20 token address.....................{}",
            strLogPrefix, ercSrcAddress20 );
        if( isReverse || ercDstAddress20 ) {
            details.trace( "{p}Destination ERC20 token address................{}",
                strLogPrefix, ercDstAddress20 );
        }
        details.trace( "{p}Destination chain name.........................{}",
            strLogPrefix, strChainNameDst );
        details.trace( "{p}Amount of tokens to transfer...................{}",
            strLogPrefix, nAmountOfToken );
        strActionName = `ERC20 payment S2S, approve, ${( isForward ? "forward" : "reverse" )}`;
        const contractERC20 = new owaspUtils.ethersMod.ethers.Contract(
            ercSrcAddress20, ercSrcAbi20, ethersProviderSrc );
        const arrArgumentsApprove = [
            joTokenManagerERC20Src.address,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmountOfToken ).toHexString() )
        ];
        const arrArgumentsTransfer = [
            strChainNameDst,
            isReverse ? ercDstAddress20 : ercSrcAddress20,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmountOfToken ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await tc.computeGas(
            details, ethersProviderSrc,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSrc,
            "ERC20", contractERC20, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description: `doErc20PaymentS2S/approve/${( isForward ? "forward" : "reverse" )}`,
                receipt: joReceiptApprove
            } );
        }
        strActionName = `ERC20 payment S2S, transferERC20 ${( isForward ? "forward" : "reverse" )}`;
        const weiHowMuchTransferERC20 = undefined;
        gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasTransfer = await tc.computeGas(
            details, ethersProviderSrc,
            "TokenManagerERC20", joTokenManagerERC20Src,
            "transferToSchainERC20", arrArgumentsTransfer,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchTransferERC20, null );
        details.trace( "{p}Using estimated(transfer) gas={}", strLogPrefix, estimatedGasTransfer );
        const isIgnoreTransferERC20 = true;
        const strErrorOfDryRunTransferERC20 = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "TokenManagerERC20", joTokenManagerERC20Src,
            "transferToSchainERC20", arrArgumentsTransfer,
            joAccountSrc, strActionName, isIgnoreTransferERC20,
            gasPrice, estimatedGasTransfer, weiHowMuchTransferERC20, null );
        if( strErrorOfDryRunTransferERC20 )
            throw new Error( strErrorOfDryRunTransferERC20 );
        const joReceiptTransfer = await imaTx.payedCall(
            details, ethersProviderSrc,
            "TokenManagerERC20", joTokenManagerERC20Src,
            "transferToSchainERC20", arrArgumentsTransfer,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasTransfer, weiHowMuchTransferERC20, null );
        if( joReceiptTransfer ) {
            jarrReceipts.push( {
                description: "doErc20PaymentS2S/transfer",
                receipt: joReceiptTransfer
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(),
            `doErc20PaymentS2S/${( isForward ? "forward" : "reverse" )}`, false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        `ERC-20 PAYMENT FROM S2S/${( isForward ? "forward" : "reverse" )}`, jarrReceipts, details );
    if( log.exposeDetailsGet() ) {
        details.exposeDetailsTo( log.globalStream(),
            `doErc20PaymentS2S/${( isForward ? "forward" : "reverse" )}`, true );
    }
    details.close();
    return true;
}

export async function doErc721PaymentS2S(
    isForward: boolean,
    ethersProviderSrc: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdSrc: string,
    strChainNameDst: string,
    joAccountSrc: state.TAccount,
    joTokenManagerERC721Src: owaspUtils.ethersMod.ethers.Contract,
    tokenId: any, // which ERC721 token id to send
    nAmountOfWei: any, // how much to send
    strCoinNameErc721Src: string,
    joSrcErc721: any,
    ercDstAddress721: any, // only reverse payment needs it
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    const isReverse = !isForward;
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = `S2S ERC721 Payment(${( isForward ? "forward" : "reverse" )}: `;
    try {
        strActionName = `validateArgs/doErc721PaymentS2S/${( isForward ? "forward" : "reverse" )}`;
        if( !ethersProviderSrc )
            throw new Error( "No provider for source of transfer" );
        if( !strChainNameDst )
            throw new Error( "No destination chain name provided" );
        if( !joAccountSrc )
            throw new Error( "No account or sign TX way provided" );
        if( !strCoinNameErc721Src )
            throw new Error( "Need full source ERC721 information, like ABI" );
        if( !joSrcErc721 )
            throw new Error( "No source ERC721 ABI provided" );
        if( isReverse ) {
            if( !ercDstAddress721 )
                throw new Error( "No destination ERC721 address provided" );
        }
        if( !tc )
            throw new Error( "No transaction customizer provided" );
        const ercSrcAbi721 = joSrcErc721[strCoinNameErc721Src + "_abi"];
        const ercSrcAddress721 = joSrcErc721[strCoinNameErc721Src + "_address"];
        details.trace( "{p}Token Manager ERC721 address on source chain....{}",
            strLogPrefix, joTokenManagerERC721Src.address );
        details.trace( "{p}Source ERC721 coin name.........................{}",
            strLogPrefix, strCoinNameErc721Src );
        details.trace( "{p}Source ERC721 token address.....................{}",
            strLogPrefix, ercSrcAddress721 );
        if( isReverse || ercDstAddress721 ) {
            details.trace( "{p}Destination ERC721 token address................{}",
                strLogPrefix, ercDstAddress721 );
        }
        details.trace( "{p}Destination chain name.........................{}",
            strLogPrefix, strChainNameDst );
        details.trace( "{p}Token ID to transfer...........................{}",
            strLogPrefix, tokenId );
        strActionName = `ERC721 payment S2S, approve, ${( isForward ? "forward" : "reverse" )}`;
        const contractERC721 = new owaspUtils.ethersMod.ethers.Contract(
            ercSrcAddress721, ercSrcAbi721, ethersProviderSrc );
        const arrArgumentsApprove = [
            joTokenManagerERC721Src.address,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const arrArgumentsTransfer = [
            strChainNameDst,
            isReverse ? ercDstAddress721 : ercSrcAddress721,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await tc.computeGas(
            details, ethersProviderSrc,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSrc,
            "ERC721", contractERC721, "approve", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description:
                `doErc721PaymentS2S/approve/${( isForward ? "forward" : "reverse" )}`,
                receipt: joReceiptApprove
            } );
        }
        const isIgnoreTransferERC721 = true;
        strActionName =
            `ERC721 payment S2S, transferERC721 ${( isForward ? "forward" : "reverse" )}`;
        const weiHowMuchTransferERC721 = undefined;
        gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasTransfer = await tc.computeGas(
            details, ethersProviderSrc,
            "TokenManagerERC721", joTokenManagerERC721Src,
            "transferToSchainERC721", arrArgumentsTransfer,
            joAccountSrc, strActionName,
            gasPrice, 8000000, weiHowMuchTransferERC721, null );
        details.trace( "{p}Using estimated(transfer) gas={}", strLogPrefix, estimatedGasTransfer );
        const strErrorOfDryRunTransferERC721 = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "TokenManagerERC721", joTokenManagerERC721Src,
            "transferToSchainERC721", arrArgumentsTransfer,
            joAccountSrc, strActionName, isIgnoreTransferERC721,
            gasPrice, estimatedGasTransfer, weiHowMuchTransferERC721, null );
        if( strErrorOfDryRunTransferERC721 )
            throw new Error( strErrorOfDryRunTransferERC721 );
        const joReceiptTransfer = await imaTx.payedCall(
            details, ethersProviderSrc,
            "TokenManagerERC721", joTokenManagerERC721Src,
            "transferToSchainERC721", arrArgumentsTransfer,
            joAccountSrc, strActionName,
            gasPrice, estimatedGasTransfer, weiHowMuchTransferERC721, null );
        if( joReceiptTransfer ) {
            jarrReceipts.push( {
                description: "doErc721PaymentS2S/transfer",
                receipt: joReceiptTransfer
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(),
            `doErc721PaymentS2S/${( isForward ? "forward" : "reverse" )}`, false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        `ERC-721 PAYMENT FROM S2S/${( isForward ? "forward" : "reverse" )}`,
        jarrReceipts, details );
    if( log.exposeDetailsGet() ) {
        details.exposeDetailsTo( log.globalStream(),
            `doErc721PaymentS2S/${( isForward ? "forward" : "reverse" )}`, true );
    }
    details.close();
    return true;
}

export async function doErc1155PaymentS2S(
    isForward: boolean,
    ethersProviderSrc: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdSrc: string,
    strChainNameDst: string,
    joAccountSrc: state.TAccount,
    joTokenManagerERC1155Src: owaspUtils.ethersMod.ethers.Contract,
    tokenId: any, // which ERC721 token id to send
    nAmountOfToken: any, // how much ERC1155 tokens to send
    nAmountOfWei: any, // how much to send
    strCoinNameErc1155Src: string,
    joSrcErc1155: any,
    ercDstAddress1155: any, // only reverse payment needs it
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    const isReverse = !isForward;
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = `S2S ERC1155 Payment(${( isForward ? "forward" : "reverse" )}): `;
    try {
        strActionName = `validateArgs/doErc1155PaymentS2S/${( isForward ? "forward" : "reverse" )}`;
        if( !ethersProviderSrc )
            throw new Error( "No provider for source of transfer" );
        if( !strChainNameDst )
            throw new Error( "No destination chain name provided" );
        if( !joAccountSrc )
            throw new Error( "No account or sign TX way provided" );
        if( !strCoinNameErc1155Src )
            throw new Error( "Need full source ERC1155 information, like ABI" );
        if( !joSrcErc1155 )
            throw new Error( "No source ERC1155 ABI provided" );
        if( isReverse ) {
            if( !ercDstAddress1155 )
                throw new Error( "No destination ERC1155 address provided" );
        }
        if( !tc )
            throw new Error( "No transaction customizer provided" );
        const ercSrcAbi1155 = joSrcErc1155[strCoinNameErc1155Src + "_abi"];
        const ercSrcAddress1155 = joSrcErc1155[strCoinNameErc1155Src + "_address"];
        details.trace( "{p}Token Manager ERC1155 address on source chain....{}",
            strLogPrefix, joTokenManagerERC1155Src.address );
        details.trace( "{p}Source ERC1155 coin name.........................{}",
            strLogPrefix, strCoinNameErc1155Src );
        details.trace( "{p}Source ERC1155 token address.....................{}",
            strLogPrefix, ercSrcAddress1155 );
        if( isReverse || ercDstAddress1155 ) {
            details.trace( "{p}Destination ERC1155 token address................{}",
                strLogPrefix, ercDstAddress1155 );
        }
        details.trace( "{p}Destination chain name.........................{}",
            strLogPrefix, strChainNameDst );
        details.trace( "{p}Token ID to transfer...........................{}",
            strLogPrefix, tokenId );
        details.trace( "{p}Amount of tokens to transfer...................{}",
            strLogPrefix, nAmountOfToken );
        strActionName = `ERC1155 payment S2S, approve, ${( isForward ? "forward" : "reverse" )}`;
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            ercSrcAddress1155, ercSrcAbi1155, ethersProviderSrc );
        const arrArgumentsApprove = [ joTokenManagerERC1155Src.address, true ];
        const arrArgumentsTransfer = [
            strChainNameDst,
            isReverse ? ercDstAddress1155 : ercSrcAddress1155,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( tokenId ).toHexString() ),
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmountOfToken ).toHexString() )
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await tc.computeGas(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice,
            estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description:
                    `doErc1155PaymentS2S/approve/${( isForward ? "forward" : "reverse" )}`,
                receipt: joReceiptApprove
            } );
        }
        strActionName =
            `ERC1155 payment S2S, transferERC1155 ${( isForward ? "forward" : "reverse" )}`;
        const weiHowMuchTransferERC1155 = undefined;
        gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasTransfer = await tc.computeGas(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155", arrArgumentsTransfer,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchTransferERC1155, null );
        details.trace( "{p}Using estimated(transfer) gas={}", strLogPrefix, estimatedGasTransfer );
        const isIgnoreTransferERC1155 = true;
        const strErrorOfDryRunTransferERC1155 = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155", arrArgumentsTransfer,
            joAccountSrc, strActionName, isIgnoreTransferERC1155, gasPrice,
            estimatedGasTransfer, weiHowMuchTransferERC1155, null );
        if( strErrorOfDryRunTransferERC1155 )
            throw new Error( strErrorOfDryRunTransferERC1155 );
        const joReceiptTransfer = await imaTx.payedCall(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155", arrArgumentsTransfer,
            joAccountSrc, strActionName, gasPrice, estimatedGasTransfer,
            weiHowMuchTransferERC1155, null );
        if( joReceiptTransfer ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentS2S/transfer",
                receipt: joReceiptTransfer
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(),
            `doErc1155PaymentS2S/${( isForward ? "forward" : "reverse" )}`, false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        `ERC-1155 PAYMENT FROM S2S/${( isForward ? "forward" : "reverse" )}`,
        jarrReceipts, details );
    if( log.exposeDetailsGet() ) {
        details.exposeDetailsTo( log.globalStream(),
            `doErc1155PaymentS2S/${( isForward ? "forward" : "reverse" )}`, true );
    }
    details.close();
    return true;
}

export async function doErc1155BatchPaymentS2S(
    isForward: boolean,
    ethersProviderSrc: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainIdSrc: string,
    strChainNameDst: string,
    joAccountSrc: state.TAccount,
    joTokenManagerERC1155Src: owaspUtils.ethersMod.ethers.Contract,
    arrTokenIds: any[], // which ERC1155 token id to send
    arrTokenAmounts: any[], // which ERC1155 token id to send
    nAmountOfWei: any, // how much to send
    strCoinNameErc1155Src: string,
    joSrcErc1155: any,
    ercDstAddress1155: any, // only reverse payment needs it
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    const isReverse = !isForward;
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = `S2S Batch ERC1155 Payment(${( isForward ? "forward" : "reverse" )}: `;
    try {
        strActionName =
            `validateArgs/doErc1155BatchPaymentS2S/${( isForward ? "forward" : "reverse" )}`;
        if( !ethersProviderSrc )
            throw new Error( "No provider for source of transfer" );
        if( !strChainNameDst )
            throw new Error( "No destination chain name provided" );
        if( !joAccountSrc )
            throw new Error( "No account or sign TX way provided" );
        if( !strCoinNameErc1155Src )
            throw new Error( "Need full source ERC1155 information, like ABI" );
        if( !joSrcErc1155 )
            throw new Error( "No source ERC1155 ABI provided" );
        if( isReverse ) {
            if( !ercDstAddress1155 )
                throw new Error( "No destination ERC1155 address provided" );
        }
        if( !tc )
            throw new Error( "No transaction customizer provided" );
        const ercSrcAbi1155 = joSrcErc1155[strCoinNameErc1155Src + "_abi"];
        const ercSrcAddress1155 = joSrcErc1155[strCoinNameErc1155Src + "_address"];
        details.trace( "{p}Token Manager ERC1155 address on source chain....{}",
            strLogPrefix, joTokenManagerERC1155Src.address );
        details.trace( "{p}Source ERC1155 coin name.........................{}",
            strLogPrefix, strCoinNameErc1155Src );
        details.trace( "{p}Source ERC1155 token address.....................{}",
            strLogPrefix, ercSrcAddress1155 );
        if( isReverse || ercDstAddress1155 ) {
            details.trace( "{p}Destination ERC1155 token address................{}",
                strLogPrefix, ercDstAddress1155 );
        }
        details.trace( "{p}Destination chain name.........................{}",
            strLogPrefix, strChainNameDst );
        details.trace( "{p}Token IDs to transfer..........................{}",
            strLogPrefix, arrTokenIds );
        details.trace( "{p}Amounts of tokens to transfer..................{}",
            strLogPrefix, arrTokenAmounts );
        strActionName =
            `ERC1155 batch-payment S2S, approve, ${( isForward ? "forward" : "reverse" )}`;
        const contractERC1155 = new owaspUtils.ethersMod.ethers.Contract(
            ercSrcAddress1155, ercSrcAbi1155, ethersProviderSrc );
        const arrArgumentsApprove = [ joTokenManagerERC1155Src.address, true ];
        const arrArgumentsTransfer = [
            strChainNameDst,
            isReverse ? ercDstAddress1155 : ercSrcAddress1155,
            arrTokenIds,
            arrTokenAmounts
        ];
        const weiHowMuchApprove = undefined;
        let gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasApprove = await tc.computeGas(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, 8000000, weiHowMuchApprove, null );
        details.trace( "{p}Using estimated(approve) gas={}", strLogPrefix, estimatedGasApprove );
        const isIgnoreApprove = false;
        const strErrorOfDryRunApprove = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, isIgnoreApprove,
            gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( strErrorOfDryRunApprove )
            throw new Error( strErrorOfDryRunApprove );
        const joReceiptApprove = await imaTx.payedCall(
            details, ethersProviderSrc,
            "ERC1155", contractERC1155, "setApprovalForAll", arrArgumentsApprove,
            joAccountSrc, strActionName, gasPrice, estimatedGasApprove, weiHowMuchApprove, null );
        if( joReceiptApprove ) {
            jarrReceipts.push( {
                description:
                    `doErc1155BatchPaymentS2S/approve/${( isForward ? "forward" : "reverse" )}`,
                receipt: joReceiptApprove
            } );
        }
        strActionName =
            `ERC1155 batch-payment S2S, transferERC1155 ${( isForward ? "forward" : "reverse" )}`;
        const weiHowMuchTransferERC1155 = undefined;
        gasPrice = await tc.computeGasPrice( ethersProviderSrc, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasTransfer = await tc.computeGas(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155Batch", arrArgumentsTransfer,
            joAccountSrc, strActionName,
            gasPrice, 8000000, weiHowMuchTransferERC1155, null );
        details.trace( "{p}Using estimated(transfer) gas={}", strLogPrefix, estimatedGasTransfer );
        const isIgnoreTransferERC1155 = true;
        const strErrorOfDryRunTransferERC1155 = await imaTx.dryRunCall(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155Batch", arrArgumentsTransfer,
            joAccountSrc, strActionName, isIgnoreTransferERC1155,
            gasPrice, estimatedGasTransfer, weiHowMuchTransferERC1155, null );
        if( strErrorOfDryRunTransferERC1155 )
            throw new Error( strErrorOfDryRunTransferERC1155 );
        const joReceiptTransfer = await imaTx.payedCall(
            details, ethersProviderSrc,
            "TokenManagerERC1155", joTokenManagerERC1155Src,
            "transferToSchainERC1155Batch", arrArgumentsTransfer,
            joAccountSrc, strActionName,
            gasPrice, estimatedGasTransfer, weiHowMuchTransferERC1155, null );
        if( joReceiptTransfer ) {
            jarrReceipts.push( {
                description: "doErc1155PaymentS2S/transfer",
                receipt: joReceiptTransfer
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(),
            `doErc1155BatchPaymentS2S/${( isForward ? "forward" : "reverse" )}`, false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        `ERC-1155-batch PAYMENT FROM S2S/${( isForward ? "forward" : "reverse" )}`,
        jarrReceipts, details );
    if( log.exposeDetailsGet() ) {
        details.exposeDetailsTo( log.globalStream(),
            `doErc1155BatchPaymentS2S/${( isForward ? "forward" : "reverse" )}`, true );
    }
    details.close();
    return true;
}

export async function mintErc20(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: string,
    joAccount: state.TAccount,
    strAddressMintTo: string,
    nAmount: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "mintErc20() init";
    const strLogPrefix = "mintErc20() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Mint ERC20 token amount {}", strLogPrefix, nAmount );
        if( !( strAddressMintTo.length > 0 && strTokenContractAddress.length > 0 &&
            joTokenContractABI ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "mintErc20() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsMint = [
            strAddressMintTo,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmount ).toHexString() )
        ];
        const weiHowMuchMint = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasMint = await tc.computeGas(
            details, ethersProvider,
            "ERC20", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchMint, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasMint );
        strActionName = "Mint ERC20";
        const isIgnoreMint = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC20", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, isIgnoreMint,
            gasPrice, estimatedGasMint, weiHowMuchMint, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC20", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, estimatedGasMint, weiHowMuchMint, opts );
        imaGasUsage.printGasUsageReportFromArray( "MINT ERC20 ", [ {
            description: "mintErc20()/mint",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "mintErc20", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "mintErc20()", false );
        details.close();
        return false;
    }
}

export async function mintErc721(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: string,
    joAccount: state.TAccount,
    strAddressMintTo: string,
    idToken: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "mintErc721() init";
    const strLogPrefix = "mintErc721() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Mint ERC721 token ID {}", strLogPrefix, idToken );
        if( !( ethersProvider && joAccount && strAddressMintTo &&
            typeof strAddressMintTo === "string" && strAddressMintTo.length > 0 &&
            strTokenContractAddress && typeof strTokenContractAddress === "string" &&
            strTokenContractAddress.length > 0 && joTokenContractABI
        ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "mintErc721() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsMint = [
            strAddressMintTo,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( idToken ).toHexString() )
        ];
        const weiHowMuchMint = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasMint = await tc.computeGas(
            details, ethersProvider,
            "ERC721", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchMint, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasMint );
        strActionName = "Mint ERC721";
        const isIgnoreMint = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC721", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, isIgnoreMint,
            gasPrice, estimatedGasMint, weiHowMuchMint, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC721", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, estimatedGasMint, weiHowMuchMint, opts );
        imaGasUsage.printGasUsageReportFromArray( "MINT ERC721 ", [ {
            description: "mintErc721()/mint",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "mintErc721", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "mintErc721()", false );
        details.close();
        return false;
    }
}

export async function mintErc1155(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: any,
    joAccount: state.TAccount,
    strAddressMintTo: string,
    idToken: any,
    nAmount: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "mintErc1155() init";
    const strLogPrefix = "mintErc1155() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Mint ERC1155 token ID {} token amount {}",
            strLogPrefix, idToken, nAmount );
        if( !( ethersProvider && joAccount && strAddressMintTo &&
            typeof strAddressMintTo === "string" && strAddressMintTo.length > 0 &&
            strTokenContractAddress && typeof strTokenContractAddress === "string" &&
            strTokenContractAddress.length > 0 && joTokenContractABI
        ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "mintErc1155() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsMint = [
            strAddressMintTo,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( idToken ).toHexString() ),
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmount ).toHexString() ),
            [] // data
        ];
        const weiHowMuchMint = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasMint = await tc.computeGas(
            details, ethersProvider,
            "ERC1155", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchMint, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasMint );
        strActionName = "Mint ERC1155";
        const isIgnoreMint = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC1155", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, isIgnoreMint,
            gasPrice, estimatedGasMint, weiHowMuchMint, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC1155", contract, "mint", arrArgumentsMint,
            joAccount, strActionName, gasPrice, estimatedGasMint, weiHowMuchMint, opts );
        imaGasUsage.printGasUsageReportFromArray( "MINT ERC1155 ", [ {
            description: "mintErc1155()/mint",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "mintErc1155", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "mintErc1155()", false );
        details.close();
        return false;
    }
}

export async function burnErc20(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: string,
    joAccount: state.TAccount,
    strAddressBurnFrom: string,
    nAmount: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "burnErc20() init";
    const strLogPrefix = "burnErc20() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Burn ERC20 token amount {}", strLogPrefix, nAmount );
        if( !( ethersProvider && joAccount && strAddressBurnFrom &&
            typeof strAddressBurnFrom === "string" && strAddressBurnFrom.length > 0 &&
            strTokenContractAddress && typeof strTokenContractAddress === "string" &&
            strTokenContractAddress.length > 0 && joTokenContractABI
        ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "burnErc20() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsBurn = [
            strAddressBurnFrom,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmount ).toHexString() )
        ];
        const weiHowMuchBurn = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasBurn = await tc.computeGas(
            details, ethersProvider,
            "ERC20", contract, "burnFrom", arrArgumentsBurn,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchBurn, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasBurn );
        strActionName = "Burn ERC20";
        const isIgnoreBurn = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC20", contract, "burnFrom", arrArgumentsBurn,
            joAccount, strActionName, isIgnoreBurn,
            gasPrice, estimatedGasBurn, weiHowMuchBurn, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC20", contract, "burnFrom", arrArgumentsBurn,
            joAccount, strActionName, gasPrice, estimatedGasBurn, weiHowMuchBurn, opts );
        imaGasUsage.printGasUsageReportFromArray( "BURN ERC20 ", [ {
            description: "burnErc20()/burn",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "burnErc20", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "burnErc20()", false );
        details.close();
        return false;
    }
}

export async function burnErc721(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: string,
    joAccount: state.TAccount,
    idToken: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "burnErc721() init";
    const strLogPrefix = "burnErc721() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Burn ERC721 token ID {}", strLogPrefix, idToken );
        if( !( ethersProvider && joAccount &&
            strTokenContractAddress && typeof strTokenContractAddress === "string" &&
            strTokenContractAddress.length > 0 && joTokenContractABI
        ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "burnErc721() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsBurn = [
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( idToken ).toHexString() )
        ];
        const weiHowMuchBurn = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasBurn = await tc.computeGas(
            details, ethersProvider,
            "ERC721", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchBurn, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasBurn );
        strActionName = "Burn ERC721";
        const isIgnoreBurn = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC721", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName, isIgnoreBurn,
            gasPrice, estimatedGasBurn, weiHowMuchBurn, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC721", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName, gasPrice, estimatedGasBurn, weiHowMuchBurn, opts );
        imaGasUsage.printGasUsageReportFromArray( "BURN ERC721 ", [ {
            description: "burnErc721()/burn",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "burnErc721", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "burnErc721()", false );
        details.close();
        return false;
    }
}

export async function burnErc1155(
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    chainId: string,
    chainName: string,
    joAccount: state.TAccount,
    strAddressBurnFrom: string,
    idToken: any,
    nAmount: any,
    strTokenContractAddress: string,
    joTokenContractABI: any,
    tc: imaTx.TransactionCustomizer
): Promise<boolean> {
    let strActionName = "burnErc1155() init";
    const strLogPrefix = "burnErc1155() call ";
    const details = log.createMemoryStream();
    try {
        details.debug( "{p}Burn ERC1155 token ID {} token amount {}",
            strLogPrefix, idToken, nAmount );
        if( !( ethersProvider && joAccount && strAddressBurnFrom &&
            typeof strAddressBurnFrom === "string" && strAddressBurnFrom.length > 0 &&
            strTokenContractAddress && typeof strTokenContractAddress === "string" &&
            strTokenContractAddress.length > 0 && joTokenContractABI
        ) )
            throw new Error( "Missing valid arguments" );
        strActionName = "burnErc1155() instantiate token contract";
        const contract = new owaspUtils.ethersMod.ethers.Contract(
            strTokenContractAddress, joTokenContractABI, ethersProvider );
        const arrArgumentsBurn = [
            strAddressBurnFrom,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( idToken ).toHexString() ),
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nAmount ).toHexString() )
        ];
        const weiHowMuchBurn = undefined;
        const gasPrice = await tc.computeGasPrice( ethersProvider, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGasBurn = await tc.computeGas(
            details, ethersProvider,
            "ERC1155", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName, gasPrice, 10000000, weiHowMuchBurn, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGasBurn );
        strActionName = "Burn ERC1155";
        const isIgnoreBurn = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProvider,
            "ERC1155", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName, isIgnoreBurn,
            gasPrice, estimatedGasBurn, weiHowMuchBurn, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions =
            { isCheckTransactionToSchain: ( chainName !== "Mainnet" ) };
        const joReceipt = await imaTx.payedCall(
            details, ethersProvider,
            "ERC1155", contract, "burn", arrArgumentsBurn,
            joAccount, strActionName,
            gasPrice, estimatedGasBurn, weiHowMuchBurn, opts );
        imaGasUsage.printGasUsageReportFromArray( "BURN ERC1155 ", [ {
            description: "burnErc1155()/burn",
            receipt: joReceipt
        } ], details );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "burnErc1155", true );
        details.close();
        return joReceipt; // can be used as "true" boolean value
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "burnErc1155()", false );
        details.close();
        return false;
    }
}
