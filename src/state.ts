import * as owaspUtils from "./owaspUtils.js";
import * as imaTx from "./imaTx.js";
import type * as discoveryTools from "./discoveryTools.js";

export interface TLoopStateSubPart {
    isInProgress: boolean
    wasInProgress: boolean
}

export interface TLoopState {
    oracle: TLoopStateSubPart
    m2s: TLoopStateSubPart
    s2m: TLoopStateSubPart
    s2s: TLoopStateSubPart
}

export interface TTokeInformation {
    abi: object
    address: string
}

export const gDefaultValueForLoopState: TLoopState = {
    oracle: {
        isInProgress: false,
        wasInProgress: false
    },
    m2s: {
        isInProgress: false,
        wasInProgress: false
    },
    s2m: {
        isInProgress: false,
        wasInProgress: false
    },
    s2s: {
        isInProgress: false,
        wasInProgress: false
    }
};

export interface TAccount {
    address_?: string
    privateKey: string | null
    address: any
    strTransactionManagerURL: string
    nTmPriority: number
    strSgxURL: string
    strSgxKeyName: string
    strPathSslKey: string
    strPathSslCert: string
    strBlsKeyName: string
}

export interface TOneChainProperties {
    joAccount: TAccount
    transactionCustomizer: imaTx.TransactionCustomizer
    ethersProvider: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider | null
    strURL: string
    strChainName: string
    chainId: string | number
    strPathAbiJson: string
    joAbiIMA: any
    bHaveAbiIMA: boolean
    joErc20: any | null
    joErc721: any | null
    joErc1155: any | null
    strCoinNameErc20: string // in-JSON coin name
    strCoinNameErc721: string // in-JSON coin name
    strCoinNameErc1155: string // in-JSON coin name
    strPathJsonErc20: string
    strPathJsonErc721: string
    strPathJsonErc1155: string
}

export interface TPropertiesOfChains {
    mn: TOneChainProperties
    sc: TOneChainProperties
    tc: TOneChainProperties
}

