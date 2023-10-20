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
 * @file cli.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as path from "path";
import * as url from "url";
import * as os from "os";
import * as cc from "./cc.mjs";
import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaUtils from "./utils.mjs";
import * as rpcCall from "./rpcCall.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as imaOracleOperations from "./imaOracleOperations.mjs";
import * as imaTx from "./imaTx.mjs";
import * as state from "./state.mjs";

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );

const gStrAppName = "IMA AGENT";
const gStrVersion =
    imaUtils.jsonFileLoad( path.join( __dirname, "package.json" ), null ).version;

export function printAbout( isLog ) {
    isLog = isLog || false;
    const strMsg =
        cc.attention( gStrAppName ) + cc.normal( " version " ) + cc.sunny( gStrVersion );
    if( isLog )
        log.write( strMsg + "\n" );
    else
        console.log( strMsg );
    return true;
}

export function parseCommandLineArgument( s ) {
    const joArg = {
        name: "",
        value: ""
    };
    try {
        if( !s )
            return joArg;
        s = "" + s;
        while( s.length > 0 && s[0] == "-" )
            s = s.substring( 1 );
        const n = s.indexOf( "=" );
        if( n < 0 ) {
            joArg.name = s;
            return joArg;
        }
        joArg.name = s.substring( 0, n );
        joArg.value = s.substring( n + 1 );
    } catch ( err ) {}
    return joArg;
}

// check correctness of command line arguments
export function ensureHaveValue(
    name, value, isExitIfEmpty,
    isPrintValue, fnNameColorizer, fnValueColorizer
) {
    isExitIfEmpty = isExitIfEmpty || false;
    isPrintValue = isPrintValue || false;
    fnNameColorizer = fnNameColorizer || ( ( x ) => {
        return cc.info( x );
    } );
    fnValueColorizer = fnValueColorizer || ( ( x ) => {
        return cc.notice( x );
    } );
    let retVal = true;
    value = value ? value.toString() : "";
    if( value.length === 0 ) {
        retVal = false;
        if( ! isPrintValue ) {
            console.log( cc.error( "WARNING:" ) + cc.warning( " missing value for " ) +
                fnNameColorizer( name ) );
        }
        if( isExitIfEmpty )
            process.exit( 126 );
    }
    let strDots = "...";
    let n = 50 - name.length;
    for( ; n > 0; --n )
        strDots += ".";
    if( isPrintValue ) {
        log.write( fnNameColorizer( name ) + cc.debug( strDots ) +
            fnValueColorizer( value ) + "\n" );
    }
    return retVal;
}

export function ensureHaveCredentials(
    strFriendlyChainName, joAccount, isExitIfEmpty, isPrintValue
) {
    strFriendlyChainName = strFriendlyChainName || "<UNKNOWN>";
    if( ! ( typeof joAccount == "object" ) ) {
        log.error( "ARGUMENTS VALIDATION WARNING: bad account specified for ",
            cc.info( strFriendlyChainName ), " chain" );
        if( isExitIfEmpty )
            process.exit( 126 );
    }
    let cntAccountVariantsSpecified = 0;
    if( "strTransactionManagerURL" in joAccount &&
        typeof joAccount.strTransactionManagerURL == "string" &&
        joAccount.strTransactionManagerURL.length > 0
    ) {
        ++ cntAccountVariantsSpecified;
        ensureHaveValue(
            "" + strFriendlyChainName + "/TM/URL",
            joAccount.strTransactionManagerURL, isExitIfEmpty, isPrintValue
        );
    }
    if( "strSgxURL" in joAccount &&
        typeof joAccount.strSgxURL == "string" &&
        joAccount.strSgxURL.length > 0
    ) {
        ++ cntAccountVariantsSpecified;
        ensureHaveValue(
            "" + strFriendlyChainName + "/SGX/URL",
            joAccount.strSgxURL, isExitIfEmpty, isPrintValue
        );
        if( "strPathSslKey" in joAccount &&
            typeof joAccount.strPathSslKey == "string" &&
            joAccount.strPathSslKey.length > 0
        ) {
            ensureHaveValue(
                "" + strFriendlyChainName + "/SGX/SSL/keyPath",
                joAccount.strPathSslKey, isExitIfEmpty, isPrintValue
            );
        }
        if( "strPathSslCert" in joAccount &&
            typeof joAccount.strPathSslCert == "string" &&
            joAccount.strPathSslCert.length > 0
        ) {
            ensureHaveValue(
                "" + strFriendlyChainName + "/SGX/SSL/certPath",
                joAccount.strPathSslCert, isExitIfEmpty, isPrintValue
            );
        }
    }
    if( "strSgxKeyName" in joAccount &&
        typeof joAccount.strSgxKeyName == "string" &&
        joAccount.strSgxKeyName.length > 0
    ) {
        ++ cntAccountVariantsSpecified;
        ensureHaveValue(
            "" + strFriendlyChainName + "/SGX/keyName",
            joAccount.strSgxKeyName, isExitIfEmpty, isPrintValue
        );
    }
    if( "privateKey" in joAccount &&
        typeof joAccount.privateKey == "string" &&
        joAccount.privateKey.length > 0
    ) {
        ++ cntAccountVariantsSpecified;
        ensureHaveValue(
            "" + strFriendlyChainName + "/privateKey",
            joAccount.privateKey, isExitIfEmpty, isPrintValue
        );
    }
    if( "address_" in joAccount &&
        typeof joAccount.address_ == "string" &&
        joAccount.address_.length > 0
    ) {
        ++ cntAccountVariantsSpecified;
        ensureHaveValue(
            "" + strFriendlyChainName + "/walletAddress",
            joAccount.address_, isExitIfEmpty, isPrintValue
        );
    }
    if( cntAccountVariantsSpecified == 0 ) {
        log.error( "ARGUMENTS VALIDATION WARNING: bad credentials information specified for ",
            cc.info( strFriendlyChainName ), " chain, no explicit SGX, no explicit private key, ",
            "no wallet address found" );
        if( isExitIfEmpty )
            process.exit( 126 );
    }
    return true;
}

export function findNodeIndex( joSChainNodeConfiguration ) {
    try {
        const searchID = joSChainNodeConfiguration.skaleConfig.nodeInfo.nodeID;
        const cnt = joSChainNodeConfiguration.skaleConfig.sChain.nodes.length;
        for( let i = 0; i < cnt; ++i ) {
            const joNodeDescription = joSChainNodeConfiguration.skaleConfig.sChain.nodes[i];
            if( joNodeDescription.nodeID == searchID )
                return i;
        }
    } catch ( err ) {}
    return 0;
}

function printHelpGeneral( soi ) {
    console.log( cc.sunny( "GENERAL" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) + cc.bright( "help" ) +
        "..................................", cc.notice( "Show this " ) +
        cc.note( "help info" ) + cc.notice( " and exit." ) );
    console.log( soi + cc.debug( "--" ) + cc.bright( "version" ) +
        "...............................", cc.notice( "Show " ) +
        cc.note( "version info" ) + cc.notice( " and exit." ) );
    console.log( soi + cc.debug( "--" ) + cc.bright( "colors" ) +
        "................................", cc.notice( "Use " ) +
        cc.rainbow( "ANSI-colorized logging" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) + cc.bright( "no-colors" ) +
        ".............................", cc.notice( "Use " ) +
        cc.normal( "monochrome logging" ) + cc.notice( "." ) );
}

