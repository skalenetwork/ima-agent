import * as fs from "fs";
import * as cc from "./cc.mjs";
import * as log from "./log.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as rpcCall from "./rpcCall.mjs";

const gIsDebugLogging = false; // development option only, must be always false
const isColors = owaspUtils.toBoolean( process.argv[2] );
cc.enable( true );
log.addStdout();

// allow self-signed wss and https
process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

function finalizeOutput( jo ) {
    if( ! jo )
        return;
    cc.enable( false );
    process.stdout.write( cc.j( jo ) );
}

function postConvertBN( jo, name ) {
    if( ! jo )
        return;
    if( ! ( name in jo ) )
        return;
    if( typeof jo[name] != "object" )
        return;
    jo[name] = owaspUtils.toHexStringSafe( jo[name] );
}

async function run() {
    try {
        if( gIsDebugLogging )
            log.debug( "Process startup arguments array is ", cc.j( process.argv ) );
        if( gIsDebugLogging )
            log.debug( "Colorized mode is ", cc.yn( isColors ) );

        const strSgxWalletURL = process.argv[3];
        if( gIsDebugLogging )
            log.debug( "SGX Wallet URL is ", cc.u( strSgxWalletURL ) );
        const strSgxKeyName = process.argv[4];
        if( gIsDebugLogging )
            log.debug( "SGX key name is ", cc.notice( strSgxWalletURL ) );
        const strURL = process.argv[5];
        if( gIsDebugLogging )
            log.debug( "Chain URL is ", cc.u( strURL ) );
        const chainId = process.argv[6];
        if( gIsDebugLogging )
            log.debug( "Chain ID is ", cc.j( chainId ) );
        const tcData = process.argv[7];
        if( gIsDebugLogging )
            log.debug( "TX data is ", cc.j( tcData ) );
        const txTo = process.argv[8];
        if( gIsDebugLogging )
            log.debug( "TX destination is ", cc.j( txTo ) );
        const txValue = process.argv[9];
        if( gIsDebugLogging )
            log.debug( "TX value is ", cc.j( txValue ) );
        const gasPrice = process.argv[10];
        if( gIsDebugLogging )
            log.debug( "TX gas price is ", cc.j( gasPrice ) );
        const gasLimit = process.argv[11];
        if( gIsDebugLogging )
            log.debug( "TX gas limit is ", cc.j( gasLimit ) );
        const txNonce = process.argv[12];
        if( gIsDebugLogging )
            log.debug( "TX nonce is ", cc.j( txNonce ) );
        const strPathCert = process.argv[13];
        if( gIsDebugLogging )
            log.debug( "Path to SGX certificate file is ", cc.attention( strPathCert ) );

        const strPathKey = process.argv[14];
        if( gIsDebugLogging )
            log.debug( "Path to SGX key file is ", cc.attention( strPathKey ) );

        const ethersProvider = owaspUtils.getEthersProviderFromURL( strURL );

        const tx = {
            data: tcData,
            to: txTo,
            value: owaspUtils.toBN( txValue ),
            chainId: owaspUtils.parseIntOrHex( chainId ),
            gasPrice: owaspUtils.toBN( gasPrice ),
            gasLimit: owaspUtils.toBN( gasLimit ),
            nonce: owaspUtils.toBN( txNonce )
        };
        if( gIsDebugLogging )
            log.debug( "----- Source TX ----> ", cc.j( tx ) );
        let rawTX = owaspUtils.ethersMod.ethers.utils.serializeTransaction( tx );
        if( gIsDebugLogging )
            log.debug( "----- RAW unsigned TX ----> ", cc.info( rawTX ) );
        const txHash = owaspUtils.ethersMod.ethers.utils.keccak256( rawTX );
        if( gIsDebugLogging )
            log.debug( "----- TX hash ----> ", cc.attention( txHash ) );

        const rpcCallOpts = {
            "cert": fs.readFileSync( strPathCert, "utf8" ),
            "key": fs.readFileSync( strPathKey, "utf8" )
        };

        await rpcCall.create(
            strSgxWalletURL, rpcCallOpts,
            async function( joCall, err ) {
                if( err ) {
                    if( gIsDebugLogging )
                        log.error( "Failed to create RPC call: ", cc.j( err ) );
                    finalizeOutput( { "error": owaspUtils.extractErrorMessage( err ) } );
                    process.exit( 1 );
                }
                const joIn = {
                    "method": "ecdsaSignMessageHash",
                    "params": {
                        "keyName": "" + strSgxKeyName,
                        "messageHash": txHash,
                        "base": 16
                    }
                };
                await joCall.call( joIn, async function( joIn, joOut, err ) {
                    if( err ) {
                        if( gIsDebugLogging )
                            log.error( "RPC call error: ", cc.j( err ) );
                        finalizeOutput( { "error": owaspUtils.extractErrorMessage( err ) } );
                        process.exit( 1 );
                    }
                    try {
                        if( gIsDebugLogging )
                            log.debug( "SGX wallet ECDSA sign result is: ", cc.j( joOut ) );

                        const v = parseInt( joOut.result.signature_v );
                        const eth_v = v + owaspUtils.parseIntOrHex( chainId ) * 2 + 35;
                        const joExpanded = {
                            "recoveryParam": v,
                            "v": eth_v,
                            "r": joOut.result.signature_r,
                            "s": joOut.result.signature_s
                        };
                        if( gIsDebugLogging )
                            log.debug( "----- Expanded signature ----> ", cc.j( joExpanded ) );
                        rawTX = owaspUtils.ethersMod.ethers.utils
                            .serializeTransaction( tx, joExpanded );
                        if( gIsDebugLogging ) {
                            log.debug( "----- Raw transaction with signature ----> ",
                                cc.info( rawTX ) );
                        }
                        const sr = await ethersProvider.sendTransaction( rawTX );
                        if( gIsDebugLogging ) {
                            log.debug( "----- Raw-sent transaction result ----> ",
                                cc.j( sr ) );
                        }
                        const joReceipt = await ethersProvider.waitForTransaction( sr.hash );
                        if( gIsDebugLogging )
                            log.debug( "----- Transaction receipt ----> ", cc.j( sr ) );
                        joReceipt.chainId = tx.chainId;
                        joReceipt.rawTX = rawTX;
                        joReceipt.signature = joExpanded;
                        postConvertBN( joReceipt, "gasUsed" );
                        postConvertBN( joReceipt, "cumulativeGasUsed" );
                        postConvertBN( joReceipt, "effectiveGasPrice" );
                        if( joReceipt.error ) {
                            finalizeOutput( joReceipt );
                            process.exit( 1 );
                        }
                        finalizeOutput( joReceipt );
                        process.exit( 0 );
                    } catch ( err ) {
                        if( gIsDebugLogging )
                            log.debug( "----- Call error ----> ", cc.j( err ) );
                        finalizeOutput( { "error": owaspUtils.extractErrorMessage( err ) } );
                        process.exit( 1 );
                    }

                } );
            } );
    } catch ( err ) {
        if( gIsDebugLogging )
            log.error( "Failed to create RPC call: ", cc.j( err ) );
        finalizeOutput( { "error": owaspUtils.extractErrorMessage( err ) } );
        process.exit( 1 );
    }
}
run();