function constructChainProperties(): TPropertiesOfChains {
    return {
        mn: {
            joAccount: {
                privateKey:
                    owaspUtils.toEthPrivateKey( process.env.PRIVATE_KEY_FOR_ETHEREUM ),
                address:
                    function() { return owaspUtils.fnAddressImpl_( this ); },
                strTransactionManagerURL:
                    owaspUtils.toStringURL(
                        process.env.TRANSACTION_MANAGER_URL_ETHEREUM ),
                nTmPriority:
                    owaspUtils.toInteger(
                        process.env.TRANSACTION_MANAGER_PRIORITY_ETHEREUM ) || 5,
                strSgxURL: owaspUtils.toStringURL( process.env.SGX_URL_ETHEREUM ),
                strSgxKeyName: owaspUtils.toStringURL( process.env.SGX_KEY_ETHEREUM ),
                strPathSslKey:
                    ( process.env.SGX_SSL_KEY_FILE_ETHEREUM || "" ).toString().trim(),
                strPathSslCert:
                    ( process.env.SGX_SSL_CERT_FILE_ETHEREUM || "" ).toString().trim(),
                strBlsKeyName: owaspUtils.toStringURL( process.env.BLS_KEY_ETHEREUM )
            },
            transactionCustomizer: imaTx.getTransactionCustomizerForMainNet(),
            ethersProvider: null,
            strURL: owaspUtils.toStringURL( process.env.URL_W3_ETHEREUM ),
            strChainName:
                ( process.env.CHAIN_NAME_ETHEREUM || "Mainnet" ).toString().trim(),
            chainId: owaspUtils.toInteger( process.env.CID_ETHEREUM ) || -4,
            strPathAbiJson: "",
            joAbiIMA: { },
            bHaveAbiIMA: false,
            joErc20: null,
            joErc721: null,
            joErc1155: null,
            strCoinNameErc20: "", // in-JSON coin name
            strCoinNameErc721: "", // in-JSON coin name
            strCoinNameErc1155: "", // in-JSON coin name
            strPathJsonErc20: "",
            strPathJsonErc721: "",
            strPathJsonErc1155: ""
        },
        sc: {
            joAccount: {
                privateKey:
                    owaspUtils.toEthPrivateKey( process.env.PRIVATE_KEY_FOR_SCHAIN ),
                address:
                    function() { return owaspUtils.fnAddressImpl_( this ); },
                strTransactionManagerURL:
                    owaspUtils.toStringURL( process.env.TRANSACTION_MANAGER_URL_S_CHAIN ),
                nTmPriority:
                    owaspUtils.toInteger(
                        process.env.TRANSACTION_MANAGER_PRIORITY_S_CHAIN ) || 5,
                strSgxURL: owaspUtils.toStringURL( process.env.SGX_URL_S_CHAIN ),
                strSgxKeyName: owaspUtils.toStringURL( process.env.SGX_KEY_S_CHAIN ),
                strPathSslKey:
                    ( process.env.SGX_SSL_KEY_FILE_S_CHAIN || "" ).toString().trim(),
                strPathSslCert:
                    ( process.env.SGX_SSL_CERT_FILE_S_CHAIN || "" ).toString().trim(),
                strBlsKeyName: owaspUtils.toStringURL( process.env.BLS_KEY_S_CHAIN )
            },
            transactionCustomizer: imaTx.getTransactionCustomizerForSChain(),
            ethersProvider: null,
            strURL: owaspUtils.toStringURL( process.env.URL_W3_S_CHAIN ),
            strChainName:
                ( process.env.CHAIN_NAME_SCHAIN || "id-S-chain" ).toString().trim(),
            chainId: owaspUtils.toInteger( process.env.CID_SCHAIN ) || -4,
            strPathAbiJson: "",
            joAbiIMA: { },
            bHaveAbiIMA: false,
            joErc20: null,
            joErc721: null,
            joErc1155: null,
            strCoinNameErc20: "", // in-JSON coin name
            strCoinNameErc721: "", // in-JSON coin name
            strCoinNameErc1155: "", // in-JSON coin name
            strPathJsonErc20: "",
            strPathJsonErc721: "",
            strPathJsonErc1155: ""
        },
        tc: {
            joAccount: {
                privateKey:
                    owaspUtils.toEthPrivateKey( process.env.PRIVATE_KEY_FOR_SCHAIN_TARGET ),
                address:
                    function() { return owaspUtils.fnAddressImpl_( this ); },
                strTransactionManagerURL:
                    owaspUtils.toStringURL(
                        process.env.TRANSACTION_MANAGER_URL_S_CHAIN_TARGET ),
                nTmPriority:
                    owaspUtils.toInteger(
                        process.env.TRANSACTION_MANAGER_PRIORITY_S_CHAIN_TARGET ) || 5,
                strSgxURL: owaspUtils.toStringURL( process.env.SGX_URL_S_CHAIN_TARGET ),
                strSgxKeyName: owaspUtils.toStringURL( process.env.SGX_KEY_S_CHAIN_TARGET ),
                strPathSslKey:
                    ( process.env.SGX_SSL_KEY_FILE_S_CHAIN_TARGET || "" ).toString().trim(),
                strPathSslCert:
                    ( process.env.SGX_SSL_CERT_FILE_S_CHAIN_TARGET || "" ).toString().trim(),
                strBlsKeyName: owaspUtils.toStringURL( process.env.BLS_KEY_T_CHAIN )
            },
            transactionCustomizer: imaTx.getTransactionCustomizerForSChainTarget(),
            ethersProvider: null,
            strURL: owaspUtils.toStringURL( process.env.URL_W3_S_CHAIN_TARGET ),
            strChainName:
                ( process.env.CHAIN_NAME_SCHAIN_TARGET || "id-T-chain" ).toString().trim(),
            chainId: owaspUtils.toInteger( process.env.CID_SCHAIN_TARGET ) || -4,
            strPathAbiJson: "",
            joAbiIMA: { },
            bHaveAbiIMA: false,
            joErc20: null,
            joErc721: null,
            joErc1155: null,
            strCoinNameErc20: "", // in-JSON coin name
            strCoinNameErc721: "", // in-JSON coin name
            strCoinNameErc1155: "", // in-JSON coin name
            strPathJsonErc20: "",
            strPathJsonErc721: "",
            strPathJsonErc1155: ""
        }
    };
}

export interface TIMAAction {
    name: string
    fn: () => Promise < boolean >
}

export interface TIMAState {
    loopState: TLoopState

