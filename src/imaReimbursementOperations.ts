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
 * @file imaReimbursementOperations.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.js";
import * as owaspUtils from "./owaspUtils.js";
import * as imaTx from "./imaTx.js";
import * as imaGasUsage from "./imaGasUsageOperations.js";
import type * as state from "./state.js";

export async function reimbursementShowBalance(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joCommunityPool: owaspUtils.ethersMod.Contract,
    joReceiverMainNet: any,
    strChainNameMainNet: string,
    chainIdMainNet: string,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer,
    strReimbursementChain: string,
    isForcePrintOut: boolean
): Promise<any> {
    const details = log.createMemoryStream();
    let s = "";
    const strLogPrefix = "Gas Reimbursement - Show Balance ";
    try {
        const addressFrom = joReceiverMainNet;
        details.debug( "{p}Querying wallet {}/{} balance...",
            strLogPrefix, strReimbursementChain, addressFrom );
        const xWei = await joCommunityPool.callStatic.getBalance(
            addressFrom, strReimbursementChain, { from: addressFrom } );
        s = strLogPrefix + log.fmtSuccess( "Balance(wei): {}", xWei );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const xEth = owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
        s = strLogPrefix + log.fmtSuccess( "Balance(eth): {}", xEth );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "reimbursementShowBalance", true );
        details.close();
        return xWei;
    } catch ( err ) {
        details.critical( "{p}Payment error in reimbursementShowBalance(): {err}, " +
            "stack is:\n{stack}", strLogPrefix, err, err );
        details.exposeDetailsTo( log.globalStream(), "reimbursementShowBalance", false );
        details.close();
        return 0;
    }
}

export async function reimbursementEstimateAmount(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joCommunityPool: owaspUtils.ethersMod.Contract,
    joReceiverMainNet: any,
    strChainNameMainNet: string,
    chainIdMainNet: string,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer,
    strReimbursementChain: string,
    isForcePrintOut: boolean
): Promise<any> {
    const details = log.createMemoryStream();
    let s = "";
    const strLogPrefix = "Gas Reimbursement - Estimate Amount To Recharge ";
    try {
        details.debug( "{p}Querying wallet {} balance...",
            strLogPrefix, strReimbursementChain );
        const addressReceiver = joReceiverMainNet;
        const xWei =
        await joCommunityPool.callStatic.getBalance(
            addressReceiver, strReimbursementChain, { from: addressReceiver } );
        s = strLogPrefix + log.fmtSuccess( "Balance(wei): {}", xWei );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const xEth = owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
        s = strLogPrefix + log.fmtSuccess( "Balance(eth): {}", xEth );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const minTransactionGas = owaspUtils.parseIntOrHex(
            await joCommunityPool.callStatic.minTransactionGas( { from: addressReceiver } ) );
        s = strLogPrefix + log.fmtSuccess( "MinTransactionGas: {}", minTransactionGas );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        s = strLogPrefix + log.fmtSuccess( "Multiplied Gas Price: {}", gasPrice );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const minAmount = minTransactionGas * gasPrice;
        s = strLogPrefix + log.fmtSuccess( "Minimum recharge balance: {}", minAmount );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        let amountToRecharge = 0;
        if( xWei >= minAmount )
            amountToRecharge = 1;
        else
            amountToRecharge = minAmount - xWei;

        s = strLogPrefix + log.fmtSuccess( "Estimated amount to recharge(wei): {}",
            amountToRecharge );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const amountToRechargeEth =
            owaspUtils.ethersMod.ethers.utils.formatEther(
                owaspUtils.toBN( amountToRecharge.toString() ) );
        s = strLogPrefix + log.fmtSuccess( "Estimated amount to recharge(eth): {}",
            amountToRechargeEth );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log.globalStream(), "reimbursementEstimateAmount", true );
        details.close();
        return amountToRecharge;
    } catch ( err ) {
        details.critical( "{p} Payment error in reimbursementEstimateAmount(): {err}, " +
            "stack is:\n{stack}", strLogPrefix, err, err );
        details.exposeDetailsTo( log.globalStream(), "reimbursementEstimateAmount", false );
        details.close();
        return 0;
    }
}

