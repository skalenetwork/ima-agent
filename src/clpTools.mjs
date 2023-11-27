// SPDX-License-Identifier: AGPL-3.0-only

/**
 * @license
 * SKALE IMA
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * @file clpTools.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as owaspUtils from "./owaspUtils.mjs";
import * as log from "./log.mjs";
import * as imaCLI from "./cli.mjs";
import * as rpcCall from "./rpcCall.mjs";
import * as state from "./state.mjs";
import * as IMA from "./imaCore.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaGasUsage from "./imaGasUsageOperations.mjs";
import * as imaReimbursement from "./imaReimbursementOperations.mjs";
import * as imaReg from "./imaRegistrationOperations.mjs";
import * as imaEth from "./imaEthOperations.mjs";
import * as imaToken from "./imaTokenOperations.mjs";
import * as skaleObserver from "./observer.mjs";
import * as discoveryTools from "./discoveryTools.mjs";
import * as loop from "./loop.mjs";
import * as imaUtils from "./utils.mjs";
import * as imaBLS from "./bls.mjs";

export async function registerAll( isPrintSummaryRegistrationCosts ) {
    if( !await registerStep1( false ) )
        return false;
    if( isPrintSummaryRegistrationCosts )
        printSummaryRegistrationCosts();
    return true;
}

export async function checkRegistrationAll() {
    const b1 = await checkRegistrationStep1();
    return b1;
}

const gInfoRegistrationCost = {
    mn: [],
    sc: []
};

export async function registerStep1( isPrintSummaryRegistrationCosts ) {
    const imaState = state.get();
    imaCLI.initContracts();
    const strLogPrefix = "Reg 1: ";
    log.information( "{p}Will check chain registration now...", strLogPrefix );
    let bSuccess = await imaReg.checkIsRegisteredSChainInDepositBoxes( // step 1
        imaState.chainProperties.mn.ethersProvider,
        imaState.joLinker,
        imaState.chainProperties.mn.joAccount,
        imaState.chainProperties.sc.strChainName
    );
    log.information( "{p}Chain is {}", strLogPrefix,
        log.posNeg( bSuccess, "already registered", "not registered yet" ) );
    if( bSuccess )
        return true;
    const jarrReceipts =
        await imaReg.registerSChainInDepositBoxes( // step 1
            imaState.chainProperties.mn.ethersProvider,
            imaState.joLinker,
            imaState.chainProperties.mn.joAccount,
            imaState.joTokenManagerETH, // only s-chain
            imaState.joTokenManagerERC20, // only s-chain
            imaState.joTokenManagerERC721, // only s-chain
            imaState.joTokenManagerERC1155, // only s-chain
            imaState.joTokenManagerERC721WithMetadata, // only s-chain
            imaState.joCommunityLocker, // only s-chain
            imaState.joTokenManagerLinker, // only s-chain
            imaState.chainProperties.sc.strChainName,
            imaState.chainProperties.mn.chainId,
            imaState.chainProperties.mn.transactionCustomizer //,
        );
    bSuccess = ( jarrReceipts != null && jarrReceipts.length > 0 ) ? true : false;
    log.information( "{p}Chain was {}", strLogPrefix,
        log.posNeg( bSuccess, "registered successfully", "not registered" ) );
    if( bSuccess ) {
        gInfoRegistrationCost.mn =
            gInfoRegistrationCost.mn.concat( gInfoRegistrationCost.mn, jarrReceipts );
    }
    if( isPrintSummaryRegistrationCosts )
        clpTools.printSummaryRegistrationCosts();
    if( !bSuccess ) {
        const nRetCode = 163;
        log.fatal( "{p}failed to register S-Chain in deposit box, will return code {}",
            strLogPrefix, nRetCode );
        process.exit( nRetCode );
    }
    return true;
}

export async function checkRegistrationStep1() {
    const imaState = state.get();
    imaCLI.initContracts();
    const bRetVal = await imaReg.checkIsRegisteredSChainInDepositBoxes( // step 1
        imaState.chainProperties.mn.ethersProvider,
        imaState.joLinker,
        imaState.chainProperties.mn.joAccount,
        imaState.chainProperties.sc.strChainName
    );
    return bRetVal;
}

export function printSummaryRegistrationCosts( details ) {
    imaGasUsage.printGasUsageReportFromArray(
        "Main Net REGISTRATION", gInfoRegistrationCost.mn, details );
    imaGasUsage.printGasUsageReportFromArray(
        "S-Chain REGISTRATION", gInfoRegistrationCost.sc, details );
}

export function commandLineTaskRegister() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Full registration(all steps)",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // registerAll
            return await registerAll( true );
        }
    } );
}

export function commandLineTaskRegister1() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Registration step 1, register S-Chain in deposit box",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // registerStep1
            return await registerStep1( true );
        }
    } );
}

export function commandLineTaskCheckRegistration() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Full registration status check(all steps)",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // checkRegistrationAll
            const b = await checkRegistrationAll();
            // nExitCode is: 0 - OKay - registered; non-zero -  not registered or error
            const nExitCode = b ? 0 : 150;
            log.notice( "Exiting with code {}", nExitCode );
            process.exit( nExitCode );
        }
    } );
}

export function commandLineTaskCheckRegistration1() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Registration status check step 1, register S-Chain in deposit box",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // checkRegistrationStep1
            const b = await checkRegistrationStep1();
            // nExitCode is: 0 - OKay - registered; non-zero -  not registered or error
            const nExitCode = b ? 0 : 152;
            log.notice( "Exiting with code {}", nExitCode );
            process.exit( nExitCode );
        }
    } );
}

export function commandLineTaskMintErc20() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "mint ERC20",
        "fn": async function() {
            let bMintIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
                try {
                    const strAddressMintTo = // same as caller/transaction signer
                        imaState.chainProperties.tc.joAccount.address();
                    bMintIsOK =
                        await imaToken.mintErc20(
                            imaState.chainProperties.tc.ethersProvider,
                            imaState.chainProperties.tc.chainId,
                            imaState.chainProperties.tc.strChainName,
                            imaState.chainProperties.tc.joAccount,
                            strAddressMintTo,
                            imaState.nAmountOfToken,
                            imaState.chainProperties.tc.joErc20[imaState.chainProperties
                                .tc.strCoinNameErc20 + "_address"],
                            imaState.chainProperties.tc.joErc20[imaState.chainProperties
                                .tc.strCoinNameErc20 + "_abi"],
                            imaState.chainProperties.tc.transactionCustomizer
                        ) ? true : false;
                } catch ( err ) {
                    bMintIsOK = false;
                }
            }
            return bMintIsOK;
        }
    } );
}

export function commandLineTaskMintErc721() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "mint ERC721",
        "fn": async function() {
            let bMintIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc721.length > 0 ) {
                try {
                    const strAddressMintTo = // same as caller/transaction signer
                        imaState.chainProperties.tc.joAccount.address();
                    const idTokens = imaState.haveArrayOfTokenIdentifiers ? imaState.idTokens : [];
                    if( imaState.haveOneTokenIdentifier )
                        idTokens.push( imaState.idToken );
                    if( idTokens.length > 0 ) {
                        for( let i = 0; i < idTokens.length; ++ i ) {
                            const idToken = idTokens[i];
                            bMintIsOK =
                                await imaToken.mintErc721(
                                    imaState.chainProperties.tc.ethersProvider,
                                    imaState.chainProperties.tc.chainId,
                                    imaState.chainProperties.tc.strChainName,
                                    imaState.chainProperties.tc.joAccount,
                                    strAddressMintTo,
                                    idToken,
                                    imaState.chainProperties.tc.joErc721[imaState
                                        .chainProperties.tc.strCoinNameErc721 + "_address"],
                                    imaState.chainProperties.tc.joErc721[imaState
                                        .chainProperties.tc.strCoinNameErc721 + "_abi"],
                                    imaState.chainProperties.tc.transactionCustomizer
                                ) ? true : false;
                        }
                    }
                } catch ( err ) {
                    bMintIsOK = false;
                }
            }
            return bMintIsOK;
        }
    } );
}

export function commandLineTaskMintErc1155() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "mint ERC1155",
        "fn": async function() {
            let bMintIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc1155.length > 0 ) {
                try {
                    const strAddressMintTo = // same as caller/transaction signer
                        imaState.chainProperties.tc.joAccount.address();
                    const idTokens = imaState.haveArrayOfTokenIdentifiers ? imaState.idTokens : [];
                    if( imaState.haveOneTokenIdentifier )
                        idTokens.push( imaState.idToken );
                    if( idTokens.length > 0 ) {
                        for( let i = 0; i < idTokens.length; ++ i ) {
                            const idToken = idTokens[i];
                            bMintIsOK =
                                await imaToken.mintErc1155(
                                    imaState.chainProperties.tc.ethersProvider,
                                    imaState.chainProperties.tc.chainId,
                                    imaState.chainProperties.tc.strChainName,
                                    imaState.chainProperties.tc.joAccount,
                                    strAddressMintTo,
                                    idToken,
                                    imaState.nAmountOfToken,
                                    imaState.chainProperties.tc
                                        .joErc1155[imaState.chainProperties.tc
                                            .strCoinNameErc1155 + "_address"],
                                    imaState.chainProperties.tc
                                        .joErc1155[imaState.chainProperties.tc
                                            .strCoinNameErc1155 + "_abi"],
                                    imaState.chainProperties.tc.transactionCustomizer
                                ) ? true : false;
                        }
                    }
                } catch ( err ) {
                    bMintIsOK = false;
                }
            }
            return bMintIsOK;
        }
    } );
}

export function commandLineTaskBurnErc20() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "burn ERC20",
        "fn": async function() {
            let bBurnIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
                try {
                    const strAddressBurnFrom = // same as caller/transaction signer
                        imaState.chainProperties.tc.joAccount.address();
                    bBurnIsOK =
                        await imaToken.burnErc20(
                            imaState.chainProperties.tc.ethersProvider,
                            imaState.chainProperties.tc.chainId,
                            imaState.chainProperties.tc.strChainName,
                            imaState.chainProperties.tc.joAccount,
                            strAddressBurnFrom,
                            imaState.nAmountOfToken,
                            imaState.chainProperties.tc
                                .joErc20[imaState.chainProperties
                                    .tc.strCoinNameErc20 + "_address"],
                            imaState.chainProperties.tc
                                .joErc20[imaState.chainProperties
                                    .tc.strCoinNameErc20 + "_abi"],
                            imaState.chainProperties.tc.transactionCustomizer
                        ) ? true : false;
                } catch ( err ) {
                    bBurnIsOK = false;
                }
            }
            return bBurnIsOK;
        }
    } );
}

export function commandLineTaskBurnErc721() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "burn ERC721",
        "fn": async function() {
            let bBurnIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc721.length > 0 ) {
                try {
                    const idTokens = imaState.haveArrayOfTokenIdentifiers ? imaState.idTokens : [];
                    if( imaState.haveOneTokenIdentifier )
                        idTokens.push( imaState.idToken );
                    if( idTokens.length > 0 ) {
                        for( let i = 0; i < idTokens.length; ++ i ) {
                            const idToken = idTokens[i];
                            bBurnIsOK =
                                await imaToken.burnErc721(
                                    imaState.chainProperties.tc.ethersProvider,
                                    imaState.chainProperties.tc.chainId,
                                    imaState.chainProperties.tc.strChainName,
                                    imaState.chainProperties.tc.joAccount,
                                    idToken,
                                    imaState.chainProperties.tc
                                        .joErc721[imaState.chainProperties
                                            .tc.strCoinNameErc721 + "_address"],
                                    imaState.chainProperties.tc
                                        .oErc721[imaState.chainProperties
                                            .tc.strCoinNameErc721 + "_abi"],
                                    imaState.chainProperties.tc.transactionCustomizer
                                ) ? true : false;
                        }
                    }
                } catch ( err ) {
                    bBurnIsOK = false;
                }
            }
            return bBurnIsOK;
        }
    } );
}

export function commandLineTaskBurnErc1155() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "burn ERC1155",
        "fn": async function() {
            let bBurnIsOK = false;
            if( imaState.chainProperties.tc.strCoinNameErc1155.length > 0 ) {
                try {
                    const strAddressBurnFrom = // same as caller/transaction signer
                        imaState.chainProperties.tc.joAccount.address();
                    const idTokens = imaState.haveArrayOfTokenIdentifiers ? imaState.idTokens : [];
                    if( imaState.haveOneTokenIdentifier )
                        idTokens.push( imaState.idToken );
                    if( idTokens.length > 0 ) {
                        for( let i = 0; i < idTokens.length; ++ i ) {
                            const idToken = idTokens[i];
                            bBurnIsOK =
                                await imaToken.burnErc1155(
                                    imaState.chainProperties.tc.ethersProvider,
                                    imaState.chainProperties.tc.chainId,
                                    imaState.chainProperties.tc.strChainName,
                                    imaState.chainProperties.tc.joAccount,
                                    strAddressBurnFrom,
                                    idToken,
                                    imaState.nAmountOfToken,
                                    imaState.chainProperties.tc
                                        .joErc1155[imaState.chainProperties
                                            .tc.strCoinNameErc1155 + "_address"],
                                    imaState.chainProperties.tc
                                        .joErc1155[imaState.chainProperties
                                            .tc.strCoinNameErc1155 + "_abi"],
                                    imaState.chainProperties.tc.transactionCustomizer
                                ) ? true : false;
                        }
                    }
                } catch ( err ) {
                    bBurnIsOK = false;
                }
            }
            return bBurnIsOK;
        }
    } );
}

export async function commandLineTaskShowBalanceEth(
    arrBalancesMN, arrBalancesSC, arrBalancesTC
) {
    const imaState = state.get();
    let assetAddress = null;
    if( imaState.chainProperties.mn.ethersProvider ) {
        arrBalancesMN.push( {
            "assetName": "RealETH",
            "balance": await imaEth.getBalanceEth( true, // isMainNet
                imaState.chainProperties.mn.ethersProvider,
                imaState.chainProperties.mn.chainId, imaState.chainProperties.mn.joAccount )
        } );
        arrBalancesMN.push( {
            "assetName": "CanReceiveETH",
            "balance": await imaEth.viewEthPaymentFromSchainOnMainNet(
                imaState.chainProperties.mn.ethersProvider,
                imaState.chainProperties.mn.joAccount, imaState.joDepositBoxETH )
        } );
    }
    try {
        assetAddress = imaState.joEthErc20.address;
    } catch ( err ) {
        assetAddress = null;
    }
    if( imaState.chainProperties.sc.ethersProvider ) {
        arrBalancesSC.push( {
            "assetName": "S-Chain Real ETH as ERC20",
            "assetAddress": assetAddress,
            "balance": await imaEth.getBalanceEth( false, // isMainNet
                imaState.chainProperties.sc.ethersProvider, imaState.chainProperties.sc.chainId,
                imaState.chainProperties.sc.joAccount, imaState.joEthErc20 )
        } );
        arrBalancesSC.push( {
            "assetName": "S-Chain ETH Fuel",
            "balance": await imaEth.getBalanceEth( true, // isMainNet=true here, but we call S-Chain
                imaState.chainProperties.sc.ethersProvider,
                imaState.chainProperties.sc.chainId, imaState.chainProperties.sc.joAccount )
        } );
    }
    if( imaState.chainProperties.tc.ethersProvider ) {
        arrBalancesSC.push( {
            "assetName": "Target S-Chain Real ETH as ERC20",
            "assetAddress": assetAddress,
            "balance": await imaEth.getBalanceEth( false, // isMainNet
                imaState.chainProperties.tc.ethersProvider, imaState.chainProperties.sc.chainId,
                imaState.chainProperties.tc.joAccount, imaState.joEthErc20 )
        } );
        arrBalancesTC.push( {
            "assetName": "Target S-Chain ETH Fuel",
            "balance": await imaEth.getBalanceEth( true, // isMainNet=true here, but we call S-Chain
                imaState.chainProperties.tc.ethersProvider,
                imaState.chainProperties.tc.chainId, imaState.chainProperties.tc.joAccount )
        } );
    }
}

export async function commandLineTaskShowBalanceErc20(
    arrBalancesMN, arrBalancesSC, arrBalancesTC
) {
    const imaState = state.get();
    let assetAddress = null;
    if( imaState.chainProperties.mn.ethersProvider &&
        imaState.chainProperties.mn.strCoinNameErc20.length > 0
    ) {
        try {
            assetAddress = imaState.chainProperties.mn.joErc20[
                imaState.chainProperties.mn.strCoinNameErc20 + "_address"];
        } catch ( err ) { assetAddress = null; }
        arrBalancesMN.push( {
            "assetName": "ERC20",
            "assetAddress": assetAddress,
            "balance": await imaToken.getBalanceErc20( true, // isMainNet
                imaState.chainProperties.mn.ethersProvider, imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.mn.strCoinNameErc20,
                imaState.chainProperties.mn.joErc20 )
        } );
    }
    if( imaState.chainProperties.sc.ethersProvider &&
        imaState.chainProperties.sc.strCoinNameErc20.length > 0
    ) {
        try {
            assetAddress = imaState.chainProperties.sc.joErc20[
                imaState.chainProperties.sc.strCoinNameErc20 + "_address"];
        } catch ( err ) { assetAddress = null; }
        arrBalancesSC.push( {
            "assetName": "ERC20",
            "assetAddress": assetAddress,
            "balance": await imaToken.getBalanceErc20( false, // isMainNet
                imaState.chainProperties.sc.ethersProvider, imaState.chainProperties.sc.chainId,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.sc.strCoinNameErc20,
                imaState.chainProperties.sc.joErc20 )
        } );
    }
    if( imaState.chainProperties.tc.ethersProvider &&
        imaState.chainProperties.tc.strCoinNameErc20.length > 0
    ) {
        try {
            assetAddress = imaState.chainProperties.tc.joErc20[
                imaState.chainProperties.tc.strCoinNameErc20 + "_address"];
        } catch ( err ) { assetAddress = null; }
        arrBalancesTC.push( {
            "assetName": "ERC20",
            "assetAddress": assetAddress,
            "balance": await imaToken.getBalanceErc20( true, // isMainNet
                imaState.chainProperties.tc.ethersProvider, imaState.chainProperties.mn.chainId,
                imaState.chainProperties.tc.joAccount,
                imaState.chainProperties.tc.strCoinNameErc20,
                imaState.chainProperties.tc.joErc20 )
        } );
    }
}

export async function commandLineTaskShowBalanceErc721(
    arrBalancesMN, arrBalancesSC, arrBalancesTC, idTokens
) {
    const imaState = state.get();
    let assetAddress = null;
    if( imaState.chainProperties.mn.ethersProvider &&
        imaState.chainProperties.mn.strCoinNameErc721.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.mn.joErc721[
                    imaState.chainProperties.mn.strCoinNameErc721 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesMN.push( {
                "assetName": "ERC721",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "owner": await imaToken.getOwnerOfErc721( true, // isMainNet
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.mn.strCoinNameErc721,
                    imaState.chainProperties.mn.joErc721, idToken )
            } );
        }
    }
    if( imaState.chainProperties.sc.ethersProvider &&
        imaState.chainProperties.sc.strCoinNameErc721.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.sc.joErc721[
                    imaState.chainProperties.sc.strCoinNameErc721 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesSC.push( {
                "assetName": "ERC721",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "owner": await imaToken.getOwnerOfErc721( false, // isMainNet
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.sc.strCoinNameErc721,
                    imaState.chainProperties.sc.joErc721, idToken )
            } );
        }
    }
    if( imaState.chainProperties.tc.ethersProvider &&
        imaState.chainProperties.tc.strCoinNameErc721.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.tc.joErc721[
                    imaState.chainProperties.tc.strCoinNameErc721 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesTC.push( {
                "assetName": "ERC721",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "owner": await imaToken.getOwnerOfErc721( false, // isMainNet
                    imaState.chainProperties.tc.ethersProvider,
                    imaState.chainProperties.tc.chainId,
                    imaState.chainProperties.tc.joAccount,
                    imaState.chainProperties.tc.strCoinNameErc721,
                    imaState.chainProperties.tc.joErc721, idToken )
            } );
        }
    }
}

export async function commandLineTaskShowBalanceErc1155(
    arrBalancesMN, arrBalancesSC, arrBalancesTC, idTokens
) {
    const imaState = state.get();
    let assetAddress = null;
    if( imaState.chainProperties.mn.ethersProvider &&
        imaState.chainProperties.mn.strCoinNameErc1155.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.mn.joErc1155[
                    imaState.chainProperties.mn.strCoinNameErc1155 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesMN.push( {
                "assetName": "ERC1155",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "balance": await imaToken.getBalanceErc1155( true, // isMainNet
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.mn.strCoinNameErc1155,
                    imaState.chainProperties.mn.joErc1155, idToken )
            } );
        }
    }
    if( imaState.chainProperties.sc.ethersProvider &&
        imaState.chainProperties.sc.strCoinNameErc1155.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.sc.joErc1155[
                    imaState.chainProperties.sc.strCoinNameErc1155 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesSC.push( {
                "assetName": "ERC1155",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "balance": await imaToken.getBalanceErc1155( false, // isMainNet
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.sc.strCoinNameErc1155,
                    imaState.chainProperties.sc.joErc1155, idToken )
            } );
        }
    }
    if( imaState.chainProperties.tc.ethersProvider &&
        imaState.chainProperties.tc.strCoinNameErc1155.length > 0
    ) {
        for( let i = 0; i < idTokens.length; ++ i ) {
            const idToken = idTokens[i];
            try {
                assetAddress = imaState.chainProperties.tc.joErc1155[
                    imaState.chainProperties.tc.strCoinNameErc1155 + "_address"];
            } catch ( err ) { assetAddress = null; }
            arrBalancesTC.push( {
                "assetName": "ERC1155",
                "assetAddress": assetAddress,
                "idToken": idToken,
                "balance": await imaToken.getBalanceErc1155( false, // isMainNet
                    imaState.chainProperties.tc.ethersProvider,
                    imaState.chainProperties.tc.chainId,
                    imaState.chainProperties.tc.joAccount,
                    imaState.chainProperties.tc.strCoinNameErc1155,
                    imaState.chainProperties.tc.joErc1155, idToken )
            } );
        }
    }
}

export function commandLineTaskShowBalance() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "show balance",
        "fn": async function() {
            const arrBalancesMN = [], arrBalancesSC = [], arrBalancesTC = [];
            await commandLineTaskShowBalanceEth(
                arrBalancesMN, arrBalancesSC, arrBalancesTC );
            await commandLineTaskShowBalanceErc20(
                arrBalancesMN, arrBalancesSC, arrBalancesTC );
            const idTokens = imaState.haveArrayOfTokenIdentifiers ? imaState.idTokens : [];
            if( imaState.haveOneTokenIdentifier )
                idTokens.push( imaState.idToken );
            if( idTokens.length > 0 ) {
                await commandLineTaskShowBalanceErc721(
                    arrBalancesMN, arrBalancesSC, arrBalancesTC, idTokens );
                await commandLineTaskShowBalanceErc1155(
                    arrBalancesMN, arrBalancesSC, arrBalancesTC, idTokens );
            }
            if( arrBalancesMN.length > 0 || arrBalancesSC.length > 0 || arrBalancesTC.length > 0 ) {
                if( arrBalancesMN.length > 0 ) {
                    const strAddress = imaState.chainProperties.mn.joAccount.address();
                    log.information( "Main Net {} of {}:",
                        ( arrBalancesMN.length > 1 ? "balances" : "balance" ), strAddress );
                    for( let i = 0; i < arrBalancesMN.length; ++ i ) {
                        const bi = arrBalancesMN[i];
                        log.information( "    {}",
                            discoveryTools.formatBalanceInfo( bi, strAddress ) );
                    }
                }
                if( arrBalancesSC.length > 0 ) {
                    const strAddress = imaState.chainProperties.sc.joAccount.address();
                    log.information( "S-Chain {} of {}:",
                        ( arrBalancesMN.length > 1 ? "balances" : "balance" ), strAddress );
                    for( let i = 0; i < arrBalancesSC.length; ++ i ) {
                        const bi = arrBalancesSC[i];
                        log.information( "    {}",
                            discoveryTools.formatBalanceInfo( bi, strAddress ) );
                    }
                }
                if( arrBalancesTC.length > 0 ) {
                    const strAddress = imaState.chainProperties.mn.joAccount.address();
                    log.information( "Target S-Chain {} of {}:",
                        arrBalancesTC.length > 1 ? "balances" : "balance", strAddress );
                    for( let i = 0; i < arrBalancesTC.length; ++ i ) {
                        const bi = arrBalancesTC[i];
                        log.information( "    {}",
                            discoveryTools.formatBalanceInfo( bi, strAddress ) );
                    }
                }
            } else
                log.warning( "No balances to scan." );
            return true;
        }
    } );
}

export function commandLineTaskPaymentM2S() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "one M->S single payment",
        "fn": async function() {
            if( imaState.chainProperties.mn.strCoinNameErc721.length > 0 ) {
                // ERC721 payment
                log.information( "one M->S single ERC721 payment: {}", imaState.idToken );
                return await imaToken.doErc721PaymentFromMainNet(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.sc.joAccount,
                    imaState.isWithMetadata721
                        ? imaState.joDepositBoxERC721WithMetadata
                        : imaState.joDepositBoxERC721, // only main net
                    imaState.joMessageProxyMainNet, // for checking logs
                    imaState.chainProperties.sc.strChainName,
                    imaState.idToken, // which ERC721 token id to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.isWithMetadata721
                        ? imaState.joTokenManagerERC721WithMetadata
                        : imaState.joTokenManagerERC721, // only s-chain
                    imaState.chainProperties.mn.strCoinNameErc721,
                    imaState.chainProperties.mn.joErc721,
                    imaState.chainProperties.sc.strCoinNameErc721,
                    imaState.chainProperties.sc.joErc721,
                    imaState.chainProperties.mn.transactionCustomizer
                );
            }
            if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
                // ERC20 payment
                log.information( "one M->S single ERC20 payment: {}", imaState.nAmountOfToken );
                return await imaToken.doErc20PaymentFromMainNet(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.sc.joAccount,
                    imaState.joDepositBoxERC20, // only main net
                    imaState.joMessageProxyMainNet, // for checking logs
                    imaState.chainProperties.sc.strChainName,
                    imaState.nAmountOfToken, // how much ERC20 tokens to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.joTokenManagerERC20, // only s-chain
                    imaState.chainProperties.tc.strCoinNameErc20,
                    imaState.chainProperties.mn.joErc20,
                    imaState.chainProperties.sc.strCoinNameErc20,
                    imaState.chainProperties.sc.joErc20,
                    imaState.chainProperties.mn.transactionCustomizer
                );
            }
            if(
                imaState.chainProperties.mn.strCoinNameErc1155.length > 0 &&
                imaState.idToken &&
                imaState.idToken !== null &&
                imaState.idToken !== undefined &&
                imaState.nAmountOfToken &&
                imaState.nAmountOfToken !== null &&
                imaState.nAmountOfToken !== undefined &&
                ( ( !imaState.idTokens ) ||
                    imaState.idTokens === null ||
                    imaState.idTokens === undefined ) &&
                ( ( !imaState.arrAmountsOfTokens ) ||
                    imaState.arrAmountsOfTokens === null ||
                    imaState.arrAmountsOfTokens === undefined )
            ) {
                // ERC1155 payment
                log.information( "one M->S single ERC1155 payment: {} {}",
                    imaState.idToken, imaState.nAmountOfToken );
                return await imaToken.doErc1155PaymentFromMainNet(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.sc.joAccount,
                    imaState.joDepositBoxERC1155, // only main net
                    imaState.joMessageProxyMainNet, // for checking logs
                    imaState.chainProperties.sc.strChainName,
                    imaState.idToken, // which ERC1155 token id to send
                    imaState.nAmountOfToken, // which ERC1155 token amount to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.joTokenManagerERC1155, // only s-chain
                    imaState.chainProperties.mn.strCoinNameErc1155,
                    imaState.chainProperties.mn.joErc1155,
                    imaState.chainProperties.sc.strCoinNameErc1155,
                    imaState.chainProperties.sc.joErc1155,
                    imaState.chainProperties.mn.transactionCustomizer
                );
            }
            if(
                imaState.chainProperties.mn.strCoinNameErc1155.length > 0 &&
                imaState.idTokens &&
                imaState.idTokens !== null &&
                imaState.idTokens !== undefined &&
                imaState.arrAmountsOfTokens &&
                imaState.arrAmountsOfTokens !== null &&
                imaState.arrAmountsOfTokens !== undefined &&
                ( !imaState.idToken ||
                    imaState.idToken === null ||
                    imaState.idToken === undefined ) &&
                ( !imaState.nAmountOfToken ||
                    imaState.nAmountOfToken === null ||
                    imaState.nAmountOfToken === undefined )
            ) {
                // ERC1155 Batch payment
                log.information( "one M->S single ERC1155 Batch payment: {} {}",
                    imaState.idTokens, imaState.arrAmountsOfTokens );
                return await imaToken.doErc1155BatchPaymentFromMainNet(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.mn.joAccount,
                    imaState.chainProperties.sc.joAccount,
                    imaState.joDepositBoxERC1155, // only main net
                    imaState.joMessageProxyMainNet, // for checking logs
                    imaState.chainProperties.sc.strChainName,
                    imaState.idTokens, // which ERC1155 token id to send
                    imaState.arrAmountsOfTokens, // which ERC1155 token amount to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.joTokenManagerERC1155, // only s-chain
                    imaState.chainProperties.mn.strCoinNameErc1155,
                    imaState.chainProperties.mn.joErc1155,
                    imaState.chainProperties.sc.strCoinNameErc1155,
                    imaState.chainProperties.sc.joErc1155,
                    imaState.chainProperties.mn.transactionCustomizer
                );
            }
            // ETH payment
            log.information( "one M->S single ETH payment: {}", imaState.nAmountOfWei );
            return await imaEth.doEthPaymentFromMainNet(
                imaState.chainProperties.mn.ethersProvider,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.sc.joAccount,
                imaState.joDepositBoxETH, // only main net
                imaState.joMessageProxyMainNet, // for checking logs
                imaState.chainProperties.sc.strChainName,
                imaState.nAmountOfWei, // how much WEI money to send
                imaState.chainProperties.mn.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskPaymentS2M() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "one S->M single payment",
        "fn": async function() {
            if( imaState.chainProperties.sc.strCoinNameErc721.length > 0 ) {
                // ERC721 payment
                log.information( "one S->M single ERC721 payment: {}", imaState.idToken );
                return await imaToken.doErc721PaymentFromSChain(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.mn.joAccount,
                    imaState.isWithMetadata721
                        ? imaState.joTokenManagerERC721WithMetadata
                        : imaState.joTokenManagerERC721, // only s-chain
                    imaState.joMessageProxySChain, // for checking logs
                    imaState.isWithMetadata721
                        ? imaState.joDepositBoxERC721WithMetadata
                        : imaState.joDepositBoxERC721, // only main net
                    imaState.idToken, // which ERC721 token id to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.chainProperties.mn.strCoinNameErc721,
                    imaState.chainProperties.mn.joErc721,
                    imaState.chainProperties.sc.strCoinNameErc721,
                    imaState.chainProperties.sc.joErc721,
                    imaState.chainProperties.sc.transactionCustomizer
                );
            }
            if( imaState.chainProperties.sc.strCoinNameErc20.length > 0 ) {
                // ERC20 payment
                log.information( "one S->M single ERC20 payment: {}", imaState.nAmountOfToken );
                return await imaToken.doErc20PaymentFromSChain(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.mn.joAccount,
                    imaState.joTokenManagerERC20, // only s-chain
                    imaState.joMessageProxySChain, // for checking logs
                    imaState.joDepositBoxERC20, // only main net
                    imaState.nAmountOfToken, // how ERC20 tokens money to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.chainProperties.tc.strCoinNameErc20,
                    imaState.chainProperties.mn.joErc20,
                    imaState.chainProperties.sc.strCoinNameErc20,
                    imaState.chainProperties.sc.joErc20,
                    imaState.chainProperties.sc.transactionCustomizer
                );
            }
            if(
                imaState.chainProperties.sc.strCoinNameErc1155.length > 0 &&
                imaState.idToken &&
                imaState.idToken !== null &&
                imaState.idToken !== undefined &&
                imaState.nAmountOfToken &&
                imaState.nAmountOfToken !== null &&
                imaState.nAmountOfToken !== undefined &&
                ( ( !imaState.idTokens ) ||
                    imaState.idTokens === null ||
                    imaState.idTokens === undefined ) &&
                ( ( !imaState.arrAmountsOfTokens ) ||
                    imaState.arrAmountsOfTokens === null ||
                    imaState.arrAmountsOfTokens === undefined )
            ) {
                // ERC1155 payment
                log.information( "one S->M single ERC1155 payment: {} {}",
                    imaState.idToken, imaState.nAmountOfToken );
                return await imaToken.doErc1155PaymentFromSChain(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.mn.joAccount,
                    imaState.joTokenManagerERC1155, // only s-chain
                    imaState.joMessageProxySChain, // for checking logs
                    imaState.joDepositBoxERC1155, // only main net
                    imaState.idToken, // which ERC1155 token id to send
                    imaState.nAmountOfToken, // which ERC1155 token amount to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.chainProperties.mn.strCoinNameErc1155,
                    imaState.chainProperties.mn.joErc1155,
                    imaState.chainProperties.sc.strCoinNameErc1155,
                    imaState.chainProperties.sc.joErc1155,
                    imaState.chainProperties.sc.transactionCustomizer
                );
            }
            if(
                imaState.chainProperties.sc.strCoinNameErc1155.length > 0 &&
                imaState.idTokens &&
                imaState.idTokens !== null &&
                imaState.idTokens !== undefined &&
                imaState.arrAmountsOfTokens &&
                imaState.arrAmountsOfTokens !== null &&
                imaState.arrAmountsOfTokens !== undefined &&
                ( !imaState.idToken ||
                    imaState.idToken === null ||
                    imaState.idToken === undefined ) &&
                ( !imaState.nAmountOfToken ||
                    imaState.nAmountOfToken === null ||
                    imaState.nAmountOfToken === undefined )
            ) {
                // ERC1155 payment
                log.information( "one S->M single ERC1155 payment: {} {}",
                    imaState.idTokens, imaState.arrAmountsOfTokens );
                return await imaToken.doErc1155BatchPaymentFromSChain(
                    imaState.chainProperties.mn.ethersProvider,
                    imaState.chainProperties.sc.ethersProvider,
                    imaState.chainProperties.mn.chainId,
                    imaState.chainProperties.sc.chainId,
                    imaState.chainProperties.sc.joAccount,
                    imaState.chainProperties.mn.joAccount,
                    imaState.joTokenManagerERC1155, // only s-chain
                    imaState.joMessageProxySChain, // for checking logs
                    imaState.joDepositBoxERC1155, // only main net
                    imaState.idTokens, // which ERC1155 token id to send
                    imaState.arrAmountsOfTokens, // which ERC1155 token amount to send
                    imaState.nAmountOfWei, // how much to send
                    imaState.chainProperties.mn.strCoinNameErc1155,
                    imaState.chainProperties.mn.joErc1155,
                    imaState.chainProperties.sc.strCoinNameErc1155,
                    imaState.chainProperties.sc.joErc1155,
                    imaState.chainProperties.sc.transactionCustomizer
                );
            }
            // ETH payment
            log.information( "one S->M single ETH payment: {}", imaState.nAmountOfWei );
            return await imaEth.doEthPaymentFromSChain(
                imaState.chainProperties.sc.ethersProvider,
                imaState.chainProperties.sc.chainId,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.mn.joAccount,
                imaState.joTokenManagerETH, // only s-chain
                imaState.joMessageProxySChain, // for checking logs
                imaState.nAmountOfWei, // how much WEI money to send
                imaState.chainProperties.sc.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskPaymentS2S() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "one S->S single payment",
        "fn": async function() {
            const isForward = imaHelperAPIs.isForwardS2S();
            const sc = imaState.chainProperties.sc, tc = imaState.chainProperties.tc;
            const ethersProviderSrc = isForward ? sc.ethersProvider : tc.ethersProvider;
            const chainIdSrc = isForward ? sc.chainId : tc.chainId;
            const joAccountSrc = isForward ? sc.joAccount : tc.joAccount;
            const joTokenManagerERC20Src = isForward
                ? imaState.joTokenManagerERC20 : imaState.joTokenManagerERC20Target;
            const joTokenManagerERC721Src = isForward
                ? ( imaState.isWithMetadata721
                    ? imaState.joTokenManagerERC721WithMetadata
                    : imaState.joTokenManagerERC721 )
                : ( imaState.isWithMetadata721
                    ? imaState.joTokenManagerERC721WithMetadataTarget
                    : imaState.joTokenManagerERC721Target )
            ;
            const joTokenManagerERC1155Src = isForward
                ? imaState.joTokenManagerERC1155 : imaState.joTokenManagerERC1155Target;
            const strChainNameDst = isForward ? tc.strChainName : sc.strChainName;
            const strCoinNameErc20Src = isForward ? sc.strCoinNameErc20 : tc.strCoinNameErc20;
            const strCoinNameErc721Src = isForward ? sc.strCoinNameErc721 : tc.strCoinNameErc721;
            const strCoinNameErc1155Src =
                isForward ? sc.strCoinNameErc1155 : tc.strCoinNameErc1155;
            const joSrcErc20 = isForward ? sc.joErc20 : tc.joErc20;
            const joSrcErc721 = isForward ? sc.joErc721 : tc.joErc721;
            const joSrcErc1155 = isForward ? sc.joErc1155 : tc.joErc1155;
            let strAddrErc20Explicit = imaState.strAddrErc20Explicit;
            let strAddrErc20ExplicitTarget = imaState.strAddrErc20ExplicitTarget;
            let strAddrErc721Explicit = imaState.strAddrErc721Explicit;
            let strAddrErc721ExplicitTarget = imaState.strAddrErc721ExplicitTarget;
            let strAddrErc1155Explicit = imaState.strAddrErc1155Explicit;
            let strAddrErc1155ExplicitTarget = imaState.strAddrErc1155ExplicitTarget;
            if( ( ! strAddrErc20Explicit ) && sc.joErc20 && sc.strCoinNameErc20 )
                strAddrErc20Explicit = sc.joErc20[sc.strCoinNameErc20 + "_address"];
            if( ( ! strAddrErc20ExplicitTarget ) && tc.joErc20 && tc.strCoinNameErc20 )
                strAddrErc20ExplicitTarget = tc.joErc20[tc.strCoinNameErc20 + "_address"];
            if( ( ! strAddrErc721Explicit ) && sc.joErc721 && sc.strCoinNameErc721 )
                strAddrErc721Explicit = sc.joErc721[sc.strCoinNameErc721 + "_address"];
            if( ( ! strAddrErc721ExplicitTarget ) && tc.joErc721 && tc.strCoinNameErc721 )
                strAddrErc721ExplicitTarget = tc.joErc721[tc.strCoinNameErc721 + "_address"];
            if( ( ! strAddrErc1155Explicit ) && sc.joErc1155 && sc.strCoinNameErc1155 )
                strAddrErc1155Explicit = sc.joErc1155[sc.strCoinNameErc1155 + "_address"];
            if( ( ! strAddrErc1155ExplicitTarget ) && tc.joErc1155 && tc.strCoinNameErc1155 )
                strAddrErc1155ExplicitTarget = tc.joErc1155[tc.strCoinNameErc1155 + "_address"];
            const strAddrErc20Dst = isForward
                ? strAddrErc20ExplicitTarget : strAddrErc20Explicit;
            const strAddrErc721Dst = isForward
                ? strAddrErc721ExplicitTarget : strAddrErc721Explicit;
            const strAddrErc1155Dst = isForward
                ? strAddrErc1155ExplicitTarget : strAddrErc1155Explicit;
            const tx_customizer = isForward ? sc.transactionCustomizer : tc.transactionCustomizer;
            if( strCoinNameErc721Src.length > 0 ) {
                // ERC721 payment
                log.information( "one S->S single ERC721 payment: {}", imaState.idToken );
                return await imaToken.doErc721PaymentS2S(
                    isForward,
                    ethersProviderSrc,
                    chainIdSrc,
                    strChainNameDst,
                    joAccountSrc,
                    joTokenManagerERC721Src,
                    imaState.idToken, // which ERC721 token id to send
                    imaState.nAmountOfWei, // how much to send
                    strCoinNameErc721Src,
                    joSrcErc721,
                    strAddrErc721Dst, // only reverse payment needs it
                    tx_customizer
                );
            }
            if( strCoinNameErc20Src.length > 0 ) {
                // ERC20 payment
                log.information( "one S->S single ERC20 payment: {}", imaState.nAmountOfToken );
                return await imaToken.doErc20PaymentS2S(
                    isForward,
                    ethersProviderSrc,
                    chainIdSrc,
                    strChainNameDst,
                    joAccountSrc,
                    joTokenManagerERC20Src,
                    imaState.nAmountOfToken, // how much ERC20 tokens to send
                    imaState.nAmountOfWei, // how much to send
                    strCoinNameErc20Src,
                    joSrcErc20,
                    strAddrErc20Dst, // only reverse payment needs it
                    tx_customizer
                );
            }
            if(
                strCoinNameErc1155Src.length > 0 &&
                imaState.idToken &&
                imaState.idToken !== null &&
                imaState.idToken !== undefined &&
                imaState.nAmountOfToken &&
                imaState.nAmountOfToken !== null &&
                imaState.nAmountOfToken !== undefined &&
                ( ( !imaState.idTokens ) ||
                    imaState.idTokens === null ||
                    imaState.idTokens === undefined ) &&
                ( ( !imaState.arrAmountsOfTokens ) ||
                    imaState.arrAmountsOfTokens === null ||
                    imaState.arrAmountsOfTokens === undefined )
            ) {
                // ERC1155 payment
                log.information( "one S->S single ERC1155 payment: {} {}",
                    imaState.idToken, imaState.nAmountOfToken );
                return await imaToken.doErc1155PaymentS2S(
                    isForward,
                    ethersProviderSrc,
                    chainIdSrc,
                    strChainNameDst,
                    joAccountSrc,
                    joTokenManagerERC1155Src,
                    imaState.idToken, // which ERC1155 token id to send
                    imaState.nAmountOfToken, // how much ERC1155 tokens to send
                    imaState.nAmountOfWei, // how much to send
                    strCoinNameErc1155Src,
                    joSrcErc1155,
                    strAddrErc1155Dst, // only reverse payment needs it
                    tx_customizer
                );
            }
            if(
                strCoinNameErc1155Src.length > 0 &&
                imaState.idTokens &&
                imaState.idTokens !== null &&
                imaState.idTokens !== undefined &&
                imaState.arrAmountsOfTokens &&
                imaState.arrAmountsOfTokens !== null &&
                imaState.arrAmountsOfTokens !== undefined &&
                ( !imaState.idToken ||
                    imaState.idToken === null ||
                    imaState.idToken === undefined ) &&
                ( !imaState.nAmountOfToken ||
                    imaState.nAmountOfToken === null ||
                    imaState.nAmountOfToken === undefined )
            ) {
                // ERC1155 Batch payment
                log.information( "one S->S single ERC1155 Batch payment: {} {}",
                    imaState.idTokens, imaState.arrAmountsOfTokens );
                return await imaToken.doErc1155BatchPaymentS2S(
                    isForward,
                    ethersProviderSrc,
                    chainIdSrc,
                    strChainNameDst,
                    joAccountSrc,
                    joTokenManagerERC1155Src,
                    imaState.idTokens, // which ERC1155 token id to send
                    imaState.arrAmountsOfTokens, // which ERC1155 token amount to send
                    imaState.nAmountOfWei, // how much to send
                    strCoinNameErc1155Src,
                    joSrcErc1155,
                    strAddrErc1155Dst,
                    tx_customizer
                );
            }
            // ETH payment
            log.information( "one S->S single ETH payment: {}", imaState.nAmountOfWei );
            lop.fatal( "S->S ETH payment(s) are neither supported nor allowed" );
            process.exit( 154 );
        }
    } );
}

export function commandLineTaskReceiveS2M() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "receive one S->M single ETH payment",
        "fn": async function() {
            log.information( "receive one S->M single ETH payment:" );
            return await imaEth.receiveEthPaymentFromSchainOnMainNet(
                imaState.chainProperties.mn.ethersProvider,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.joAccount,
                imaState.joDepositBoxETH,
                imaState.chainProperties.mn.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskViewS2M() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "view one S->M single ETH payment",
        "fn": async function() {
            log.information( "view one S->M single ETH payment:" );
            const xWei = await imaEth.viewEthPaymentFromSchainOnMainNet(
                imaState.chainProperties.mn.ethersProvider,
                imaState.chainProperties.mn.joAccount,
                imaState.joDepositBoxETH
            );
            if( xWei === null || xWei === undefined )
                return false;
            const xEth =
                owaspUtils.ethersMod.ethers.utils.formatEther( owaspUtils.toBN( xWei ) );
            log.success( "Main-net user can receive: {} wei = {} eth", xWei, xEth );
            return true;
        }
    } );
}

export function commandLineTaskTransferM2S() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "single M->S transfer loop",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // main-net --> s-chain transfer
            const joRuntimeOpts = {
                isInsideWorker: false,
                idxChainKnownForS2S: 0,
                cntChainsKnownForS2S: 0
            };
            return await IMA.doTransfer( // main-net --> s-chain
                "M2S",
                joRuntimeOpts,
                imaState.chainProperties.mn.ethersProvider,
                imaState.joMessageProxyMainNet,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.sc.ethersProvider,
                imaState.joMessageProxySChain,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.sc.chainId,
                null,
                imaState.joTokenManagerETH, // for logs validation on s-chain
                imaState.nTransferBlockSizeM2S,
                imaState.nTransferStepsM2S,
                imaState.nMaxTransactionsM2S,
                imaState.nBlockAwaitDepthM2S,
                imaState.nBlockAgeM2S,
                imaBLS.doSignMessagesM2S,
                null,
                imaState.chainProperties.sc.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskTransferS2M() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "single S->M transfer loop",
        "fn": async function() {
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // s-chain --> main-net transfer
            const joRuntimeOpts = {
                isInsideWorker: false,
                idxChainKnownForS2S: 0,
                cntChainsKnownForS2S: 0
            };
            return await IMA.doTransfer( // s-chain --> main-net
                "S2M",
                joRuntimeOpts,
                imaState.chainProperties.sc.ethersProvider,
                imaState.joMessageProxySChain,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.mn.ethersProvider,
                imaState.joMessageProxyMainNet,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.sc.chainId,
                imaState.chainProperties.mn.chainId,
                imaState.joDepositBoxETH, // for logs validation on mainnet
                null,
                imaState.nTransferBlockSizeS2M,
                imaState.nTransferStepsS2M,
                imaState.nMaxTransactionsS2M,
                imaState.nBlockAwaitDepthS2M,
                imaState.nBlockAgeS2M,
                imaBLS.doSignMessagesS2M,
                null,
                imaState.chainProperties.mn.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskTransferS2S() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "single S->S transfer loop",
        "fn": async function() {
            if( ! imaState.optsS2S.isEnabled )
                return;
            discoveryTools.initialSkaleNetworkScanForS2S();
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // s-chain --> main-net transfer
            const joRuntimeOpts = {
                isInsideWorker: false,
                idxChainKnownForS2S: 0,
                cntChainsKnownForS2S: 0
            };
            return await IMA.doAllS2S( // s-chain --> s-chain
                joRuntimeOpts,
                imaState,
                skaleObserver,
                imaState.chainProperties.sc.ethersProvider,
                imaState.joMessageProxySChain,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.sc.chainId,
                imaState.joTokenManagerETH, // for logs validation on s-chain
                imaState.nTransferBlockSizeM2S,
                imaState.nTransferStepsS2S,
                imaState.nMaxTransactionsM2S,
                imaState.nBlockAwaitDepthM2S,
                imaState.nBlockAgeM2S,
                imaBLS.doSignMessagesM2S,
                imaState.chainProperties.sc.transactionCustomizer
            );
        }
    } );
}

export function commandLineTaskTransfer() {
    const imaState = state.get();
    discoveryTools.initialSkaleNetworkScanForS2S();
    imaState.arrActions.push( {
        "name": "Single M<->S transfer loop iteration",
        "fn": async function() {
            discoveryTools.initialSkaleNetworkScanForS2S();
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted();
            const joRuntimeOpts = {
                isInsideWorker: false,
                idxChainKnownForS2S: 0,
                cntChainsKnownForS2S: 0
            };
            const optsLoop = {
                joRuntimeOpts: joRuntimeOpts,
                isDelayFirstRun: false,
                enableStepOracle: true,
                enableStepM2S: true,
                enableStepS2M: true,
                enableStepS2S: true
            };
            return await singleTransferLoop( optsLoop );
        }
    } );
}

export function commandLineTaskLoop() {
    const imaState = state.get();
    discoveryTools.initialSkaleNetworkScanForS2S();
    imaState.arrActions.push( {
        "name": "M<->S and S->S transfer loop, startup in parallel mode",
        "fn": async function() {
            state.setPreventExitAfterLastAction( true );
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // M<->S transfer loop
            let isPrintSummaryRegistrationCosts = false;
            if( !await checkRegistrationStep1() ) {
                if( !await registerStep1( false ) )
                    return false;
                isPrintSummaryRegistrationCosts = true;
            }
            if( isPrintSummaryRegistrationCosts )
                printSummaryRegistrationCosts();
            const opts = {
                imaState: imaState,
                "details": log
            };
            return await loop.runParallelLoops(
                opts
            );
        }
    } );
}

export function commandLineTaskLoopSimple() {
    const imaState = state.get();
    discoveryTools.initialSkaleNetworkScanForS2S();
    imaState.arrActions.push( {
        "name": "M<->S and S->S transfer loop, startup simple mode",
        "fn": async function() {
            state.setPreventExitAfterLastAction( true );
            if( ! imaState.bNoWaitSChainStarted )
                await discoveryTools.waitUntilSChainStarted(); // M<->S transfer loop
            let isPrintSummaryRegistrationCosts = false;
            if( !await checkRegistrationStep1() ) {
                if( !await registerStep1( false ) )
                    return false;
                isPrintSummaryRegistrationCosts = true;
            }
            if( isPrintSummaryRegistrationCosts )
                printSummaryRegistrationCosts();
            const joRuntimeOpts = {
                isInsideWorker: false,
                idxChainKnownForS2S: 0,
                cntChainsKnownForS2S: 0
            };
            const optsLoop = {
                joRuntimeOpts: joRuntimeOpts,
                isDelayFirstRun: false,
                enableStepOracle: true,
                enableStepM2S: true,
                enableStepS2M: true,
                enableStepS2S: true
            };
            return await loop.runTransferLoop( optsLoop );
        }
    } );
}

async function handleBrowseSkaleModesRpcInfoResult( strLogPrefix, joCall, joIn, joOut ) {
    const imaState = state.get();
    log.information( "{p}S-Chain network information: {}",
        strLogPrefix, joOut.result );
    let nCountReceivedImaDescriptions = 0;
    const jarrNodes = joOut.result.network;
    for( let i = 0; i < jarrNodes.length; ++ i ) {
        const joNode = jarrNodes[i];
        if( ! joNode ) {
            log.critical( "{p}Discovery node {} is completely unknown and will be skipped",
                strLogPrefix, i );
            continue;
        }
        const strNodeURL = imaUtils.composeSChainNodeUrl( joNode );
        const rpcCallOpts = null;
        let joCall = null;
        try {
            joCall = await rpcCall.create( strNodeURL, rpcCallOpts );
            if( ! joCall )
                throw new Error( `Failed to create JSON RPC call object to ${strNodeURL}` );
            const jIn = { "method": "skale_imaInfo", "params": { } };
            if( discoveryTools.isSendImaAgentIndex() )
                jIn.params.fromImaAgentIndex = imaState.nNodeNumber;
            const joOut = await joCall.call( joIn );
            ++ nCountReceivedImaDescriptions;
            log.information( "{p}Node {} IMA information: {}",
                strLogPrefix, joNode.nodeID, joOut.result );
            await joCall.disconnect();
        } catch ( err ) {
            log.fatal( "JSON RPC call to S-Chain failed, error: {err}", err );
            if( joCall )
                await joCall.disconnect();
            process.exit( 159 );
        }
    }
    const iv = setInterval( function() {
        if( nCountReceivedImaDescriptions == jarrNodes.length ) {
            clearInterval( iv );
            process.exit( 0 );
        }
    }, 100 );
    await joCall.disconnect();
}

export function commandLineTaskBrowseSChain() {
    const imaState = state.get();
    imaState.bIsNeededCommonInit = false;
    imaState.arrActions.push( {
        "name": "Browse S-Chain network",
        "fn": async function() {
            const strLogPrefix = "S-Chain Browse: ";
            if( imaState.chainProperties.sc.strURL.length === 0 ) {
                log.fatal( "Missing S-Chain URL, please specify {}", "--url-s-chain" );
                process.exit( 155 );
            }
            log.information( "{p}Downloading S-Chain network information...", strLogPrefix );
            const rpcCallOpts = null;
            let joCall = null;
            try {
                joCall = await rpcCall.create( imaState.chainProperties.sc.strURL, rpcCallOpts );
                if( ! joCall ) {
                    throw new Error( "Failed to create JSON RPC call object " +
                        `to ${imaState.chainProperties.sc.strURL}` );
                }
                const joIn = { "method": "skale_nodesRpcInfo", "params": { } };
                if( discoveryTools.isSendImaAgentIndex() )
                    joIn.params.fromImaAgentIndex = imaState.nNodeNumber;
                const joOut = await joCall.call( joIn );
                await handleBrowseSkaleModesRpcInfoResult( strLogPrefix, joCall, joIn, joOut );
            } catch ( err ) {
                log.fatal( "JSON RPC call to S-Chain failed, error: {err}", err );
                if( joCall )
                    await joCall.disconnect();
                process.exit( 159 );
            }
            return true;
        }
    } );
}

export function commandLineTaskBrowseSkaleNetwork() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Browse S-Chain network",
        "fn": async function() {
            const strLogPrefix = "SKALE NETWORK Browse: ";
            if( imaState.strPathAbiJsonSkaleManager.length === 0 ) {
                log.fatal( "Missing Skale Manager ABI, please specify {}", "--abi-skale-manager" );
                process.exit( 160 );
            }
            log.information( "{p}Downloading SKALE network information...", strLogPrefix );
            const opts = {
                imaState: imaState,
                "details": log,
                "bStopNeeded": false,
                "isLoadConnectedOnly": false
            };
            const arrSChains = await skaleObserver.loadSChainsDefault( opts );
            const cnt = arrSChains.length;
            log.information( "{p}Got {} S-Chains(s) in SKALE NETWORK information: {}",
                strLogPrefix, cnt, arrSChains );
            return true;
        }
    } );
}

export function commandLineTaskBrowseConnectedSChains() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Browse connected S-Chains",
        "fn": async function() {
            const strLogPrefix = "Browse connected S-Chains: ";
            if( imaState.strPathAbiJsonSkaleManager.length === 0 ) {
                log.fatal( "Missing Skale Manager ABI, please specify {}", "--abi-skale-manager" );
                process.exit( 161 );
            }
            log.information( "{p}Downloading SKALE network information...", strLogPrefix );
            const opts = {
                "imaState": imaState,
                "details": log,
                "bStopNeeded": false,
                "isLoadConnectedOnly": true
            };
            const arrSChainsCached = await skaleObserver.loadSChainsConnectedOnly(
                imaState.chainProperties.sc.strChainName, opts );
            const cnt = arrSChainsCached.length;
            log.information( "{p}Got {} connected S-Chain(s): {}",
                strLogPrefix, cnt, arrSChainsCached );
            return true;
        }
    } );
}

export function commandLineTaskDiscoverChainId() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Discover chains ID(s)",
        "fn": async function() {
            const strLogPrefix = "Discover chains ID(s): ";
            const arrURLsToDiscover = [];
            if( imaState.chainProperties.mn.strURL &&
                typeof( imaState.chainProperties.mn.strURL ) == "string" &&
                imaState.chainProperties.mn.strURL.length > 0
            ) {
                arrURLsToDiscover.push( {
                    "name": "Main Net",
                    "strURL": "" + imaState.chainProperties.mn.strURL,
                    "fnSave": function( chainId ) {
                        imaState.chainProperties.mn.chainId = chainId;
                    }
                } );
            }
            if( imaState.chainProperties.sc.strURL &&
                typeof( imaState.chainProperties.sc.strURL ) == "string" &&
                imaState.chainProperties.sc.strURL.length > 0
            ) {
                arrURLsToDiscover.push( {
                    "name": "S-Chain",
                    "strURL": "" + "" + imaState.chainProperties.sc.strURL,
                    "fnSave": function( chainId ) {
                        imaState.chainProperties.sc.chainId = chainId;
                    }
                } );
            }
            if( imaState.chainProperties.tc.strURL &&
                typeof( imaState.chainProperties.tc.strURL ) == "string" &&
                imaState.chainProperties.tc.strURL.length > 0
            ) {
                arrURLsToDiscover.push( {
                    "name": "S<->S Target S-Chain",
                    "strURL": "" + "" + imaState.chainProperties.tc.strURL,
                    "fnSave": function( chainId ) {
                        imaState.chainProperties.tc.chainId = chainId;
                    }
                } );
            }
            if( arrURLsToDiscover.length === 0 ) {
                log.fatal( "No URLs provided to discover chain IDs, please specify {} and/or {} " +
                    "and/or {}.", "--url-main-net", "--url-s-chain", "--url-t-chain" );
                process.exit( 162 );
            }
            for( let i = 0; i < arrURLsToDiscover.length; ++ i ) {
                const joDiscoverEntry = arrURLsToDiscover[i];
                const chainId = await
                skaleObserver.discoverChainId( joDiscoverEntry.strURL );
                if( chainId === null ) {
                    log.error( "{p}Failed to detect {} chain ID",
                        strLogPrefix, joDiscoverEntry.name );
                } else {
                    const cid16 =
                        owaspUtils.ensureStartsWith0x( owaspUtils.toBN( chainId ).toHexString() );
                    const cid10 = "" + owaspUtils.toBN( chainId ).toString();
                    log.information( "{p}Got {} chain ID={}={} from URL {url}", strLogPrefix,
                        joDiscoverEntry.name, cid16, cid10, joDiscoverEntry.strURL );
                    joDiscoverEntry.fnSave( chainId );
                }
            }
            return true;
        }
    } );
}

export function commandLineTaskReimbursementShowBalance() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Gas Reimbursement - Show Balance",
        "fn": async function() {
            await imaReimbursement.reimbursementShowBalance(
                imaState.chainProperties.mn.ethersProvider,
                imaState.joCommunityPool,
                imaState.chainProperties.mn.joAccount.address(),
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.transactionCustomizer,
                imaState.strReimbursementChain,
                true
            );
            return true;
        }
    } );
}

export function commandLineTaskReimbursementEstimateAmount() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Gas Reimbursement - Estimate Amount",
        "fn": async function() {
            await imaReimbursement.reimbursementEstimateAmount(
                imaState.chainProperties.mn.ethersProvider,
                imaState.joCommunityPool,
                imaState.chainProperties.mn.joAccount.address(),
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.transactionCustomizer,
                imaState.strReimbursementChain,
                true
            );
            return true;
        }
    } );
}

export function commandLineTaskReimbursementRecharge() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Gas Reimbursement - Recharge User Wallet",
        "fn": async function() {
            await imaReimbursement.reimbursementWalletRecharge(
                imaState.chainProperties.mn.ethersProvider,
                imaState.joCommunityPool,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.transactionCustomizer,
                imaState.strReimbursementChain,
                imaState.nReimbursementRecharge
            );
            return true;
        }
    } );
}

export function commandLineTaskReimbursementWithdraw() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Gas Reimbursement - Withdraw User Wallet",
        "fn": async function() {
            await imaReimbursement.reimbursementWalletWithdraw(
                imaState.chainProperties.mn.ethersProvider,
                imaState.joCommunityPool,
                imaState.chainProperties.mn.joAccount,
                imaState.chainProperties.mn.strChainName,
                imaState.chainProperties.mn.chainId,
                imaState.chainProperties.mn.transactionCustomizer,
                imaState.strReimbursementChain,
                imaState.nReimbursementWithdraw
            );
            return true;
        }
    } );
}

export function commandLineTaskReimbursementSetRange() {
    const imaState = state.get();
    imaState.arrActions.push( {
        "name": "Gas Reimbursement - Set Minimal time interval from S2M and S2S transfers",
        "fn": async function() {
            await imaReimbursement.reimbursementSetRange(
                imaState.chainProperties.sc.ethersProvider,
                imaState.joCommunityLocker,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.sc.chainId,
                imaState.chainProperties.sc.transactionCustomizer,
                imaState.strChainNameOriginChain,
                imaState.nReimbursementRange
            );
            return true;
        }
    } );
}