    strLogFilePath: string
    nLogMaxSizeBeforeRotation: number
    nLogMaxFilesCount: number
    isPrintGathered: boolean
    isPrintSecurityValues: boolean
    isPrintPWA: boolean
    isDynamicLogInDoTransfer: boolean
    isDynamicLogInBlsSigner: boolean

    bIsNeededCommonInit: boolean
    // use BLS message signing, turned on with --sign-messages
    bSignMessages: boolean
    // scanned S-Chain network description
    joSChainNetworkInfo: discoveryTools.TSChainNetworkInfo | null
    // path to bls_glue app, must have if --sign-messages specified
    strPathBlsGlue: string
    // path to hash_g1 app, must have if --sign-messages specified
    strPathHashG1: string
    // path to verify_bls app, optional,
    // if specified then we will verify gathered BLS signature
    strPathBlsVerify: string

    // true - just show configuration values and exit
    bShowConfigMode: boolean

    isEnabledMultiCall: boolean

    bNoWaitSChainStarted: boolean
    nMaxWaitSChainAttempts: number // 20

    nAmountOfWei: any
    nAmountOfToken: any
    arrAmountsOfTokens: any[] | null
    idToken: any
    idTokens: any[] | null

    nTransferBlockSizeM2S: number
    nTransferBlockSizeS2M: number
    nTransferBlockSizeS2S: number
    nTransferStepsM2S: number
    nTransferStepsS2M: number
    nTransferStepsS2S: number
    nMaxTransactionsM2S: number
    nMaxTransactionsS2M: number
    nMaxTransactionsS2S: number

    nBlockAwaitDepthM2S: number
    nBlockAwaitDepthS2M: number
    nBlockAwaitDepthS2S: number
    nBlockAgeM2S: number
    nBlockAgeS2M: number
    nBlockAgeS2S: number

    nLoopPeriodSeconds: number

    nNodeNumber: number // S-Chain node number(zero based)
    nNodesCount: number
    nTimeFrameSeconds: number // 0-disable, 60-recommended
    nNextFrameGap: number

    nAutoExitAfterSeconds: number // 0-disable

    joCommunityPool: owaspUtils.ethersMod.Contract | null // only main net
    joDepositBoxETH: owaspUtils.ethersMod.Contract | null // only main net
    joDepositBoxERC20: owaspUtils.ethersMod.Contract | null // only main net
    joDepositBoxERC721: owaspUtils.ethersMod.Contract | null // only main net
    joDepositBoxERC1155: owaspUtils.ethersMod.Contract | null // only main net
    joDepositBoxERC721WithMetadata: owaspUtils.ethersMod.Contract | null // only main net
    joLinker: owaspUtils.ethersMod.Contract | null // only main net

    isWithMetadata721: boolean

    joTokenManagerETH: owaspUtils.ethersMod.Contract | null // only s-chain
    joTokenManagerETHTarget: owaspUtils.ethersMod.Contract | null
    joTokenManagerERC20: owaspUtils.ethersMod.Contract | null // only s-chain
    joTokenManagerERC20Target: owaspUtils.ethersMod.Contract | null // only s-chain
    joTokenManagerERC721: owaspUtils.ethersMod.Contract | null // only sc target
    joTokenManagerERC721Target: owaspUtils.ethersMod.Contract | null // only sc target
    joTokenManagerERC1155: owaspUtils.ethersMod.Contract | null // only s-chain
    joTokenManagerERC1155Target: owaspUtils.ethersMod.Contract | null // only sc target
    joTokenManagerERC721WithMetadata: owaspUtils.ethersMod.Contract | null // only sc target
    joTokenManagerERC721WithMetadataTarget: owaspUtils.ethersMod.Contract | null // only sc target
    joCommunityLocker: owaspUtils.ethersMod.Contract | null // only s-chain
    joCommunityLockerTarget: owaspUtils.ethersMod.Contract | null // only sc target
    joMessageProxyMainNet: owaspUtils.ethersMod.Contract | null
    joMessageProxySChain: owaspUtils.ethersMod.Contract | null
    joMessageProxySChainTarget: owaspUtils.ethersMod.Contract | null // only sc target
    joTokenManagerLinker: owaspUtils.ethersMod.Contract | null
    joTokenManagerLinkerTarget: owaspUtils.ethersMod.Contract | null // only sc target
    joEthErc20: owaspUtils.ethersMod.Contract | null // only s-chain
    joEthErc20Target: owaspUtils.ethersMod.Contract | null // only sc target

