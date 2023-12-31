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
 * @file imaEthOperations.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";
import * as imaEventLogScan from "./imaEventLogScan.mjs";
import * as threadInfo from "./threadInfo.mjs";

export async function getBalanceEth(
    isMainNet,
    ethersProvider,
    chainId,
    joAccount,
    contractERC20
) {
    const strLogPrefix = "getBalanceEth() call ";
    try {
        if( ! ( ethersProvider && joAccount ) )
            return "<no-data>";
        const strAddress = joAccount.address();
        if( ( !isMainNet ) && contractERC20 ) {
            const balance =
                await contractERC20.callStatic.balanceOf( strAddress, { from: strAddress } );
            return balance;
        }
        const balance = await ethersProvider.getBalance( strAddress );
        return balance;
    } catch ( err ) {
        log.error( "{p}balance fetching error details: {err}, stack is:\n{stack}",
            strLogPrefix, err, err.stack );
    }
    return "<no-data-or-error>";
}

// transfer money from main-net to S-chain
// main-net.DepositBox call: function deposit(string schainName, address to) public payable
// Where:
//   schainName...obvious
//   to.........address in S-chain
// Notice:
//   this function is available for everyone in main-net
//   money is sent from caller
//   "value" JSON arg is used to specify amount of money to sent
export async function doEthPaymentFromMainNet(
    ethersProviderMainNet,
    chainIdMainNet,
    joAccountSrc,
    joAccountDst,
    joDepositBox,
    joMessageProxyMainNet, // for checking logs
    chainIdSChain,
    weiHowMuch, // how much WEI money to send
    transactionCustomizerMainNet
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "M2S ETH Payment: ";
    try {
        details.debug( "{p}Doing payment from mainnet with chainIdSChain={}...",
            strLogPrefix, chainIdSChain );
        strActionName = "ETH payment from Main Net, deposit";
        const arrArguments = [
            chainIdSChain
        ];
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "DepositBox", joDepositBox, "deposit", arrArguments,
            joAccountSrc, strActionName,
            gasPrice, 3000000, weiHowMuch );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "DepositBox", joDepositBox, "deposit", arrArguments,
            joAccountSrc, strActionName, isIgnore,
            gasPrice, estimatedGas, weiHowMuch );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "DepositBox", joDepositBox, "deposit", arrArguments,
            joAccountSrc, strActionName,
            gasPrice, estimatedGas, weiHowMuch );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "doEthPaymentFromMainNet",
                "receipt": joReceipt
            } );
        }

        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxyMainNet ) {
            details.debug( "{p}Verifying the {} event of the ", "MessageProxy/{} contract ...",
                strLogPrefix, strEventName, joMessageProxyMainNet.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderMainNet, joMessageProxyMainNet, strEventName,
                joReceipt.blockNumber, joReceipt.transactionHash,
                joMessageProxyMainNet.filters[strEventName]()
            );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{} contract, " +
                    "found event(s): {}", strLogPrefix, strEventName,
                    joMessageProxyMainNet.address, joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxyMainNet.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err.stack );
        details.exposeDetailsTo( log, "doEthPaymentFromMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray( "ETH PAYMENT FROM MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "doEthPaymentFromMainNet", true );
    details.close();
    return true;
}