function printHelpBlockchainNetwork( soi ) {
    console.log( cc.sunny( "BLOCKCHAIN NETWORK" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "url-main-net" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "......................", cc.note( "Main-net" ) +
        cc.notice( " URL. Value is automatically loaded from the " ) +
        cc.warning( "URL_W3_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "url-s-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        ".......................", cc.note( "S-chain" ) +
        cc.notice( " URL. Value is automatically loaded from the " ) +
        cc.warning( "URL_W3_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "url-t-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        ".......................", cc.note( "S<->S Target S-chain" ) +
        cc.notice( " URL. Value is automatically loaded from the " ) +
        cc.warning( "URL_W3_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "id-main-net" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        "....................", cc.note( "Main-net" ) +
        cc.notice( " Ethereum " ) + cc.note( "network name." ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CHAIN_NAME_ETHEREUM" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( "\"Mainnet\"" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "id-s-chain" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        ".....................", cc.note( "S-chain" ) +
        cc.notice( " Ethereum " ) + cc.note( "network name." ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CHAIN_NAME_SCHAIN" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( "\"id-S-chain\"" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "id-t-chain" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        ".....................", cc.note( "S<->S Target S-chain" ) +
        cc.notice( " Ethereum " ) + cc.note( "network name." ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CHAIN_NAME_SCHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( "\"id-T-chain\"" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "cid-main-net" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        "...................", cc.note( "Main-net" ) +
        cc.notice( " Ethereum " ) + cc.attention( "chain ID" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CID_ETHEREUM" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( -4 ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "cid-s-chain" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        "....................", cc.note( "S-chain" ) +
        cc.notice( " Ethereum " ) + cc.attention( "chain ID" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CID_SCHAIN" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( -4 ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "cid-t-chain" ) + cc.sunny( "=" ) + cc.success( "number" ) +
        "....................", cc.note( "S<->S Target S-chain" ) +
        cc.notice( " Ethereum " ) + cc.attention( "chain ID" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "CID_SCHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default value is " ) + cc.sunny( -4 ) + cc.notice( "." ) );
}

function printHelpBlockchainInterface( soi ) {
    console.log( cc.sunny( "BLOCKCHAIN INTERFACE" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "abi-skale-manager" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "................", cc.notice( "Path to JSON file containing " ) +
        cc.bright( "Skale Manager" ) + cc.notice( " ABI. " ) +
        cc.debug( "Optional parameter. It's needed for " ) + cc.note( "S-Chain" ) +
        cc.debug( " to " ) + cc.note( "S-Chain" ) + cc.debug( " transfers." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "abi-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".....................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "IMA" ) +
        cc.notice( " ABI for " ) + cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "abi-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "......................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "IMA" ) +
        cc.notice( " ABI for " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "abi-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "......................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "IMA" ) +
        cc.notice( " ABI for " ) + cc.note( "S<->S Target S-chain" ) + cc.notice( "." ) );
}

function printHelpErcInterfaces( soi ) {
    console.log( cc.sunny( "ERC20 INTERFACE" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc20-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "...................", cc.notice( "Path to JSON file containing " ) +
        cc.bright( "ERC20" ) + cc.notice( " ABI for " ) +
        cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc20-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "....................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC20" ) +
        cc.notice( " ABI for " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc20-s-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "............", cc.notice( "Explicit " ) + cc.bright( "ERC20" ) +
        cc.notice( " address in " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc20-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "....................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC20" ) +
        cc.notice( " ABI for " ) + cc.note( "S<->S Target S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc20-t-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "............", cc.notice( "Explicit " ) + cc.bright( "ERC20" ) +
        cc.notice( " address in " ) +
        cc.note( "S<->S Target S-chain" ) + cc.notice( "." ) );

    console.log( cc.sunny( "ERC721 INTERFACE" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc721-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..................", cc.notice( "Path to JSON file containing " ) +
        cc.bright( "ERC721" ) + cc.notice( " ABI for " ) +
        cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc721-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "...................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC721" ) +
        cc.notice( " ABI for " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc721-s-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "...........", cc.notice( "Explicit " ) + cc.bright( "ERC721" ) +
        cc.notice( " address in " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc721-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "...................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC721" ) +
        cc.notice( " ABI for " ) + cc.note( "S<->S S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc721-t-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "...........", cc.notice( "Explicit " ) + cc.bright( "ERC721" ) +
        cc.notice( " address in " ) + cc.note( "S<->S S-chain" ) + cc.notice( "." ) );

    console.log( cc.sunny( "ERC1155 INTERFACE" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc1155-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC1155" ) +
        cc.notice( " ABI for " ) + cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc1155-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC1155" ) +
        cc.notice( " ABI for " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc1155-s-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "..........", cc.notice( "Explicit " ) + cc.bright( "ERC1155" ) +
        cc.notice( " address in " ) + cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "erc1155-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..................",
    cc.notice( "Path to JSON file containing " ) + cc.bright( "ERC1155" ) +
        cc.notice( " ABI for " ) + cc.note( "S<->S S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "addr-erc1155-t-chain" ) + cc.sunny( "=" ) + cc.attention( "address" ) +
        "..........", cc.notice( "Explicit " ) + cc.bright( "ERC1155" ) +
        cc.notice( " address in " ) + cc.note( "S<->S S-chain" ) + cc.notice( "." ) );
}

function printHelpUserAccount1( soi ) {
    console.log( cc.sunny( "USER ACCOUNT" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-url-main-net" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...................", cc.bright( "Transaction Manager" ) +
        cc.notice( " server URL for " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_URL_ETHEREUM" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Example: " ) + cc.bright( "redis://@127.0.0.1:6379" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-url-s-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "....................", cc.bright( "Transaction Manager" ) +
        cc.notice( " server URL for " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_URL_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-url-t-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "....................", cc.bright( "Transaction Manager" ) +
        cc.notice( " server URL for " ) + cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_URL_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-priority-main-net" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "..............", cc.bright( "Transaction Manager" ) +
        cc.notice( " priority for " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_PRIORITY_ETHEREUM" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default is " ) + cc.sunny( "5" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-priority-s-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...............", cc.bright( "Transaction Manager" ) +
        cc.notice( " priority for " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_PRIORITY_S_CHAIN" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default is " ) + cc.sunny( "5" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tm-priority-t-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...............", cc.bright( "Transaction Manager" ) +
        cc.notice( " priority for " ) + cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "TRANSACTION_MANAGER_PRIORITY_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified. " ) +
        cc.debug( "Default is " ) + cc.sunny( "5" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-url-main-net" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "..................", cc.sunny( "SGX server" ) +
        cc.notice( " URL for " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_URL_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-url-s-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...................", cc.sunny( "SGX server" ) +
        cc.notice( " URL for " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_URL_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-url-t-chain" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...................", cc.sunny( "SGX server" ) +
        cc.notice( " URL for " ) + cc.note( "S<->S Target S-chain." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-url" ) + cc.sunny( "=" ) + cc.attention( "URL" ) +
        "...........................", cc.sunny( "SGX server" ) +
        cc.notice( " URL for all chains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ecdsa-key-main-net" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "...........", cc.attention( "SGX/ECDSA key name" ) +
        cc.notice( " for " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_KEY_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ecdsa-key-s-chain" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "............", cc.attention( "SGX/ECDSA key name" ) +
        cc.notice( " for " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_KEY_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ecdsa-key-t-chain" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "............", cc.attention( "SGX/ECDSA key name" ) +
        cc.notice( " for " ) + cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_KEY_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ecdsa-key" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "............", cc.attention( "SGX/ECDSA key name" ) +
        cc.notice( " for all chains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-bls-key-main-net" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        ".............", cc.attention( "SGX/BLS key name" ) +
        cc.notice( " for " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "BLS_KEY_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-bls-key-s-chain" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "..............", cc.attention( "SGX/BLS key name" ) +
        cc.notice( " for " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "BLS_KEY_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-bls-key-t-chain" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "..............", cc.attention( "SGX/BLS key name" ) +
        cc.notice( " for " ) + cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "BLS_KEY_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-bls-key" ) + cc.sunny( "=" ) + cc.error( "name" ) +
        "..............", cc.attention( "SGX/BLS key name" ) +
        cc.notice( " for all chains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-key-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".............", cc.notice( "Path to " ) + cc.note( "SSL key file" ) +
        cc.notice( " for " ) + cc.bright( "SGX wallet" ) + cc.notice( " of " ) +
        cc.note( "Main-net" ) + cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_KEY_FILE_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-key-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..............", cc.notice( "Path to " ) +
        cc.note( "SSL key file" ) + cc.notice( " for " ) + cc.bright( "SGX wallet" ) +
        cc.notice( " of " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_KEY_FILE_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-key-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..............", cc.notice( "Path to " ) + cc.note( "SSL key file" ) +
        cc.notice( " for " ) + cc.bright( "SGX wallet" ) + cc.notice( " of " ) +
        cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_KEY_FILE_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-key" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "..............", cc.notice( "Path to " ) + cc.note( "SSL key file" ) +
        cc.notice( " for " ) + cc.bright( "SGX wallet" ) + cc.notice( " of all chains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-cert-main-net" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        "............", cc.notice( "Path to " ) +
        cc.note( "SSL certificate file" ) + cc.notice( " for " ) +
        cc.bright( "SGX wallet" ) + cc.notice( " of " ) + cc.note( "Main-net" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_CERT_FILE_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-cert-s-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".............", cc.notice( "Path to " ) +
        cc.note( "SSL certificate file" ) + cc.notice( " for " ) +
        cc.bright( "SGX wallet" ) + cc.notice( " of " ) + cc.note( "S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_CERT_FILE_S_CHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-cert-t-chain" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".............", cc.notice( "Path to " ) +
        cc.note( "SSL certificate file" ) + cc.notice( " for " ) +
        cc.bright( "SGX wallet" ) + cc.notice( " of " ) +
        cc.note( "S<->S Target S-chain" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "SGX_SSL_CERT_FILE_S_CHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sgx-ssl-cert" ) + cc.sunny( "=" ) + cc.attention( "path" ) +
        ".............", cc.notice( "Path to " ) +
        cc.note( "SSL certificate file" ) + cc.notice( " for all chains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "address-main-net" ) + cc.sunny( "=" ) + cc.warning( "value" ) +
        "................", cc.note( "Main-net" ) + " " +
        cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "ACCOUNT_FOR_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "address-s-chain" ) + cc.sunny( "=" ) + cc.warning( "value" ) +
        ".................", cc.note( "S-chain" ) + " " +
        cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "ACCOUNT_FOR_SCHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "address-t-chain" ) + cc.sunny( "=" ) + cc.warning( "value" ) +
        ".................", cc.note( "S<->S Target S-chain" ) +
        " " + cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "ACCOUNT_FOR_SCHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
}

function printHelpUserAccount2( soi ) {
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "key-main-net" ) + cc.sunny( "=" ) + cc.error( "value" ) +
        "....................", cc.attention( "Private key" ) +
        cc.notice( " for " ) + cc.note( "Main-net" ) + " " +
        cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "PRIVATE_KEY_FOR_ETHEREUM" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "key-s-chain" ) + cc.sunny( "=" ) + cc.error( "value" ) +
        ".....................", cc.attention( "Private key" ) +
        cc.notice( " for " ) + cc.note( "S-Chain" ) + " " +
        cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "PRIVATE_KEY_FOR_SCHAIN" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "key-t-chain" ) + cc.sunny( "=" ) + cc.error( "value" ) +
        ".....................", cc.attention( "Private key" ) +
        cc.notice( " for " ) + cc.note( "S<->S Target S-Chain" ) + " " +
        cc.attention( "user account address" ) +
        cc.notice( ". Value is automatically loaded from the " ) +
        cc.warning( "PRIVATE_KEY_FOR_SCHAIN_TARGET" ) +
        cc.notice( " environment variable if not specified." ) );
    console.log( soi + cc.debug( "Please notice, IMA prefer to use transaction manager " +
        "to sign blockchain transactions if " ) +
        cc.attention( "--tm-url-main-net" ) + cc.debug( "/" ) +
        cc.attention( "--tm-url-s-chain" ) + cc.debug( " command line values or " ) +
        cc.warning( "TRANSACTION_MANAGER_URL_ETHEREUM" ) + cc.debug( "/" ) +
        cc.warning( "TRANSACTION_MANAGER_URL_S_CHAIN" ) +
        cc.debug( " shell variables were specified. " +
        "Next preferred option is SGX wallet which is used if " ) +
        cc.attention( "--sgx-url-main-net" ) + cc.debug( "/" ) +
        cc.attention( "--sgx-url-s-chain" ) + cc.debug( " command line values or " ) +
        cc.warning( "SGX_URL_ETHEREUM" ) + cc.debug( "/" ) +
        cc.warning( "SGX_URL_S_CHAIN" ) +
        cc.debug( " shell variables were specified. SGX signing also needs " +
        "key name, key and certificate files. " ) +
        cc.debug( "Finally, IMA attempts to use explicitly provided private key " +
        "to sign blockchain transactions if " ) +
        cc.attention( "--key-main-net" ) + cc.debug( "/" ) +
        cc.attention( "--key-s-chain" ) + cc.debug( " command line values or " ) +
        cc.warning( "PRIVATE_KEY_FOR_ETHEREUM" ) + cc.debug( "/" ) +
        cc.warning( "PRIVATE_KEY_FOR_SCHAIN" ) +
        cc.debug( " shell variables were specified. " )
    );
}

function printHelpTransfers( soi ) {
    console.log( cc.sunny( "GENERAL TRANSFER" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "value" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        cc.warning( "unitName" ), ".................",
    cc.notice( "Amount of " ) + cc.attention( "unitName" ) +
        cc.notice( " to transfer, where " ) + cc.attention( "unitName" ) +
        cc.notice( " is well known Ethereum unit name like " ) + cc.attention( "ether" ) +
        cc.notice( " or " ) + cc.attention( "wei" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "wei" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "............................", cc.notice( "Amount of " ) +
        cc.attention( "wei" ) + cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "babbage" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "........................", cc.notice( "Amount of " ) +
        cc.attention( "babbage" ) + cc.info( "(wei*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "lovelace" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        ".......................", cc.notice( "Amount of " ) +
        cc.attention( "lovelace" ) + cc.info( "(wei*1000*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "shannon" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "........................", cc.notice( "Amount of " ) +
        cc.attention( "shannon" ) + cc.info( "(wei*1000*1000*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "szabo" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "..........................", cc.notice( "Amount of " ) +
        cc.attention( "szabo" ) + cc.info( "(wei*1000*1000*1000*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "finney" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        ".........................", cc.notice( "Amount of " ) +
        cc.attention( "finney" ) + cc.info( "(wei*1000*1000*1000*1000*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "ether" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "..........................", cc.notice( "Amount of " ) +
        cc.attention( "ether" ) + cc.info( "(wei*1000*1000*1000*1000*1000*1000)" ) +
        cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "amount" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        ".........................", cc.notice( "Amount of " ) +
        cc.attention( "tokens" ) + cc.notice( " to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tid" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "............................", cc.bright( "ERC721" ) +
        cc.notice( " or " ) + cc.bright( "ERC1155" ) +
        cc.notice( " token id to transfer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "amounts" ) + cc.sunny( "=" ) + cc.attention( "array of numbers" ) +
        "..............", cc.bright( "ERC1155" ) +
        cc.notice( " token id to transfer in batch." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "tids" ) + cc.sunny( "=" ) + cc.attention( "array of numbers" ) +
        ".................", cc.bright( "ERC1155" ) +
        cc.notice( " token amount to transfer in batch." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sleep-between-tx" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        "...............", cc.notice( "Sleep time " ) +
        cc.debug( "(in milliseconds)" ) +
        cc.notice( " between transactions during complex operations." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "wait-next-block" ) +
        ".......................",
    cc.notice( "Wait for next block between transactions " +
        "during complex operations." ) );

    console.log( cc.sunny( "S-CHAIN TO S-CHAIN TRANSFER" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-enable" ), "...........................",
    cc.success( "Enables" ) + " " + cc.note( "S-Chain" ) + cc.notice( " to " ) +
        cc.note( "S-Chain" ) + cc.notice( " transfers. " ) + cc.debug( "Default mode" ) +
        cc.notice( ". The " ) + cc.bright( "abi-skale-manager" ) +
        cc.notice( " path must be provided." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-disable" ), "..........................",
    cc.error( "Disables" ) + " " + cc.note( "S-Chain" ) + cc.notice( " to " ) +
        cc.note( "S-Chain" ) + cc.notice( " transfers." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-parallel" ), ".........................",
    cc.notice( "Sets " ) + " " + cc.note( "parallel S2S transfer mode" ) +
        cc.notice( " and runs S2S in worker thread." ) +
        " " + cc.debug( "This is default mode" ) + cc.notice( ". " )
    );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-simple" ), "...........................",
    cc.notice( "Sets " ) + " " + cc.note( "simple S2S transfer mode" ) +
        cc.notice( " and runs S2S in main thread." )
    );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "net-rediscover" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        ".................", cc.note( "SKALE NETWORK" ) +
        cc.notice( " re-discovery interval" ) + cc.debug( "(in seconds)" ) +
        cc.notice( ". " ) + cc.debug( "Default is " ) + cc.sunny( "3600" ) +
        cc.debug( " seconds or " ) + cc.sunny( "1" ) + cc.debug( " hour, specify " ) +
        cc.sunny( "0" ) + cc.debug( " to " ) + cc.error( "disable" ) + " " +
        cc.note( "SKALE NETWORK" ) + cc.debug( " re-discovery" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "net-wait-discovery" ) + cc.sunny( "=" ) + cc.attention( "number" ) +
        ".............", cc.note( "SKALE NETWORK" ) +
        cc.notice( " wait time" ) + cc.debug( "(in seconds)" ) +
        cc.debug( " for " ) + cc.note( "SKALE NETWORK" ) +
        cc.debug( " discovery result to arrive. " ) + cc.debug( "Default is " ) +
        cc.sunny( "120" ) + cc.notice( "." ) );
}

function printHelpPaymentTransaction( soi ) {
    console.log( cc.sunny( "PAYMENT TRANSACTION" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-price-multiplier-mn" ), "..............",
    cc.notice( "Sets " ) + cc.attention( "Gas Price Multiplier" ) +
        cc.notice( " for " ) + cc.note( "Main Net" ) + cc.notice( " transactions, " ) +
        cc.debug( "Default value is " ) + cc.sunny( "1.25" ) + cc.notice( "." ) +
        cc.debug( " Specify value " ) + cc.sunny( "0.0" ) + cc.debug( " to " ) +
        cc.error( "disable" ) + " " + cc.attention( "Gas Price Customization" ) +
        cc.debug( " for " ) + cc.note( "Main Net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-price-multiplier-sc" ), "..............",
    cc.notice( "Sets " ) + cc.attention( "Gas Price Multiplier" ) +
        cc.notice( " for " ) + cc.note( "S-Chain" ) + cc.notice( " transactions, " ) +
        cc.debug( "Default value is " ) + cc.sunny( "0.0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-price-multiplier-tc" ), "..............",
    cc.notice( "Sets " ) + cc.attention( "Gas Price Multiplier" ) +
        cc.notice( " for " ) + cc.note( "S<->S Target S-Chain" ) +
        cc.notice( " transactions, " ) + cc.debug( "Default value is " ) +
        cc.sunny( "0.0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-price-multiplier" ), ".................",
    cc.notice( "Sets " ) + cc.attention( "Gas Price Multiplier" ) +
        cc.notice( " for both " ) + cc.note( "Main Net" ) + cc.notice( " and " ) +
        cc.note( "S-Chain" ) + cc.debug( "(s)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-multiplier-mn" ), "....................",
    cc.notice( "Sets " ) + cc.attention( "Gas Value Multiplier" ) +
        cc.notice( " for " ) + cc.note( "Main Net" ) + cc.notice( " transactions, " ) +
        cc.debug( "Default value is " ) + cc.sunny( "1.25" ) + cc.notice( "." ) +
        cc.debug( " Specify value " ) + cc.sunny( "0.0" ) + cc.debug( " to " ) +
        cc.error( "disable" ) + " " + cc.attention( "Gas Price Customization" ) +
        cc.debug( " for " ) + cc.note( "Main Net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-multiplier-sc" ), "....................",
    cc.notice( "Sets " ) + cc.attention( "Gas Value Multiplier" ) +
        cc.notice( " for " ) + cc.note( "S-Chain" ) + cc.notice( " transactions, " ) +
        cc.debug( "Default value is " ) + cc.sunny( "1.25" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-multiplier-tc" ), "....................",
    cc.notice( "Sets " ) + cc.attention( "Gas Value Multiplier" ) +
        cc.notice( " for " ) + cc.note( "S<->S Target S-Chain" ) +
        cc.notice( " transactions, " ) + cc.debug( "Default value is " ) +
        cc.sunny( "1.25" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gas-multiplier" ), ".......................",
    cc.notice( "Sets " ) + cc.attention( "Gas Value Multiplier" ) +
        cc.notice( " for both " ) + cc.note( "Main Net" ) + cc.notice( " and " ) +
        cc.note( "S-Chain" ) + cc.debug( "(s)" ) + cc.notice( "." ) );
}

function printHelpRegistration( soi ) {
    console.log( cc.sunny( "REGISTRATION" ) + cc.info( " commands:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "register" ), ".............................",
    cc.notice( "Register" ) + cc.debug( "(perform " ) + cc.sunny( "all steps" ) +
        cc.debug( ")" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "register1" ), "............................",
    cc.notice( "Perform registration " ) + cc.sunny( "step 1" ) +
        cc.notice( " - register " ) + cc.note( "S-Chain" ) + cc.notice( " on " ) +
        cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "check-registration" ), "...................",
    cc.notice( "Perform registration status check" ) + cc.debug( "(perform " ) +
        cc.sunny( "all steps" ) + cc.debug( ")" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "check-registration1" ), "..................",
    cc.notice( "Perform registration status check " ) + cc.sunny( "step 1" ) +
        cc.notice( " - register " ) + cc.note( "S-Chain" ) + cc.notice( " on " ) +
        cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "check-registration2" ), "..................",
    cc.notice( "Perform registration status check " ) + cc.sunny( "step 2" ) +
        cc.notice( " - register " ) + cc.note( "S-Chain" ) + cc.notice( " in " ) +
        cc.attention( "deposit box" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "check-registration3" ), "..................",
    cc.notice( "Perform registration status check " ) + cc.sunny( "step 3" ) +
        cc.notice( " - register " ) + cc.note( "Main-net" ) + cc.notice( "'s " ) +
        cc.attention( "deposit box" ) + cc.notice( " on " ) + cc.note( "S-Chain" ) +
        cc.notice( "." ) );
}

function printHelpAction( soi ) {
    console.log( cc.sunny( "ACTION" ) + cc.info( " commands:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "show-config" ), "..........................",
    cc.notice( "Show " ) + cc.note( "configuration values" ) +
        cc.notice( " and exit." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "show-balance" ), ".........................",
    cc.notice( "Show " ) + cc.note( "ETH" ) +
        cc.notice( " and/or token balances on " ) + cc.note( "Main-net" ) +
        cc.notice( " and/or " ) + cc.note( "S-Chain" ) + cc.notice( " and exit." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-payment" ), "..........................",
    cc.notice( "Do one payment from " ) + cc.note( "Main-net" ) +
        cc.notice( " user account to " ) + cc.note( "S-chain" ) +
        cc.notice( " user account." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-payment" ), "..........................",
    cc.notice( "Do one payment from " ) + cc.note( "S-chain" ) +
        cc.notice( " user account to " ) + cc.note( "Main-net" ) +
        cc.notice( " user account." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-receive" ), "..........................",
    cc.notice( "Receive one payment from " ) + cc.note( "S-chain" ) +
        cc.notice( " user account to " ) + cc.note( "Main-net" ) +
        cc.notice( " user account" ) +
        cc.debug( "(ETH only, receives all the ETH pending in transfer)" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-view" ), ".............................",
    cc.notice( "View money amount user can receive as payment from " ) +
        cc.note( "S-chain" ) + cc.notice( " user account to " ) + cc.note( "Main-net" ) +
        cc.notice( " user account" ) +
        cc.debug( "(ETH only, receives all the ETH pending in transfer)" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-payment" ), "..........................",
    cc.notice( "Do one payment from " ) + cc.note( "S-chain" ) +
        cc.notice( " user account to other " ) + cc.note( "S-chain" ) +
        cc.notice( " user account." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-forward" ), "..........................",
    cc.notice( "Indicates " ) + cc.note( "S<->S" ) +
        cc.notice( " transfer direction is " ) + cc.attention( "forward" ) +
        cc.notice( ". I.e. source " ) + cc.note( "S-chain" ) +
        cc.notice( " is token minter and instantiator. " ) +
        cc.debug( "This is default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-reverse" ), "..........................",
    cc.notice( "Indicates " ) + cc.note( "S<->S" ) +
        cc.notice( " transfer direction is " ) + cc.attention( "reverse" ) +
        cc.notice( ". I.e. destination " ) + cc.note( "S-chain" ) +
        cc.notice( " is token minter and instantiator." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-transfer" ), ".........................",
    cc.notice( "Do single " ) + cc.attention( "message transfer loop" ) +
        cc.notice( " from " ) + cc.note( "Main-net" ) + cc.notice( " to " ) +
        cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-transfer" ), ".........................",
    cc.notice( "Do single " ) + cc.attention( "message transfer loop" ) +
        cc.notice( " from " ) + cc.note( "S-chain" ) + cc.notice( " to " ) +
        cc.note( "Main-net" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-transfer" ), ".........................",
    cc.notice( "Do single " ) + cc.attention( "message transfer loop" ) +
        cc.notice( " from " ) + cc.note( "S-chain" ) + cc.notice( " to " ) +
        cc.note( "S-chain" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "with-metadata" ), "........................",
    cc.notice( "Makes " ) + cc.bright( "ERC721" ) +
        cc.notice( " transfer using special version of " ) +
        cc.bright( "Token Manager" ) + cc.notice( " to transfer token metadata." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "transfer" ), ".............................",
    cc.notice( "Run single " ) + cc.note( "M<->S" ) +
        cc.notice( " and, optionally, " ) + cc.note( "S->S" ) +
        cc.notice( " transfer loop iteration" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "loop" ), ".................................",
    cc.notice( "Run " ) + cc.note( "M<->S" ) + cc.notice( " and, optionally, " ) +
        cc.note( "S->S" ) + cc.notice( " transfer loops in parallel threads." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "simple-loop" ), "..........................",
    cc.notice( "Run " ) + cc.note( "M<->S" ) + cc.notice( " and, optionally, " ) +
        cc.note( "S->S" ) + cc.notice( " transfer loops in main thread only." ) );
}

function printHelpActionAdditional( soi ) {
    console.log( cc.sunny( "ADDITIONAL ACTION" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-wait-s-chain" ), "......................",
    cc.notice( "Do not wait until " ) + cc.note( "S-Chain" ) +
        cc.notice( " is started." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "max-wait-attempts" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        "...............", cc.notice( "Max number of " ) +
        cc.note( "S-Chain" ) +
        cc.notice( " call attempts to do while it became alive and sane." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "skip-dry-run" ), ".........................",
    cc.notice( "Skip " ) + cc.note( "dry run" ) +
        cc.notice( " invocation before payed contract method calls." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-ignore-dry-run" ), "....................",
    cc.notice( "Use error results of " ) + cc.note( "dry run" ) +
        cc.notice( " contract method calls as actual errors and stop execute." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-transfer-block-size" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".........", cc.notice( "Number of transactions in one block " +
        "to use in message transfer loop from " ) + cc.note( "Main-net" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "4" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-transfer-block-size" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".........", cc.notice( "Number of transactions in one block " +
        "to use in message transfer loop from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "Main-net" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "4" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-transfer-block-size" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".........", cc.notice( "Number of transactions in one block " +
        "to use in message transfer loop from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "4" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "transfer-block-size" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".............", cc.notice( "Number of transactions in one block " +
        "to use in all message transfer loops." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-transfer-steps" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        "..............", cc.notice( "Maximal number of blocks " +
        "to transfer at a job run from " ) + cc.note( "Main-net" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.notice( "." ) +
        cc.debug( " Value " ) + cc.sunny( "0" ) + cc.debug( " is unlimited" ) +
        cc.notice( "." ) + cc.debug( " Default is " ) + cc.sunny( "8" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-transfer-steps" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        "..............", cc.notice( "Maximal number of blocks " +
        "to transfer at a job run from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "Main-net" ) + cc.notice( "." ) +
        cc.debug( " Value " ) + cc.sunny( "0" ) + cc.debug( " is unlimited" ) +
        cc.notice( "." ) + cc.debug( " Default is " ) + cc.sunny( "8" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-transfer-steps" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        "..............", cc.notice( "Maximal number of blocks " +
        "to transfer at a job run from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.notice( "." ) +
        cc.debug( " Value " ) + cc.sunny( "0" ) + cc.debug( " is unlimited" ) +
        cc.notice( "." ) + cc.debug( " Default is " ) + cc.sunny( "8" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "transfer-steps" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        "..................", cc.notice( "Maximal number of blocks " +
        "to transfer at a job run in all transfer loops." ) + cc.debug( " Value " ) +
        cc.sunny( "0" ) + cc.debug( " is unlimited" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-max-transactions" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...........", cc.notice( "Maximal number of transactions " +
        "to do in message transfer loop from " ) + cc.note( "Main-net" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.debug( "(" ) +
        cc.sunny( "0" ) + cc.debug( " is unlimited)" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-max-transactions" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...........", cc.notice( "Maximal number of transactions " +
        "to do in message transfer loop from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "Main-net" ) + cc.debug( "(" ) +
        cc.sunny( "0" ) + cc.debug( " is unlimited)" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-max-transactions" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...........", cc.notice( "Maximal number of transactions " +
        "to do in message transfer loop from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is unlimited)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "max-transactions" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...............", cc.notice( "Maximal number of transactions " +
        "to do in all message transfer loops" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is unlimited)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-await-blocks" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...............", cc.notice( "Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " ) + cc.note( "Main-net" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is no wait)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-await-blocks" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...............", cc.notice( "Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "Main-net" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is no wait)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-await-blocks" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...............", cc.notice( "Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is no wait)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "await-blocks" ) + cc.sunny( "=" ) + cc.info( "number" ) +
        "...................", cc.notice( "Maximal number of blocks " +
        "to wait to appear in blockchain before transaction between both " ) +
        cc.note( "S-chain" ) + cc.notice( " and " ) + cc.note( "Main-net" ) +
        cc.debug( "(" ) + cc.sunny( "0 " ) + cc.debug( "is no wait)" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "m2s-await-time" ) + cc.sunny( "=" ) + cc.info( "seconds" ) +
        "................",
    cc.notice( "Minimal age of transaction message" ) +
        cc.debug( "(in seconds)" ) + cc.notice( " before it will be transferred from " ) +
        cc.note( "Main-net" ) + cc.notice( " to " ) + cc.note( "S-chain" ) +
        cc.debug( "(" ) + cc.sunny( "0" ) + cc.debug( " is no wait)" ) +
        cc.notice( "." ) + cc.debug( " Default is " ) + cc.sunny( "0" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2m-await-time" ) + cc.sunny( "=" ) + cc.info( "seconds" ) +
        "................",
    cc.notice( "Minimal age of transaction message" ) + cc.debug( "(in seconds)" ) +
        cc.notice( " before it will be transferred from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "Main-net" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is no wait)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "s2s-await-time" ) + cc.sunny( "=" ) + cc.info( "seconds" ) +
        "................",
    cc.notice( "Minimal age of transaction message" ) + cc.debug( "(in seconds)" ) +
        cc.notice( " before it will be transferred from " ) + cc.note( "S-chain" ) +
        cc.notice( " to " ) + cc.note( "S-chain" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " is no wait)" ) + cc.notice( "." ) + cc.debug( " Default is " ) +
        cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "await-time" ) + cc.sunny( "=" ) + cc.info( "seconds" ) +
        "....................",
    cc.notice( "Minimal age of transaction message" ) + cc.debug( "(in seconds)" ) +
        cc.notice( " before it will be transferred between both " ) +
        cc.note( "S-chain" ) + cc.notice( " and " ) + cc.note( "Main-net" ) +
        cc.debug( "(" ) + cc.sunny( "0" ) + cc.debug( " is no wait)" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "period" ), "...............................",
    cc.notice( "Transfer " ) + cc.note( "loop period" ) + cc.debug( "(in seconds)" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "node-number" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".....................", cc.note( "S-Chain" ) + " " +
        cc.bright( "node number" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( "-based)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "nodes-count" ) + cc.sunny( "=" ) + cc.info( "value" ) +
        ".....................", cc.note( "S-Chain" ) + " " +
        cc.bright( "nodes count" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "time-framing" ) + cc.sunny( "=" ) + cc.note( "value" ) +
        "....................", cc.notice( "Specifies " ) +
        cc.note( "period" ) + cc.debug( "(in seconds) " ) +
        cc.note( "for time framing" ) + cc.debug( "(" ) + cc.sunny( "0" ) +
        cc.debug( " to " ) + cc.error( "disable" ) +
        cc.debug( " time framing)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "time-gap" ) + cc.sunny( "=" ) + cc.note( "value" ) +
        "........................", cc.notice( "Specifies " ) +
        cc.note( "gap" ) + cc.debug( "(in seconds) " ) +
        cc.note( "before next time frame" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "auto-exit" ) + cc.sunny( "=" ) + cc.note( "seconds" ) +
        ".....................", cc.notice( "Automatically exit " ) +
        cc.bright( "IMA Agent" ) + cc.notice( " after specified number of seconds" ) +
        cc.debug( "(" ) + cc.sunny( "0" ) + cc.debug( " is no automatic exit, " ) +
        cc.sunny( "3600" ) + cc.debug( " is no default)" ) + cc.notice( "." ) );
}

function printHelpTokenTesting( soi ) {
    console.log( cc.sunny( "TOKEN TESTING" ) + cc.info( " commands:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "mint-erc20" ), "...........................",
    cc.notice( "Mint " ) + cc.note( "ERC20" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "mint-erc721" ), "..........................",
    cc.notice( "Mint " ) + cc.note( "ERC721" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "mint-erc1155" ), ".........................",
    cc.notice( "Mint " ) + cc.note( "ERC1155" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "burn-erc20" ), "...........................",
    cc.notice( "Burn " ) + cc.note( "ERC20" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "burn-erc721" ), "..........................",
    cc.notice( "Burn " ) + cc.note( "ERC721" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "burn-erc1155" ), ".........................",
    cc.notice( "Burn " ) + cc.note( "ERC1155" ) + cc.notice( " tokens." ) );
    console.log( soi + cc.debug( "Please notice, token testing commands require " ) +
        cc.attention( "--tm-url-t-chain" ) + cc.debug( ", " ) +
        cc.attention( "cid-t-chain" ) + cc.debug( ", " ) +
        cc.attention( "erc20-t-chain" ) + cc.debug( " or " ) +
        cc.attention( "erc721-t-chain" ) + cc.debug( " or " ) +
        cc.attention( "erc1155-t-chain" ) +
        cc.debug( ", account information (like private key " ) +
        cc.attention( "key-t-chain" ) +
        cc.debug( ") command line arguments specified. Token amounts are specified via " ) +
        cc.attention( "amount" ) +
        cc.debug( " command line arguments specified. Token IDs are specified via " ) +
        cc.attention( "tid" ) + cc.debug( " or " ) + cc.attention( "tids" ) +
        cc.debug( " command line arguments." )
    );
}

function printHelpNetworkStateAnalysis( soi ) {
    console.log( cc.sunny( "IMA WORK STATE ANALYSIS" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "pwa" ), "..................................",
    cc.success( "Enable" ) + " " + cc.attention( "pending work analysis" ) +
        cc.notice( " to avoid transaction conflicts." ) + " " +
        cc.debug( "Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-pwa" ), "...............................",
    cc.error( "Disable" ) + " " + cc.attention( "pending work analysis" ) +
        cc.notice( ". " ) + cc.warning( "Not recommended" ) +
        cc.notice( " for slow and overloaded blockchains." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "pwa-timeout" ) + cc.sunny( "=" ) + cc.note( "seconds" ) +
        "...................", cc.notice( "Node state timeout during " ) +
        cc.attention( "pending work analysis" ) + cc.notice( ". " ) +
        cc.debug( "Default is " ) + cc.sunny( "60" ) + cc.debug( " seconds" ) +
        cc.notice( "." ) );
}

function printHelpMessageSigning( soi ) {
    console.log( cc.sunny( "MESSAGE SIGNING" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "sign-messages" ), "........................",
    cc.notice( "Sign transferred messages." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bls-glue" ) + cc.sunny( "=" ) + cc.note( "path" ) +
        ".........................", cc.notice( "Specifies path to " ) +
        cc.note( "bls_glue" ) + cc.notice( " application." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "hash-g1" ) + cc.sunny( "=" ) + cc.note( "path" ) +
        "..........................", cc.notice( "Specifies path to " ) +
        cc.note( "hash_g1" ) + cc.notice( " application." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bls-verify" ) + cc.sunny( "=" ) + cc.note( "path" ) +
        ".......................",
    cc.debug( "Optional parameter, specifies path to " ) +
        cc.note( "verify_bls" ) + cc.debug( " application." ) );
}

function printHelpMonitoring( soi ) {
    console.log( cc.sunny( "MONITORING" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "monitoring-port" ) + cc.sunny( "=" ) + cc.note( "number" ) +
        "................", cc.notice( "Run " ) +
        cc.note( "monitoring web socket RPC server" ) +
        cc.notice( " on specified port. " ) + cc.debug( "Specify " ) +
        cc.sunny( "0" ) + cc.debug( " to " ) + cc.error( "disable" ) +
        cc.notice( "." ) + cc.debug( " By default monitoring server is " ) +
        cc.error( "disabled" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "monitoring-log" ) +
        "........................", cc.notice( "Enable logging on " ) +
        cc.note( "monitoring web socket RPC server" ) +
        cc.notice( ". " ) + cc.debug( " By default these log messages are " ) +
        cc.error( "disabled" ) + cc.notice( "." ) );
}

function printHelpGasReimbursement( soi ) {
    console.log( cc.sunny( "GAS REIMBURSEMENT" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "reimbursement-chain" ) + cc.sunny( "=" ) + cc.note( "name" ) +
        "..............", cc.notice( "Specifies chain name." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "reimbursement-recharge" ) + cc.sunny( "=" ) + cc.note( "v" ) +
        cc.warning( "u" ), "............", cc.success( "Recharge" ) +
        cc.notice( " user wallet with specified value " ) + cc.attention( "v" ) +
        cc.notice( ", unit name " ) + cc.attention( "u" ) +
        cc.notice( " is well known Ethereum unit name like " ) + cc.attention( "ether" ) +
        cc.notice( " or " ) + cc.attention( "wei" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "reimbursement-withdraw" ) + cc.sunny( "=" ) + cc.note( "v" ) +
        cc.warning( "u" ), "............", cc.error( "Withdraw" ) +
        cc.notice( " user wallet with specified value " ) + cc.attention( "v" ) +
        cc.notice( ", unit name " ) + cc.attention( "u" ) +
        cc.notice( " is well known Ethereum unit name like " ) + cc.attention( "ether" ) +
        cc.notice( " or " ) + cc.attention( "wei" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "reimbursement-balance" ), "................",
    cc.notice( "Show wallet balance." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "reimbursement-range" ) + cc.sunny( "=" ) + cc.note( "number" ) +
        "............", cc.notice( "Sets " ) +
        cc.note( "minimal time interval" ) + cc.notice( " between transfers from " ) +
        cc.note( "S-Chain" ) + cc.notice( " to " ) + cc.note( "Main Net" ) +
        cc.notice( "." ) );
}

function printHelpPastEventsScan( soi ) {
    console.log( cc.sunny( "PAST EVENTS SCAN" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bs-step-size" ) + cc.sunny( "=" ) + cc.note( "number" ) +
        "...................", cc.notice( "Specifies " ) +
        cc.note( "step block range size" ) +
        cc.notice( " to search iterative past events step by step. " ) +
        cc.sunny( "0" ) + cc.notice( " to " ) + cc.error( "disable" ) +
        cc.notice( " iterative search." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bs-max-all-range" ) +
        cc.sunny( "=" ) + cc.note( "number" ), "..............",
    cc.notice( "Specifies " ) + cc.note( "max number of steps" ) +
        cc.notice( " to allow to search as [0...latest] range. " ) +
        cc.sunny( "0" ) + cc.notice( " to " ) + cc.error( "disable" ) +
        cc.notice( " iterative search." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bs-progressive-enable" ), "................",
    cc.success( "Enables" ) + " " + cc.attention( "progressive block scan" ) +
        cc.notice( " to search past events." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "bs-progressive-disable" ), "...............",
    cc.error( "Disables" ) + " " + cc.attention( "progressive block scan" ) +
        cc.notice( " to search past events." ) );
}

function printHelpOracleBasedReimbursement( soi ) {
    console.log( cc.sunny( "ORACLE BASED GAS REIMBURSEMENT" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "enable-oracle" ), "........................",
    cc.success( "Enable" ) + cc.notice( " call to " ) + cc.note( "Oracle" ) +
        cc.notice( " to compute " ) + cc.note( "gas price" ) + cc.notice( " for " ) +
        cc.attention( "gas reimbursement" ) + cc.notice( ". " ) +
        cc.debug( "Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "disable-oracle" ), ".......................",
    cc.error( "Disable" ) + cc.notice( " call to " ) + cc.note( "Oracle" ) +
        cc.notice( " to compute " ) + cc.note( "gas price" ) + cc.notice( " for " ) +
        cc.attention( "gas reimbursement" ) + cc.notice( "." ) );
}

function printHelpJsonRpcServer( soi ) {
    console.log( cc.sunny( "IMA JSON RPC SERVER" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "json-rpc-port" ) + cc.sunny( "=" ) + cc.note( "number" ) +
        "..................", cc.notice( "Run " ) +
        cc.note( "IMA JSON RPC server" ) + cc.notice( " on specified " ) +
        cc.note( "port" ) + cc.notice( "." ) + cc.debug( " Specify " ) +
        cc.sunny( "0" ) + cc.debug( " to " ) + cc.error( "disable" ) + cc.notice( "." ) +
        cc.debug( " Default is " ) + cc.sunny( "0" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "cross-ima" ), "............................",
    cc.success( "Enable" ) + cc.notice( " calls to " ) +
        cc.note( "IMA JSON RPC servers" ) + cc.notice( " to compute " ) +
        cc.note( "BLS signature parts" ) +
        cc.notice( " and operation state inside time frames." ) +
        cc.debug( "Use calls to " ) + cc.attention( "IMA Agent" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-cross-ima" ), ".........................",
    cc.error( "Disable" ) + cc.notice( " calls to " ) +
        cc.note( "IMA JSON RPC servers" ) + cc.notice( " to compute " ) +
        cc.note( "BLS signature parts" ) +
        cc.notice( " and operation state inside time frames. " ) +
        cc.debug( "Use calls to " ) + cc.attention( "skaled" ) + cc.notice( "." ) +
        cc.debug( " Default mode" ) + cc.notice( "." ) );
}

function printHelpTest( soi ) {
    console.log( cc.sunny( "TEST" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "browse-s-chain" ), ".......................",
    cc.notice( "Download own " ) + cc.note( "S-Chain" ) +
        cc.notice( " network information." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "browse-skale-network" ), ".................",
    cc.notice( "Download entire " ) + cc.note( "SKALE network" ) +
        cc.notice( " description." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "browse-connected-schains" ), ".............",
    cc.notice( "Download " ) + cc.note( "S-Chains" ) +
        cc.notice( " connected to " ) + cc.note( "S-Chain" ) +
        cc.notice( " with name specified in " ) + cc.bright( "id-s-chain" ) +
        cc.notice( " command line parameter." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "discover-cid" ), ".........................",
    cc.notice( "Discover " ) + cc.attention( "chains ID(s)" ) +
        cc.notice( " from provided " ) + cc.note( "URL(s)" ) + cc.notice( "." ) +
        cc.debug( " This command is not executed automatically at startup" ) +
        cc.notice( "." ) );
}

function printHelpOptimization( soi ) {
    console.log( cc.sunny( "OPTIMIZATION" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "enable-multicall" ), ".....................",
    cc.success( "Enable" ) + cc.notice( " optimizations via multi-call." ) +
        cc.debug( " Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "disable-multicall" ), "....................",
    cc.error( "Disable" ) + cc.notice( " optimizations via multi-call." ) );
}

function printHelpLogging( soi ) {
    console.log( cc.sunny( "LOGGING" ) + cc.info( " options:" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "expose" ), "...............................",
    cc.notice( "Expose " ) + cc.note( "low-level log details" ) +
        cc.notice( " after " ) + cc.success( "successful operations" ) +
        cc.notice( ". " ) + cc.debug( "By default details exposed only " ) +
        cc.error( "on errors" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-expose" ), "............................",
    cc.notice( "Expose " ) + cc.note( "low-level log details" ) +
        cc.notice( " only after " ) + cc.error( "errors" ) + cc.notice( ". " ) +
        cc.debug( "Default expose mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "verbose" ) + cc.sunny( "=" ) + cc.bright( "value" ) +
        ".........................",
    cc.notice( "Set " ) + cc.note( "level" ) + cc.notice( " of output details." ) );
    console.log( soi + cc.debug( "--" ) + cc.bright( "verbose-list" ) +
        "..........................",
    cc.notice( "List available " ) + cc.note( "verbose levels" ) +
        cc.notice( " and exit." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "log" ) + cc.sunny( "=" ) + cc.note( "path" ) +
        "..............................",
    cc.notice( "Write program output to specified " ) + cc.note( "log file" ) +
        cc.debug( "(multiple files can be specified)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "log-size" ) + cc.sunny( "=" ) + cc.note( "value" ) +
        "........................", cc.notice( "Max size" ) +
        cc.debug( "(in bytes)" ) + cc.notice( " of one log file" ) +
        cc.debug( "(affects to log log rotation)" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "log-files" ) + cc.sunny( "=" ) + cc.note( "value" ) +
        ".......................",
    cc.notice( "Maximum number of log files for log rotation." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "gathered" ), ".............................",
    cc.notice( "Print details of gathering data from command line arguments. " ) +
        cc.debug( "Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-gathered" ), "..........................",
    cc.notice( "Do not print details of gathering data " +
        "from command line arguments." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "expose-security-info" ), ".................",
    cc.notice( "Expose security-related values in log output." ) + " " +
        cc.debug( "This mode is needed for debugging purposes only" ) +
        cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-expose-security-info" ), "..............",
    cc.notice( "Do not expose security-related values in log output." ) +
        " " + cc.debug( "Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "expose-pwa" ), "...........................",
    cc.notice( "Expose IMA agent pending work analysis information" ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "no-expose-pwa" ), "........................",
    cc.notice( "Do not expose IMA agent pending work analysis information" ) +
        cc.notice( "." ) + " " + cc.debug( "Default mode" ) + cc.notice( "." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "accumulated-log-in-transfer" ), "..........",
    cc.notice( "Use accumulated log in message transfer loop." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "accumulated-log-in-bls-signer" ), "........",
    cc.notice( "Use accumulated log in BLS signer." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "dynamic-log-in-transfer" ), "..............",
    cc.notice( "Use realtime log in message transfer loop." ) );
    console.log( soi + cc.debug( "--" ) +
        cc.bright( "dynamic-log-in-bls-signer" ), "............",
    cc.notice( "Use realtime log in BLS signer." ) );
}

function parseHelp( imaState, joArg ) { // exits process on "--help"
    if( joArg.name != "help" )
        return false;
    printAbout();
    const soi = "    "; // options indent
    printHelpGeneral( soi );
    printHelpBlockchainNetwork( soi );
    printHelpBlockchainInterface( soi );
    printHelpErcInterfaces( soi );
    printHelpUserAccount1( soi );
    printHelpUserAccount2( soi );
    printHelpTransfers( soi );
    printHelpPaymentTransaction( soi );
    printHelpRegistration( soi );
    printHelpAction( soi );
    printHelpActionAdditional( soi );
    printHelpTokenTesting( soi );
    printHelpNetworkStateAnalysis( soi );
    printHelpMessageSigning( soi );
    printHelpMonitoring( soi );
    printHelpGasReimbursement( soi );
    printHelpPastEventsScan( soi );
    printHelpOracleBasedReimbursement( soi );
    printHelpJsonRpcServer( soi );
    printHelpTest( soi );
    printHelpOptimization( soi );
    printHelpLogging( soi );
    process.exit( 0 );
}

function parseVersion( imaState, joArg ) { // exits process on "--version"
    if( joArg.name != "version" )
        return false;
    printAbout();
    process.exit( 0 );
}

function parseBasicArgs( imaState, joArg ) {
    if( joArg.name == "colors" ) {
        cc.enable( true );
        return true;
    }
    if( joArg.name == "no-colors" ) {
        cc.enable( false );
        return true;
    }
    if( joArg.name == "expose" ) {
        log.exposeDetailsSet( true );
        return true;
    }
    if( joArg.name == "no-expose" ) {
        log.exposeDetailsSet( false );
        return true;
    }
    if( joArg.name == "verbose" ) {
        log.verboseSet( log.verboseParse( joArg.value ) );
        return true;
    }
    if( joArg.name == "verbose-list" ) {
        log.verboseList();
        return true;
    }
    return false;
}

function parseChainAccessArgs( imaState, joArg ) {
    if( joArg.name == "url-main-net" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.mn.strURL = joArg.value;
        return true;
    }
    if( joArg.name == "url-s-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.sc.strURL = joArg.value;
        return true;
    }
    if( joArg.name == "url-t-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.tc.strURL = joArg.value;
        return true;
    }
    if( joArg.name == "id-main-net" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.strChainName = joArg.value;
        return true;
    }
    if( joArg.name == "id-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.sc.strChainName = joArg.value;
        return true;
    }
    if( joArg.name == "id-origin-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strChainNameOriginChain = joArg.value;
        return true;
    }
    if( joArg.name == "id-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.tc.strChainName = joArg.value;
        return true;
    }
    if( joArg.name == "cid-main-net" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.mn.chainId = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "cid-s-chain" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.sc.chainId = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "cid-t-chain" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.tc.chainId = owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseTransactionManagerArgs( imaState, joArg ) {
    if( joArg.name == "tm-url-main-net" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        const strURL = "" + joArg.value;
        imaState.chainProperties.mn.joAccount.strTransactionManagerURL = strURL;
        return true;
    }
    if( joArg.name == "tm-url-s-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        const strURL = "" + joArg.value;
        imaState.chainProperties.sc.joAccount.strTransactionManagerURL = strURL;
        return true;
    }
    if( joArg.name == "tm-url-t-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        const strURL = "" + joArg.value;
        imaState.chainProperties.tc.joAccount.strTransactionManagerURL = strURL;
        return true;
    }
    if( joArg.name == "tm-priority-main-net" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.mn.joAccount.nTmPriority =
            owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "tm-priority-s-chain" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.sc.joAccount.nTmPriority =
            owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "tm-priority-t-chain" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.chainProperties.tc.joAccount.nTmPriority =
            owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseSgxArgs( imaState, joArg ) {
    if( joArg.name == "sgx-url-main-net" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.mn.joAccount.strSgxURL = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-url-s-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.sc.joAccount.strSgxURL = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-url-t-chain" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.tc.joAccount.strSgxURL = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-url" ) {
        owaspUtils.verifyArgumentIsURL( joArg );
        imaState.chainProperties.mn.joAccount.strSgxURL =
            imaState.chainProperties.sc.joAccount.strSgxURL =
            imaState.chainProperties.tc.joAccount.strSgxURL =
            joArg.value;
        return true;
    }
    if( joArg.name == "sgx-ecdsa-key-main-net" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.strSgxKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-ecdsa-key-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.sc.joAccount.strSgxKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-ecdsa-key-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.tc.joAccount.strSgxKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-ecdsa-key" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.strSgxKeyName =
            imaState.chainProperties.sc.joAccount.strSgxKeyName =
            imaState.chainProperties.tc.joAccount.strSgxKeyName =
            joArg.value;
        return true;
    }
    if( joArg.name == "sgx-bls-key-main-net" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.strBlsKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-bls-key-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.sc.joAccount.strBlsKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-bls-key-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.tc.joAccount.strBlsKeyName = joArg.value;
        return true;
    }
    if( joArg.name == "sgx-bls-key" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.strBlsKeyName =
            imaState.chainProperties.sc.joAccount.strBlsKeyName =
            imaState.chainProperties.tc.joAccount.strBlsKeyName =
            joArg.value;
        return true;
    }
    if( joArg.name == "sgx-ssl-key-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.joAccount.strPathSslKey =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-key-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.joAccount.strPathSslKey =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-key-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.joAccount.strPathSslKey =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-key" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.joAccount.strPathSslKey =
            imaState.chainProperties.sc.joAccount.strPathSslKey =
            imaState.chainProperties.tc.joAccount.strPathSslKey =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-cert-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.joAccount.strPathSslCert =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-cert-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.joAccount.strPathSslCert =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-cert-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.joAccount.strPathSslCert =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "sgx-ssl-cert" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.joAccount.strPathSslCert =
            imaState.chainProperties.sc.joAccount.strPathSslCert =
            imaState.chainProperties.tc.joAccount.strPathSslCert =
            imaUtils.normalizePath( joArg.value );
        return true;
    }
    return false;
}

function parseCredentialsArgs( imaState, joArg ) {
    if( joArg.name == "address-main-net" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.address_ = joArg.value;
        return true;
    }
    if( joArg.name == "address-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.sc.joAccount.address_ = joArg.value;
        return true;
    }
    if( joArg.name == "address-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.tc.joAccount.address_ = joArg.value;
        return true;
    }
    if( joArg.name == "receiver" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.receiver = joArg.value;
        return true;
    }
    if( joArg.name == "key-main-net" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.mn.joAccount.privateKey = joArg.value;
        return true;
    }
    if( joArg.name == "key-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.sc.joAccount.privateKey = joArg.value;
        return true;
    }
    if( joArg.name == "key-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.chainProperties.tc.joAccount.privateKey = joArg.value;
        return true;
    }
    return false;
}

function parseAbiArgs( imaState, joArg ) {
    if( joArg.name == "abi-skale-manager" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.strPathAbiJsonSkaleManager = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "abi-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.strPathAbiJson = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "abi-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.strPathAbiJson = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "abi-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.strPathAbiJson = imaUtils.normalizePath( joArg.value );
        return true;
    }
    return false;
}

function parseErcArgs( imaState, joArg ) {
    if( joArg.name == "erc20-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.strPathJsonErc20 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "erc20-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.strPathJsonErc20 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc20-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc20Explicit = joArg.value;
        return true;
    }
    if( joArg.name == "erc20-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.strPathJsonErc20 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc20-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc20ExplicitTarget = joArg.value;
        return true;
    }

    if( joArg.name == "erc721-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.strPathJsonErc721 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "erc721-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.strPathJsonErc721 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc721-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc721Explicit = joArg.value;
        return true;
    }
    if( joArg.name == "erc721-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.strPathJsonErc721 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc721-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc721ExplicitTarget = joArg.value;
        return true;
    }

    if( joArg.name == "erc1155-main-net" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.mn.strPathJsonErc1155 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "erc1155-s-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.sc.strPathJsonErc1155 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc1155-s-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc1155Explicit = joArg.value;
        return true;
    }
    if( joArg.name == "erc1155-t-chain" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.chainProperties.tc.strPathJsonErc1155 = imaUtils.normalizePath( joArg.value );
        return true;
    }
    if( joArg.name == "addr-erc1155-t-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strAddrErc1155ExplicitTarget = joArg.value;
        return true;
    }
    if( joArg.name == "with-metadata" ) {
        imaState.isWithMetadata721 = true;
        return true;
    }
    return false;
}

function parseTransactionArgs( imaState, joArg ) {
    if( joArg.name == "sleep-between-tx" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaHelperAPIs.setSleepBetweenTransactionsOnSChainMilliseconds( joArg.value );
        return true;
    }
    if( joArg.name == "wait-next-block" ) {
        imaHelperAPIs.setWaitForNextBlockOnSChain( true );
        return true;
    }
    if( joArg.name == "gas-price-multiplier-mn" ) {
        let gasPriceMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasPriceMultiplier < 0.0 )
            gasPriceMultiplier = 0.0;
        imaState.chainProperties.mn.transactionCustomizer.gasPriceMultiplier =
            gasPriceMultiplier;
        return true;
    }
    if( joArg.name == "gas-price-multiplier-sc" ) {
        let gasPriceMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasPriceMultiplier < 0.0 )
            gasPriceMultiplier = 0.0;
        imaState.chainProperties.sc.transactionCustomizer.gasPriceMultiplier =
            gasPriceMultiplier;
        return true;
    }
    if( joArg.name == "gas-price-multiplier-tc" ) {
        let gasPriceMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasPriceMultiplier < 0.0 )
            gasPriceMultiplier = 0.0;
        imaState.chainProperties.tc.transactionCustomizer.gasPriceMultiplier =
            gasPriceMultiplier;
        return true;
    }
    if( joArg.name == "gas-price-multiplier" ) {
        let gasPriceMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasPriceMultiplier < 0.0 )
            gasPriceMultiplier = 0.0;
        imaState.chainProperties.mn.transactionCustomizer.gasPriceMultiplier =
            imaState.chainProperties.sc.transactionCustomizer.gasPriceMultiplier =
            imaState.chainProperties.tc.transactionCustomizer.gasPriceMultiplier =
            gasPriceMultiplier;
        return true;
    }

    if( joArg.name == "gas-multiplier-mn" ) {
        let gasMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasMultiplier < 0.0 )
            gasMultiplier = 0.0;
        imaState.chainProperties.mn.transactionCustomizer.gasMultiplier =
            gasMultiplier;
        return true;
    }
    if( joArg.name == "gas-multiplier-sc" ) {
        let gasMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasMultiplier < 0.0 )
            gasMultiplier = 0.0;
        imaState.chainProperties.sc.transactionCustomizer.gasMultiplier =
            gasMultiplier;
        return true;
    }
    if( joArg.name == "gas-multiplier-tc" ) {
        let gasMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasMultiplier < 0.0 )
            gasMultiplier = 0.0;
        imaState.chainProperties.tc.transactionCustomizer.gasMultiplier =
            gasMultiplier;
        return true;
    }
    if( joArg.name == "gas-multiplier" ) {
        let gasMultiplier = owaspUtils.toFloat( joArg.value );
        if( gasMultiplier < 0.0 )
            gasMultiplier = 0.0;
        imaState.chainProperties.mn.transactionCustomizer.gasMultiplier =
            imaState.chainProperties.sc.transactionCustomizer.gasMultiplier =
            imaState.chainProperties.tc.transactionCustomizer.gasMultiplier =
            gasMultiplier;
        return true;
    }
    if( joArg.name == "skip-dry-run" ) {
        imaTx.dryRunEnable( false );
        return true;
    }
    if( joArg.name == "no-skip-dry-run" ) {
        imaTx.dryRunEnable( true );
        return true;
    }
    if( joArg.name == "ignore-dry-run" ) {
        imaTx.dryRunIgnore( true );
        return true;
    }
    if( joArg.name == "dry-run" || joArg.name == "no-ignore-dry-run" ) {
        imaTx.dryRunIgnore( false );
        return true;
    }
    return false;
}

function parsePaymentAmountArgs( imaState, joArg ) {
    if( joArg.name == "value" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei = owaspUtils.parseMoneySpecToWei( "" + joArg.value, true );
        return true;
    }
    if( joArg.name == "wei" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "wei", true );
        return true;
    }
    if( joArg.name == "babbage" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "babbage", true );
        return true;
    }
    if( joArg.name == "lovelace" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "lovelace", true );
        return true;
    }
    if( joArg.name == "shannon" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "shannon", true );
        return true;
    }
    if( joArg.name == "szabo" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "szabo", true );
        return true;
    }
    if( joArg.name == "finney" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "finney", true );
        return true;
    }
    if( joArg.name == "ether" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfWei =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value + "ether", true );
        return true;
    }
    if( joArg.name == "amount" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nAmountOfToken = joArg.value;
        return true;
    }
    if( joArg.name == "tid" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.idToken = joArg.value;
        imaState.haveOneTokenIdentifier = true;
        return true;
    }
    if( joArg.name == "amounts" ) {
        imaState.arrAmountsOfTokens = owaspUtils.verifyArgumentIsArrayOfIntegers( joArg );
        return true;
    }
    if( joArg.name == "tids" ) {
        imaState.idTokens = owaspUtils.verifyArgumentIsArrayOfIntegers( joArg );
        imaState.haveArrayOfTokenIdentifiers = true;
        return true;
    }
    return false;
}

function parseTransferArgs( imaState, joArg ) {
    if( joArg.name == "s2s-forward" ) {
        imaHelperAPIs.setForwardS2S();
        return true;
    }
    if( joArg.name == "s2s-reverse" ) {
        imaHelperAPIs.setReverseS2S();
        return true;
    }
    if( joArg.name == "s2s-enable" ) {
        imaState.optsS2S.isEnabled = true;
        return true;
    }
    if( joArg.name == "s2s-disable" ) {
        imaState.optsS2S.isEnabled = false;
        return true;
    }
    if( joArg.name == "s2s-parallel" ) {
        imaState.optsS2S.bParallelModeRefreshSNB = true;
        return true;
    }
    if( joArg.name == "s2s-simple" ) {
        imaState.optsS2S.bParallelModeRefreshSNB = false;
        return true;
    }
    if( joArg.name == "no-wait-s-chain" ) {
        imaState.bNoWaitSChainStarted = true;
        return true;
    }
    if( joArg.name == "max-wait-attempts" ) {
        imaState.nMaxWaitSChainAttempts = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "m2s-transfer-block-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferBlockSizeM2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2m-transfer-block-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferBlockSizeS2M = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2s-transfer-block-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferBlockSizeS2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "transfer-block-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferBlockSizeM2S =
            imaState.nTransferBlockSizeS2M =
            imaState.nTransferBlockSizeS2S =
                owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "m2s-transfer-steps" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferStepsM2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2m-transfer-steps" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferStepsS2M = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2s-transfer-steps" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferStepsS2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "transfer-steps" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTransferStepsM2S =
            imaState.nTransferStepsS2M =
            imaState.nTransferStepsS2S =
                owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "m2s-max-transactions" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nMaxTransactionsM2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2m-max-transactions" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nMaxTransactionsS2M = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2s-max-transactions" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nMaxTransactionsS2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "max-transactions" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nMaxTransactionsM2S =
            imaState.nMaxTransactionsS2M =
            imaState.nMaxTransactionsS2S =
                owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "m2s-await-blocks" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAwaitDepthM2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2m-await-blocks" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAwaitDepthS2M = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2s-await-blocks" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAwaitDepthS2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "await-blocks" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAwaitDepthM2S =
            imaState.nBlockAwaitDepthS2M =
            imaState.nBlockAwaitDepthS2S =
                owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "m2s-await-time" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAgeM2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2m-await-time" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAgeS2M = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "s2s-await-time" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAgeS2S = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "await-time" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nBlockAgeM2S =
            imaState.nBlockAgeS2M =
            imaState.nBlockAgeS2S =
                owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "period" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nLoopPeriodSeconds = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "node-number" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nNodeNumber = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "nodes-count" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nNodesCount = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "time-framing" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTimeFrameSeconds = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "time-gap" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nNextFrameGap = owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseMulticallArgs( imaState, joArg ) {
    if( joArg.name == "enable-multicall" ) {
        imaState.isEnabledMultiCall = true;
        return true;
    }
    if( joArg.name == "disable-multicall" ) {
        imaState.isEnabledMultiCall = false;
        return true;
    }
    return false;
}

function parsePendingWorkAnalysisArgs( imaState, joArg ) {
    if( joArg.name == "pwa" ) {
        imaState.isPWA = true;
        return true;
    }
    if( joArg.name == "no-pwa" ) {
        imaState.isPWA = false;
        return true;
    }
    if( joArg.name == "pwa-timeout" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nTimeoutSecondsPWA = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "expose-pwa" ) {
        imaState.isPrintPWA = true;
        return true;
    }
    if( joArg.name == "no-expose-pwa" ) {
        imaState.isPrintPWA = false;
        return true;
    }
    return false;
}

function parseLoggingArgs( imaState, joArg ) {
    if( joArg.name == "gathered" ) {
        imaState.isPrintGathered = true;
        return true;
    }
    if( joArg.name == "no-gathered" ) {
        imaState.isPrintGathered = false;
        return true;
    }
    if( joArg.name == "expose-security-info" ) {
        imaState.isPrintSecurityValues = true;
        return true;
    }
    if( joArg.name == "no-expose-security-info" ) {
        imaState.isPrintSecurityValues = false;
        return true;
    }
    if( joArg.name == "log-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nLogMaxSizeBeforeRotation = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "log-files" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nLogMaxFilesCount = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "accumulated-log-in-transfer" ) {
        imaState.isDynamicLogInDoTransfer = false;
        return true;
    }
    if( joArg.name == "accumulated-log-in-bls-signer" ) {
        imaState.isDynamicLogInBlsSigner = false;
        return true;
    }
    if( joArg.name == "dynamic-log-in-transfer" ) {
        imaState.isDynamicLogInDoTransfer = true;
        return true;
    }
    if( joArg.name == "dynamic-log-in-bls-signer" ) {
        imaState.isDynamicLogInBlsSigner = true;
        return true;
    }
    if( joArg.name == "log" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strLogFilePath = "" + joArg.value;
        return true;
    }
    return false;
}

function parseBlsArgs( imaState, joArg ) {
    if( joArg.name == "sign-messages" ) {
        imaState.bSignMessages = true;
        return true;
    }
    if( joArg.name == "bls-glue" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.strPathBlsGlue = "" + joArg.value;
        return true;
    }
    if( joArg.name == "hash-g1" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.strPathHashG1 = "" + joArg.value;
        return true;
    }
    if( joArg.name == "bls-verify" ) {
        owaspUtils.verifyArgumentIsPathToExistingFile( joArg );
        imaState.strPathBlsVerify = "" + joArg.value;
        return true;
    }
    return false;
}

function parseMonitoringArgs( imaState, joArg ) {
    if( joArg.name == "monitoring-port" ) {
        owaspUtils.verifyArgumentIsIntegerIpPortNumber( joArg, true );
        imaState.nMonitoringPort = owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "monitoring-log" ) {
        owaspUtils.verifyArgumentIsIntegerIpPortNumber( joArg, true );
        imaState.bLogMonitoringServer = true;
        return true;
    }
    return false;
}

function parseReimbursementArgs( imaState, joArg ) {
    if( joArg.name == "reimbursement-chain" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.strReimbursementChain = joArg.value.trim();
        return true;
    }
    if( joArg.name == "reimbursement-recharge" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nReimbursementRecharge =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value, true );
        return true;
    }
    if( joArg.name == "reimbursement-withdraw" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nReimbursementWithdraw =
            owaspUtils.parseMoneySpecToWei( "" + joArg.value, true );
        return true;
    }
    if( joArg.name == "reimbursement-balance" ) {
        imaState.isShowReimbursementBalance = true;
        return true;
    }
    if( joArg.name == "reimbursement-estimate" ) {
        imaState.nReimbursementEstimate = true;
        return true;
    }
    if( joArg.name == "reimbursement-range" ) {
        owaspUtils.verifyArgumentWithNonEmptyValue( joArg );
        imaState.nReimbursementRange = owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseOracleArgs( imaState, joArg ) {
    if( joArg.name == "enable-oracle" ) {
        imaOracleOperations.setEnabledOracle( true );
        return true;
    }
    if( joArg.name == "disable-oracle" ) {
        imaOracleOperations.setEnabledOracle( false );
        return true;
    }
    return false;
}

function parseNetworkDiscoveryArgs( imaState, joArg ) {
    if( joArg.name == "net-rediscover" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.optsS2S.secondsToReDiscoverSkaleNetwork =
            owaspUtils.toInteger( joArg.value );
        return true;
    }
    if( joArg.name == "net-wait-discovery" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered =
            owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseBlockScannerArgs( imaState, joArg ) {
    if( joArg.name == "bs-step-size" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaHelperAPIs.setBlocksCountInInIterativeStepOfEventsScan(
            owaspUtils.toInteger( joArg.value ) );
        return true;
    }
    if( joArg.name == "bs-max-all-range" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaHelperAPIs.setMaxIterationsInAllRangeEventsScan( owaspUtils.toInteger( joArg.value ) );
        return true;
    }
    if( joArg.name == "bs-progressive-enable" ) {
        imaTransferErrorHandling.setEnabledProgressiveEventsScan( true );
        return true;
    }
    if( joArg.name == "bs-progressive-disable" ) {
        imaTransferErrorHandling.setEnabledProgressiveEventsScan( false );
        return true;
    }
    return false;
}

function parseJsonRpcServerArgs( imaState, joArg ) {
    if( joArg.name == "json-rpc-port" ) {
        owaspUtils.verifyArgumentIsIntegerIpPortNumber( joArg, true );
        imaState.nJsonRpcPort = owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

function parseCrossImaCommunicationArgs( imaState, joArg ) {
    if( joArg.name == "cross-ima" ) {
        imaState.isCrossImaBlsMode = true;
        return true;
    }
    if( joArg.name == "no-cross-ima" ) {
        imaState.isCrossImaBlsMode = false;
        return true;
    }
    return false;
}

function parseShowConfigArgs( imaState, joArg ) {
    if( joArg.name == "show-config" ) {
        imaState.bShowConfigMode = true;
        return true;
    }
    return false;
}

function parseOtherArgs( imaState, joArg ) {
    if( joArg.name == "auto-exit" ) {
        owaspUtils.verifyArgumentIsInteger( joArg );
        imaState.nAutoExitAfterSeconds = owaspUtils.toInteger( joArg.value );
        return true;
    }
    return false;
}

export function parse( joExternalHandlers, argv ) {
    const imaState = state.get();
    const cntArgs = argv || process.argv.length;
    for( let idxArg = 2; idxArg < cntArgs; ++idxArg ) {
        const joArg = parseCommandLineArgument( process.argv[idxArg] );
        parseHelp( imaState, joArg ); // exits process on "--help"
        parseVersion( imaState, joArg ); // exits process on "--version"
        if( parseBasicArgs( imaState, joArg ) )
            continue;
        if( parseChainAccessArgs( imaState, joArg ) )
            continue;
        if( parseTransactionManagerArgs( imaState, joArg ) )
            continue;
        if( parseSgxArgs( imaState, joArg ) )
            continue;
        if( parseCredentialsArgs( imaState, joArg ) )
            continue;
        if( parseAbiArgs( imaState, joArg ) )
            continue;
        if( parseErcArgs( imaState, joArg ) )
            continue;
        if( parseTransactionArgs( imaState, joArg ) )
            continue;
        if( parsePaymentAmountArgs( imaState, joArg ) )
            continue;
        if( parseTransferArgs( imaState, joArg ) )
            continue;
        if( parseMulticallArgs( imaState, joArg ) )
            continue;
        if( parsePendingWorkAnalysisArgs( imaState, joArg ) )
            continue;
        if( parseLoggingArgs( imaState, joArg ) )
            continue;
        if( parseBlsArgs( imaState, joArg ) )
            continue;
        if( parseMonitoringArgs( imaState, joArg ) )
            continue; if( parseBlockScannerArgs( imaState, joArg ) )
            continue;
        if( parseReimbursementArgs( imaState, joArg ) )
            continue;
        if( parseOracleArgs( imaState, joArg ) )
            continue;
        if( parseNetworkDiscoveryArgs( imaState, joArg ) )
            continue;
        if( parseBlockScannerArgs( imaState, joArg ) )
            continue;
        if( parseJsonRpcServerArgs( imaState, joArg ) )
            continue;
        if( parseCrossImaCommunicationArgs( imaState, joArg ) )
            continue;
        if( parseShowConfigArgs( imaState, joArg ) )
            continue;
        if( parseOtherArgs( imaState, joArg ) )
            continue;
        if( joArg.name == "register" ||
            joArg.name == "register1" ||
            joArg.name == "check-registration" ||
            joArg.name == "check-registration1" ||
            joArg.name == "check-registration2" ||
            joArg.name == "check-registration3" ||
            joArg.name == "mint-erc20" ||
            joArg.name == "mint-erc721" ||
            joArg.name == "mint-erc1155" ||
            joArg.name == "burn-erc20" ||
            joArg.name == "burn-erc721" ||
            joArg.name == "burn-erc1155" ||
            joArg.name == "show-balance" ||
            joArg.name == "m2s-payment" ||
            joArg.name == "s2m-payment" ||
            joArg.name == "s2m-receive" ||
            joArg.name == "s2m-view" ||
            joArg.name == "s2s-payment" |
            joArg.name == "m2s-transfer" ||
            joArg.name == "s2m-transfer" ||
            joArg.name == "s2s-transfer" ||
            joArg.name == "transfer" ||
            joArg.name == "loop" ||
            joArg.name == "simple-loop" ||
            joArg.name == "browse-s-chain" ||
            joArg.name == "browse-skale-network" ||
            joArg.name == "browse-connected-schains" ||
            joArg.name == "discover-cid"
        ) {
            joExternalHandlers[joArg.name]();
            continue;
        }
        console.log( cc.fatal( "COMMAND LINE PARSER ERROR:" ) +
            cc.error( " unknown command line argument " ) + cc.info( joArg.name ) );
        return 666;
    }
    return 0;
}

async function asyncCheckUrlAtStartup( u, name ) {
    const details = log.createMemoryStream();
    const nTimeoutMilliseconds = 10 * 1000;
    try {
        details.debug( "Will check URL ", cc.u( u ), " connectivity for ",
            cc.info( name ), " at start-up..." );
        const isLog = false;
        const isOnLine = await rpcCall.checkUrl( u, nTimeoutMilliseconds, isLog );
        if( isOnLine ) {
            details.success( "Done, start-up checking URL ", cc.u( u ), " connectivity for ",
                cc.info( name ), ", URL is on-line." );
        } else {
            details.error( "Done, start-up checking URL ", cc.u( u ), " connectivity for ",
                cc.info( name ), ", URL is off-line." );
        }
        return isOnLine;
    } catch ( err ) {
        details.error( "Failed to check URL ", cc.u( u ),
            " connectivity for ", cc.info( name ), " at start-up, error is: ",
            cc.warning( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", cc.stack( err.stack ) );
    }
    return false;
}

function commonInitPrintSysInfo() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( isPrintGathered ) {
        log.debug( "This process ", cc.sunny( "PID" ), " is ", cc.bright( process.pid ) );
        log.debug( "This process ", cc.sunny( "PPID" ), " is ", cc.bright( process.ppid ) );
        log.debug( "This process ", cc.sunny( "EGID" ), " is ", cc.bright( process.getegid() ) );
        log.debug( "This process ", cc.sunny( "EUID" ), " is ", cc.bright( process.geteuid() ) );
        log.debug( "This process ", cc.sunny( "GID" ), " is ", cc.bright( process.getgid() ) );
        log.debug( "This process ", cc.sunny( "UID" ), " is ", cc.bright( process.getuid() ) );
        log.debug( "This process ", cc.sunny( "groups" ), " are ", cc.j( process.getgroups() ) );
        log.debug( "This process ", cc.sunny( "CWD" ), " is ", cc.bright( process.cwd() ) );
        log.debug( "This process ", cc.sunny( "platform" ), " is ", cc.bright( process.platform ) );
        log.debug( "This process ", cc.sunny( "release" ), " is ", cc.j( process.release ) );
        log.debug( "This process ", cc.sunny( "report" ), " is ", cc.j( process.report ) );
        log.debug( "This process ", cc.sunny( "config" ), " is ", cc.j( process.config ) );
        log.debug( cc.sunny( "Node JS" ), " ", cc.bright( "detailed version information" ),
            " is ", cc.j( process.versions ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "type" ), " is ", cc.bright( os.type() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "platform" ),
            " is ", cc.bright( os.platform() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "release" ),
            " is ", cc.bright( os.release() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "architecture" ),
            " is ", cc.bright( os.arch() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "endianness" ),
            " is ", cc.bright( os.endianness() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "host name" ),
            " is ", cc.bright( os.hostname() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "CPUs" ), " are ", cc.j( os.cpus() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "network interfaces" ),
            " are ", cc.j( os.networkInterfaces() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "home dir" ),
            " is ", cc.bright( os.homedir() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "tmp dir" ),
            " is ", cc.bright( os.tmpdir() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "uptime" ), " is ", cc.bright( os.uptime() ) );
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "user" ), " is ", cc.j( os.userInfo() ) );
        const joMemory = { total: os.totalmem(), free: os.freemem() };
        joMemory.freePercent = ( joMemory.free / joMemory.total ) * 100.0;
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "memory" ), " is ", cc.j( joMemory ) );
        const joLA = os.loadavg();
        log.debug( cc.sunny( "OS" ), " ", cc.bright( "average load" ), " is ", cc.j( joLA ) );
    }
}

function commonInitCheckAbiPaths() {
    const imaState = state.get();
    if( imaState.strPathAbiJsonSkaleManager &&
        ( typeof imaState.strPathAbiJsonSkaleManager == "string" ) &&
        imaState.strPathAbiJsonSkaleManager.length > 0
    ) {
        imaState.joAbiSkaleManager =
            imaUtils.jsonFileLoad( imaState.strPathAbiJsonSkaleManager, null );
        imaState.bHaveSkaleManagerABI = true;
    } else {
        imaState.bHaveSkaleManagerABI = false;
        log.warning( cc.error( "WARNING:" ), " No ", cc.note( "Skale Manager" ),
            " ABI file path is provided in command line arguments",
            cc.debug( "(needed for particular operations only)" ) );
    }

    if( imaState.chainProperties.mn.strPathAbiJson &&
        typeof imaState.chainProperties.mn.strPathAbiJson == "string" &&
        imaState.chainProperties.mn.strPathAbiJson.length > 0 ) {
        imaState.chainProperties.mn.joAbiIMA =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathAbiJson, null );
        imaState.chainProperties.mn.bHaveAbiIMA = true;
    } else {
        imaState.chainProperties.mn.bHaveAbiIMA = false;
        log.warning( cc.error( "WARNING:" ), " No ", cc.note( "Main-net" ),
            " IMA ABI file path is provided in command line arguments",
            cc.debug( "(needed for particular operations only)" ) );
    }

    if( imaState.chainProperties.sc.strPathAbiJson &&
        typeof imaState.chainProperties.sc.strPathAbiJson == "string" &&
        imaState.chainProperties.sc.strPathAbiJson.length > 0
    ) {
        imaState.chainProperties.sc.joAbiIMA =
            imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathAbiJson, null );
        imaState.chainProperties.sc.bHaveAbiIMA = true;
    } else {
        imaState.chainProperties.sc.bHaveAbiIMA = false;
        log.warning(
            cc.error( "WARNING:" ), " No ", cc.note( "S-Chain" ),
            " IMA ABI file path is provided in command line arguments",
            cc.debug( "(needed for particular operations only)" ) );
    }

    if( imaState.chainProperties.tc.strPathAbiJson &&
        typeof imaState.chainProperties.tc.strPathAbiJson == "string" &&
        imaState.chainProperties.tc.strPathAbiJson.length > 0
    ) {
        imaState.chainProperties.tc.joAbiIMA =
            imaUtils.jsonFileLoad( imaState.chainProperties.tc.strPathAbiJson, null );
        imaState.chainProperties.tc.bHaveAbiIMA = true;
    } else {
        imaState.chainProperties.tc.bHaveAbiIMA = false;
        log.warning(
            cc.error( "WARNING:" ), " No ", cc.note( "S<->S Target S-Chain" ),
            " IMA ABI file path is provided in command line arguments",
            cc.debug( "(needed for particular operations only)" ) );
    }
}

function commonInitCheckContractPresences() {
    const imaState = state.get();
    if( imaState.bHaveSkaleManagerABI ) {
        imaUtils.checkKeysExistInABI( "skale-manager",
            imaState.strPathAbiJsonSkaleManager,
            imaState.joAbiSkaleManager, [
            // partial list of Skale Manager's contracts specified here:
                "constants_holder_abi",
                "constants_holder_address",
                "nodes_abi",
                "nodes_address",
                "key_storage_abi",
                "key_storage_address",
                "schains_abi",
                "schains_address",
                "schains_internal_abi",
                "schains_internal_address",
                "skale_d_k_g_abi",
                "skale_d_k_g_address",
                "skale_manager_abi",
                "skale_manager_address",
                "skale_token_abi",
                "skale_token_address",
                "validator_service_abi",
                "validator_service_address",
                "wallets_abi",
                "wallets_address"
            ] );
    } else if( imaState.optsS2S.isEnabled ) {
        log.warning( cc.error( "WARNING:" ), " Missing ", cc.note( "Skale Manager" ),
            " ABI path for ", cc.note( "S-Chain" ), " to ", cc.note( "S-Chain" ), " transfers" );
    }

    if( imaState.chainProperties.mn.bHaveAbiIMA ) {
        imaUtils.checkKeysExistInABI( "main-net",
            imaState.chainProperties.mn.strPathAbiJson,
            imaState.chainProperties.mn.joAbiIMA, [
                "deposit_box_eth_abi",
                "deposit_box_eth_address",
                "message_proxy_mainnet_abi",
                "message_proxy_mainnet_address",
                "linker_abi",
                "linker_address",
                "deposit_box_erc20_abi",
                "deposit_box_erc20_address",
                "deposit_box_erc721_abi",
                "deposit_box_erc721_address",
                "deposit_box_erc1155_abi",
                "deposit_box_erc1155_address",
                "deposit_box_erc721_with_metadata_abi",
                "deposit_box_erc721_with_metadata_address",
                "community_pool_abi",
                "community_pool_address"
            ] );
    }
    if( imaState.chainProperties.sc.bHaveAbiIMA ) {
        imaUtils.checkKeysExistInABI( "S-Chain",
            imaState.chainProperties.sc.strPathAbiJson,
            imaState.chainProperties.sc.joAbiIMA, [
                "token_manager_eth_abi",
                "token_manager_eth_address",
                "token_manager_erc20_abi",
                "token_manager_erc20_address",
                "token_manager_erc721_abi",
                "token_manager_erc721_address",
                "token_manager_erc1155_abi",
                "token_manager_erc1155_address",
                "token_manager_erc721_with_metadata_abi",
                "token_manager_erc721_with_metadata_address",
                "message_proxy_chain_abi",
                "message_proxy_chain_address",
                "token_manager_linker_abi",
                "token_manager_linker_address",
                "community_locker_abi",
                "community_locker_address"
            ] );
    }
    if( imaState.chainProperties.tc.bHaveAbiIMA ) {
        imaUtils.checkKeysExistInABI( "S<->S Target S-Chain",
            imaState.chainProperties.tc.strPathAbiJson,
            imaState.chainProperties.tc.joAbiIMA, [
                "token_manager_eth_abi",
                "token_manager_eth_address",
                "token_manager_erc20_abi",
                "token_manager_erc20_address",
                "token_manager_erc721_abi",
                "token_manager_erc721_address",
                "token_manager_erc1155_abi",
                "token_manager_erc1155_address",
                "token_manager_erc721_with_metadata_abi",
                "token_manager_erc721_with_metadata_address",
                "message_proxy_chain_abi",
                "message_proxy_chain_address",
                "token_manager_linker_abi",
                "token_manager_linker_address",
                "community_locker_abi",
                "community_locker_address"
            ] );
    }
}

function commonInitPrintFoundContracts() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    // deposit_box_eth_address                    --> deposit_box_eth_abi
    // deposit_box_erc20_address                  --> deposit_box_erc20_abi
    // deposit_box_erc721_address                 --> deposit_box_erc721_abi
    // deposit_box_erc1155_address                --> deposit_box_erc1155_abi
    // deposit_box_erc721_with_metadata_address   --> deposit_box_erc721_with_metadata_abi
    // linker_address                             --> linker_abi
    // token_manager_eth_address                  --> token_manager_eth_abi
    // token_manager_erc20_address                --> token_manager_erc20_abi
    // token_manager_erc721_address               --> token_manager_erc721_abi
    // token_manager_erc1155_address              --> token_manager_erc1155_abi
    // token_manager_erc721_with_metadata_address --> token_manager_erc721_with_metadata_abi
    // token_manager_linker_address               --> token_manager_linker_abi
    // message_proxy_mainnet_address              --> message_proxy_mainnet_abi
    // message_proxy_chain_address                --> message_proxy_chain_abi

    const oct = function( joContract ) { // optional contract address
        if( joContract && "options" in joContract && "address" in joContract.options )
            return cc.bright( joContract.address );
        return cc.error( "contract is not available" );
    };

    if( isPrintGathered ) {
        log.debug( cc.bright( "IMA contracts(Main Net):" ) );
        log.debug( cc.sunny( "DepositBoxEth" ), "...................address is.....",
            oct( imaState.joDepositBoxETH ) );
        log.debug( cc.sunny( "DepositBoxERC20" ), ".................address is.....",
            oct( imaState.joDepositBoxERC20 ) );
        log.debug( cc.sunny( "DepositBoxERC721" ), "................address is.....",
            oct( imaState.joDepositBoxERC721 ) );
        log.debug( cc.sunny( "DepositBoxERC1155" ), "...............address is.....",
            oct( imaState.joDepositBoxERC1155 ) );
        log.debug( cc.sunny( "DepositBoxERC721WithMetadata" ), "....address is.....",
            oct( imaState.joDepositBoxERC721WithMetadata ) );
        log.debug( cc.sunny( "CommunityPool" ), "...................address is.....",
            oct( imaState.joCommunityPool ) );
        log.debug( cc.sunny( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxyMainNet ) );
        log.debug( cc.sunny( "Linker" ), "..........................address is.....",
            oct( imaState.joLinker ) );
        log.debug( cc.bright( "IMA contracts(S-Chain):" ) );
        log.debug( cc.sunny( "TokenManagerEth" ), ".................address is.....",
            oct( imaState.joTokenManagerETH ) );
        log.debug( cc.sunny( "TokenManagerERC20" ), "...............address is.....",
            oct( imaState.joTokenManagerERC20 ) );
        log.debug( cc.sunny( "TokenManagerERC721" ), "..............address is.....",
            oct( imaState.joTokenManagerERC721 ) );
        log.debug( cc.sunny( "TokenManagerERC1155" ), ".............address is.....",
            oct( imaState.joTokenManagerERC1155 ) );
        log.debug( cc.sunny( "TokenManagerERC721WithMetadata" ), "..address is.....",
            oct( imaState.joTokenManagerERC721WithMetadata ) );
        log.debug( cc.sunny( "CommunityLocker" ), ".................address is.....",
            oct( imaState.joCommunityLocker ) );
        log.debug( cc.sunny( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxySChain ) );
        log.debug( cc.sunny( "TokenManagerLinker" ), "..............address is.....",
            oct( imaState.joTokenManagerLinker ) );
        log.debug( cc.sunny( "ERC20" ), " ..........................address is.....",
            oct( imaState.joEthErc20 ) );
        log.debug( cc.bright( "IMA contracts(Target S-Chain):" ) );
        log.debug( cc.sunny( "TokenManagerERC20" ), "...............address is.....",
            oct( imaState.joTokenManagerERC20Target ) );
        log.debug( cc.sunny( "TokenManagerERC721" ), "..............address is.....",
            oct( imaState.joTokenManagerERC721Target ) );
        log.debug( cc.sunny( "TokenManagerERC1155" ), ".............address is.....",
            oct( imaState.joTokenManagerERC1155Target ) );
        log.debug( cc.sunny( "TokenManagerERC721WithMetadata" ), "..address is.....",
            oct( imaState.joTokenManagerERC721WithMetadataTarget ) );
        log.debug( cc.sunny( "CommunityLocker" ), ".................address is.....",
            oct( imaState.joCommunityLockerTarget ) );
        log.debug( cc.sunny( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxySChainTarget ) );
        log.debug( cc.sunny( "TokenManagerLinker" ), "..............address is.....",
            oct( imaState.joTokenManagerLinkerTarget ) );
        log.debug( cc.sunny( "ERC20" ), " ..........................address is.....",
            oct( imaState.joEthErc20Target ) );

        log.debug( cc.bright( "Skale Manager contracts:" ) );
        log.debug( cc.sunny( "ConstantsHolder" ), ".................address is.....",
            oct( imaState.joConstantsHolder ) );
        log.debug( cc.sunny( "Nodes" ), "...........................address is.....",
            oct( imaState.joNodes ) );
        log.debug( cc.sunny( "KeyStorage" ), "......................address is.....",
            oct( imaState.joKeyStorage ) );
        log.debug( cc.sunny( "Schains" ), ".........................address is.....",
            oct( imaState.joSChains ) );
        log.debug( cc.sunny( "SchainsInternal" ), ".................address is.....",
            oct( imaState.joSChainsInternal ) );
        log.debug( cc.sunny( "SkaleDKG" ), "........................address is.....",
            oct( imaState.joSkaleDKG ) );
        log.debug( cc.sunny( "SkaleManager" ), "....................address is.....",
            oct( imaState.joSkaleManager ) );
        log.debug( cc.sunny( "SkaleToken" ), "......................address is.....",
            oct( imaState.joSkaleToken ) );
        log.debug( cc.sunny( "ValidatorService" ), "................address is.....",
            oct( imaState.joValidatorService ) );
        log.debug( cc.sunny( "Wallets" ), ".........................address is.....",
            oct( imaState.joWallets ) );
    }
}

function commonInitCheckErc20() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    let n1 = 0;
    let n2 = 0;
    if( imaState.chainProperties.mn.strPathJsonErc20.length > 0 ) {
        if( isPrintGathered ) {
            log.information( "Loading Main-net ERC20 ABI from ",
                cc.notice( imaState.chainProperties.mn.strPathJsonErc20 ) );
        }
        imaState.chainProperties.mn.joErc20 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc20, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc20 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc20.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC20 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc20 ) );
            }
            imaState.chainProperties.sc.joErc20 =
                imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc20, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc20 ).length;
        }
        if( n1 > 0 ) {
            imaState.chainProperties.tc.strCoinNameErc20 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.mn.joErc20 );
            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc20 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc20 );
            }
            n1 = imaState.chainProperties.tc.strCoinNameErc20.length;
            if( n2 > 0 )
                n2 = imaState.chainProperties.sc.strCoinNameErc20.length;
            if( n1 > 0 ) {
                if( isPrintGathered &&
                    ( !imaState.bShowConfigMode )
                ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded Main-net ERC20 ABI ",
                            cc.attention( imaState.chainProperties.tc.strCoinNameErc20 ) );
                    }
                    if( isPrintGathered && n2 > 0 ) {
                        log.information( "Loaded S-Chain ERC20 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc20 ) );
                    }
                }
            } else {
                if( n1 === 0 )
                    log.error( " Main-net ERC20 token name is not discovered(malformed JSON)" );

                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc20.length > 0 )
                    log.error( " S-Chain ERC20 token name is not discovered(malformed JSON)" );

                imaState.chainProperties.mn.joErc20 = null;
                imaState.chainProperties.sc.joErc20 = null;
                imaState.chainProperties.tc.strCoinNameErc20 = "";
                imaState.chainProperties.sc.strCoinNameErc20 = "";
                process.exit( 126 );
            }
        } else {
            if( n1 === 0 )
                log.error( "Main-net ERC20 JSON is invalid" );
            if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc20.length > 0 )
                log.error( "S-Chain ERC20 JSON is invalid" );
            imaState.chainProperties.mn.joErc20 = null;
            imaState.chainProperties.sc.joErc20 = null;
            imaState.chainProperties.tc.strCoinNameErc20 = "";
            imaState.chainProperties.sc.strCoinNameErc20 = "";
            process.exit( 126 );
        }
    } else {
        if( imaState.chainProperties.sc.strPathJsonErc20.length > 0 ) {
            n1 = 0;
            n2 = 0;
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC20 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc20 ) );
            }
            imaState.chainProperties.sc.joErc20 =
            imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc20, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc20 ).length;
            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc20 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc20 );
                n2 = imaState.chainProperties.sc.strCoinNameErc20.length;
                if( n2 > 0 ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC20 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc20 ) );
                    }
                } else {
                    if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc20.length > 0 ) {
                        log.error(
                            "S-Chain ERC20 token name is not discovered(malformed JSON)" );
                    }
                    imaState.chainProperties.mn.joErc20 = null;
                    imaState.chainProperties.sc.joErc20 = null;
                    imaState.chainProperties.tc.strCoinNameErc20 = "";
                    imaState.chainProperties.sc.strCoinNameErc20 = "";
                    process.exit( 126 );
                }
            }
        }
    }
    if( n1 !== 0 && n2 === 0 ) {
        if( imaState.strAddrErc20Explicit.length === 0 ) {
            log.warning( "IMPORTANT NOTICE: Both S-Chain ERC20 JSON and explicit " +
                "ERC20 address are not specified" );
        } else {
            if( isPrintGathered )
                log.attention( "IMPORTANT NOTICE: S-Chain ERC20 ABI will be auto-generated" );
            imaState.chainProperties.sc.strCoinNameErc20 =
                "" + imaState.chainProperties.tc.strCoinNameErc20; // assume same
            imaState.chainProperties.sc.joErc20 =
                JSON.parse( JSON.stringify( imaState.chainProperties.mn.joErc20 ) ); // clone
            imaState.chainProperties.sc.joErc20[
                imaState.chainProperties.sc.strCoinNameErc20 + "_address"] =
                    "" + imaState.strAddrErc20Explicit; // set explicit address
        }
    }

    if( imaState.chainProperties.tc.strPathJsonErc20.length > 0 ) {
        if( isPrintGathered ) {
            log.information( "Loading S<->S Target S-Chain ERC20 ABI from ",
                cc.notice( imaState.chainProperties.tc.strPathJsonErc20 ) );
        }
        imaState.chainProperties.tc.joErc20 =
            imaUtils.jsonFileLoad( imaState.chainProperties.tc.strPathJsonErc20, null );
        n2 = Object.keys( imaState.chainProperties.tc.joErc20 ).length;
        if( n2 > 0 ) {
            imaState.chainProperties.tc.strCoinNameErc20 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.tc.joErc20 );
            n2 = imaState.chainProperties.tc.strCoinNameErc20.length;
            if( n2 > 0 ) {
                if( isPrintGathered ) {
                    log.information( "Loaded S<->S Target S-Chain ERC20 ABI ",
                        cc.attention( imaState.chainProperties.tc.strCoinNameErc20 ) );
                }
            } else {
                if( n2 === 0 && imaState.chainProperties.tc.strPathJsonErc20.length > 0 ) {
                    log.fatal( " S<->S Target S-Chain ERC20 token name ",
                        "is not discovered(malformed JSON)" );
                }
                imaState.chainProperties.tc.joErc20 = null;
                imaState.chainProperties.tc.strCoinNameErc20 = "";
                process.exit( 126 );
            }
        }
    }
    if( isPrintGathered &&
        imaState.strAddrErc20ExplicitTarget.length === 0 &&
        imaState.chainProperties.tc.strCoinNameErc20.length === 0 &&
        imaState.chainProperties.sc.strCoinNameErc20.length > 0
    ) {
        log.warning( "IMPORTANT NOTICE: Both S<->S Target S-Chain ERC20 JSON and explicit " +
            "ERC20 address are not specified" );
    }
}

function commonInitCheckErc721() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    let n1 = 0;
    let n2 = 0;
    if( imaState.chainProperties.mn.strPathJsonErc721.length > 0 ) {
        if( isPrintGathered ) {
            log.information( "Loading Main-net ERC721 ABI from ",
                cc.notice( imaState.chainProperties.mn.strPathJsonErc721 ) );
        }
        imaState.chainProperties.mn.joErc721 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc721, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc721 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC721 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc721 ) );
            }
            imaState.chainProperties.sc.joErc721 =
                imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc721, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc721 ).length;
        }
        if( n1 > 0 ) {
            imaState.chainProperties.mn.strCoinNameErc721 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.mn.joErc721 );
            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc721 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc721 );
            }
            n1 = imaState.chainProperties.mn.strCoinNameErc721.length;
            if( n2 > 0 )
                n2 = imaState.chainProperties.sc.strCoinNameErc721.length;
            if( n1 > 0 ) {
                if( ! imaState.bShowConfigMode ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded Main-net ERC721 ABI ",
                            cc.attention( imaState.chainProperties.mn.strCoinNameErc721 ) );
                    }
                    if( n2 > 0 && isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC721 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc721 ) );
                    }
                }
            } else {
                if( n1 === 0 ) {
                    log.fatal(
                        "Main-net ERC721 token name  is not discovered(malformed JSON)" );
                }
                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
                    log.fatal(
                        "S-Chain ERC721 token name is not discovered(malformed JSON)" );
                }
                imaState.chainProperties.mn.joErc721 = null;
                imaState.chainProperties.sc.joErc721 = null;
                imaState.chainProperties.mn.strCoinNameErc721 = "";
                imaState.chainProperties.sc.strCoinNameErc721 = "";
                process.exit( 126 );
            }
        } else {
            if( n1 === 0 )
                log.fatal( "Main-net ERC721 JSON is invalid" );

            if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc721.length > 0 )
                log.fatal( "S-Chain ERC721 JSON is invalid" );

            imaState.chainProperties.mn.joErc721 = null;
            imaState.chainProperties.sc.joErc721 = null;
            imaState.chainProperties.mn.strCoinNameErc721 = "";
            imaState.chainProperties.sc.strCoinNameErc721 = "";
            process.exit( 126 );
        }
    } else {
        if( imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
            n1 = 0;
            n2 = 0;
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC721 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc721 ) );
            }
            imaState.chainProperties.sc.joErc721 =
                imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc721, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc721 ).length;

            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc721 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc721 );
                n2 = imaState.chainProperties.sc.strCoinNameErc721.length;
                if( n2 > 0 ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC721 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc721 ) );
                    } else {
                        if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
                            log.fatal(
                                "S-Chain ERC721 token name is not discovered(malformed JSON)" );
                        }
                        imaState.chainProperties.mn.joErc721 = null;
                        imaState.chainProperties.sc.joErc721 = null;
                        imaState.chainProperties.mn.strCoinNameErc721 = "";
                        imaState.chainProperties.sc.strCoinNameErc721 = "";
                        process.exit( 126 );
                    }
                }
            }
        }
    }
    if( n1 !== 0 && n2 === 0 ) {
        if( imaState.strAddrErc721Explicit.length === 0 ) {
            if( isPrintGathered ) {
                log.warning( "IMPORTANT NOTICE: Both S-Chain ERC721 JSON and explicit " +
                    "ERC721 address are not specified" );
            }
        } else {
            if( isPrintGathered )
                log.attention( "IMPORTANT NOTICE: S-Chain ERC721 ABI will be auto-generated" );
            imaState.chainProperties.sc.strCoinNameErc721 =
                "" + imaState.chainProperties.mn.strCoinNameErc721; // assume same
            imaState.chainProperties.sc.joErc721 =
                JSON.parse( JSON.stringify( imaState.chainProperties.mn.joErc721 ) ); // clone
            imaState.chainProperties.sc.joErc721[
                imaState.chainProperties.sc.strCoinNameErc721 + "_address"] =
                    "" + imaState.strAddrErc721Explicit; // set explicit address
        }
    }

    if( imaState.chainProperties.tc.strPathJsonErc721.length > 0 &&
        isPrintGathered
    ) {
        log.information( "Loading S<->S Target S-Chain ERC721 ABI from ",
            cc.notice( imaState.chainProperties.tc.strPathJsonErc721 ) );
        imaState.chainProperties.tc.joErc721 =
            imaUtils.jsonFileLoad( imaState.chainProperties.tc.strPathJsonErc721, null );
        n2 = Object.keys( imaState.chainProperties.tc.joErc721 ).length;
        if( n2 > 0 ) {
            imaState.chainProperties.tc.strCoinNameErc721 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.tc.joErc721 );
            n2 = imaState.chainProperties.tc.strCoinNameErc721.length;
            if( n2 > 0 && isPrintGathered ) {
                log.information( "Loaded S<->S Target S-Chain ERC721 ABI ",
                    cc.attention( imaState.chainProperties.tc.strCoinNameErc721 ) );
            } else {
                if( n2 === 0 &&
                    imaState.chainProperties.tc.strPathJsonErc721.length > 0 &&
                    isPrintGathered
                ) {
                    log.fatal( "S<->S Target S-Chain ERC721 token name ",
                        "is not discovered(malformed JSON)" );
                }
                imaState.chainProperties.tc.joErc721 = null;
                imaState.chainProperties.tc.strCoinNameErc721 = "";
                process.exit( 126 );
            }
        }
    }
    if( isPrintGathered &&
        imaState.strAddrErc721ExplicitTarget.length === 0 &&
        imaState.chainProperties.tc.strCoinNameErc721.length === 0 &&
        imaState.chainProperties.sc.strCoinNameErc721.length > 0
    ) {
        log.warning(
            "IMPORTANT NOTICE: Both S<->S Target S-Chain ERC721 JSON and ",
            "explicit ERC721 address are not specified" );
    }
}

function commonInitCheckErc1155() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    let n1 = 0;
    let n2 = 0;
    if( imaState.chainProperties.mn.strPathJsonErc1155.length > 0 ) {
        if( isPrintGathered ) {
            log.information( "Loading Main-net ERC1155 ABI from ",
                cc.notice( imaState.chainProperties.mn.strPathJsonErc1155 ) );
        }
        imaState.chainProperties.mn.joErc1155 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc1155, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc1155 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc1155.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC1155 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc1155 ) );
            }
            imaState.chainProperties.sc.joErc1155 =
                imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc1155, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc1155 ).length;
        }
        if( n1 > 0 ) {
            imaState.chainProperties.mn.strCoinNameErc1155 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.mn.joErc1155 );
            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc1155 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc1155 );
            }
            n1 = imaState.chainProperties.mn.strCoinNameErc1155.length;
            if( n2 > 0 )
                n2 = imaState.chainProperties.sc.strCoinNameErc1155.length;
            if( n1 > 0 ) {
                if( ! imaState.bShowConfigMode ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded Main-net ERC1155 ABI ",
                            cc.attention( imaState.chainProperties.mn.strCoinNameErc1155 ) );
                    }
                    if( n2 > 0 && isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC1155 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc1155 ) );
                    }
                }
            } else {
                if( n1 === 0 ) {
                    log.fatal(
                        " Main-net ERC1155 token name  is not discovered(malformed JSON)" );
                }
                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc1155.length > 0 ) {
                    log.fatal(
                        " S-Chain ERC1155 token name is not discovered(malformed JSON)" );
                }
                imaState.chainProperties.mn.joErc1155 = null;
                imaState.chainProperties.sc.joErc1155 = null;
                imaState.chainProperties.mn.strCoinNameErc1155 = "";
                imaState.chainProperties.sc.strCoinNameErc1155 = "";
                process.exit( 126 );
            }
        } else {
            if( n1 === 0 )
                log.fatal( "Main-net ERC1155 JSON is invalid" );
            if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc1155.length > 0 )
                log.fatal( "S-Chain ERC1155 JSON is invalid" );

            imaState.chainProperties.mn.joErc1155 = null;
            imaState.chainProperties.sc.joErc1155 = null;
            imaState.chainProperties.mn.strCoinNameErc1155 = "";
            imaState.chainProperties.sc.strCoinNameErc1155 = "";
            process.exit( 126 );
        }
    } else {
        if( imaState.chainProperties.sc.strPathJsonErc1155.length > 0 ) {
            n1 = 0;
            n2 = 0;
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC1155 ABI from ",
                    cc.notice( imaState.chainProperties.sc.strPathJsonErc1155 ) );
            }
            imaState.chainProperties.sc.joErc1155 =
                imaUtils.jsonFileLoad( imaState.chainProperties.sc.strPathJsonErc1155, null );
            n2 = Object.keys( imaState.chainProperties.sc.joErc1155 ).length;

            if( n2 > 0 ) {
                imaState.chainProperties.sc.strCoinNameErc1155 =
                    imaUtils.discoverCoinNameInJSON( imaState.chainProperties.sc.joErc1155 );
                n2 = imaState.chainProperties.sc.strCoinNameErc1155.length;
                if( n2 > 0 ) {
                    if( isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC1155 ABI ",
                            cc.attention( imaState.chainProperties.sc.strCoinNameErc1155 ) );
                    }
                } else {
                    if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc1155.length > 0 ) {
                        log.fatal(
                            " S-Chain ERC1155 token name  is not discovered(malformed JSON)" );
                    }
                    imaState.chainProperties.mn.joErc1155 = null;
                    imaState.chainProperties.sc.joErc1155 = null;
                    imaState.chainProperties.mn.strCoinNameErc1155 = "";
                    imaState.chainProperties.sc.strCoinNameErc1155 = "";
                    process.exit( 126 );
                }
            }
        }
    }
    if( n1 !== 0 && n2 === 0 ) {
        if( imaState.strAddrErc1155Explicit.length === 0 ) {
            if( isPrintGathered ) {
                log.warning( "IMPORTANT NOTICE: Both S-Chain ERC1155 JSON and " +
                    "explicit ERC1155 address are not specified" );
            }
        } else {
            if( isPrintGathered )
                log.attention( "IMPORTANT NOTICE: S-Chain ERC1155 ABI will be auto-generated" );
            imaState.chainProperties.sc.strCoinNameErc1155 =
                "" + imaState.chainProperties.mn.strCoinNameErc1155; // assume same
            imaState.chainProperties.sc.joErc1155 =
                JSON.parse( JSON.stringify( imaState.chainProperties.mn.joErc1155 ) ); // clone
            imaState.chainProperties.sc.joErc1155[
                imaState.chainProperties.sc.strCoinNameErc1155 + "_address"] =
                    "" + imaState.strAddrErc1155Explicit; // set explicit address
        }
    }

    if( imaState.chainProperties.tc.strPathJsonErc1155.length > 0 ) {
        if( isPrintGathered ) {
            log.information( "Loading S<->S Target S-Chain ERC1155 ABI from ",
                cc.notice( imaState.chainProperties.tc.strPathJsonErc1155 ) );
        }
        imaState.chainProperties.tc.joErc1155 =
        imaUtils.jsonFileLoad( imaState.chainProperties.tc.strPathJsonErc1155, null );
        n2 = Object.keys( imaState.chainProperties.tc.joErc1155 ).length;
        if( n2 > 0 ) {
            imaState.chainProperties.tc.strCoinNameErc1155 =
            imaUtils.discoverCoinNameInJSON( imaState.chainProperties.tc.joErc1155 );
            n2 = imaState.chainProperties.tc.strCoinNameErc1155.length;
            if( n2 > 0 ) {
                if( isPrintGathered ) {
                    log.information( "Loaded S<->S Target S-Chain ERC1155 ABI ",
                        cc.attention( imaState.chainProperties.tc.strCoinNameErc1155 ) );
                }
            } else {
                if( n2 === 0 &&
                    imaState.chainProperties.tc.strPathJsonErc1155.length > 0 &&
                    isPrintGathered
                ) {
                    log.fatal( " S<->S Target S-Chain ERC1155 token name ",
                        "is not discovered(malformed JSON)" );
                }
                imaState.chainProperties.tc.joErc1155 = null;
                imaState.chainProperties.tc.strCoinNameErc1155 = "";
                process.exit( 126 );
            }
        }
    }
    if( isPrintGathered &&
        imaState.strAddrErc1155ExplicitTarget.length === 0 &&
        imaState.chainProperties.tc.strCoinNameErc1155.length === 0 &&
        imaState.chainProperties.sc.strCoinNameErc1155.length > 0
    ) {
        log.warning(
            "IMPORTANT NOTICE: Both S<->S Target S-Chain ERC1155 JSON and ",
            "explicit ERC1155 address are not specified" );
    }
}

function commonInitCheckGeneralArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    const isPrintSecurityValues = ( !!( imaState.isPrintSecurityValues ) );
    if( isPrintGathered ) {
        printAbout( true );
        log.information( cc.attention( "IMA AGENT" ), cc.normal( " is using " ),
            cc.bright( "Ethers JS" ), cc.normal( " version " ),
            cc.sunny(
                owaspUtils.ethersMod.ethers.version.toString().replace( "ethers/", "" ) ) );
    }
    ensureHaveValue(
        "App path",
        path.join( __dirname, "main.mjs" ), false, isPrintGathered, null, ( x ) => {
            return cc.normal( x );
        } );
    ensureHaveValue(
        "Verbose level",
        log.verboseLevelAsTextForLog( log.verboseGet() ),
        false, isPrintGathered, null, ( x ) => {
            return cc.sunny( x );
        } );
    ensureHaveValue(
        "Multi-call optimizations",
        imaState.isEnabledMultiCall, false, isPrintGathered, null, ( x ) => {
            return cc.yn( x );
        } );
    ensureHaveValue(
        "Main-net URL",
        imaState.chainProperties.mn.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.u( x );
        } );
    ensureHaveValue(
        "S-chain URL",
        imaState.chainProperties.sc.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.u( x );
        } );
    ensureHaveValue(
        "S<->S Target S-chain URL",
        imaState.chainProperties.tc.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.u( x );
        } );
    ensureHaveValue(
        "Main-net Ethereum network name",
        imaState.chainProperties.mn.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S-Chain Ethereum network name",
        imaState.chainProperties.sc.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain Ethereum network name",
        imaState.chainProperties.tc.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "Main-net Ethereum chain ID",
        imaState.chainProperties.mn.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S-Chain Ethereum chain ID",
        imaState.chainProperties.sc.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain Ethereum chain ID",
        imaState.chainProperties.tc.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "Skale Manager ABI JSON file path",
        imaState.strPathAbiJsonSkaleManager, false, isPrintGathered, null, ( x ) => {
            return cc.warning( x );
        } );
    ensureHaveValue(
        "Main-net ABI JSON file path",
        imaState.chainProperties.mn.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return cc.warning( x );
        } );
    ensureHaveValue(
        "S-Chain ABI JSON file path",
        imaState.chainProperties.sc.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return cc.warning( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain ABI JSON file path",
        imaState.chainProperties.tc.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return cc.warning( x );
        } );

    try {
        ensureHaveValue( "Main-net user account address",
            imaState.chainProperties.mn.joAccount.address(), false,
            isPrintGathered && isPrintSecurityValues );
    } catch ( err ) {}
    try {
        ensureHaveValue( "S-chain user account address",
            imaState.chainProperties.sc.joAccount.address(), false,
            isPrintGathered && isPrintSecurityValues );
    } catch ( err ) {}
    try {
        ensureHaveValue(
            "S<->S Target S-chain user account address",
            imaState.chainProperties.tc.joAccount.address(),
            false, isPrintGathered );
    } catch ( err ) {}
}

function commonInitCheckCredentialsArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    const isPrintSecurityValues = ( !!( imaState.isPrintSecurityValues ) );
    try {
        ensureHaveCredentials(
            "Main Net",
            imaState.chainProperties.mn.joAccount, false,
            isPrintGathered && isPrintSecurityValues );
    } catch ( err ) {}
    try {
        ensureHaveCredentials(
            "S-Chain",
            imaState.chainProperties.sc.joAccount, false,
            isPrintGathered && isPrintSecurityValues );
    } catch ( err ) {}
    try {
        commonInitCheckTransferAmountArgs();
        ensureHaveCredentials(
            "S<->S Target S-Chain",
            imaState.chainProperties.tc.joAccount, false,
            isPrintGathered && isPrintSecurityValues );
    } catch ( err ) {}
    if( isPrintGathered && isPrintSecurityValues ) {
        if( imaState.chainProperties.mn.joAccount.strBlsKeyName ) {
            ensureHaveValue(
                "BLS/Main Net key name",
                imaState.chainProperties.mn.joAccount.strBlsKeyName,
                false, isPrintGathered, null, ( x ) => {
                    return cc.attention( x );
                } );
        }
        if( imaState.chainProperties.sc.joAccount.strBlsKeyName ) {
            ensureHaveValue(
                "BLS/S-Chain key name",
                imaState.chainProperties.sc.joAccount.strBlsKeyName,
                false, isPrintGathered, null, ( x ) => {
                    return cc.attention( x );
                } );
        }
        if( imaState.chainProperties.tc.joAccount.strBlsKeyName ) {
            ensureHaveValue(
                "BLS/Target S-Chain key name",
                imaState.chainProperties.tc.joAccount.strBlsKeyName,
                false, isPrintGathered, null, ( x ) => {
                    return cc.attention( x );
                } );
        }
    }
}

function commonInitCheckTransferAmountArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    ensureHaveValue(
        "Amount of wei to transfer", imaState.nAmountOfWei,
        false, isPrintGathered, null, ( x ) => {
            return cc.info( x );
        } );
}

function commonInitTransferringArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    ensureHaveValue(
        "M->S transfer block size", imaState.nTransferBlockSizeM2S,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S->M transfer block size", imaState.nTransferBlockSizeS2M,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transfer block size", imaState.nTransferBlockSizeS2S,
            false, isPrintGathered, null, ( x ) => {
                return cc.note( x );
            } );
    }
    ensureHaveValue(
        "M->S transfer job steps", imaState.nTransferStepsM2S,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S->M transfer job steps", imaState.nTransferStepsS2M,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transfer job steps", imaState.nTransferStepsS2S,
            false, isPrintGathered, null, ( x ) => {
                return cc.note( x );
            } );
    }
    ensureHaveValue(
        "M->S transactions limit", imaState.nMaxTransactionsM2S,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S->M transactions limit", imaState.nMaxTransactionsS2M,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transactions limit", imaState.nMaxTransactionsS2S,
            false, isPrintGathered, null, ( x ) => {
                return cc.note( x );
            } );
    }
    ensureHaveValue(
        "M->S await blocks", imaState.nBlockAwaitDepthM2S, false,
        isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S->M await blocks", imaState.nBlockAwaitDepthS2M, false,
        isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S await blocks", imaState.nBlockAwaitDepthS2S, false,
            isPrintGathered, null, ( x ) => {
                return cc.note( x );
            } );
    }
    ensureHaveValue(
        "M->S minimal block age", imaState.nBlockAgeM2S,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    ensureHaveValue(
        "S->M minimal block age", imaState.nBlockAgeS2M,
        false, isPrintGathered, null, ( x ) => {
            return cc.note( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S minimal block age", imaState.nBlockAgeS2S,
            false, isPrintGathered, null, ( x ) => {
                return cc.note( x );
            } );
    }
    ensureHaveValue(
        "Transfer loop period(seconds)", imaState.nLoopPeriodSeconds,
        false, isPrintGathered, null, ( x ) => {
            return cc.success( x );
        } );
    if( imaState.nTimeFrameSeconds > 0 ) {
        ensureHaveValue(
            "Time framing(seconds)", imaState.nTimeFrameSeconds,
            false, isPrintGathered );
        ensureHaveValue(
            "Next frame gap(seconds)", imaState.nNextFrameGap,
            false, isPrintGathered );
    } else {
        ensureHaveValue(
            "Time framing", cc.error( "disabled" ),
            false, isPrintGathered
        );
    }
}

function commonInitCheckAccessArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    ensureHaveValue(
        "S-Chain node number(zero based)",
        imaState.nNodeNumber, false, isPrintGathered, null, ( x ) => {
            return cc.info( x );
        } );
    ensureHaveValue(
        "S-Chain nodes count",
        imaState.nNodesCount, false, isPrintGathered, null, ( x ) => {
            return cc.info( x );
        } );
}

function commonInitErcTokensArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
        ensureHaveValue(
            "Loaded Main-net ERC20 ABI ",
            imaState.chainProperties.tc.strCoinNameErc20,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        ensureHaveValue(
            "Loaded S-Chain ERC20 ABI ",
            imaState.chainProperties.sc.strCoinNameErc20,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        ensureHaveValue(
            "Amount of tokens to transfer",
            imaState.nAmountOfToken,
            false, isPrintGathered, null, ( x ) => {
                return cc.info( x );
            } );
        if( isPrintGathered ) {
            log.information( "ERC20 explicit S-Chain address is ",
                cc.attention( imaState.strAddrErc20Explicit ) );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC20 ABI ",
            imaState.chainProperties.tc.strCoinNameErc20,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
    }
    if( imaState.chainProperties.mn.strCoinNameErc721.length > 0 ) {
        ensureHaveValue(
            "Loaded Main-net ERC721 ABI ",
            imaState.chainProperties.mn.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        ensureHaveValue(
            "Loaded S-Chain ERC721 ABI ",
            imaState.chainProperties.sc.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        ensureHaveValue(
            "ERC721 token id ",
            imaState.idToken, false,
            isPrintGathered, null, ( x ) => {
                return cc.info( x );
            } );
        if( isPrintGathered ) {
            log.information( "ERC721 explicit S-Chain address is ",
                cc.attention( imaState.strAddrErc721Explicit ) );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc721.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC721 ABI ",
            imaState.chainProperties.tc.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
    }
    if( imaState.chainProperties.mn.strCoinNameErc1155.length > 0 ) {
        ensureHaveValue( "Loaded Main-net ERC1155 ABI ",
            imaState.chainProperties.mn.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        ensureHaveValue( "Loaded S-Chain ERC1155 ABI ",
            imaState.chainProperties.sc.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
        try {
            ensureHaveValue( "ERC1155 token id ",
                imaState.idToken, false, isPrintGathered, null, ( x ) => {
                    return cc.info( x );
                } );
            ensureHaveValue( "ERC1155 token amount ",
                imaState.nAmountOfToken, false, isPrintGathered, null, ( x ) => {
                    return cc.info( x );
                } );
        } catch ( e1 ) {
            try {
                ensureHaveValue(
                    "ERC1155 batch of token ids ",
                    imaState.idTokens, false,
                    isPrintGathered, null, ( x ) => {
                        return cc.info( x );
                    } );
                ensureHaveValue(
                    "ERC1155 batch of token amounts ",
                    imaState.arrAmountsOfTokens, false,
                    isPrintGathered, null, ( x ) => {
                        return cc.info( x );
                    } );
            } catch ( e2 ) {
                log.warning( "Please check your params in ERC1155 transfer" );
                log.warning( "Error 1", cc.sunny( e1 ) );
                log.warning( "Error 2", cc.sunny( e2 ) );
                process.exit( 126 );
            }
        }
        if( isPrintGathered ) {
            log.information( "ERC1155 explicit S-Chain address is ",
                cc.attention( imaState.strAddrErc1155Explicit ) );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc1155.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC1155 ABI ",
            imaState.chainProperties.tc.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return cc.attention( x );
            } );
    }
}

function commonInitGasMultipliersAndTransactionArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( isPrintGathered ) {
        log.debug( cc.info( "Main Net Gas Price Multiplier is" ), ".....................",
            ( imaState.chainProperties.mn.transactionCustomizer.gasPriceMultiplier
                ? cc.info( imaState.chainProperties.mn.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : cc.error( "disabled" ) ) );
        log.debug( cc.info( "S-Chain Gas Price Multiplier is" ), "......................",
            ( imaState.chainProperties.sc.transactionCustomizer.gasPriceMultiplier
                ? cc.info( imaState.chainProperties.sc.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Target S-Chain Gas Price Multiplier is" ), "...............",
            ( imaState.chainProperties.tc.transactionCustomizer.gasPriceMultiplier
                ? cc.info( imaState.chainProperties.tc.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Main Net Gas Value Multiplier is" ), ".....................",
            ( imaState.chainProperties.mn.transactionCustomizer.gasMultiplier
                ? cc.info( imaState.chainProperties.mn
                    .transactionCustomizer.gasMultiplier.toString() )
                : cc.notice( "default" ) ) );
        log.debug( cc.info( "S-Chain Gas Value Multiplier is" ), "......................",
            ( imaState.chainProperties.sc.transactionCustomizer.gasMultiplier
                ? cc.info( imaState.chainProperties.sc
                    .transactionCustomizer.gasMultiplier.toString() )
                : cc.notice( "default" ) ) );
        log.debug( cc.info( "Target S-Chain Gas Value Multiplier is" ), "...............",
            ( imaState.chainProperties.tc.transactionCustomizer.gasMultiplier
                ? cc.info( imaState.chainProperties.tc
                    .transactionCustomizer.gasMultiplier.toString() )
                : cc.notice( "default" ) ) );
        log.debug( cc.info( "Pending work analysis(PWA) is" ), "........................",
            ( imaState.isPWA ? cc.success( "enabled" ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Expose PWA details to log is" ), ".........................",
            ( imaState.isPrintPWA ? cc.success( "enabled" ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Oracle based gas reimbursement is" ), "....................",
            ( imaOracleOperations.getEnabledOracle()
                ? cc.success( "enabled" ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "S-Chain to S-Chain transferring is" ) + "...................",
            ( imaState.optsS2S.isEnabled ? cc.success( "enabled" ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "SKALE network re-discovery interval is" ), "...............",
            ( imaState.optsS2S.secondsToReDiscoverSkaleNetwork
                ? cc.info( imaState.optsS2S.secondsToReDiscoverSkaleNetwork.toString() )
                : cc.error( "disabled" ) ) );
        log.debug( cc.info( "SKALE network max discovery wait time is" ), ".............",
            ( imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered
                ? cc.info( imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered.toString() )
                : cc.error( "disabled" ) ) );
        log.debug( cc.info( "S<->S transfer mode is" ), "...............................",
            imaHelperAPIs.getS2STransferModeDescriptionColorized() );
        log.debug( cc.info( "IMA JSON RPC server port is" ), "..........................",
            ( ( imaState.nJsonRpcPort > 0 )
                ? cc.info( imaState.nJsonRpcPort ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Cross-IMA mode is" ), "....................................",
            ( imaState.isCrossImaBlsMode ? cc.success( "enabled" ) : cc.error( "disabled" ) ) );
        log.debug( cc.info( "Dry-run is enabled" ), "...................................",
            cc.yn( imaTx.dryRunIsEnabled() ) );
        log.debug( cc.info( "Dry-run execution result is ignored" ) + "..................",
            cc.yn( imaTx.dryRunIsIgnored() ) );
    }
}

function commonInitLoggingArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( imaState.strLogFilePath.length > 0 ) {
        ensureHaveValue(
            "Log file path",
            imaState.strLogFilePath, false,
            isPrintGathered, null, ( x ) => {
                return cc.info( x );
            } );
        ensureHaveValue(
            "Max size of log file path",
            imaState.nLogMaxSizeBeforeRotation, false,
            isPrintGathered, null, ( x ) => {
                return ( x <= 0 ) ? cc.warning( "unlimited" ) : cc.note( x );
            } );
        ensureHaveValue(
            "Max rotated count of log files",
            imaState.nLogMaxFilesCount,
            false, isPrintGathered, null, ( x ) => {
                return ( x <= 1 ) ? cc.warning( "not set" ) : cc.note( x );
            } );
    }
}

function commonInitAutomaticExitArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    const isPrintSecurityValues = ( !!( imaState.isPrintSecurityValues ) );
    ensureHaveValue(
        "Automatic exit(seconds)",
        imaState.nAutoExitAfterSeconds, false,
        isPrintGathered && isPrintSecurityValues );
}

export function commonInit() {
    const imaState = state.get();
    commonInitPrintSysInfo();
    commonInitCheckAbiPaths();
    commonInitCheckContractPresences();
    commonInitPrintFoundContracts();
    commonInitCheckErc20();
    commonInitCheckErc721();
    commonInitCheckErc1155();
    if( log.verboseGet() > log.verboseReversed().debug || imaState.bShowConfigMode ) {
        commonInitCheckGeneralArgs();
        commonInitCheckCredentialsArgs();
        commonInitCheckTransferAmountArgs();
        commonInitTransferringArgs();
        commonInitCheckAccessArgs();
        commonInitErcTokensArgs();
        commonInitGasMultipliersAndTransactionArgs();
        commonInitLoggingArgs();
        commonInitAutomaticExitArgs();
    }
} // commonInit

export function imaInitEthersProviders() {
    const imaState = state.get();
    if( imaState.chainProperties.mn.strURL &&
        typeof imaState.chainProperties.mn.strURL == "string" &&
        imaState.chainProperties.mn.strURL.length > 0
    ) {
        const u = imaState.chainProperties.mn.strURL;
        asyncCheckUrlAtStartup( u, "Main-net" );
        imaState.chainProperties.mn.ethersProvider = owaspUtils.getEthersProviderFromURL( u );
    } else {
        log.warning( " No Main-net URL specified in command line arguments" +
            "(needed for particular operations only)" );
    }

    if( imaState.chainProperties.sc.strURL &&
        typeof imaState.chainProperties.sc.strURL == "string" &&
        imaState.chainProperties.sc.strURL.length > 0
    ) {
        const u = imaState.chainProperties.sc.strURL;
        asyncCheckUrlAtStartup( u, "S-Chain" );
        imaState.chainProperties.sc.ethersProvider = owaspUtils.getEthersProviderFromURL( u );
    } else {
        log.warning( " No S-Chain URL specified in command line arguments" +
            "(needed for particular operations only)" );
    }

    if( imaState.chainProperties.tc.strURL &&
        typeof imaState.chainProperties.tc.strURL == "string" &&
        imaState.chainProperties.tc.strURL.length > 0
    ) {
        const u = imaState.chainProperties.tc.strURL;
        asyncCheckUrlAtStartup( u, "S<->S Target S-Chain" );
        imaState.chainProperties.tc.ethersProvider = owaspUtils.getEthersProviderFromURL( u );
    } else {
        log.warning( " No S<->S Target S-Chain URL specified in command line arguments" +
            "(needed for particular operations only)" );
    }

} // imaInitEthersProviders

function initContractsIMA() {
    const imaState = state.get();
    if( imaState.chainProperties.mn.bHaveAbiIMA ) {
        const cp = imaState.chainProperties.mn;
        const ep = cp.ethersProvider;
        const joABI = cp.joAbiIMA;
        imaState.joDepositBoxETH =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.deposit_box_eth_address,
                joABI.deposit_box_eth_abi,
                ep
            ); // only main net
        imaState.joDepositBoxERC20 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.deposit_box_erc20_address,
                joABI.deposit_box_erc20_abi,
                ep
            ); // only main net
        imaState.joDepositBoxERC721 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.deposit_box_erc721_address,
                joABI.deposit_box_erc721_abi,
                ep
            ); // only main net
        imaState.joDepositBoxERC1155 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.deposit_box_erc1155_address,
                joABI.deposit_box_erc1155_abi,
                ep )
        ; // only main net
        imaState.joDepositBoxERC721WithMetadata =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.deposit_box_erc721_with_metadata_address,
                joABI.deposit_box_erc721_with_metadata_abi,
                ep
            ); // only main net
        imaState.joCommunityPool =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.community_pool_address,
                joABI.community_pool_abi,
                ep
            ); // only main net
        imaState.joLinker =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.linker_address, joABI.linker_abi, ep ); // only main net
        imaState.joMessageProxyMainNet =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.message_proxy_mainnet_address, joABI.message_proxy_mainnet_abi, ep );
    }
    if( imaState.chainProperties.sc.bHaveAbiIMA ) {
        const cp = imaState.chainProperties.sc;
        const ep = cp.ethersProvider;
        const joABI = cp.joAbiIMA;
        imaState.joTokenManagerETH =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_eth_address,
                joABI.token_manager_eth_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC20 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc20_address,
                joABI.token_manager_erc20_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC721 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc721_address,
                joABI.token_manager_erc721_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC1155 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc1155_address,
                joABI.token_manager_erc1155_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC721WithMetadata =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc721_with_metadata_address,
                joABI.token_manager_erc721_with_metadata_abi,
                ep ); // only s-chain
        imaState.joCommunityLocker =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.community_locker_address,
                joABI.community_locker_abi,
                ep ); // only s-chain
        imaState.joMessageProxySChain =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.message_proxy_chain_address,
                joABI.message_proxy_chain_abi,
                ep );
        imaState.joTokenManagerLinker =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_linker_address,
                joABI.token_manager_linker_abi,
                ep );
        imaState.joEthErc20 =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.eth_erc20_address,
                joABI.eth_erc20_abi,
                ep ); // only s-chain
    }
    if( imaState.chainProperties.tc.bHaveAbiIMA ) {
        const cp = imaState.chainProperties.tc;
        const ep = cp.ethersProvider;
        const joABI = cp.joAbiIMA;
        imaState.joTokenManagerETHTarget =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_eth_address,
                joABI.token_manager_eth_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC20Target =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc20_address,
                joABI.token_manager_erc20_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC721Target =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc721_address,
                joABI.token_manager_erc721_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC1155Target =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc1155_address,
                joABI.token_manager_erc1155_abi,
                ep ); // only s-chain
        imaState.joTokenManagerERC721WithMetadataTarget =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_erc721_with_metadata_address,
                joABI.token_manager_erc721_with_metadata_abi,
                ep ); // only s-chain
        imaState.joCommunityLockerTarget =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.community_locker_address,
                joABI.community_locker_abi,
                ep ); // only s-chain
        imaState.joMessageProxySChainTarget =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.message_proxy_chain_address,
                joABI.message_proxy_chain_abi,
                ep );
        imaState.joTokenManagerLinkerTarget =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.token_manager_linker_address,
                joABI.token_manager_linker_abi,
                ep );
        imaState.joEthErc20Target =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.eth_erc20_address,
                joABI.eth_erc20_abi,
                ep ); // only s-chain
    }
}