    joConstantsHolder?: owaspUtils.ethersMod.Contract | null
    joNodes?: owaspUtils.ethersMod.Contract | null
    joKeyStorage?: owaspUtils.ethersMod.Contract | null
    joSChains?: owaspUtils.ethersMod.Contract | null
    joSChainsInternal?: owaspUtils.ethersMod.Contract | null
    joSkaleDKG?: owaspUtils.ethersMod.Contract | null
    joSkaleManager?: owaspUtils.ethersMod.Contract | null
    joSkaleToken?: owaspUtils.ethersMod.Contract | null
    joValidatorService?: owaspUtils.ethersMod.Contract | null
    joWallets?: owaspUtils.ethersMod.Contract | null

    chainProperties: TPropertiesOfChains

    strPathAbiJsonSkaleManager: string
    joAbiSkaleManager: any
    bHaveSkaleManagerABI: boolean

    strChainNameOriginChain: string

    strAddrErc20Explicit: string
    strAddrErc20ExplicitTarget: string // S<->S target
    strAddrErc721Explicit: string
    strAddrErc721ExplicitTarget: string // S<->S target
    strAddrErc1155Explicit: string
    strAddrErc1155ExplicitTarget: string // S<->S target

    isPWA: boolean
    nTimeoutSecondsPWA: number

    nMonitoringPort: number // 0 - default, means monitoring server is disabled
    bLogMonitoringServer: boolean

    strReimbursementChain: string
    isShowReimbursementBalance: boolean
    nReimbursementRecharge: string | number | null
    nReimbursementWithdraw: string | number | null
    nReimbursementRange: number // < 0 - do not change anything
    isReimbursementEstimate?: boolean

    joSChainDiscovery: {
        isSilentReDiscovery: boolean
        // zero to disable (for debugging only)
        repeatIntervalMilliseconds: number
        periodicDiscoveryInterval: number
    }

    // S-Chain to S-Chain transfer options
    optsS2S: {
        // is S-Chain to S-Chain transfers enabled
        isEnabled: boolean
        strNetworkBrowserPath: string | null
    }

    nJsonRpcPort: number // 0 to disable
    isCrossImaBlsMode: boolean

    arrActions: TIMAAction[] // array of actions to run

    receiver?: any | null

    haveOneTokenIdentifier: boolean
    haveArrayOfTokenIdentifiers: boolean
};

let imaState: TIMAState | null = null;