// transfer money from S-chain to main-net
// S-chain.TokenManager call: function exitToMain(address to) public payable
// Where:
//   to.........address in main-net
// Notice:
//   this function is available for everyone in S-chain
//   money is sent from caller
//   "value" JSON arg is used to specify amount of money to sent
export async function doEthPaymentFromSChain(
    ethersProviderSChain,
    chainIdSChain,
    joAccountSrc,
    joAccountDst,
    joTokenManagerETH,
    joMessageProxySChain, // for checking logs
    weiHowMuch, // how much WEI money to send
    transactionCustomizerSChain
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "S2M ETH Payment: ";
    try {
        strActionName = "ETH payment from S-Chain, exitToMain";
        const arrArguments = [
            owaspUtils.toBN( weiHowMuch )
        ];
        const gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "TokenManagerETH", joTokenManagerETH, "exitToMain", arrArguments,
            joAccountSrc, strActionName,
            gasPrice, 6000000, 0, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = true;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "TokenManagerETH", joTokenManagerETH, "exitToMain", arrArguments,
            joAccountSrc, strActionName, isIgnore,
            gasPrice, estimatedGas, 0, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts = {
            isCheckTransactionToSchain: true
        };
        const joReceipt = await imaTx.payedCall(
            details, ethersProviderSChain,
            "TokenManagerETH", joTokenManagerETH, "exitToMain", arrArguments,
            joAccountSrc, strActionName,
            gasPrice, estimatedGas, 0, opts );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "doEthPaymentFromSChain",
                "receipt": joReceipt
            } );
        }

        // Must-have event(s) analysis as indicator(s) of success
        const strEventName = "OutgoingMessage";
        if( joMessageProxySChain ) {
            details.debug( "{p}Verifying the {} event of the MessageProxy/{} contract ...",
                strLogPrefix, strEventName, joMessageProxySChain.address );
            await threadInfo.sleep(
                imaHelperAPIs.getMillisecondsSleepBeforeFetchOutgoingMessageEvent() );
            const joEvents = await imaEventLogScan.getContractCallEvents(
                details, strLogPrefix,
                ethersProviderSChain, joMessageProxySChain, strEventName,
                joReceipt.blockNumber, joReceipt.transactionHash,
                joMessageProxySChain.filters[strEventName]()
            );
            if( joEvents.length > 0 ) {
                details.success(
                    "{p}Success, verified the {} event of the MessageProxy/{} contract, " +
                    "found event(s): {}", strLogPrefix, strEventName, joMessageProxySChain.address,
                    joEvents );
            } else {
                throw new Error( "Verification failed for the OutgoingMessage event of the " +
                    `MessageProxy ${joMessageProxySChain.address} contract, no events found` );
            }
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err.stack );
        details.exposeDetailsTo( log, "doEthPaymentFromSChain", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray( "ETH PAYMENT FROM S-CHAIN", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "doEthPaymentFromSChain", true );
    details.close();
    return true;
}

export async function receiveEthPaymentFromSchainOnMainNet(
    ethersProviderMainNet,
    chainIdMainNet,
    joAccountMN,
    joDepositBoxETH,
    transactionCustomizerMainNet
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "M2S ETH Receive: ";
    try {
        strActionName = "Receive ETH payment from S-Chain on Main Met, getMyEth";
        const arrArguments = [];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "DepositBoxETH", joDepositBoxETH, "getMyEth", arrArguments,
            joAccountMN, strActionName,
            gasPrice, 3000000, weiHowMuch );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "DepositBoxETH", joDepositBoxETH,
            "getMyEth", arrArguments,
            joAccountMN, strActionName, isIgnore,
            gasPrice, estimatedGas, weiHowMuch );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "DepositBoxETH", joDepositBoxETH,
            "getMyEth", arrArguments,
            joAccountMN, strActionName,
            gasPrice, estimatedGas, weiHowMuch );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "receiveEthPaymentFromSchainOnMainNet",
                "receipt": joReceipt
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Receive payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err.stack );
        details.exposeDetailsTo( log, "receiveEthPaymentFromSchainOnMainNet", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray( "RECEIVE ETH ON MAIN NET", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "receiveEthPaymentFromSchainOnMainNet", true );
    details.close();
    return true;
}

export async function viewEthPaymentFromSchainOnMainNet(
    ethersProviderMainNet,
    joAccountMN,
    joDepositBoxETH
) {
    const details = log.createMemoryStream();
    const strActionName = "";
    const strLogPrefix = "S ETH View: ";
    try {
        if( ! ( ethersProviderMainNet && joAccountMN && joDepositBoxETH ) )
            return null;
        const addressFrom = joAccountMN.address();
        const xWei =
            await joDepositBoxETH.callStatic.approveTransfers(
                addressFrom,
                { from: addressFrom } );
        details.success( "{p}You can receive(wei): {}", strLogPrefix, xWei );
        const xEth = owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
        details.success( "{p}You can receive(eth): {}", strLogPrefix, xEth );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log, "viewEthPaymentFromSchainOnMainNet", true );
        details.close();
        return xWei;
    } catch ( err ) {
        details.critical( "{p}View payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err.stack );
        details.exposeDetailsTo( log, "viewEthPaymentFromSchainOnMainNet", false );
        details.close();
        return null;
    }
}
