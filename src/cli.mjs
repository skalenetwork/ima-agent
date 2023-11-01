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

function att() { return log.fmtAttention( ...arguments ); };

export function printAbout( isLog ) {
    isLog = isLog || false;
    const strMsg =
        log.fmtTrace( att( gStrAppName ), " version ", log.fmtNotice( gStrVersion ) );
    if( isLog )
        log.information( strMsg + "\n" );
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
        return log.fmtInformation( x );
    } );
    fnValueColorizer = fnValueColorizer || ( ( x ) => {
        return log.fmtNotice( x );
    } );
    let retVal = true;
    value = value ? value.toString() : "";
    if( value.length === 0 ) {
        retVal = false;
        if( ! isPrintValue )
            console.log( log.fmtError( "WARNING:, missing value for ", fnNameColorizer( name ) ) );
        if( isExitIfEmpty )
            process.exit( 126 );
    }
    let strDots = "...";
    let n = 50 - name.length;
    for( ; n > 0; --n )
        strDots += ".";
    if( isPrintValue )
        log.debug( "{}{}{}", fnNameColorizer( name ), strDots, fnValueColorizer( value ) );
    return retVal;
}

export function ensureHaveCredentials(
    strFriendlyChainName, joAccount, isExitIfEmpty, isPrintValue
) {
    strFriendlyChainName = strFriendlyChainName || "<UNKNOWN>";
    if( ! ( typeof joAccount == "object" ) ) {
        log.error( "ARGUMENTS VALIDATION WARNING: bad account specified for {} chain",
            strFriendlyChainName );
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
        log.error( "ARGUMENTS VALIDATION WARNING: bad credentials information specified for {} " +
            "chain, no explicit SGX, no explicit private key, no wallet address found",
        strFriendlyChainName );
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
    console.log( att( "GENERAL" ) + " options:" );
    console.log( soi + "--" + att( "help" ) +
        "..................................Show this help info and exit." );
    console.log( soi + "--" + att( "version" ) +
        "...............................Show version info and exit." );
    console.log( soi + "--" + att( "colors" ) +
        "................................Use ANSI-colorized logging." );
    console.log( soi + "--" + att( "no-colors" ) +
        ".............................Use monochrome logging." );
}

function printHelpBlockchainNetwork( soi ) {
    console.log( att( "BLOCKCHAIN NETWORK" ) + " options:" );
    console.log( soi + "--" +
        att( "url-main-net" ) + "=" + att( "URL" ) +
        "......................Main-net URL. Value is automatically loaded from the " +
        att( "URL_W3_ETHEREUM" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "url-s-chain" ) + "=" + att( "URL" ) +
        ".......................S-chain URL. Value is automatically loaded from the " +
        att( "URL_W3_S_CHAIN" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "url-t-chain" ) + "=" + att( "URL" ) +
        ".......................S<->S Target S-chain URL. Value is automatically loaded from the " +
        att( "URL_W3_S_CHAIN_TARGET" ) + " environment variable if not specified." );
    console.log( soi + "--" +
        att( "id-main-net" ) + "=" + att( "number" ) +
        "....................Main-net Ethereum network name. " +
        "Value is automatically loaded from the " + att( "CHAIN_NAME_ETHEREUM" ) +
        " environment variable if not specified. Default value is " +
        att( "\"Mainnet\"" ) + "." );
    console.log( soi + "--" + att( "id-s-chain" ) + "=" + att( "number" ) +
        ".....................S-chain Ethereum network name." +
        " Value is automatically loaded from the " + att( "CHAIN_NAME_SCHAIN" ) +
        " environment variable if not specified. Default value is " +
        att( "\"id-S-chain\"" ) + "." );
    console.log( soi + "--" +
        att( "id-t-chain" ) + "=" + att( "number" ) +
        ".....................S<->S Target S-chain Ethereum network name." +
        " Value is automatically loaded from the " + att( "CHAIN_NAME_SCHAIN_TARGET" ) +
        " environment variable if not specified. Default value is " + att( "\"id-T-chain\"" ) +
        "." );
    console.log( soi + "--" + att( "cid-main-net" ) + "=" + att( "number" ) +
        "...................Main-net Ethereum " + att( "chain ID" ) +
        " Value is automatically loaded from the " + att( "CID_ETHEREUM" ) +
        " environment variable if not specified. Default value is " + att( -4 ) + "." );
    console.log( soi + "--" + att( "cid-s-chain" ) + "=" + att( "number" ) +
        "....................S-chain Ethereum " + att( "chain ID" ) +
        " Value is automatically loaded from the " + att( "CID_SCHAIN" ) +
        " environment variable if not specified. Default value is " + att( -4 ) + "." );
    console.log( soi + "--" + att( "cid-t-chain" ) + "=" + att( "number" ) +
        "....................S<->S Target S-chain Ethereum " + att( "chain ID" ) +
        " Value is automatically loaded from the " + att( "CID_SCHAIN_TARGET" ) +
        " environment variable if not specified. Default value is " + att( -4 ) + "." );
}

function printHelpBlockchainInterface( soi ) {
    console.log( att( "BLOCKCHAIN INTERFACE" ) + " options:" );
    console.log( soi + "--" + att( "abi-skale-manager" ) + "=" + att( "path" ) +
        "................Path to JSON file containing " + att( "Skale Manager" ) + " ABI. " +
        "Optional parameter. It's needed for S-Chain to S-Chain transfers." );
    console.log( soi + "--" + att( "abi-main-net" ) + "=" + att( "path" ) +
        ".....................Path to JSON file containing IMA ABI for Main-net." );
    console.log( soi + "--" + att( "abi-s-chain" ) + "=" + att( "path" ) +
        "......................Path to JSON file containing IMA ABI for S-chain." );
    console.log( soi + "--" + att( "abi-t-chain" ) + "=" + att( "path" ) +
        "......................Path to JSON file containing IMA ABI for S<->S Target S-chain." );
}

function printHelpErcInterfaces( soi ) {
    console.log( att( "ERC20 INTERFACE" ) + " options:" );
    console.log( soi + "--" + att( "erc20-main-net" ) + "=" + att( "path" ) +
        "...................Path to JSON file containing " + att( "ERC20" ) +
        " ABI for Main-net." );
    console.log( soi + "--" + att( "erc20-s-chain" ) + "=" + att( "path" ) +
        "....................Path to JSON file containing " + att( "ERC20" ) +
        " ABI for S-chain." );
    console.log( soi + "--" + att( "addr-erc20-s-chain" ) + "=" + att( "address" ) +
        "............Explicit " + att( "ERC20" ) + " address in S-chain." );
    console.log( soi + "--" + att( "erc20-t-chain" ) + "=" + att( "path" ) +
        "....................Path to JSON file containing " + att( "ERC20" ) +
        " ABI for S<->S Target S-chain." );
    console.log( soi + "--" + att( "addr-erc20-t-chain" ) + "=" + att( "address" ) +
        "............Explicit " + att( "ERC20" ) + " address in S<->S Target S-chain." );

    console.log( att( "ERC721 INTERFACE" ) + " options:" );
    console.log( soi + "--" + att( "erc721-main-net" ) + "=" + att( "path" ) +
        "..................Path to JSON file containing " + att( "ERC721" ) +
        " ABI for Main-net." );
    console.log( soi + "--" + att( "erc721-s-chain" ) + "=" + att( "path" ) +
        "...................Path to JSON file containing " + att( "ERC721" ) +
        " ABI for S-chain." );
    console.log( soi + "--" + att( "addr-erc721-s-chain" ) + "=" + att( "address" ) +
        "...........Explicit " + att( "ERC721" ) + " address in S-chain." );
    console.log( soi + "--" + att( "erc721-t-chain" ) + "=" + att( "path" ) +
        "...................Path to JSON file containing " + att( "ERC721" ) +
        " ABI for S<->S S-chain." );
    console.log( soi + "--" + att( "addr-erc721-t-chain" ) + "=" + att( "address" ) +
        "...........Explicit " + att( "ERC721" ) + " address in S<->S S-chain." );

    console.log( att( "ERC1155 INTERFACE" ) + " options:" );
    console.log( soi + "--" + att( "erc1155-main-net" ) + "=" + att( "path" ) +
        ".................Path to JSON file containing " + att( "ERC1155" ) +
        " ABI for Main-net." );
    console.log( soi + "--" + att( "erc1155-s-chain" ) + "=" + att( "path" ) +
        "..................Path to JSON file containing " + att( "ERC1155" ) +
        " ABI for S-chain." );
    console.log( soi + "--" + att( "addr-erc1155-s-chain" ) + "=" + att( "address" ) +
        "..........Explicit " + att( "ERC1155" ) + " address in S-chain." );
    console.log( soi + "--" + att( "erc1155-t-chain" ) + "=" + att( "path" ) +
        "..................Path to JSON file containing " + att( "ERC1155" ) +
        " ABI for S<->S S-chain." );
    console.log( soi + "--" + att( "addr-erc1155-t-chain" ) + "=" + att( "address" ) +
        "..........Explicit " + att( "ERC1155" ) + " address in S<->S S-chain." );
}

function printHelpUserAccount1( soi ) {
    console.log( att( "USER ACCOUNT" ) + " options:" );
    console.log( soi + "--" + att( "tm-url-main-net" ) + "=" + att( "URL" ) +
        "...................Transaction Manager server URL for " + att( "Main-net" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_URL_ETHEREUM" ) +
        " environment variable if not specified. " +
        "Example: " + att( "redis://@127.0.0.1:6379" ) );
    console.log( soi + "--" + att( "tm-url-s-chain" ) + "=" + att( "URL" ) +
        "....................Transaction Manager server URL for " + att( "S-chain" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_URL_S_CHAIN" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "tm-url-t-chain" ) + "=" + att( "URL" ) +
        "....................Transaction Manager server URL for " + att( "S<->S Target S-chain" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_URL_S_CHAIN_TARGET" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "tm-priority-main-net" ) + "=" + att( "URL" ) +
        "..............Transaction Manager priority for " + att( "Main-net" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_PRIORITY_ETHEREUM" ) +
        " environment variable if not specified. Default is " + att( "5" ) + "." );
    console.log( soi + "--" + att( "tm-priority-s-chain" ) + "=" + att( "URL" ) +
        "...............Transaction Manager" +
        att( " priority for " ) + att( "S-chain" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_PRIORITY_S_CHAIN" ) +
        " environment variable if not specified. Default is " + att( "5" ) + "." );
    console.log( soi + "--" + att( "tm-priority-t-chain" ) + "=" + att( "URL" ) +
        "...............Transaction Manager" +
        att( " priority for " ) + att( "S<->S Target S-chain" ) +
        " Value is automatically loaded from the " +
        att( "TRANSACTION_MANAGER_PRIORITY_S_CHAIN_TARGET" ) +
        " environment variable if not specified. Default is " + att( "5" ) + "." );
    console.log( soi + "--" + att( "sgx-url-main-net" ) + "=" + att( "URL" ) +
        ".................." + att( "SGX server" ) + " URL for " + att( "Main-net" ) +
        " Value is automatically loaded from the " + att( "SGX_URL_ETHEREUM" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-url-s-chain" ) + "=" + att( "URL" ) +
        "..................." + att( "SGX server" ) + " URL for S-chain" +
        " Value is automatically loaded from the " + att( "SGX_URL_S_CHAIN" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-url-t-chain" ) + "=" + att( "URL" ) +
        "..................." + att( "SGX server" ) + " URL for " +
        att( "S<->S Target S-chain." ) );
    console.log( soi + "--" + att( "sgx-url" ) + "=" + att( "URL" ) +
        "..........................." + att( "SGX server" ) + att( " URL for all chains." ) );
    console.log( soi + "--" + att( "sgx-ecdsa-key-main-net" ) + "=" + att( "name" ) +
        "..........." + att( "SGX/ECDSA key name" ) + " for " + att( "Main-net" ) +
        " Value is automatically loaded from the " + att( "SGX_KEY_ETHEREUM" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ecdsa-key-s-chain" ) + "=" + att( "name" ) +
        "............" + att( "SGX/ECDSA key name" ) + " for S-chain" +
        " Value is automatically loaded from the " + att( "SGX_KEY_S_CHAIN" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ecdsa-key-t-chain" ) + "=" + att( "name" ) +
        "............" + att( "SGX/ECDSA key name" ) + " for S<->S Target S-chain" +
        " Value is automatically loaded from the " + att( "SGX_KEY_S_CHAIN_TARGET" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ecdsa-key" ) + "=" + att( "name" ) +
        "...................." + att( "SGX/ECDSA key name" ) + " for all chains." );
    console.log( soi + "--" + att( "sgx-bls-key-main-net" ) + "=" + att( "name" ) +
        "............." + att( "SGX/BLS key name" ) + " for " + att( "Main-net" ) +
        " Value is automatically loaded from the " + att( "BLS_KEY_ETHEREUM" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-bls-key-s-chain" ) + "=" + att( "name" ) +
        ".............." + att( "SGX/BLS key name" ) + " for S-chain" +
        " Value is automatically loaded from the " + att( "BLS_KEY_S_CHAIN" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-bls-key-t-chain" ) + "=" + att( "name" ) +
        ".............." + att( "SGX/BLS key name" ) + " for S<->S Target S-chain" +
        " Value is automatically loaded from the " + att( "BLS_KEY_S_CHAIN_TARGET" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-bls-key" ) + "=" + att( "name" ) +
        "......................" + att( "SGX/BLS key name" ) + " for all chains." );
    console.log( soi + "--" + att( "sgx-ssl-key-main-net" ) + "=" + att( "path" ) +
        ".............Path to " + att( "SSL key file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "Main-net" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_KEY_FILE_ETHEREUM" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-key-s-chain" ) + "=" + att( "path" ) +
        "..............Path to " + att( "SSL key file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "S-chain" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_KEY_FILE_S_CHAIN" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-key-t-chain" ) + "=" + att( "path" ) +
        "..............Path to " + att( "SSL key file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "S<->S Target S-chain" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_KEY_FILE_S_CHAIN_TARGET" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-key" ) + "=" + att( "path" ) +
        "......................Path to " + att( "SSL key file" ) + " for " + att( "SGX wallet" ) +
        " of all chains." );
    console.log( soi + "--" + att( "sgx-ssl-cert-main-net" ) + "=" + att( "path" ) +
        "............Path to " + att( "SSL certificate file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "Main-net" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_CERT_FILE_ETHEREUM" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-cert-s-chain" ) + "=" + att( "path" ) +
        ".............Path to " + att( "SSL certificate file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "S-chain" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_CERT_FILE_S_CHAIN" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-cert-t-chain" ) + "=" + att( "path" ) +
        ".............Path to " + att( "SSL certificate file" ) + " for " + att( "SGX wallet" ) +
        " of " + att( "S<->S Target S-chain" ) + " Value is automatically loaded from the " +
        att( "SGX_SSL_CERT_FILE_S_CHAIN_TARGET" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "sgx-ssl-cert" ) + "=" + att( "path" ) +
        ".....................Path to " + att( "SSL certificate file" ) + " for all chains." );
    console.log( soi + "--" + att( "address-main-net" ) + "=" + att( "value" ) +
        "................Main-net " + att( "user account address" ) +
        " Value is automatically loaded from the " + att( "ACCOUNT_FOR_ETHEREUM" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "address-s-chain" ) + "=" + att( "value" ) +
        ".................S-chain " + att( "user account address" ) +
        " Value is automatically loaded from the " + att( "ACCOUNT_FOR_SCHAIN" ) +
        " environment variable if not specified." );
    console.log( soi + "--" + att( "address-t-chain" ) + "=" + att( "value" ) +
        ".................S<->S Target S-chain " + att( "user account address" ) +
        " Value is automatically loaded from the " + att( "ACCOUNT_FOR_SCHAIN_TARGET" ) +
        " environment variable if not specified." );
}

function printHelpUserAccount2( soi ) {
    console.log( soi + "--" + att( "key-main-net" ) + "=" + att( "value" ) +
        "....................Private key" + " for " + att( "Main-net" ) + " " +
        att( "user account address" ) + " Value is automatically loaded from the " +
        att( "PRIVATE_KEY_FOR_ETHEREUM" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "key-s-chain" ) + "=" + att( "value" ) +
        ".....................Private key" + " for " + att( "S-Chain" ) + " " +
        att( "user account address" ) + " Value is automatically loaded from the " +
        att( "PRIVATE_KEY_FOR_SCHAIN" ) + " environment variable if not specified." );
    console.log( soi + "--" + att( "key-t-chain" ) + "=" + att( "value" ) +
        ".....................Private key" + " for " + att( "S<->S Target S-Chain" ) +
        " " + att( "user account address" ) + " Value is automatically loaded from the " +
        att( "PRIVATE_KEY_FOR_SCHAIN_TARGET" ) + " environment variable if not specified." );
    console.log( soi + "Please notice, IMA prefer to use transaction manager " +
        "to sign blockchain transactions if " + att( "--tm-url-main-net" ) + "/" +
        att( "--tm-url-s-chain" ) + " command line values or " +
        att( "TRANSACTION_MANAGER_URL_ETHEREUM" ) + "/" + att( "TRANSACTION_MANAGER_URL_S_CHAIN" ) +
        " shell variables were specified. Next preferred option is SGX wallet which is used if " +
        att( "--sgx-url-main-net" ) + "/" + att( "--sgx-url-s-chain" ) +
        " command line values or " + att( "SGX_URL_ETHEREUM" ) + "/" + att( "SGX_URL_S_CHAIN" ) +
        " shell variables were specified. SGX signing also needs key name, " +
        "key and certificate files. Finally, IMA attempts to use explicitly provided private key " +
        "to sign blockchain transactions if " + att( "--key-main-net" ) + "/" +
        att( "--key-s-chain" ) + " command line values or " +
        att( "PRIVATE_KEY_FOR_ETHEREUM" ) + "/" + att( "PRIVATE_KEY_FOR_SCHAIN" ) +
        " shell variables were specified. " );
}

function printHelpTransfers( soi ) {
    console.log( att( "GENERAL TRANSFER" ) + " options:" );
    console.log( soi + "--" + att( "value" ) + "=" + att( "number" ) + att( "unitName" ),
        ".................Amount of " + att( "unitName" ) + " to transfer, where " +
        att( "unitName" ) + " is well known Ethereum unit name like " + att( "ether" ) +
        " or " + att( "wei" ) + "." );
    console.log( soi + "--" + att( "wei" ) + "=" + att( "number" ) +
        "............................Amount of " + att( "wei" ) + " to transfer." );
    console.log( soi + "--" + att( "babbage" ) + "=" + att( "number" ) +
        "........................Amount of " +
        att( "babbage" ) + log.fmtInformation( "(wei*1000)" ) + " to transfer." );
    console.log( soi + "--" + att( "lovelace" ) + "=" + att( "number" ) +
        ".......................Amount of " +
        att( "lovelace" ) + log.fmtInformation( "(wei*1000*1000)" ) + " to transfer." );
    console.log( soi + "--" + att( "shannon" ) + "=" + att( "number" ) +
        "........................Amount of " +
        att( "shannon" ) + log.fmtInformation( "(wei*1000*1000*1000)" ) + " to transfer." );
    console.log( soi + "--" + att( "szabo" ) + "=" + att( "number" ) +
        "..........................Amount of " +
        att( "szabo" ) + log.fmtInformation( "(wei*1000*1000*1000*1000)" ) +
        " to transfer." );
    console.log( soi + "--" + att( "finney" ) + "=" + att( "number" ) +
        ".........................Amount of " +
        att( "finney" ) + log.fmtInformation( "(wei*1000*1000*1000*1000*1000)" ) +
        " to transfer." );
    console.log( soi + "--" + att( "ether" ) + "=" + att( "number" ) +
        "..........................Amount of " +
        att( "ether" ) + log.fmtInformation( "(wei*1000*1000*1000*1000*1000*1000)" ) +
        " to transfer." );
    console.log( soi + "--" + att( "amount" ) + "=" + att( "number" ) +
        ".........................Amount of " +
        att( "tokens" ) + " to transfer." );
    console.log( soi + "--" + att( "tid" ) + "=" + att( "number" ) +
        "............................" + att( "ERC721" ) +
        " or " + att( "ERC1155" ) + " to ken id to transfer." );
    console.log( soi + "--" + att( "amounts" ) + "=" + att( "array of numbers" ) +
        ".............." + att( "ERC1155" ) + " to ken id to transfer in batch." );
    console.log( soi + "--" + att( "tids" ) + "=" + att( "array of numbers" ) +
        "................." + att( "ERC1155" ) + " to ken amount to transfer in batch." );
    console.log( soi + "--" + att( "sleep-between-tx" ) + "=" + att( "number" ) +
        "...............Sleep time (in milliseconds) between transactions " +
        "during complex operations." );
    console.log( soi + "--" + att( "wait-next-block" ) +
        ".......................Wait for next block between transactions " +
        "during complex operations." );

    console.log( att( "S-CHAIN TO S-CHAIN TRANSFER" ) + " options:" );
    console.log( soi + "--" + att( "s2s-enable" ), "..........................." +
        log.fmtSuccess( "Enables" ) + " " + att( "S-Chain" ) + " to " +
        att( "S-Chain" ) + " transfers. Default mode" + ". The " + att( "abi-skale-manager" ) +
        " path must be provided." );
    console.log( soi + "--" + att( "s2s-disable" ), ".........................." +
        log.fmtError( "Disables" ) + " " + att( "S-Chain" ) + " to " + att( "S-Chain" ) +
        " transfers." );
    console.log( soi + "--" + att( "s2s-parallel" ), "........................." +
        "Sets  " + att( "parallel S2S transfer mode" ) + " and runs S2S in worker thread." +
        " This is default mode." );
    console.log( soi + "--" + att( "s2s-simple" ), "..........................." +
        "Sets  " + att( "simple S2S transfer mode" ) + " and runs S2S in main thread." );
    console.log( soi + "--" + att( "net-rediscover" ) + "=" + att( "number" ) +
        "................." + att( "SKALE NETWORK" ) + " re-discovery interval(in seconds). " +
        "Default is " + att( "3600" ) + " seconds or " + att( "1" ) + " hour, specify " +
        att( "0" ) + " to " + log.fmtError( "disable" ) + " " +
        att( "SKALE NETWORK" ) + " re-discovery." );
    console.log( soi + "--" + att( "net-wait-discovery" ) + "=" + att( "number" ) +
        "............." + att( "SKALE NETWORK" ) + " wait time(in seconds) for " +
        att( "SKALE NETWORK" ) + " discovery result to arrive. Default is " + att( "120" ) + "." );
}

function printHelpPaymentTransaction( soi ) {
    console.log( att( "PAYMENT TRANSACTION" ) + " options:" );
    console.log( soi + "--" + att( "gas-price-multiplier-mn" ), ".............." +
        "Sets " + att( "Gas Price Multiplier" ) + " for " + att( "Main Net" ) + " transactions, " +
        "Default value is " + att( "1.25" ) + ". Specify value " + att( "0.0" ) + " to " +
        log.fmtError( "disable" ) + " " + att( "Gas Price Customization" ) +
        " for " + att( "Main Net" ) + "." );
    console.log( soi + "--" + att( "gas-price-multiplier-sc" ), ".............." +
        "Sets " + att( "Gas Price Multiplier" ) + " for S-Chain transactions, " +
        "Default value is " + att( "0.0" ) + "." );
    console.log( soi + "--" + att( "gas-price-multiplier-tc" ), ".............." +
        "Sets " + att( "Gas Price Multiplier" ) + " for " + att( "S<->S Target S-Chain" ) +
        " transactions, Default value is " + att( "0.0" ) + "." );
    console.log( soi + "--" + att( "gas-price-multiplier" ), "................." +
        "Sets " + att( "Gas Price Multiplier" ) + " for both " + att( "Main Net" ) + " and " +
        att( "S-Chain" ) + "(s)." );
    console.log( soi + "--" + att( "gas-multiplier-mn" ), "...................." +
        "Sets " + att( "Gas Value Multiplier" ) + " for " + att( "Main Net" ) + " transactions, " +
        "Default value is " + att( "1.25" ) + ". Specify value " + att( "0.0" ) + " to " +
        log.fmtError( "disable" ) + " " + att( "Gas Price Customization" ) +
        " for " + att( "Main Net" ) + "." );
    console.log( soi + "--" + att( "gas-multiplier-sc" ), "...................." +
        "Sets " + att( "Gas Value Multiplier" ) + "for S-Chain transactions, " +
        "Default value is " + att( "1.25" ) + "." );
    console.log( soi + "--" + att( "gas-multiplier-tc" ), "...................." +
        "Sets " + att( "Gas Value Multiplier" ) + " for " + att( "S<->S Target S-Chain" ) +
        " transactions, Default value is " + att( "1.25" ) + "." );
    console.log( soi + "--" + att( "gas-multiplier" ), "......................." +
        "Sets " + att( "Gas Value Multiplier" ) + " for both " + att( "Main Net" ) + " and " +
        att( "S-Chain" ) + "(s)." );
}

function printHelpRegistration( soi ) {
    console.log( att( "REGISTRATION" ) + log.fmtInformation( " commands:" ) );
    console.log( soi + "--" + att( "register" ), "............................." +
        "Register" + "(perform " + att( "all steps" ) + ")." );
    console.log( soi + "--" + att( "register1" ), "............................" +
        "Perform registration " + att( "step 1" ) + " - register S-Chain" + " on " +
        att( "Main-net" ) + "." );
    console.log( soi + "--" + att( "check-registration" ), "..................." +
        "Perform registration status check(perform " + att( "all steps" ) + ")." );
    console.log( soi + "--" + att( "check-registration1" ), ".................." +
        "Perform registration status check " + att( "step 1" ) +
        " - register S-Chain on Main-net." );
    console.log( soi + "--" + att( "check-registration2" ), ".................." +
        "Perform registration status check " + att( "step 2" ) +
        " - register S-Chain in " + att( "deposit box" ) + "." );
    console.log( soi + "--" + att( "check-registration3" ), ".................." +
        "Perform registration status check " + att( "step 3" ) + " - register " +
        att( "Main-net" ) + "'s " + att( "deposit box" ) + " on S-Chain." );
}

function printHelpAction( soi ) {
    console.log( att( "ACTION" ) + log.fmtInformation( " commands:" ) );
    console.log( soi + "--" + att( "show-config" ), ".........................." +
        "Show " + att( "configuration values" ) + " and exit." );
    console.log( soi + "--" + att( "show-balance" ), "........................." +
        "Show " + att( "ETH" ) + " and/or token balances on " + att( "Main-net" ) +
        " and/or S-Chain and exit." );
    console.log( soi + "--" + att( "m2s-payment" ), ".........................." +
        "Do one payment from " + att( "Main-net" ) + " user account to " + att( "S-chain" ) +
        " user account." );
    console.log( soi + "--" + att( "s2m-payment" ), ".........................." +
        "Do one payment from " + att( "S-chain" ) + " user account to " + att( "Main-net" ) +
        " user account." );
    console.log( soi + "--" + att( "s2m-receive" ), ".........................." +
        "Receive one payment from " + att( "S-chain" ) + " user account to " + att( "Main-net" ) +
        " user account(ETH only, receives all the ETH pending in transfer)." );
    console.log( soi + "--" + att( "s2m-view" ), "............................." +
        "View money amount user can receive as payment from " + att( "S-chain" ) +
        " user account to " + att( "Main-net" ) + " user account" +
        "(ETH only, receives all the ETH pending in transfer)." );
    console.log( soi + "--" + att( "s2s-payment" ), ".........................." +
        "Do one payment from " + att( "S-chain" ) + " user account to other " + att( "S-chain" ) +
        " user account." );
    console.log( soi + "--" + att( "s2s-forward" ), ".........................." +
        "Indicates " + att( "S<->S" ) + " transfer direction is " + att( "forward" ) +
        ". I.e. source " + att( "S-chain" ) +
        " is token minter and instantiator. This is default mode" + "." );
    console.log( soi + "--" + att( "s2s-reverse" ), ".........................." +
        "Indicates " + att( "S<->S" ) + " transfer direction is " + att( "reverse" ) +
        ". I.e. destination " + att( "S-chain" ) + " is token minter and instantiator." );
    console.log( soi + "--" + att( "m2s-transfer" ), "........................." +
        "Do single message transfer loop from " + att( "Main-net" ) + " to " +
        att( "S-chain" ) + "." );
    console.log( soi + "--" + att( "s2m-transfer" ), "........................." +
        "Do single message transfer loop from " + att( "S-chain" ) + " to " +
        att( "Main-net" ) + "." );
    console.log( soi + "--" +
        att( "s2s-transfer" ), "........................." +
    "Do single message transfer loop from " + att( "S-chain" ) + " to " +
        att( "S-chain" ) + "." );
    console.log( soi + "--" + att( "with-metadata" ), "........................" +
        "Makes " + att( "ERC721" ) + " transfer using special version of " +
        att( "Token Manager" ) + " to transfer token metadata." );
    console.log( soi + "--" + att( "transfer" ), "............................." +
        "Run single " + att( "M<->S" ) + " and, optionally, " + att( "S->S" ) +
        " transfer loop iteration." );
    console.log( soi + "--" + att( "loop" ), "................................." +
        "Run " + att( "M<->S" ) + " and, optionally, " +
        att( "S->S" ) + " transfer loops in parallel threads." );
    console.log( soi + "--" + att( "simple-loop" ), ".........................." +
        "Run " + att( "M<->S" ) + " and, optionally, " +
        att( "S->S" ) + " transfer loops in main thread only." );
}

function printHelpActionAdditional( soi ) {
    console.log( att( "ADDITIONAL ACTION" ) + " options:" );
    console.log( soi + "--" + att( "no-wait-s-chain" ), "......................" +
        "Do not wait until S-Chain is started." );
    console.log( soi + "--" + att( "max-wait-attempts" ) + "=" + log.fmtInformation( "value" ) +
        "...............Max number of " + att( "S-Chain" ) +
        " call attempts to do while it became alive and sane." );
    console.log( soi + "--" + att( "skip-dry-run" ), "........................." +
        "Skip " + att( "dry run" ) + " invocation before payed contract method calls." );
    console.log( soi + "--" + att( "no-ignore-dry-run" ), "...................." +
        att( "Use error results of " ) + att( "dry run" ) +
        " contract method calls as actual errors and stop execute." );
    console.log( soi + "--" + att( "m2s-transfer-block-size" ) + "=" +
        log.fmtInformation( "value" ) + "........." +
    "Number of transactions in one block to use in message transfer loop from " +
        att( "Main-net" ) + " to " + att( "S-chain" ) + "." +
        " Default is " + att( "4" ) + "." );
    console.log( soi + "--" + att( "s2m-transfer-block-size" ) + "=" +
        log.fmtInformation( "value" ) + ".........Number of transactions in one block " +
        "to use in message transfer loop from " + att( "S-chain" ) +
        " to " + att( "Main-net" ) + ". Default is " + att( "4" ) + "." );
    console.log( soi + "--" + att( "s2s-transfer-block-size" ) + "=" +
        log.fmtInformation( "value" ) + ".........Number of transactions in one block " +
        "to use in message transfer loop from " + att( "S-chain" ) +
        " to " + att( "S-chain" ) + ". Default is " + att( "4" ) + "." );
    console.log( soi + "--" + att( "transfer-block-size" ) + "=" +
        log.fmtInformation( "value" ) + ".............Number of transactions in one block " +
        "to use in all message transfer loops." );
    console.log( soi + "--" + att( "m2s-transfer-steps" ) + "=" +
        log.fmtInformation( "value" ) + "..............Maximal number of blocks " +
        "to transfer at a job run from " + att( "Main-net" ) +
        " to " + att( "S-chain" ) + ". Value " + att( "0" ) + " is unlimited. Default is " +
        att( "8" ) + "." );
    console.log( soi + "--" + att( "s2m-transfer-steps" ) + "=" + log.fmtInformation( "value" ) +
        "..............Maximal number of blocks to transfer at a job run from " +
        att( "S-chain" ) + " to " + att( "Main-net" ) + ". Value " + att( "0" ) + " is unlimited" +
        ". Default is " + att( "8" ) + "." );
    console.log( soi + "--" + att( "s2s-transfer-steps" ) + "=" + log.fmtInformation( "value" ) +
        "..............Maximal number of blocks to transfer at a job run from " +
        att( "S-chain" ) + " to " + att( "S-chain" ) + ". Value " + att( "0" ) + " is unlimited" +
        ". Default is " + att( "8" ) + "." );
    console.log( soi + "--" + att( "transfer-steps" ) + "=" + log.fmtInformation( "value" ) +
        "..................Maximal number of blocks " +
        "to transfer at a job run in all transfer loops." + " Value " +
        att( "0" ) + " is unlimited" + "." );
    console.log( soi + "--" + att( "m2s-max-transactions" ) + "=" + log.fmtInformation( "number" ) +
        "...........Maximal number of transactions to do in message transfer loop from " +
        att( "Main-net" ) + " to " + att( "S-chain" ) + "(" + att( "0" ) +
        " is unlimited)" + ". Default is " + att( "0" ) + "." );
    console.log( soi + "--" + att( "s2m-max-transactions" ) + "=" + log.fmtInformation( "number" ) +
        "...........Maximal number of transactions to do in message transfer loop from " +
        att( "S-chain" ) + " to " + att( "Main-net" ) + "(" + att( "0" ) +
        " is unlimited). Default is " + att( "0" ) + "." );
    console.log( soi + "--" + att( "s2s-max-transactions" ) + "=" + log.fmtInformation( "number" ) +
        "...........Maximal number of transactions to do in message transfer loop from " +
        att( "S-chain" ) + " to " + att( "S-chain" ) + "(" + att( "0" ) +
        " is unlimited). Default is " + att( "0" ) + "." );
    console.log( soi + "--" + att( "max-transactions" ) + "=" + log.fmtInformation( "number" ) +
        "...............Maximal number of transactions to do in all message transfer loops" +
        "(" + att( "0" ) + " is unlimited)." );
    console.log( soi + "--" + att( "m2s-await-blocks" ) + "=" + log.fmtInformation( "number" ) +
        "...............Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " + att( "Main-net" ) +
        " to " + att( "S-chain" ) + "(" + att( "0" ) + " is no wait). Default is " +
        att( "0" ) + "." );
    console.log( soi + "--" + att( "s2m-await-blocks" ) + "=" + log.fmtInformation( "number" ) +
        "...............Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " + att( "S-chain" ) +
        " to " + att( "Main-net" ) + "(" + att( "0" ) + " is no wait). Default is " +
        att( "0" ) + "." );
    console.log( soi + "--" + att( "s2s-await-blocks" ) + "=" + log.fmtInformation( "number" ) +
        "...............Maximal number of blocks to wait " +
        "to appear in blockchain before transaction from " + att( "S-chain" ) +
        " to " + att( "S-chain" ) + "(" + att( "0" ) + " is no wait). Default is " +
        att( "0" ) + "." );
    console.log( soi + "--" + att( "await-blocks" ) + "=" + log.fmtInformation( "number" ) +
        "...................Maximal number of blocks " +
        "to wait to appear in blockchain before transaction between both " +
        att( "S-chain" ) + " and " + att( "Main-net" ) +
        "(" + att( "0 " ) + "is no wait)." );
    console.log( soi + "--" + att( "m2s-await-time" ) + "=" + log.fmtInformation( "seconds" ) +
        "................Minimal age of transaction message(in seconds) before it will be " +
        "transferred from " + att( "Main-net" ) + " to " + att( "S-chain" ) +
        "(" + att( "0" ) + " is no wait). Default is " + att( "0" ) + "." );
    console.log( soi + "--" + att( "s2m-await-time" ) + "=" + log.fmtInformation( "seconds" ) +
        "................" + att( "Minimal age of transaction message" ) + "(in seconds)" +
        att( " before it will be transferred from " ) + att( "S-chain" ) +
        " to " + att( "Main-net" ) + "(" + att( "0" ) + " is no wait). Default is " +
        att( "0" ) + "." );
    console.log( soi + "--" + att( "s2s-await-time" ) + "=" + log.fmtInformation( "seconds" ) +
        "................" + att( "Minimal age of transaction message" ) + "(in seconds)" +
        att( " before it will be transferred from " ) + att( "S-chain" ) +
        " to " + att( "S-chain" ) + "(" + att( "0" ) + " is no wait). Default is " +
        att( "0" ) + "." );
    console.log( soi + "--" + att( "await-time" ) + "=" + log.fmtInformation( "seconds" ) +
        "...................." + att( "Minimal age of transaction message" ) + "(in seconds)" +
        att( " before it will be transferred between both " ) +
        att( "S-chain" ) + " and " + att( "Main-net" ) +
        "(" + att( "0" ) + " is no wait)." );
    console.log( soi + "--" + att( "period" ), "..............................." +
        att( "Transfer " ) + att( "loop period" ) + "(in seconds)" + "." );
    console.log( soi + "--" + att( "node-number" ) + "=" + log.fmtInformation( "value" ) +
        "....................." + att( "S-Chain" ) + " " +
        att( "node number" ) + "(" + att( "0" ) + "-based)." );
    console.log( soi + "--" + att( "nodes-count" ) + "=" + log.fmtInformation( "value" ) +
        "....................." + att( "S-Chain" ) + " " + att( "nodes count" ) + "." );
    console.log( soi + "--" + att( "time-framing" ) + "=" + att( "value" ) +
        "...................." + "Specifies period(in seconds) for time framing(" + att( "0" ) +
        " to " + log.fmtError( "disable" ) + " time framing)." );
    console.log( soi + "--" + att( "time-gap" ) + "=" + att( "value" ) +
        "........................" + "Specifies gap(in seconds) before next time frame." );
    console.log( soi + "--" + att( "auto-exit" ) + "=" + att( "seconds" ) +
        ".....................Automatically exit " + att( "IMA Agent" ) +
        " after specified number of seconds(" + att( "0" ) + " is no automatic exit, " +
        att( "3600" ) + " is no default)." );
}

function printHelpTokenTesting( soi ) {
    console.log( att( "TOKEN TESTING" ) + log.fmtInformation( " commands:" ) );
    console.log( soi + "--" + att( "mint-erc20" ), "..........................." +
        att( "Mint " ) + att( "ERC20" ) + " tokens." );
    console.log( soi + "--" + att( "mint-erc721" ), ".........................." +
        att( "Mint " ) + att( "ERC721" ) + " tokens." );
    console.log( soi + "--" + att( "mint-erc1155" ), "........................." +
        att( "Mint " ) + att( "ERC1155" ) + " tokens." );
    console.log( soi + "--" + att( "burn-erc20" ), "..........................." +
        att( "Burn " ) + att( "ERC20" ) + " tokens." );
    console.log( soi + "--" + att( "burn-erc721" ), ".........................." +
        att( "Burn " ) + att( "ERC721" ) + " tokens." );
    console.log( soi + "--" + att( "burn-erc1155" ), "........................." +
        att( "Burn " ) + att( "ERC1155" ) + " tokens." );
    console.log( soi + "Please notice, token testing commands require " +
        att( "--tm-url-t-chain" ) + ", " + att( "cid-t-chain" ) + ", " +
        att( "erc20-t-chain" ) + " or " + att( "erc721-t-chain" ) + " or " +
        att( "erc1155-t-chain" ) + ", account information (like private key " +
        att( "key-t-chain" ) + ") command line arguments specified. " +
        "Token amounts are specified via " + att( "amount" ) +
        " command line arguments specified. Token IDs are specified via " +
        att( "tid" ) + " or " + att( "tids" ) + " command line arguments." );
}

function printHelpNetworkStateAnalysis( soi ) {
    console.log( att( "IMA WORK STATE ANALYSIS" ) + " options:" );
    console.log( soi + "--" + att( "pwa" ), ".................................." +
        log.fmtSuccess( "Enable" ) + " " + att( "pending work analysis" ) +
        " to avoid transaction conflicts. Default mode." );
    console.log( soi + "--" + att( "no-pwa" ), "..............................." +
        log.fmtError( "Disable" ) + " " + att( "pending work analysis" ) +
        ". " + log.fmtWarning( "Not recommended" ) + " for slow and overloaded blockchains." );
    console.log( soi + "--" + att( "pwa-timeout" ) + "=" + att( "seconds" ) +
        "...................Node state timeout during pending work analysis. " +
        "Default is " + att( "60" ) + " seconds." );
}

function printHelpMessageSigning( soi ) {
    console.log( att( "MESSAGE SIGNING" ) + " options:" );
    console.log( soi + "--" + att( "sign-messages" ), "........................" +
        "Sign transferred messages." );
    console.log( soi + "--" + att( "bls-glue" ) + "=" + att( "path" ) +
        ".........................Specifies path to " +
        att( "bls_glue" ) + " application." );
    console.log( soi + "--" + att( "hash-g1" ) + "=" + att( "path" ) +
        "..........................Specifies path to " +
        att( "hash_g1" ) + " application." );
    console.log( soi + "--" + att( "bls-verify" ) + "=" + att( "path" ) +
        ".......................Optional parameter, specifies path to " +
        att( "verify_bls" ) + " application." );
}

function printHelpMonitoring( soi ) {
    console.log( att( "MONITORING" ) + " options:" );
    console.log( soi + "--" + att( "monitoring-port" ) + "=" + att( "number" ) +
        "................Run monitoring web socket RPC server" +
        " on specified port. Specify " + att( "0" ) + " to " + log.fmtError( "disable" ) +
        ". By default monitoring server is " + log.fmtError( "disabled" ) + "." );
    console.log( soi + "--" + att( "monitoring-log" ) +
        "........................" + att( "Enable logging on " ) +
        "monitoring web socket RPC server.  By default these log messages are " +
        log.fmtError( "disabled" ) + "." );
}

function printHelpGasReimbursement( soi ) {
    console.log( att( "GAS REIMBURSEMENT" ) + " options:" );
    console.log( soi + "--" + att( "reimbursement-chain" ) + "=" + att( "name" ) +
        ".............." + "Specifies chain name." );
    console.log( soi + "--" + att( "reimbursement-recharge" ) + "=" + att( "v" ) +
        log.fmtWarning( "u" ), "............" + log.fmtSuccess( "Recharge" ) +
        " user wallet with specified value " + att( "v" ) + ", unit name " + att( "u" ) +
        " is well known Ethereum unit name like " + att( "ether" ) +
        " or " + att( "wei" ) + "." );
    console.log( soi + "--" + att( "reimbursement-withdraw" ) + "=" + att( "v" ) +
        log.fmtWarning( "u" ), "............" + log.fmtError( "Withdraw" ) +
        " user wallet with specified value " + att( "v" ) + ", unit name " + att( "u" ) +
        " is well known Ethereum unit name like " + att( "ether" ) +
        " or " + att( "wei" ) + "." );
    console.log( soi + "--" + att( "reimbursement-balance" ), "................" +
        "Show wallet balance." );
    console.log( soi + "--" + att( "reimbursement-range" ) + "=" + att( "number" ) +
        "............" + "Sets " + att( "minimal time interval" ) + " between transfers from " +
        att( "S-Chain" ) + " to " + att( "Main Net" ) + "." );
}

function printHelpPastEventsScan( soi ) {
    console.log( att( "PAST EVENTS SCAN" ) + " options:" );
    console.log( soi + "--" + att( "bs-step-size" ) + "=" + att( "number" ) +
        "...................Specifies " + att( "step block range size" ) +
        " to  search iterative past events step by step. " +
        att( "0" ) + " to " + log.fmtError( "disable" ) + " iterative search." );
    console.log( soi + "--" + att( "bs-max-all-range" ) + "=" + att( "number" ),
        "..............Specifies " + att( "max number of steps" ) +
        " to  allow to search as [0...latest] range. " +
        att( "0" ) + " to " + log.fmtError( "disable" ) + " iterative search." );
    console.log( soi + "--" + att( "bs-progressive-enable" ), "................" +
        log.fmtSuccess( "Enables" ) + " " + att( "progressive block scan" ) +
        " to  search past events." );
    console.log( soi + "--" + att( "bs-progressive-disable" ), "..............." +
        log.fmtError( "Disables" ) + " " + att( "progressive block scan" ) +
        " to  search past events." );
}

function printHelpOracleBasedReimbursement( soi ) {
    console.log( att( "ORACLE BASED GAS REIMBURSEMENT" ) + " options:" );
    console.log( soi + "--" + att( "enable-oracle" ), "........................" +
        log.fmtSuccess( "Enable" ) + " call to Oracle to compute gas price for " +
        "gas reimbursement. Default mode." );
    console.log( soi + "--" + att( "disable-oracle" ), "......................." +
        log.fmtError( "Disable" ) + " call to " + att( "Oracle" ) +
        " to  compute " + att( "gas price" ) + " for " + att( "gas reimbursement" ) + "." );
}

function printHelpJsonRpcServer( soi ) {
    console.log( att( "IMA JSON RPC SERVER" ) + " options:" );
    console.log( soi + "--" + att( "json-rpc-port" ) + "=" + att( "number" ) +
        "..................Run " + att( "IMA JSON RPC server" ) + " on specified " +
        att( "port" ) + ". Specify " + att( "0" ) + " to " + log.fmtError( "disable" ) + "." +
        " Default is " + att( "0" ) + "." );
    console.log( soi + "--" + att( "cross-ima" ), "............................" +
        log.fmtSuccess( "Enable" ) + " calls to " + att( "IMA JSON RPC servers" ) +
        " to  compute " + att( "BLS signature parts" ) +
        " and operation state inside time frames. Use calls to " + att( "IMA Agent" ) + "." );
    console.log( soi + "--" + att( "no-cross-ima" ), "........................." +
        log.fmtError( "Disable" ) + " calls to " + att( "IMA JSON RPC servers" ) +
        " to  compute " + att( "BLS signature parts" ) +
        " and operation state inside time frames. " +
        "Use calls to " + att( "skaled" ) + ". Default mode." );
}

function printHelpTest( soi ) {
    console.log( att( "TEST" ) + " options:" );
    console.log( soi + "--" + att( "browse-s-chain" ), "......................." +
        "Download own S-Chain's" + att( " network information." ) );
    console.log( soi + "--" + att( "browse-skale-network" ), "................." +
        "Download entire " + att( "SKALE network" ) + " description." );
    console.log( soi + "--" + att( "browse-connected-schains" ), "............." +
        "Download " + att( "S-Chains" ) + " connected to S-Chain with name specified in " +
        att( "id-s-chain" ) + " command line parameter." );
    console.log( soi + "--" + att( "discover-cid" ), "........................." +
        "Discover " + att( "chains ID(s)" ) + " from provided " + att( "URL(s)" ) + "." +
        " This command is not executed automatically at startup." );
}

function printHelpOptimization( soi ) {
    console.log( att( "OPTIMIZATION" ) + " options:" );
    console.log( soi + "--" + att( "enable-multicall" ), "....................." +
        log.fmtSuccess( "Enable" ) + " optimizations via multi-call. Default mode." );
    console.log( soi + "--" + att( "disable-multicall" ), "...................." +
        log.fmtError( "Disable" ) + " optimizations via multi-call." );
}

function printHelpLogging( soi ) {
    console.log( att( "LOGGING" ) + " options:" );
    console.log( soi + "--" + att( "expose" ), "..............................." +
        "Expose " + att( "low-level log details" ) + " after successful operations" +
        ". By default details exposed only on errors." );
    console.log( soi + "--" + att( "no-expose" ), "............................" +
        "Expose " + att( "low-level log details" ) + " only after errors. " +
        "Default expose mode." );
    console.log( soi + "--" + att( "verbose" ) + "=" + att( "value" ) +
        ".........................Set " + att( "level" ) + " of output details." );
    console.log( soi + "--" + att( "verbose-list" ) + ".........................." +
        "List available " + att( "verbose levels" ) + " and exit." );
    console.log( soi + "--" + att( "log" ) + "=" + att( "path" ) +
        "..............................Write program output to specified " + att( "log file" ) +
        "(multiple files can be specified)." );
    console.log( soi + "--" + att( "log-size" ) + "=" + att( "value" ) +
        "........................" + "Max size(in bytes) of one log file" +
        "(affects to log log rotation)." );
    console.log( soi + "--" + att( "log-files" ) + "=" + att( "value" ) +
        ".......................Maximum number of log files for log rotation." );
    console.log( soi + "--" + att( "gathered" ), "............................." +
        "Print details of gathering data from command line arguments. Default mode." );
    console.log( soi + "--" + att( "no-gathered" ), ".........................." +
        "Do not print details of gathering data from command line arguments." );
    console.log( soi + "--" + att( "expose-security-info" ), "................." +
        "Expose security-related values in log output. " +
        "This mode is needed for debugging purposes only." );
    console.log( soi + "--" + att( "no-expose-security-info" ), ".............." +
        "Do not expose security-related values in log output. Default mode" + "." );
    console.log( soi + "--" + att( "expose-pwa" ), "..........................." +
        "Expose IMA agent pending work analysis information" );
    console.log( soi + "--" + att( "no-expose-pwa" ), "........................" +
        "Do not expose IMA agent pending work analysis information. Default mode." );
    console.log( soi + "--" + att( "accumulated-log-in-transfer" ), ".........." +
        "Use accumulated log in message transfer loop." );
    console.log( soi + "--" + att( "accumulated-log-in-bls-signer" ), "........" +
        "Use accumulated log in BLS signer." );
    console.log( soi + "--" + att( "dynamic-log-in-transfer" ), ".............." +
        "Use realtime log in message transfer loop." );
    console.log( soi + "--" + att( "dynamic-log-in-bls-signer" ), "............" +
        "Use realtime log in BLS signer." );
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
        log.enableColorization( true );
        return true;
    }
    if( joArg.name == "no-colors" ) {
        log.enableColorization( false );
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
        console.log( log.fmtFatal( "COMMAND LINE PARSER ERROR: unknown command line argument ",
            log.v( joArg.name ) ) );
        return 666;
    }
    return 0;
}

async function asyncCheckUrlAtStartup( u, name ) {
    const details = log.createMemoryStream();
    const nTimeoutMilliseconds = 10 * 1000;
    try {
        details.debug( "Will check URL {} connectivity for {} at start-up...", log.u( u ), name );
        const isLog = false;
        const isOnLine = await rpcCall.checkUrl( u, nTimeoutMilliseconds, isLog );
        if( isOnLine ) {
            details.success( "Done, start-up checking URL {} connectivity for {}, URL is on-line.",
                log.u( u ), name );
        } else {
            details.warning( "Done, start-up checking URL {} connectivity for {}, URL is off-line.",
                log.u( u ), name );
        }
        return isOnLine;
    } catch ( err ) {
        details.error( "Failed to check URL {} connectivity for {} at start-up, error is: {}" +
            ", stack is: {}{}", log.u( u ), name, log.em( owaspUtils.extractErrorMessage( err ) ),
        "\n", log.s( err.stack ) );
    }
    return false;
}

function commonInitPrintSysInfo() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( isPrintGathered ) {
        log.debug( "This process ", att( "PID" ), " is ", att( process.pid ) );
        log.debug( "This process ", att( "PPID" ), " is ", att( process.ppid ) );
        log.debug( "This process ", att( "EGID" ), " is ", att( process.getegid() ) );
        log.debug( "This process ", att( "EUID" ), " is ", att( process.geteuid() ) );
        log.debug( "This process ", att( "GID" ), " is ", att( process.getgid() ) );
        log.debug( "This process ", att( "UID" ), " is ", att( process.getuid() ) );
        log.debug( "This process ", att( "groups" ), " are ", log.v( process.getgroups() ) );
        log.debug( "This process ", att( "CWD" ), " is ", att( process.cwd() ) );
        log.debug( "This process ", att( "platform" ), " is ", att( process.platform ) );
        log.debug( "This process ", att( "release" ), " is ", log.v( process.release ) );
        log.debug( "This process ", att( "report" ), " is ", log.v( process.report ) );
        log.debug( "This process ", att( "config" ), " is ", log.v( process.config ) );
        log.debug( att( "Node JS" ), " ", att( "detailed version information" ),
            " is ", log.v( process.versions ) );
        log.debug( att( "OS" ), " ", att( "type" ), " is ", att( os.type() ) );
        log.debug( att( "OS" ), " ", att( "platform" ),
            " is ", att( os.platform() ) );
        log.debug( att( "OS" ), " ", att( "release" ),
            " is ", att( os.release() ) );
        log.debug( att( "OS" ), " ", att( "architecture" ),
            " is ", att( os.arch() ) );
        log.debug( att( "OS" ), " ", att( "endianness" ),
            " is ", att( os.endianness() ) );
        log.debug( att( "OS" ), " ", att( "host name" ),
            " is ", att( os.hostname() ) );
        log.debug( att( "OS" ), " ", att( "CPUs" ), " are ", log.v( os.cpus() ) );
        log.debug( att( "OS" ), " ", att( "network interfaces" ),
            " are ", log.v( os.networkInterfaces() ) );
        log.debug( att( "OS" ), " ", att( "home dir" ),
            " is ", att( os.homedir() ) );
        log.debug( att( "OS" ), " ", att( "tmp dir" ),
            " is ", att( os.tmpdir() ) );
        log.debug( att( "OS" ), " ", att( "uptime" ), " is ", att( os.uptime() ) );
        log.debug( att( "OS" ), " ", att( "user" ), " is ", log.v( os.userInfo() ) );
        const joMemory = { total: os.totalmem(), free: os.freemem() };
        joMemory.freePercent = ( joMemory.free / joMemory.total ) * 100.0;
        log.debug( att( "OS" ), " ", att( "memory" ), " is ", log.v( joMemory ) );
        const joLA = os.loadavg();
        log.debug( att( "OS" ), " ", att( "average load" ), " is ", log.v( joLA ) );
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
        log.warning( "WARNING: No Skale Manager ABI file path is provided in command line " +
            "arguments(needed for particular operations only)" );
    }

    if( imaState.chainProperties.mn.strPathAbiJson &&
        typeof imaState.chainProperties.mn.strPathAbiJson == "string" &&
        imaState.chainProperties.mn.strPathAbiJson.length > 0 ) {
        imaState.chainProperties.mn.joAbiIMA =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathAbiJson, null );
        imaState.chainProperties.mn.bHaveAbiIMA = true;
    } else {
        imaState.chainProperties.mn.bHaveAbiIMA = false;
        log.warning( "WARNING: No Main-net IMA ABI file path is provided in command line " +
            "arguments(needed for particular operations only)" );
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
        log.warning( "WARNING: No S-Chain IMA ABI file path is provided in command line arguments" +
            "(needed for particular operations only)" );
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
        log.warning( "WARNING: No S<->S Target S-Chain IMA ABI file path is provided " +
            "in command line arguments(needed for particular operations only)" );
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
    } else if( imaState.optsS2S.isEnabled )
        log.warning( "WARNING: Missing Skale Manager ABI path for S-Chain to S-Chain transfers" );

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
            return att( joContract.address );
        return log.fmtError( "contract is not available" );
    };

    if( isPrintGathered ) {
        log.debug( att( "IMA contracts(Main Net):" ) );
        log.debug( att( "DepositBoxEth" ), "...................address is.....",
            oct( imaState.joDepositBoxETH ) );
        log.debug( att( "DepositBoxERC20" ), ".................address is.....",
            oct( imaState.joDepositBoxERC20 ) );
        log.debug( att( "DepositBoxERC721" ), "................address is.....",
            oct( imaState.joDepositBoxERC721 ) );
        log.debug( att( "DepositBoxERC1155" ), "...............address is.....",
            oct( imaState.joDepositBoxERC1155 ) );
        log.debug( att( "DepositBoxERC721WithMetadata" ), "....address is.....",
            oct( imaState.joDepositBoxERC721WithMetadata ) );
        log.debug( att( "CommunityPool" ), "...................address is.....",
            oct( imaState.joCommunityPool ) );
        log.debug( att( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxyMainNet ) );
        log.debug( att( "Linker" ), "..........................address is.....",
            oct( imaState.joLinker ) );
        log.debug( att( "IMA contracts(S-Chain):" ) );
        log.debug( att( "TokenManagerEth" ), ".................address is.....",
            oct( imaState.joTokenManagerETH ) );
        log.debug( att( "TokenManagerERC20" ), "...............address is.....",
            oct( imaState.joTokenManagerERC20 ) );
        log.debug( att( "TokenManagerERC721" ), "..............address is.....",
            oct( imaState.joTokenManagerERC721 ) );
        log.debug( att( "TokenManagerERC1155" ), ".............address is.....",
            oct( imaState.joTokenManagerERC1155 ) );
        log.debug( att( "TokenManagerERC721WithMetadata" ), "..address is.....",
            oct( imaState.joTokenManagerERC721WithMetadata ) );
        log.debug( att( "CommunityLocker" ), ".................address is.....",
            oct( imaState.joCommunityLocker ) );
        log.debug( att( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxySChain ) );
        log.debug( att( "TokenManagerLinker" ), "..............address is.....",
            oct( imaState.joTokenManagerLinker ) );
        log.debug( att( "ERC20" ), " ..........................address is.....",
            oct( imaState.joEthErc20 ) );
        log.debug( att( "IMA contracts(Target S-Chain):" ) );
        log.debug( att( "TokenManagerERC20" ), "...............address is.....",
            oct( imaState.joTokenManagerERC20Target ) );
        log.debug( att( "TokenManagerERC721" ), "..............address is.....",
            oct( imaState.joTokenManagerERC721Target ) );
        log.debug( att( "TokenManagerERC1155" ), ".............address is.....",
            oct( imaState.joTokenManagerERC1155Target ) );
        log.debug( att( "TokenManagerERC721WithMetadata" ), "..address is.....",
            oct( imaState.joTokenManagerERC721WithMetadataTarget ) );
        log.debug( att( "CommunityLocker" ), ".................address is.....",
            oct( imaState.joCommunityLockerTarget ) );
        log.debug( att( "MessageProxy" ), "....................address is.....",
            oct( imaState.joMessageProxySChainTarget ) );
        log.debug( att( "TokenManagerLinker" ), "..............address is.....",
            oct( imaState.joTokenManagerLinkerTarget ) );
        log.debug( att( "ERC20" ), " ..........................address is.....",
            oct( imaState.joEthErc20Target ) );

        log.debug( att( "Skale Manager contracts:" ) );
        log.debug( att( "ConstantsHolder" ), ".................address is.....",
            oct( imaState.joConstantsHolder ) );
        log.debug( att( "Nodes" ), "...........................address is.....",
            oct( imaState.joNodes ) );
        log.debug( att( "KeyStorage" ), "......................address is.....",
            oct( imaState.joKeyStorage ) );
        log.debug( att( "Schains" ), ".........................address is.....",
            oct( imaState.joSChains ) );
        log.debug( att( "SchainsInternal" ), ".................address is.....",
            oct( imaState.joSChainsInternal ) );
        log.debug( att( "SkaleDKG" ), "........................address is.....",
            oct( imaState.joSkaleDKG ) );
        log.debug( att( "SkaleManager" ), "....................address is.....",
            oct( imaState.joSkaleManager ) );
        log.debug( att( "SkaleToken" ), "......................address is.....",
            oct( imaState.joSkaleToken ) );
        log.debug( att( "ValidatorService" ), "................address is.....",
            oct( imaState.joValidatorService ) );
        log.debug( att( "Wallets" ), ".........................address is.....",
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
            log.information( "Loading Main-net ERC20 ABI from {}",
                imaState.chainProperties.mn.strPathJsonErc20 );
        }
        imaState.chainProperties.mn.joErc20 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc20, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc20 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc20.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC20 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc20 );
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
                        log.information( "Loaded Main-net ERC20 ABI {}",
                            imaState.chainProperties.tc.strCoinNameErc20 );
                    }
                    if( isPrintGathered && n2 > 0 ) {
                        log.information( "Loaded S-Chain ERC20 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc20 );
                    }
                }
            } else {
                if( n1 === 0 )
                    log.error( "Main-net ERC20 token name is not discovered(malformed JSON)" );

                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc20.length > 0 )
                    log.error( "S-Chain ERC20 token name is not discovered(malformed JSON)" );

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
                log.information( "Loading S-Chain ERC20 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc20 );
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
                        log.information( "Loaded S-Chain ERC20 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc20 );
                    }
                } else {
                    if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc20.length > 0 )
                        log.error( "S-Chain ERC20 token name is not discovered(malformed JSON)" );
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
            log.information( "Loading S<->S Target S-Chain ERC20 ABI from {}",
                imaState.chainProperties.tc.strPathJsonErc20 );
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
                    log.information( "Loaded S<->S Target S-Chain ERC20 ABI {}",
                        imaState.chainProperties.tc.strCoinNameErc20 );
                }
            } else {
                if( n2 === 0 && imaState.chainProperties.tc.strPathJsonErc20.length > 0 ) {
                    log.fatal( "S<->S Target S-Chain ERC20 token name " +
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
            log.information( "Loading Main-net ERC721 ABI from {}",
                imaState.chainProperties.mn.strPathJsonErc721 );
        }
        imaState.chainProperties.mn.joErc721 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc721, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc721 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC721 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc721 );
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
                        log.information( "Loaded Main-net ERC721 ABI {}",
                            imaState.chainProperties.mn.strCoinNameErc721 );
                    }
                    if( n2 > 0 && isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC721 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc721 );
                    }
                }
            } else {
                if( n1 === 0 )
                    log.fatal( "Main-net ERC721 token name  is not discovered(malformed JSON)" );
                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc721.length > 0 )
                    log.fatal( "S-Chain ERC721 token name is not discovered(malformed JSON)" );
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
                log.information( "Loading S-Chain ERC721 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc721 );
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
                        log.information( "Loaded S-Chain ERC721 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc721 );
                    } else {
                        if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc721.length > 0 ) {
                            log.fatal( "S-Chain ERC721 token name is not " +
                                "discovered(malformed JSON)" );
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
        log.information( "Loading S<->S Target S-Chain ERC721 ABI from {}",
            imaState.chainProperties.tc.strPathJsonErc721 );
        imaState.chainProperties.tc.joErc721 =
            imaUtils.jsonFileLoad( imaState.chainProperties.tc.strPathJsonErc721, null );
        n2 = Object.keys( imaState.chainProperties.tc.joErc721 ).length;
        if( n2 > 0 ) {
            imaState.chainProperties.tc.strCoinNameErc721 =
                imaUtils.discoverCoinNameInJSON( imaState.chainProperties.tc.joErc721 );
            n2 = imaState.chainProperties.tc.strCoinNameErc721.length;
            if( n2 > 0 && isPrintGathered ) {
                log.information( "Loaded S<->S Target S-Chain ERC721 ABI {}",
                    imaState.chainProperties.tc.strCoinNameErc721 );
            } else {
                if( n2 === 0 &&
                    imaState.chainProperties.tc.strPathJsonErc721.length > 0 &&
                    isPrintGathered
                ) {
                    log.fatal( "S<->S Target S-Chain ERC721 token name " +
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
        log.warning( "IMPORTANT NOTICE: Both S<->S Target S-Chain ERC721 JSON and " +
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
            log.information( "Loading Main-net ERC1155 ABI from {}",
                imaState.chainProperties.mn.strPathJsonErc1155 );
        }
        imaState.chainProperties.mn.joErc1155 =
            imaUtils.jsonFileLoad( imaState.chainProperties.mn.strPathJsonErc1155, null );
        n1 = Object.keys( imaState.chainProperties.mn.joErc1155 ).length;
        if( imaState.chainProperties.sc.strPathJsonErc1155.length > 0 ) {
            if( isPrintGathered ) {
                log.information( "Loading S-Chain ERC1155 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc1155 );
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
                        log.information( "Loaded Main-net ERC1155 ABI {}",
                            imaState.chainProperties.mn.strCoinNameErc1155 );
                    }
                    if( n2 > 0 && isPrintGathered ) {
                        log.information( "Loaded S-Chain ERC1155 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc1155 );
                    }
                }
            } else {
                if( n1 === 0 )
                    log.fatal( "Main-net ERC1155 token name  is not discovered(malformed JSON)" );
                if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc1155.length > 0 )
                    log.fatal( "S-Chain ERC1155 token name is not discovered(malformed JSON)" );
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
                log.information( "Loading S-Chain ERC1155 ABI from {}",
                    imaState.chainProperties.sc.strPathJsonErc1155 );
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
                        log.information( "Loaded S-Chain ERC1155 ABI {}",
                            imaState.chainProperties.sc.strCoinNameErc1155 );
                    }
                } else {
                    if( n2 === 0 && imaState.chainProperties.sc.strPathJsonErc1155.length > 0 )
                        log.fatal( "S-Chain ERC1155 token name is not discovered(malformed JSON)" );
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
            log.information( "Loading S<->S Target S-Chain ERC1155 ABI from {}",
                imaState.chainProperties.tc.strPathJsonErc1155 );
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
                    log.information( "Loaded S<->S Target S-Chain ERC1155 ABI {}",
                        imaState.chainProperties.tc.strCoinNameErc1155 );
                }
            } else {
                if( n2 === 0 &&
                    imaState.chainProperties.tc.strPathJsonErc1155.length > 0 &&
                    isPrintGathered
                ) {
                    log.fatal( " S<->S Target S-Chain ERC1155 token name " +
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
        log.warning( "IMPORTANT NOTICE: Both S<->S Target S-Chain ERC1155 JSON and " +
            "explicit ERC1155 address are not specified" );
    }
}

function commonInitCheckGeneralArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    const isPrintSecurityValues = ( !!( imaState.isPrintSecurityValues ) );
    if( isPrintGathered ) {
        printAbout( true );
        log.information( "IMA AGENT is using Ethers JS version ",
            att(
                owaspUtils.ethersMod.ethers.version.toString().replace( "ethers/", "" ) ) );
    }
    ensureHaveValue(
        "App path",
        path.join( __dirname, "main.mjs" ), false, isPrintGathered, null, ( x ) => {
            return att( x );
        } );
    ensureHaveValue(
        "Verbose level",
        log.verboseLevelAsTextForLog( log.verboseGet() ),
        false, isPrintGathered, null, ( x ) => {
            return att( x );
        } );
    ensureHaveValue(
        "Multi-call optimizations",
        imaState.isEnabledMultiCall, false, isPrintGathered, null, ( x ) => {
            return log.yn( x );
        } );
    ensureHaveValue(
        "Main-net URL",
        imaState.chainProperties.mn.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.u( x );
        } );
    ensureHaveValue(
        "S-chain URL",
        imaState.chainProperties.sc.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.u( x );
        } );
    ensureHaveValue(
        "S<->S Target S-chain URL",
        imaState.chainProperties.tc.strURL, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.u( x );
        } );
    ensureHaveValue(
        "Main-net Ethereum network name",
        imaState.chainProperties.mn.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S-Chain Ethereum network name",
        imaState.chainProperties.sc.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain Ethereum network name",
        imaState.chainProperties.tc.strChainName, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "Main-net Ethereum chain ID",
        imaState.chainProperties.mn.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S-Chain Ethereum chain ID",
        imaState.chainProperties.sc.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain Ethereum chain ID",
        imaState.chainProperties.tc.chainId, false,
        isPrintGathered && isPrintSecurityValues, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "Skale Manager ABI JSON file path",
        imaState.strPathAbiJsonSkaleManager, false, isPrintGathered, null, ( x ) => {
            return log.fmtWarning( x );
        } );
    ensureHaveValue(
        "Main-net ABI JSON file path",
        imaState.chainProperties.mn.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return log.fmtWarning( x );
        } );
    ensureHaveValue(
        "S-Chain ABI JSON file path",
        imaState.chainProperties.sc.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return log.fmtWarning( x );
        } );
    ensureHaveValue(
        "S<->S Target S-Chain ABI JSON file path",
        imaState.chainProperties.tc.strPathAbiJson, false, isPrintGathered, null, ( x ) => {
            return log.fmtWarning( x );
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
                    return att( x );
                } );
        }
        if( imaState.chainProperties.sc.joAccount.strBlsKeyName ) {
            ensureHaveValue(
                "BLS/S-Chain key name",
                imaState.chainProperties.sc.joAccount.strBlsKeyName,
                false, isPrintGathered, null, ( x ) => {
                    return att( x );
                } );
        }
        if( imaState.chainProperties.tc.joAccount.strBlsKeyName ) {
            ensureHaveValue(
                "BLS/Target S-Chain key name",
                imaState.chainProperties.tc.joAccount.strBlsKeyName,
                false, isPrintGathered, null, ( x ) => {
                    return att( x );
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
            return log.fmtInformation( x );
        } );
}

function commonInitTransferringArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    ensureHaveValue(
        "M->S transfer block size", imaState.nTransferBlockSizeM2S,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S->M transfer block size", imaState.nTransferBlockSizeS2M,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transfer block size", imaState.nTransferBlockSizeS2S,
            false, isPrintGathered, null, ( x ) => {
                return log.fmtNote( x );
            } );
    }
    ensureHaveValue(
        "M->S transfer job steps", imaState.nTransferStepsM2S,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S->M transfer job steps", imaState.nTransferStepsS2M,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transfer job steps", imaState.nTransferStepsS2S,
            false, isPrintGathered, null, ( x ) => {
                return log.fmtNote( x );
            } );
    }
    ensureHaveValue(
        "M->S transactions limit", imaState.nMaxTransactionsM2S,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S->M transactions limit", imaState.nMaxTransactionsS2M,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S transactions limit", imaState.nMaxTransactionsS2S,
            false, isPrintGathered, null, ( x ) => {
                return log.fmtNote( x );
            } );
    }
    ensureHaveValue(
        "M->S await blocks", imaState.nBlockAwaitDepthM2S, false,
        isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S->M await blocks", imaState.nBlockAwaitDepthS2M, false,
        isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S await blocks", imaState.nBlockAwaitDepthS2S, false,
            isPrintGathered, null, ( x ) => {
                return log.fmtNote( x );
            } );
    }
    ensureHaveValue(
        "M->S minimal block age", imaState.nBlockAgeM2S,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    ensureHaveValue(
        "S->M minimal block age", imaState.nBlockAgeS2M,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtNote( x );
        } );
    if( imaState.bHaveSkaleManagerABI ) {
        ensureHaveValue(
            "S->S minimal block age", imaState.nBlockAgeS2S,
            false, isPrintGathered, null, ( x ) => {
                return log.fmtNote( x );
            } );
    }
    ensureHaveValue(
        "Transfer loop period(seconds)", imaState.nLoopPeriodSeconds,
        false, isPrintGathered, null, ( x ) => {
            return log.fmtSuccess( x );
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
            "Time framing", log.fmtError( "disabled" ),
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
            return log.fmtInformation( x );
        } );
    ensureHaveValue(
        "S-Chain nodes count",
        imaState.nNodesCount, false, isPrintGathered, null, ( x ) => {
            return log.fmtInformation( x );
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
                return att( x );
            } );
        ensureHaveValue(
            "Loaded S-Chain ERC20 ABI ",
            imaState.chainProperties.sc.strCoinNameErc20,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
        ensureHaveValue(
            "Amount of tokens to transfer",
            imaState.nAmountOfToken,
            false, isPrintGathered, null, ( x ) => {
                return log.fmtInformation( x );
            } );
        if( isPrintGathered ) {
            log.information( "ERC20 explicit S-Chain address is {}",
                imaState.strAddrErc20Explicit );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc20.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC20 ABI ",
            imaState.chainProperties.tc.strCoinNameErc20,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
    }
    if( imaState.chainProperties.mn.strCoinNameErc721.length > 0 ) {
        ensureHaveValue(
            "Loaded Main-net ERC721 ABI ",
            imaState.chainProperties.mn.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
        ensureHaveValue(
            "Loaded S-Chain ERC721 ABI ",
            imaState.chainProperties.sc.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
        ensureHaveValue(
            "ERC721 token id ",
            imaState.idToken, false,
            isPrintGathered, null, ( x ) => {
                return log.fmtInformation( x );
            } );
        if( isPrintGathered ) {
            log.information( "ERC721 explicit S-Chain address is {}",
                imaState.strAddrErc721Explicit );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc721.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC721 ABI ",
            imaState.chainProperties.tc.strCoinNameErc721,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
    }
    if( imaState.chainProperties.mn.strCoinNameErc1155.length > 0 ) {
        ensureHaveValue( "Loaded Main-net ERC1155 ABI ",
            imaState.chainProperties.mn.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
        ensureHaveValue( "Loaded S-Chain ERC1155 ABI ",
            imaState.chainProperties.sc.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
        try {
            ensureHaveValue( "ERC1155 token id ",
                imaState.idToken, false, isPrintGathered, null, ( x ) => {
                    return log.fmtInformation( x );
                } );
            ensureHaveValue( "ERC1155 token amount ",
                imaState.nAmountOfToken, false, isPrintGathered, null, ( x ) => {
                    return log.fmtInformation( x );
                } );
        } catch ( e1 ) {
            try {
                ensureHaveValue(
                    "ERC1155 batch of token ids ",
                    imaState.idTokens, false,
                    isPrintGathered, null, ( x ) => {
                        return log.fmtInformation( x );
                    } );
                ensureHaveValue(
                    "ERC1155 batch of token amounts ",
                    imaState.arrAmountsOfTokens, false,
                    isPrintGathered, null, ( x ) => {
                        return log.fmtInformation( x );
                    } );
            } catch ( e2 ) {
                log.warning( "Please check your params in ERC1155 transfer" );
                log.warning( "Error 1 {}", e1 );
                log.warning( "Error 2 {}", e2 );
                process.exit( 126 );
            }
        }
        if( isPrintGathered ) {
            log.information( "ERC1155 explicit S-Chain address is {}",
                imaState.strAddrErc1155Explicit );
        }
    }
    if( imaState.chainProperties.tc.strCoinNameErc1155.length > 0 ) {
        ensureHaveValue(
            "Loaded S<->S Target S-Chain ERC1155 ABI ",
            imaState.chainProperties.tc.strCoinNameErc1155,
            false, isPrintGathered, null, ( x ) => {
                return att( x );
            } );
    }
}

function commonInitGasMultipliersAndTransactionArgs() {
    const imaState = state.get();
    const isPrintGathered = ( !!( imaState.isPrintGathered ) );
    if( isPrintGathered ) {
        log.debug( log.fmtInformation( "Main Net Gas Price Multiplier is" ),
            "....................." +
            ( imaState.chainProperties.mn.transactionCustomizer.gasPriceMultiplier
                ? log.fmtInformation( imaState.chainProperties.mn.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "S-Chain Gas Price Multiplier is" ),
            "......................" +
            ( imaState.chainProperties.sc.transactionCustomizer.gasPriceMultiplier
                ? log.fmtInformation( imaState.chainProperties.sc.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Target S-Chain Gas Price Multiplier is" ),
            "..............." +
            ( imaState.chainProperties.tc.transactionCustomizer.gasPriceMultiplier
                ? log.fmtInformation( imaState.chainProperties.tc.transactionCustomizer
                    .gasPriceMultiplier.toString() )
                : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Main Net Gas Value Multiplier is" ),
            "....................." +
            ( imaState.chainProperties.mn.transactionCustomizer.gasMultiplier
                ? log.fmtInformation( imaState.chainProperties.mn
                    .transactionCustomizer.gasMultiplier.toString() )
                : log.fmtNotice( "default" ) ) );
        log.debug( log.fmtInformation( "S-Chain Gas Value Multiplier is" ),
            "......................" +
            ( imaState.chainProperties.sc.transactionCustomizer.gasMultiplier
                ? log.fmtInformation( imaState.chainProperties.sc
                    .transactionCustomizer.gasMultiplier.toString() )
                : log.fmtNotice( "default" ) ) );
        log.debug( log.fmtInformation( "Target S-Chain Gas Value Multiplier is" ),
            "..............." +
            ( imaState.chainProperties.tc.transactionCustomizer.gasMultiplier
                ? log.fmtInformation( imaState.chainProperties.tc
                    .transactionCustomizer.gasMultiplier.toString() )
                : log.fmtNotice( "default" ) ) );
        log.debug( log.fmtInformation( "Pending work analysis(PWA) is" ),
            "........................" +
            ( imaState.isPWA ? log.fmtSuccess( "enabled" ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Expose PWA details to log is" ),
            "........................." +
            ( imaState.isPrintPWA ? log.fmtSuccess( "enabled" ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Oracle based gas reimbursement is" ),
            "...................." +
            ( imaOracleOperations.getEnabledOracle()
                ? log.fmtSuccess( "enabled" ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "S-Chain to S-Chain transferring is" ) +
            "..................." +
        ( imaState.optsS2S.isEnabled
            ? log.fmtSuccess( "enabled" ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "SKALE network re-discovery interval is" ),
            "..............." +
            ( imaState.optsS2S.secondsToReDiscoverSkaleNetwork
                ? log.fmtInformation( imaState.optsS2S.secondsToReDiscoverSkaleNetwork.toString() )
                : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "SKALE network max discovery wait time is" ),
            "............." +
            ( imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered
                ? log.fmtInformation(
                    imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered.toString() )
                : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "S<->S transfer mode is" ),
            "..............................." +
            imaHelperAPIs.getS2STransferModeDescriptionColorized() );
        log.debug( log.fmtInformation( "IMA JSON RPC server port is" ),
            ".........................." +
            ( ( imaState.nJsonRpcPort > 0 )
                ? log.fmtInformation( imaState.nJsonRpcPort ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Cross-IMA mode is" ),
            "...................................." +
            ( imaState.isCrossImaBlsMode
                ? log.fmtSuccess( "enabled" ) : log.fmtError( "disabled" ) ) );
        log.debug( log.fmtInformation( "Dry-run is enabled" ),
            "..................................." +
            log.yn( imaTx.dryRunIsEnabled() ) );
        log.debug( log.fmtInformation( "Dry-run execution result is ignored" ) +
            ".................." +
        log.yn( imaTx.dryRunIsIgnored() ) );
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
                return log.fmtInformation( x );
            } );
        ensureHaveValue(
            "Max size of log file path",
            imaState.nLogMaxSizeBeforeRotation, false,
            isPrintGathered, null, ( x ) => {
                return ( x <= 0 ) ? log.fmtWarning( "unlimited" ) : log.fmtNote( x );
            } );
        ensureHaveValue(
            "Max rotated count of log files",
            imaState.nLogMaxFilesCount,
            false, isPrintGathered, null, ( x ) => {
                return ( x <= 1 ) ? log.fmtWarning( "not set" ) : log.fmtNote( x );
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
        log.warning( "No Main-net URL specified in command line arguments" +
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
        log.warning( "No S-Chain URL specified in command line arguments" +
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
        log.warning( "No S<->S Target S-Chain URL specified in command line arguments" +
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