export async function reimbursementWalletRecharge(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joCommunityPool: owaspUtils.ethersMod.Contract,
    joAccountMN: state.TAccount,
    strChainNameMainNet: string,
    chainIdMainNet: string,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer,
    strReimbursementChain: string,
    nReimbursementRecharge: string | number | null
): Promise<any> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Wallet Recharge ";
    try {
        details.debug( "{p}Recharging wallet {}...",
            strLogPrefix, strReimbursementChain );
        strActionName = "Recharge reimbursement wallet on Main Net";
        const addressReceiver = joAccountMN.address();
        const arrArguments = [ strReimbursementChain, addressReceiver ];
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
            joAccountMN, strActionName, gasPrice, 3000000, nReimbursementRecharge, null );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
            joAccountMN, strActionName, isIgnore,
            gasPrice, estimatedGas, nReimbursementRecharge, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
            joAccountMN, strActionName, gasPrice, estimatedGas, nReimbursementRecharge, null );
        if( joReceipt ) {
            jarrReceipts.push( {
                description: "reimbursementWalletRecharge",
                receipt: joReceipt
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "reimbursementWalletRecharge", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_WALLET_RECHARGE", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "reimbursementWalletRecharge", true );
    details.close();
    return true;
}

export async function reimbursementWalletWithdraw(
    ethersProviderMainNet: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joCommunityPool: owaspUtils.ethersMod.Contract,
    joAccountMN: state.TAccount,
    strChainNameMainNet: string,
    chainIdMainNet: string,
    transactionCustomizerMainNet: imaTx.TransactionCustomizer,
    strReimbursementChain: string,
    nReimbursementWithdraw: string | number | null
): Promise<any> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Wallet Withdraw ";
    try {
        details.debug( "{p}Withdrawing wallet {}...",
            strLogPrefix, strReimbursementChain );
        strActionName = "Withdraw reimbursement wallet";
        const arrArguments = [
            strReimbursementChain,
            owaspUtils.ensureStartsWith0x(
                owaspUtils.toBN( nReimbursementWithdraw ).toHexString() )
        ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerMainNet.computeGas(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
            joAccountMN, strActionName, gasPrice, 3000000, weiHowMuch );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
            joAccountMN, strActionName, isIgnore,
            gasPrice, estimatedGas, weiHowMuch );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt = await imaTx.payedCall(
            details, ethersProviderMainNet,
            "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
            joAccountMN, strActionName,
            gasPrice, estimatedGas, weiHowMuch );
        if( joReceipt ) {
            jarrReceipts.push( {
                description: "reimbursementWalletWithdraw",
                receipt: joReceipt
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "reimbursementWalletWithdraw", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_WALLET_WITHDRAW", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "reimbursementWalletWithdraw", true );
    details.close();
    return true;
}

export async function reimbursementSetRange(
    ethersProviderSChain: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider,
    joCommunityLocker: owaspUtils.ethersMod.Contract,
    joAccountSC: state.TAccount,
    strChainNameSChain: string,
    chainIdSChain: string,
    transactionCustomizerSChain: imaTx.TransactionCustomizer,
    strChainNameOriginChain: string,
    nReimbursementRange: any
): Promise<any> {
    const details = log.createMemoryStream();
    const jarrReceipts: any = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Set Minimal time interval from S2M transfers ";
    try {
        details.debug( "{p}Setting minimal S2M interval to {}...",
            strLogPrefix, nReimbursementRange );
        strActionName = "Set reimbursement range";
        const arrArguments = [
            strChainNameOriginChain,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nReimbursementRange ).toHexString() )
        ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( "{p}Using computed gasPrice={}", strLogPrefix, gasPrice );
        const estimatedGas = await transactionCustomizerSChain.computeGas(
            details, ethersProviderSChain,
            "CommunityLocker", joCommunityLocker, "setTimeLimitPerMessage", arrArguments,
            joAccountSC, strActionName, gasPrice, 3000000, weiHowMuch );
        details.trace( "{p}Using estimated gas={}", strLogPrefix, estimatedGas );
        const isIgnore = false;
        const strErrorOfDryRun = await imaTx.dryRunCall(
            details, ethersProviderSChain,
            "CommunityLocker", joCommunityLocker, "setTimeLimitPerMessage", arrArguments,
            joAccountSC, strActionName, isIgnore, gasPrice, estimatedGas, weiHowMuch );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts: imaTx.TCustomPayedCallOptions = { isCheckTransactionToSchain: true };
        const joReceipt = await imaTx.payedCall(
            details, ethersProviderSChain,
            "CommunityLocker", joCommunityLocker, "setTimeLimitPerMessage", arrArguments,
            joAccountSC, strActionName, gasPrice, estimatedGas, weiHowMuch, opts );
        if( joReceipt ) {
            jarrReceipts.push( {
                description: "reimbursementSetRange",
                receipt: joReceipt
            } );
        }
    } catch ( err ) {
        details.critical( "{p}Payment error in {bright}: {err}, stack is:\n{stack}",
            strLogPrefix, strActionName, err, err );
        details.exposeDetailsTo( log.globalStream(), "reimbursementSetRange", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_SET_RANGE", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log.globalStream(), "reimbursementSetRange", true );
    details.close();
    return true;
}
