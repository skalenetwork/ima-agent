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
 * @file imaReimbursementOperations.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaTx from "./imaTx.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";

export async function reimbursementShowBalance(
    ethersProviderMainNet,
    joCommunityPool,
    joReceiverMainNet,
    strChainNameMainNet,
    chainIdMainNet,
    transactionCustomizerMainNet,
    strReimbursementChain,
    isForcePrintOut
) {
    const details = log.createMemoryStream();
    let s = "";
    const strLogPrefix = "Gas Reimbursement - Show Balance ";
    try {
        const addressFrom = joReceiverMainNet;
        details.debug( strLogPrefix, "Querying wallet ", log.v( strReimbursementChain ), "/",
            log.v( addressFrom ), " balance..." );
        const xWei =
            await joCommunityPool.callStatic.getBalance(
                addressFrom, strReimbursementChain, { from: addressFrom } );
        s = strLogPrefix + log.fmtSuccess( "Balance(wei): ", log.v( xWei ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const xEth = owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
        s = strLogPrefix + log.fmtSuccess( "Balance(eth): ", log.v( xEth ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log, "reimbursementShowBalance", true );
        details.close();
        return xWei;
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( strLogPrefix, "Payment error in reimbursementShowBalance(): ",
                log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        }
        details.critical( strLogPrefix, "Payment error in reimbursementShowBalance(): ",
            log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "reimbursementShowBalance", false );
        details.close();
        return 0;
    }
}

export async function reimbursementEstimateAmount(
    ethersProviderMainNet,
    joCommunityPool,
    joReceiverMainNet,
    strChainNameMainNet,
    chainIdMainNet,
    transactionCustomizerMainNet,
    strReimbursementChain,
    isForcePrintOut
) {
    const details = log.createMemoryStream();
    let s = "";
    const strLogPrefix = "Gas Reimbursement - Estimate Amount To Recharge ";
    try {
        details.debug( strLogPrefix, "Querying wallet ",
            log.v( strReimbursementChain ), " balance..." );
        const addressReceiver = joReceiverMainNet;
        const xWei =
        await joCommunityPool.callStatic.getBalance(
            addressReceiver, strReimbursementChain, { from: addressReceiver } );
        s = strLogPrefix + log.fmtSuccess( "Balance(wei): ", log.v( xWei ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const xEth = owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
        s = strLogPrefix + log.fmtSuccess( "Balance(eth): ", log.v( xEth ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );
        const minTransactionGas =
            owaspUtils.parseIntOrHex(
                await joCommunityPool.callStatic.minTransactionGas(
                    { from: addressReceiver } ) );
        s = strLogPrefix + log.fmtSuccess( "MinTransactionGas: ", log.v( minTransactionGas ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        s = strLogPrefix + log.fmtSuccess( "Multiplied Gas Price: ", log.v( gasPrice ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const minAmount = minTransactionGas * gasPrice;
        s = strLogPrefix + log.fmtSuccess( "Minimum recharge balance: ", log.v( minAmount ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        let amountToRecharge = 0;
        if( xWei >= minAmount )
            amountToRecharge = 1;
        else
            amountToRecharge = minAmount - xWei;

        s = strLogPrefix + log.fmtSuccess( "Estimated amount to recharge(wei): ",
            log.v( amountToRecharge ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        const amountToRechargeEth =
            owaspUtils.ethersMod.ethers.utils.formatEther(
                owaspUtils.toBN( amountToRecharge.toString() ) );
        s = strLogPrefix + log.fmtSuccess( "Estimated amount to recharge(eth): ",
            log.v( amountToRechargeEth ) );
        if( isForcePrintOut )
            log.information( s );
        details.information( s );

        if( log.exposeDetailsGet() )
            details.exposeDetailsTo( log, "reimbursementEstimateAmount", true );
        details.close();
        return amountToRecharge;
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( strLogPrefix, " Payment error in reimbursementEstimateAmount(): ",
                log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        }
        details.critical( strLogPrefix, " Payment error in reimbursementEstimateAmount(): ",
            log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "reimbursementEstimateAmount", false );
        details.close();
        return 0;
    }
}

export async function reimbursementWalletRecharge(
    ethersProviderMainNet,
    joCommunityPool,
    joAccountMN,
    strChainNameMainNet,
    chainIdMainNet,
    transactionCustomizerMainNet,
    strReimbursementChain,
    nReimbursementRecharge
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Wallet Recharge ";
    try {
        details.debug( strLogPrefix, "Recharging wallet ",
            log.v( strReimbursementChain ), "..." );
        strActionName = "Recharge reimbursement wallet on Main Net";
        const addressReceiver = joAccountMN.address();
        const arrArguments = [
            strReimbursementChain,
            addressReceiver
        ];
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( strLogPrefix, "Using computed gasPrice=", log.v( gasPrice ) );
        const estimatedGas =
            await transactionCustomizerMainNet.computeGas(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
                joAccountMN, strActionName,
                gasPrice, 3000000, nReimbursementRecharge, null );
        details.trace( strLogPrefix, "Using estimated gas=", log.v( estimatedGas ) );
        const isIgnore = false;
        const strErrorOfDryRun =
            await imaTx.dryRunCall(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
                joAccountMN, strActionName, isIgnore,
                gasPrice, estimatedGas, nReimbursementRecharge, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt =
            await imaTx.payedCall(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "rechargeUserWallet", arrArguments,
                joAccountMN, strActionName,
                gasPrice, estimatedGas, nReimbursementRecharge, null );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "reimbursementWalletRecharge",
                "receipt": joReceipt
            } );
        }
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( strLogPrefix, " Payment error in ", strActionName, ": ",
                log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        }
        details.critical( strLogPrefix, " Payment error in ", strActionName, ": ",
            log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "reimbursementWalletRecharge", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_WALLET_RECHARGE", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "reimbursementWalletRecharge", true );
    details.close();
    return true;
}

export async function reimbursementWalletWithdraw(
    ethersProviderMainNet,
    joCommunityPool,
    joAccountMN,
    strChainNameMainNet,
    chainIdMainNet,
    transactionCustomizerMainNet,
    strReimbursementChain,
    nReimbursementWithdraw
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Wallet Withdraw ";
    try {
        details.debug( strLogPrefix, "Withdrawing wallet ",
            log.v( strReimbursementChain ), "..." );
        strActionName = "Withdraw reimbursement wallet";
        const arrArguments = [
            strReimbursementChain,
            owaspUtils.ensureStartsWith0x(
                owaspUtils.toBN( nReimbursementWithdraw ).toHexString() )
        ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerMainNet.computeGasPrice(
            ethersProviderMainNet, 200000000000 );
        details.trace( strLogPrefix, "Using computed gasPrice=", log.v( gasPrice ) );
        const estimatedGas =
            await transactionCustomizerMainNet.computeGas(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
                joAccountMN, strActionName,
                gasPrice, 3000000, weiHowMuch, null );
        details.trace( strLogPrefix, "Using estimated gas=", log.v( estimatedGas ) );
        const isIgnore = false;
        const strErrorOfDryRun =
            await imaTx.dryRunCall(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
                joAccountMN, strActionName, isIgnore,
                gasPrice, estimatedGas, weiHowMuch, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const joReceipt =
            await imaTx.payedCall(
                details, ethersProviderMainNet,
                "CommunityPool", joCommunityPool, "withdrawFunds", arrArguments,
                joAccountMN, strActionName,
                gasPrice, estimatedGas, weiHowMuch, null );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "reimbursementWalletWithdraw",
                "receipt": joReceipt
            } );
        }
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( strLogPrefix, "Payment error in ", strActionName, ": ",
                log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        }
        details.critical( strLogPrefix, "Payment error in ", strActionName, ": ",
            log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "reimbursementWalletWithdraw", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_WALLET_WITHDRAW", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "reimbursementWalletWithdraw", true );
    details.close();
    return true;
}

export async function reimbursementSetRange(
    ethersProviderSChain,
    joCommunityLocker,
    joAccountSC,
    strChainNameSChain,
    chainIdSChain,
    transactionCustomizerSChain,
    strChainNameOriginChain,
    nReimbursementRange
) {
    const details = log.createMemoryStream();
    const jarrReceipts = [];
    let strActionName = "";
    const strLogPrefix = "Gas Reimbursement - Set Minimal time interval from S2M transfers ";
    try {
        details.debug( strLogPrefix, "Setting minimal S2M interval to ",
            log.v( nReimbursementRange ), "..." );
        strActionName = "Set reimbursement range";
        const arrArguments = [
            strChainNameOriginChain,
            owaspUtils.ensureStartsWith0x( owaspUtils.toBN( nReimbursementRange ).toHexString() )
        ];
        const weiHowMuch = undefined;
        const gasPrice = await transactionCustomizerSChain.computeGasPrice(
            ethersProviderSChain, 200000000000 );
        details.trace( strLogPrefix, "Using computed gasPrice=", log.v( gasPrice ) );
        const estimatedGas =
            await transactionCustomizerSChain.computeGas(
                details, ethersProviderSChain,
                "CommunityLocker", joCommunityLocker,
                "setTimeLimitPerMessage", arrArguments,
                joAccountSC, strActionName,
                gasPrice, 3000000, weiHowMuch, null );
        details.trace( strLogPrefix, "Using estimated gas=", log.v( estimatedGas ) );
        const isIgnore = false;
        const strErrorOfDryRun =
            await imaTx.dryRunCall(
                details, ethersProviderSChain,
                "CommunityLocker", joCommunityLocker,
                "setTimeLimitPerMessage", arrArguments,
                joAccountSC, strActionName, isIgnore,
                gasPrice, estimatedGas, weiHowMuch, null );
        if( strErrorOfDryRun )
            throw new Error( strErrorOfDryRun );

        const opts = {
            isCheckTransactionToSchain: true
        };
        const joReceipt =
            await imaTx.payedCall(
                details, ethersProviderSChain,
                "CommunityLocker", joCommunityLocker,
                "setTimeLimitPerMessage", arrArguments,
                joAccountSC, strActionName,
                gasPrice, estimatedGas, weiHowMuch, opts );
        if( joReceipt && typeof joReceipt == "object" ) {
            jarrReceipts.push( {
                "description": "reimbursementSetRange",
                "receipt": joReceipt
            } );
        }
    } catch ( err ) {
        const strError = owaspUtils.extractErrorMessage( err );
        if( log.id != details.id ) {
            log.critical( strLogPrefix, " Payment error in ", strActionName, ": ",
                log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        }
        details.critical( strLogPrefix, " Payment error in ", strActionName, ": ",
            log.em( strError ), ", stack is: ", "\n", log.s( err.stack ) );
        details.exposeDetailsTo( log, "reimbursementSetRange", false );
        details.close();
        return false;
    }
    imaGasUsage.printGasUsageReportFromArray(
        "REIMBURSEMENT_SET_RANGE", jarrReceipts, details );
    if( log.exposeDetailsGet() )
        details.exposeDetailsTo( log, "reimbursementSetRange", true );
    details.close();
    return true;
}