export function get(): TIMAState {
    if( imaState )
        return imaState;
    imaState = {
        loopState: gDefaultValueForLoopState,

        strLogFilePath: "",
        nLogMaxSizeBeforeRotation: -1,
        nLogMaxFilesCount: -1,
        isPrintGathered: true,
        isPrintSecurityValues: false,
        isPrintPWA: false,
        isDynamicLogInDoTransfer: true,
        isDynamicLogInBlsSigner: false,

        bIsNeededCommonInit: true,
        // use BLS message signing, turned on with --sign-messages
        bSignMessages: false,
        // scanned S-Chain network description
        joSChainNetworkInfo: null,
        // path to bls_glue app, must have if --sign-messages specified
        strPathBlsGlue: "",
        // path to hash_g1 app, must have if --sign-messages specified
        strPathHashG1: "",
        // path to verify_bls app, optional,
        // if specified then we will verify gathered BLS signature
        strPathBlsVerify: "",

        // true - just show configuration values and exit
        bShowConfigMode: false,

        isEnabledMultiCall: true,

        bNoWaitSChainStarted: false,
        nMaxWaitSChainAttempts: 0 + Number.MAX_SAFE_INTEGER, // 20

        nAmountOfWei: 0,
        nAmountOfToken: 0,
        arrAmountsOfTokens: null,
        idToken: 0,
        idTokens: null,

        nTransferBlockSizeM2S: 4,
        nTransferBlockSizeS2M: 4,
        nTransferBlockSizeS2S: 4,
        nTransferStepsM2S: 8,
        nTransferStepsS2M: 8,
        nTransferStepsS2S: 8,
        nMaxTransactionsM2S: 0,
        nMaxTransactionsS2M: 0,
        nMaxTransactionsS2S: 0,

        nBlockAwaitDepthM2S: 0,
        nBlockAwaitDepthS2M: 0,
        nBlockAwaitDepthS2S: 0,
        nBlockAgeM2S: 0,
        nBlockAgeS2M: 0,
        nBlockAgeS2S: 0,

        nLoopPeriodSeconds: 10,

        nNodeNumber: 0, // S-Chain node number(zero based)
        nNodesCount: 1,
        nTimeFrameSeconds: 0, // 0-disable, 60-recommended
        nNextFrameGap: 10,

        nAutoExitAfterSeconds: 0, // 0-disable

        joCommunityPool: null, // only main net
        joDepositBoxETH: null, // only main net
        joDepositBoxERC20: null, // only main net
        joDepositBoxERC721: null, // only main net
        joDepositBoxERC1155: null, // only main net
        joDepositBoxERC721WithMetadata: null, // only main net
        joLinker: null, // only main net

        isWithMetadata721: false,

        joTokenManagerETH: null, // only s-chain
        joTokenManagerETHTarget: null,
        joTokenManagerERC20: null, // only s-chain
        joTokenManagerERC20Target: null, // only s-chain
        joTokenManagerERC721: null, // only sc target
        joTokenManagerERC721Target: null, // only sc target
        joTokenManagerERC1155: null, // only s-chain
        joTokenManagerERC1155Target: null, // only sc target
        joTokenManagerERC721WithMetadata: null, // only sc target
        joTokenManagerERC721WithMetadataTarget: null, // only sc target
        joCommunityLocker: null, // only s-chain
        joCommunityLockerTarget: null, // only sc target
        joMessageProxyMainNet: null,
        joMessageProxySChain: null,
        joMessageProxySChainTarget: null, // only sc target
        joTokenManagerLinker: null,
        joTokenManagerLinkerTarget: null, // only sc target
        joEthErc20: null, // only s-chain
        joEthErc20Target: null, // only sc target

        chainProperties: constructChainProperties(),

        strPathAbiJsonSkaleManager: "",
        joAbiSkaleManager: { },
        bHaveSkaleManagerABI: false,

        strChainNameOriginChain:
            ( process.env.CHAIN_NAME_SCHAIN_ORIGIN || "Mainnet" ).toString().trim(),

        strAddrErc20Explicit: "",
        strAddrErc20ExplicitTarget: "", // S<->S target
        strAddrErc721Explicit: "",
        strAddrErc721ExplicitTarget: "", // S<->S target
        strAddrErc1155Explicit: "",
        strAddrErc1155ExplicitTarget: "", // S<->S target

        isPWA: true,
        nTimeoutSecondsPWA: 60,

        nMonitoringPort: 0, // 0 - default, means monitoring server is disabled
        bLogMonitoringServer: false,

        strReimbursementChain: "",
        isShowReimbursementBalance: false,
        nReimbursementRecharge: 0,
        nReimbursementWithdraw: 0,
        nReimbursementRange: -1, // < 0 - do not change anything

        joSChainDiscovery: {
            isSilentReDiscovery: false,
            // zero to disable (for debugging only)
            repeatIntervalMilliseconds: 5 * 1000,
            periodicDiscoveryInterval: 5 * 60 * 1000
        },

        // S-Chain to S-Chain transfer options
        optsS2S: {
            // is S-Chain to S-Chain transfers enabled
            isEnabled: true,
            strNetworkBrowserPath: null
        },

        nJsonRpcPort: 0, // 0 to disable
        isCrossImaBlsMode: false,

        arrActions: [], // array of actions to run

        haveOneTokenIdentifier: false,
        haveArrayOfTokenIdentifiers: false
    };
    return imaState;
}

export function set( imaStateNew: TIMAState ) {
    imaState = imaStateNew;
    return imaState;
}

let gFlagIsPreventExitAfterLastAction = false;

export function isPreventExitAfterLastAction() {
    return gFlagIsPreventExitAfterLastAction;
}

export function setPreventExitAfterLastAction( isPrevent: any ) {
    gFlagIsPreventExitAfterLastAction = ( !!isPrevent )
}