function initContractsSkaleManager() {
    const imaState = state.get();
    if( imaState.bHaveSkaleManagerABI ) {
        const cp = imaState.chainProperties.mn;
        const ep = cp.ethersProvider;
        const joABI = imaState.joAbiSkaleManager;
        imaState.joConstantsHolder =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.constants_holder_address,
                joABI.constants_holder_abi,
                ep );
        imaState.joNodes =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.nodes_address,
                joABI.nodes_abi,
                ep );
        imaState.joKeyStorage =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.key_storage_address,
                joABI.key_storage_abi,
                ep );
        imaState.joSChains =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.schains_address,
                joABI.schains_abi,
                ep );
        imaState.joSChainsInternal =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.schains_internal_address,
                joABI.schains_internal_abi,
                ep );
        imaState.joSkaleDKG =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.skale_d_k_g_address,
                joABI.skale_d_k_g_abi,
                ep );
        imaState.joSkaleManager =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.skale_manager_address,
                joABI.skale_manager_abi,
                ep );
        imaState.joSkaleToken =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.skale_token_address,
                joABI.skale_token_abi,
                ep );
        imaState.joValidatorService =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.validator_service_address,
                joABI.validator_service_abi,
                ep );
        imaState.joWallets =
            new owaspUtils.ethersMod.ethers.Contract(
                joABI.wallets_address,
                joABI.wallets_abi,
                ep );
    }
}

export function initContracts() {
    imaInitEthersProviders();
    initContractsIMA();
    initContractsSkaleManager();
}
