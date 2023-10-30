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
 * @file loop.mjs
 * @copyright SKALE Labs 2019-Present
 */

import * as networkLayer from "./socket.mjs";
import * as url from "url";
import * as threadInfo from "./threadInfo.mjs";
import * as path from "path";
import * as log from "./log.mjs";
import * as IMA from "./imaCore.mjs";
import * as imaHelperAPIs from "./imaHelperAPIs.mjs";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.mjs";
import * as imaOracleOperations from "./imaOracleOperations.mjs";
import * as owaspUtils from "./owaspUtils.mjs";
import * as imaBLS from "./bls.mjs";
import * as skaleObserver from "./observer.mjs";
import * as pwa from "./pwa.mjs";
import * as state from "./state.mjs";

const __dirname = path.dirname( url.fileURLToPath( import.meta.url ) );

// Run transfer loop

export function checkTimeFraming( d, strDirection, joRuntimeOpts ) {
    try {
        const imaState = state.get();
        if( imaState.nTimeFrameSeconds <= 0 || imaState.nNodesCount <= 1 )
            return true; // time framing is disabled

        if( d == null || d == undefined )
            d = new Date(); // now

        const nFrameShift = 0;

        // Unix UTC timestamp, see:
        // https://stackoverflow.com/questions/9756120/how-do-i-get-a-utc-timestamp-in-javascript
        const nUtcUnixTimeStamp = Math.floor( ( d ).getTime() / 1000 );

        const nSecondsRangeForAllSChains = imaState.nTimeFrameSeconds * imaState.nNodesCount;
        const nMod = Math.floor( nUtcUnixTimeStamp % nSecondsRangeForAllSChains );
        let nActiveNodeFrameIndex = Math.floor( nMod / imaState.nTimeFrameSeconds );
        if( nFrameShift > 0 ) {
            nActiveNodeFrameIndex += nFrameShift;
            nActiveNodeFrameIndex %= imaState.nNodesCount; // for safety only
        }
        let bSkip = ( nActiveNodeFrameIndex != imaState.nNodeNumber ) ? true : false;
        let bInsideGap = false;

        const nRangeStart =
            nUtcUnixTimeStamp -
            Math.floor( nUtcUnixTimeStamp % nSecondsRangeForAllSChains );
        const nFrameStart = nRangeStart + imaState.nNodeNumber * imaState.nTimeFrameSeconds;
        const nGapStart = nFrameStart + imaState.nTimeFrameSeconds - imaState.nNextFrameGap;
        if( !bSkip ) {
            if( nUtcUnixTimeStamp >= nGapStart ) {
                bSkip = true;
                bInsideGap = true;
            }
        }
        log.debug( "\n",
            "Unix UTC time stamp", "........", log.v( nUtcUnixTimeStamp ), "\n",
            "All Chains Range", "...........", nSecondsRangeForAllSChains, "\n",
            "S-Chain Range Mod", "..........", log.v( nMod ), "\n",
            "Active Node Frame Index", "....", log.v( nActiveNodeFrameIndex ), "\n",
            "Testing Frame Index", "........", log.v( imaState.nNodeNumber ), "\n",
            "Transfer Direction", ".........", log.v( strDirection || "NA" ) );
        if( nFrameShift > 0 ) {
            log.debug(
                "Frame Shift", "................", log.v( nFrameShift ), "\n",
                "S2S known chain index", "......",
                log.v( joRuntimeOpts.idxChainKnownForS2S ), "\n",
                "S2S known chains count", ".....",
                log.v( joRuntimeOpts.cntChainsKnownForS2S ), "\n"
            );
            if( "joExtraSignOpts" in joRuntimeOpts &&
                typeof joRuntimeOpts.joExtraSignOpts == "object" ) {
                log.debug( "S-Chain source", ".............",
                    log.v( joRuntimeOpts.joExtraSignOpts.chainNameSrc ),
                    "/", log.v( joRuntimeOpts.joExtraSignOpts.chainIdSrc ) );
            } else {
                log.debug( "S-Chain destination", "........",
                    log.v( joRuntimeOpts.joExtraSignOpts.chainNameDst ),
                    "/", log.v( joRuntimeOpts.joExtraSignOpts.chainIdDst ) );
            }
        }
        log.debug( "\n",
            "Is skip", "....................", log.yn( bSkip ), "\n",
            "Is inside gap", "..............", log.yn( bInsideGap ), "\n",
            "Range Start", "................", log.v( nRangeStart ), "\n",
            "Frame Start", "................", log.v( nFrameStart ), "\n",
            "Gap Start", "..................", log.v( nGapStart ) );
        if( bSkip )
            return false;
    } catch ( err ) {
        log.error( "Exception in time framing check in ",
            threadInfo.threadDescription(), ": ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
    }
    return true;
};

async function singleTransferLoopPartOracle( optsLoop, strLogPrefix ) {
    const imaState = state.get();
    let b0 = true;
    if( optsLoop.enableStepOracle && imaOracleOperations.getEnabledOracle() ) {
        log.notice( strLogPrefix, "Will invoke Oracle gas price setup in ",
            threadInfo.threadDescription(), "..." );
        try {
            if( ! await pwa.checkOnLoopStart( imaState, "oracle" ) ) {
                imaState.loopState.oracle.wasInProgress = false;
                log.notice( strLogPrefix, "Skipped(oracle) in ", threadInfo.threadDescription(),
                    " due to cancel mode reported from PWA" );
            } else {
                if( checkTimeFraming( null, "oracle", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.oracle.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "oracle" );
                    b0 = imaOracleOperations.doOracleGasPriceSetup(
                        imaState.chainProperties.mn.ethersProvider,
                        imaState.chainProperties.sc.ethersProvider,
                        imaState.chainProperties.sc.transactionCustomizer,
                        imaState.joCommunityLocker,
                        imaState.chainProperties.sc.joAccount,
                        imaState.chainProperties.mn.chainId,
                        imaState.chainProperties.sc.chainId,
                        imaBLS.doSignU256
                    );
                    imaState.loopState.oracle.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "oracle" );
                } else {
                    log.notice( strLogPrefix, "Skipped(oracle) in ",
                        threadInfo.threadDescription(), " due to time framing check" );
                }
            }
        } catch ( err ) {
            log.error( strLogPrefix, "Oracle operation exception: ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                " in ", threadInfo.threadDescription(),
                ", stack is: ", "\n", log.s( err.stack ) );
            imaState.loopState.oracle.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "oracle" );
            throw err;
        }
        log.information( strLogPrefix, "Oracle gas price setup done in ",
            threadInfo.threadDescription(), ": ", log.v( b0 ) );
    }
    return b0;
}

async function singleTransferLoopPartM2S( optsLoop, strLogPrefix ) {
    const imaState = state.get();
    let b1 = true;
    if( optsLoop.enableStepM2S ) {
        log.notice( strLogPrefix, "Will invoke M2S transfer in ",
            threadInfo.threadDescription(), "..." );
        try {
            if( ! await pwa.checkOnLoopStart( imaState, "m2s" ) ) {
                imaState.loopState.m2s.wasInProgress = false;
                log.notice( strLogPrefix, "Skipped(m2s) in ", threadInfo.threadDescription(),
                    " due to cancel mode reported from PWA" );
            } else {
                if( checkTimeFraming( null, "m2s", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.m2s.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "m2s" );
                    const optsChainPair = {
                        "strDirection": "M2S",
                        "chainSrc": imaState.chainProperties.mn,
                        "chainDst": imaState.chainProperties.sc
                    };
                    b1 = await IMA.doTransfer( // main-net --> s-chain
                        "M2S",
                        optsLoop.joRuntimeOpts,
                        imaState.chainProperties.mn.ethersProvider,
                        imaState.joMessageProxyMainNet,
                        imaState.chainProperties.mn.joAbiIMA.message_proxy_mainnet_abi,
                        imaState.chainProperties.mn.joAccount,
                        imaState.chainProperties.sc.ethersProvider,
                        imaState.joMessageProxySChain,
                        imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
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
                        imaState.chainProperties.sc.transactionCustomizer,
                        optsChainPair
                    );
                    imaState.loopState.m2s.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "m2s" );
                } else {
                    log.notice( strLogPrefix, "Skipped(m2s) in ", threadInfo.threadDescription(),
                        " due to time framing check" );
                }
            }
        } catch ( err ) {
            log.error( strLogPrefix, "M2S transfer exception in ",
                threadInfo.threadDescription() , ": ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            imaState.loopState.m2s.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "m2s" );
            throw err;
        }
        log.information( strLogPrefix, "M2S transfer done in ",
            threadInfo.threadDescription(), ": ", log.v( b1 ) );
    } else {
        log.debug( strLogPrefix, "Skipped M2S transfer in ",
            threadInfo.threadDescription(), "." );
    }
    return b1;
}

async function singleTransferLoopPartS2M( optsLoop, strLogPrefix ) {
    const imaState = state.get();
    let b2 = true;
    if( optsLoop.enableStepS2M ) {
        log.notice( strLogPrefix, "Will invoke S2M transfer in ",
            threadInfo.threadDescription(), "..." );
        try {
            if( ! await pwa.checkOnLoopStart( imaState, "s2m" ) ) {
                imaState.loopState.s2m.wasInProgress = false;
                log.notice( strLogPrefix, "Skipped(s2m) in ",
                    threadInfo.threadDescription(),
                    " due to cancel mode reported from PWA" );
            } else {
                if( checkTimeFraming( null, "s2m", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.s2m.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "s2m" );
                    const optsChainPair = {
                        "strDirection": "S2M",
                        "chainSrc": imaState.chainProperties.sc,
                        "chainDst": imaState.chainProperties.mn
                    };
                    b2 = await IMA.doTransfer( // s-chain --> main-net
                        "S2M",
                        optsLoop.joRuntimeOpts,
                        imaState.chainProperties.sc.ethersProvider,
                        imaState.joMessageProxySChain,
                        imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                        imaState.chainProperties.sc.joAccount,
                        imaState.chainProperties.mn.ethersProvider,
                        imaState.joMessageProxyMainNet,
                        imaState.chainProperties.mn.joAbiIMA.message_proxy_mainnet_abi,
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
                        imaState.chainProperties.mn.transactionCustomizer,
                        optsChainPair
                    );
                    imaState.loopState.s2m.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "s2m" );
                } else {
                    log.notice( strLogPrefix, "Skipped(s2m) in ", threadInfo.threadDescription(),
                        " due to time framing check" );
                }
            }
        } catch ( err ) {
            log.error( strLogPrefix, "S2M transfer exception in ",
                threadInfo.threadDescription() , ": ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            imaState.loopState.s2m.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "s2m" );
            throw err;
        }
        log.information( strLogPrefix, "S2M transfer done in ",
            threadInfo.threadDescription(), ": ", log.v( b2 ) );
    } else {
        log.debug( strLogPrefix, "Skipped S2M transfer in ",
            threadInfo.threadDescription(), "." );
    }
    return b2;
}

async function singleTransferLoopPartS2S( optsLoop, strLogPrefix ) {
    const imaState = state.get();
    let b3 = true;
    if( optsLoop.enableStepS2S && imaState.optsS2S.isEnabled ) {
        log.notice( strLogPrefix, "Will invoke all S2S transfers..." );
        try {
            b3 = await IMA.doAllS2S( // s-chain --> s-chain
                optsLoop.joRuntimeOpts,
                imaState,
                skaleObserver,
                imaState.chainProperties.sc.ethersProvider,
                imaState.joMessageProxySChain,
                imaState.chainProperties.sc.joAbiIMA.message_proxy_chain_abi,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.sc.chainId,
                imaState.joTokenManagerETH, // for logs validation on s-chain
                imaState.nTransferBlockSizeS2S,
                imaState.nTransferStepsS2S,
                imaState.nMaxTransactionsS2S,
                imaState.nBlockAwaitDepthMSS,
                imaState.nBlockAgeS2S,
                imaBLS.doSignMessagesS2S,
                imaState.chainProperties.sc.transactionCustomizer
            );
        } catch ( err ) {
            log.error( strLogPrefix, "S2S transfer exception in ",
                threadInfo.threadDescription() , ": ",
                log.em( owaspUtils.extractErrorMessage( err ) ),
                ", stack is: ", "\n", log.s( err.stack ) );
            throw err;
        }
        log.information( strLogPrefix, "All S2S transfers done in ",
            threadInfo.threadDescription(), ": ", log.v( b3 ) );

    } else {
        log.debug( strLogPrefix, "Skipped S2S transfer in ",
            threadInfo.threadDescription(), "." );
    }
    return b3;
}

function printLoopPartSkippedWarning( strLoopPartName ) {
    log.warning( strLogPrefix, "Skipped ", log.v( strLoopPartName ),
        " transfer loop part due to other single ",
        "transfer loop is in progress right now" );
}

export async function singleTransferLoop( optsLoop ) {
    const imaState = state.get();
    const strLogPrefix = log.fmtAttention( "Single Loop in ",
        threadInfo.threadDescription(), ": " );
    try {
        log.debug( strLogPrefix, imaHelperAPIs.longSeparator );
        let b0 = false, b1 = false, b2 = false, b3 = false;
        // Oracle loop part:
        if( optsLoop.enableStepOracle ) {
            if( imaState.loopState.oracle.isInProgress ) {
                imaState.loopState.oracle.wasInProgress = false;
                printLoopPartSkippedWarning( "Oracle" );
                b0 = true;
            } else
                b0 = await singleTransferLoopPartOracle( optsLoop, strLogPrefix );
        } else
            b0 = true;
        // M2S loop part:
        if( optsLoop.enableStepM2S ) {
            if( imaState.loopState.m2s.isInProgress ) {
                imaState.loopState.m2s.wasInProgress = false;
                printLoopPartSkippedWarning( "M2S" );
                b1 = true;
            } else
                b1 = await singleTransferLoopPartM2S( optsLoop, strLogPrefix );
        } else
            b1 = true;
        // S2M loop part:
        if( optsLoop.enableStepS2M ) {
            if( imaState.loopState.s2m.isInProgress ) {
                imaState.loopState.s2m.wasInProgress = false;
                printLoopPartSkippedWarning( "S2M" );
                b2 = true;
            } else
                b2 = await singleTransferLoopPartS2M( optsLoop, strLogPrefix );
        } else
            b2 = true;
        // S2S loop part:
        if( optsLoop.enableStepS2S ) {
            if( imaState.loopState.s2s.isInProgress ) {
                imaState.loopState.s2s.wasInProgress = false;
                printLoopPartSkippedWarning( "S2S" );
                b3 = true;
            } else
                b3 = await singleTransferLoopPartS2S( optsLoop, strLogPrefix );
        } else
            b3 = true;
        // Final status check loop part:
        const bResult = b0 && b1 && b2 && b3;
        log.notice( strLogPrefix,
            "Final completion status for all performed transfer loop parts is ",
            log.v( bResult ) );
        return bResult;
    } catch ( err ) {
        log.error( strLogPrefix, "Exception in transfer loop: ",
            log.em( owaspUtils.extractErrorMessage( err ) ),
            ", stack is: ", "\n", log.s( err.stack ) );
    }
    imaState.loopState.oracle.isInProgress = false;
    imaState.loopState.m2s.isInProgress = false;
    imaState.loopState.s2m.isInProgress = false;
    imaState.loopState.s2s.isInProgress = false;
    return false;
}
export async function singleTransferLoopWithRepeat( optsLoop ) {
    const imaState = state.get();
    await singleTransferLoop( optsLoop );
    setTimeout( async function() {
        await singleTransferLoopWithRepeat( optsLoop );
    }, imaState.nLoopPeriodSeconds * 1000 );
};
export async function runTransferLoop( optsLoop ) {
    const imaState = state.get();
    const isDelayFirstRun = owaspUtils.toBoolean( optsLoop.isDelayFirstRun );
    if( isDelayFirstRun ) {
        setTimeout( async function() {
            await singleTransferLoopWithRepeat( optsLoop );
        }, imaState.nLoopPeriodSeconds * 1000 );
    } else
        await singleTransferLoopWithRepeat( optsLoop );
    return true;
}

// Parallel thread based loop

const gArrWorkers = [];
const gArrClients = [];

export function notifyCacheChangedSNB( arrSChainsCached ) {
    const cntWorkers = gArrWorkers.length;
    if( cntWorkers == 0 ) {
        log.debug( "Will skip chainsCacheChanged dispatch event with no chains arrived in ",
            threadInfo.threadDescription() );
        return;
    }
    log.debug( "Loop module will broadcast arrSChainsCached event to its ",
        cntWorkers, " worker(s) in ", threadInfo.threadDescription(), "..." );
    for( let idxWorker = 0; idxWorker < cntWorkers; ++ idxWorker ) {
        const jo = {
            "method": "schainsCached",
            "message": { "arrSChainsCached": arrSChainsCached }
        };
        log.debug( "S-Chains cache will be sent to ",
            log.v( gArrClients[idxWorker].url ), " loop worker..." );
        gArrClients[idxWorker].send( jo );
        log.debug( "S-Chains cache did sent to ",
            log.v( gArrClients[idxWorker].url ), " loop worker" );
    }
    log.debug( "Loop module did finished broadcasting arrSChainsCached event to its ",
        cntWorkers, " worker(s) in ", threadInfo.threadDescription(), "..." );
}

log.trace( "Subscribe to chainsCacheChanged event in ", threadInfo.threadDescription() );
skaleObserver.events.on( "chainsCacheChanged", function( eventData ) {
    log.trace( "Did arrived chainsCacheChanged event in ", threadInfo.threadDescription() );
    notifyCacheChangedSNB( eventData.detail.arrSChainsCached );
} );

function constructChainProperties( opts ) {
    return {
        "mn": {
            "joAccount": {
                "privateKey":
                    opts.imaState.chainProperties.mn.joAccount.privateKey,
                "address_":
                    opts.imaState.chainProperties.mn.joAccount.address_,
                "strTransactionManagerURL":
                    opts.imaState.chainProperties.mn
                        .joAccount.strTransactionManagerURL,
                "nTmPriority":
                    opts.imaState.chainProperties.mn.joAccount.nTmPriority,
                "strSgxURL":
                    opts.imaState.chainProperties.mn.joAccount.strSgxURL,
                "strSgxKeyName":
                    opts.imaState.chainProperties.mn.joAccount.strSgxKeyName,
                "strPathSslKey":
                    opts.imaState.chainProperties.mn.joAccount.strPathSslKey,
                "strPathSslCert":
                    opts.imaState.chainProperties.mn.joAccount.strPathSslCert,
                "strBlsKeyName":
                    opts.imaState.chainProperties.mn.joAccount.strBlsKeyName
            },
            "ethersProvider": null,
            "strURL": opts.imaState.chainProperties.mn.strURL,
            "strChainName": opts.imaState.chainProperties.mn.strChainName,
            "chainId": opts.imaState.chainProperties.mn.chainId,
            "joAbiIMA": opts.imaState.chainProperties.mn.joAbiIMA,
            "bHaveAbiIMA": opts.imaState.chainProperties.mn.bHaveAbiIMA
        },
        "sc": {
            "joAccount": {
                "privateKey":
                    opts.imaState.chainProperties.sc.joAccount.privateKey,
                "address_":
                    opts.imaState.chainProperties.sc.joAccount.address_,
                "strTransactionManagerURL":
                    opts.imaState.chainProperties.sc
                        .joAccount.strTransactionManagerURL,
                "nTmPriority":
                    opts.imaState.chainProperties.sc.joAccount.nTmPriority,
                "strSgxURL":
                    opts.imaState.chainProperties.sc.joAccount.strSgxURL,
                "strSgxKeyName":
                    opts.imaState.chainProperties.sc.joAccount.strSgxKeyName,
                "strPathSslKey":
                    opts.imaState.chainProperties.sc.joAccount.strPathSslKey,
                "strPathSslCert":
                    opts.imaState.chainProperties.mn.joAccount.strPathSslCert,
                "strBlsKeyName":
                    opts.imaState.chainProperties.mn.joAccount.strBlsKeyName
            },
            "ethersProvider": null,
            "strURL": opts.imaState.chainProperties.sc.strURL,
            "strChainName": opts.imaState.chainProperties.sc.strChainName,
            "chainId": opts.imaState.chainProperties.sc.chainId,
            "joAbiIMA": opts.imaState.chainProperties.sc.joAbiIMA,
            "bHaveAbiIMA": opts.imaState.chainProperties.sc.bHaveAbiIMA
        },
        "tc": {
            "joAccount": {
                "privateKey":
                    opts.imaState.chainProperties.tc.joAccount.privateKey,
                "address_":
                    opts.imaState.chainProperties.tc.joAccount.address_,
                "strTransactionManagerURL":
                    opts.imaState.chainProperties.tc
                        .joAccount.strTransactionManagerURL,
                "nTmPriority":
                    opts.imaState.chainProperties.tc.joAccount.nTmPriority,
                "strSgxURL":
                    opts.imaState.chainProperties.tc.joAccount.strSgxURL,
                "strSgxKeyName":
                    opts.imaState.chainProperties.tc.joAccount.strSgxKeyName,
                "strPathSslKey":
                    opts.imaState.chainProperties.tc.joAccount.strPathSslKey,
                "strPathSslCert":
                    opts.imaState.chainProperties.tc.joAccount.strPathSslCert,
                "strBlsKeyName":
                    opts.imaState.chainProperties.tc.joAccount.strBlsKeyName
            },
            "ethersProvider": null,
            "strURL": opts.imaState.chainProperties.tc.strURL,
            "strChainName": opts.imaState.chainProperties.tc.strChainName,
            "chainId": opts.imaState.chainProperties.tc.chainId,
            "joAbiIMA": opts.imaState.chainProperties.tc.joAbiIMA,
            "bHaveAbiIMA": opts.imaState.chainProperties.tc.bHaveAbiIMA
        }
    };
}

function getDefaultOptsLoop( idxWorker ) {
    const optsLoop = {
        joRuntimeOpts: {
            isInsideWorker: true, idxChainKnownForS2S: 0, cntChainsKnownForS2S: 0
        },
        isDelayFirstRun: false,
        enableStepOracle: ( idxWorker == 0 ) ? true : false,
        enableStepM2S: ( idxWorker == 0 ) ? true : false,
        enableStepS2M: ( idxWorker == 1 ) ? true : false,
        enableStepS2S: ( idxWorker == 0 ) ? true : false
    };
    return optsLoop;
}

export async function ensureHaveWorkers( opts ) {
    if( gArrWorkers.length > 0 )
        return gArrWorkers;
    const cntWorkers = 2;
    log.debug( "Loop module will create its ",
        cntWorkers, " worker(s) in ", threadInfo.threadDescription(), "..." );
    for( let idxWorker = 0; idxWorker < cntWorkers; ++ idxWorker ) {
        const workerData = {
            "url": "ima_loop_server" + idxWorker,
            "colorization": { isEnabled: log.isEnabledColorization() }
        };
        gArrWorkers.push( new threadInfo.Worker(
            path.join( __dirname, "loopWorker.mjs" ),
            { "type": "module", "workerData": workerData }
        ) );
        gArrWorkers[idxWorker].on( "message", jo => {
            if( networkLayer.outOfWorkerAPIs.onMessage( gArrWorkers[idxWorker], jo ) )
                return;
        } );
        const aClient = new networkLayer.OutOfWorkerSocketClientPipe(
            workerData.url, gArrWorkers[idxWorker] );
        gArrClients.push( aClient );
        aClient.logicalInitComplete = false;
        aClient.errorLogicalInit = null;
        aClient.on( "message", async function( eventData ) {
            const joMessage = eventData.message;
            switch ( joMessage.method ) {
            case "init":
                if( ! joMessage.error ) {
                    aClient.logicalInitComplete = true;
                    break;
                }
                aClient.errorLogicalInit = joMessage.error;
                opts.details.critical( " Loop worker thread {} reported/returned init error: {}",
                    idxWorker, log.em( owaspUtils.extractErrorMessage( joMessage.error ) ) );
                break;
            case "log":
                log.information( "LOOP WORKER ", log.fmtNotice( workerData.url ),
                    " ", joMessage.message );
                break;
            case "saveTransferError":
                imaTransferErrorHandling.saveTransferError(
                    joMessage.message.category, joMessage.message.textLog, joMessage.message.ts );
                break;
            case "saveTransferSuccess":
                imaTransferErrorHandling.saveTransferSuccess( joMessage.message.category );
                break;
            } // switch ( joMessage.method )
        } );
        const jo = {
            "method": "init",
            "message": {
                "opts": {
                    "imaState": {
                        "optsLoop": getDefaultOptsLoop( idxWorker ),
                        "verbose_": log.verboseGet(),
                        "expose_details_": log.exposeDetailsGet(),
                        "arrSChainsCached": skaleObserver.getLastCachedSChains(),
                        "loopState": state.gDefaultValueForLoopState,
                        "isPrintGathered": opts.imaState.isPrintGathered,
                        "isPrintSecurityValues": opts.imaState.isPrintSecurityValues,
                        "isPrintPWA": opts.imaState.isPrintPWA,
                        "isDynamicLogInDoTransfer": opts.imaState.isDynamicLogInDoTransfer,
                        "isDynamicLogInBlsSigner": opts.imaState.isDynamicLogInBlsSigner,
                        "bIsNeededCommonInit": false,
                        "bSignMessages": opts.imaState.bSignMessages,
                        "joSChainNetworkInfo": opts.imaState.joSChainNetworkInfo,
                        "strPathBlsGlue": opts.imaState.strPathBlsGlue,
                        "strPathHashG1": opts.imaState.strPathHashG1,
                        "strPathBlsVerify": opts.imaState.strPathBlsVerify,
                        "isEnabledMultiCall": opts.imaState.isEnabledMultiCall,
                        "bNoWaitSChainStarted": opts.imaState.bNoWaitSChainStarted,
                        "nMaxWaitSChainAttempts": opts.imaState.nMaxWaitSChainAttempts,
                        "nTransferBlockSizeM2S": opts.imaState.nTransferBlockSizeM2S,
                        "nTransferBlockSizeS2M": opts.imaState.nTransferBlockSizeS2M,
                        "nTransferBlockSizeS2S": opts.imaState.nTransferBlockSizeS2S,
                        "nTransferStepsM2S": opts.imaState.nTransferStepsM2S,
                        "nTransferStepsS2M": opts.imaState.nTransferStepsS2M,
                        "nTransferStepsS2S": opts.imaState.nTransferStepsS2S,
                        "nMaxTransactionsM2S": opts.imaState.nMaxTransactionsM2S,
                        "nMaxTransactionsS2M": opts.imaState.nMaxTransactionsS2M,
                        "nMaxTransactionsS2S": opts.imaState.nMaxTransactionsS2S,

                        "nBlockAwaitDepthM2S": opts.imaState.nBlockAwaitDepthM2S,
                        "nBlockAwaitDepthS2M": opts.imaState.nBlockAwaitDepthS2M,
                        "nBlockAwaitDepthS2S": opts.imaState.nBlockAwaitDepthS2S,
                        "nBlockAgeM2S": opts.imaState.nBlockAgeM2S,
                        "nBlockAgeS2M": opts.imaState.nBlockAgeS2M,
                        "nBlockAgeS2S": opts.imaState.nBlockAgeS2S,

                        "nLoopPeriodSeconds": opts.imaState.nLoopPeriodSeconds,
                        "nNodeNumber": opts.imaState.nNodeNumber,
                        "nNodesCount": opts.imaState.nNodesCount,
                        "nTimeFrameSeconds": opts.imaState.nTimeFrameSeconds,
                        "nNextFrameGap": opts.imaState.nNextFrameGap,

                        "joCommunityPool": null,
                        "joDepositBoxETH": null,
                        "joDepositBoxERC20": null,
                        "joDepositBoxERC721": null,
                        "joDepositBoxERC1155": null,
                        "joDepositBoxERC721WithMetadata": null,
                        "joLinker": null,
                        "isWithMetadata721": false,

                        "joTokenManagerETH": null,
                        "joTokenManagerERC20": null,
                        "joTokenManagerERC20Target": null,
                        "joTokenManagerERC721": null,
                        "joTokenManagerERC721Target": null,
                        "joTokenManagerERC1155": null,
                        "joTokenManagerERC1155Target": null,
                        "joTokenManagerERC721WithMetadata": null,
                        "joTokenManagerERC721WithMetadataTarget": null,
                        "joCommunityLocker": null,
                        "joCommunityLockerTarget": null,
                        "joMessageProxyMainNet": null,
                        "joMessageProxySChain": null,
                        "joMessageProxySChainTarget": null,
                        "joTokenManagerLinker": null,
                        "joTokenManagerLinkerTarget": null,
                        "joEthErc20": null,
                        "joEthErc20Target": null,

                        "chainProperties": constructChainProperties( opts ),
                        "joAbiSkaleManager": opts.imaState.joAbiSkaleManager,
                        "bHaveSkaleManagerABI": opts.imaState.bHaveSkaleManagerABI,
                        "strChainNameOriginChain": opts.imaState.strChainNameOriginChain,
                        "isPWA": opts.imaState.isPWA,
                        "nTimeoutSecondsPWA": opts.imaState.nTimeoutSecondsPWA,
                        "strReimbursementChain": opts.imaState.strReimbursementChain,
                        "isShowReimbursementBalance": opts.imaState.isShowReimbursementBalance,
                        "nReimbursementRecharge": opts.imaState.nReimbursementRecharge,
                        "nReimbursementWithdraw": opts.imaState.nReimbursementWithdraw,
                        "nReimbursementRange": opts.imaState.nReimbursementRange,
                        "joSChainDiscovery": {
                            "isSilentReDiscovery":
                                opts.imaState.joSChainDiscovery.isSilentReDiscovery,
                            "repeatIntervalMilliseconds":
                                opts.imaState.joSChainDiscovery.repeatIntervalMilliseconds,
                            "periodicDiscoveryInterval":
                                opts.imaState.joSChainDiscovery.periodicDiscoveryInterval
                        },
                        "optsS2S": { // S-Chain to S-Chain transfer options
                            "isEnabled": true,
                            "bParallelModeRefreshSNB":
                                opts.imaState.optsS2S.bParallelModeRefreshSNB,
                            "secondsToReDiscoverSkaleNetwork":
                                opts.imaState.optsS2S.secondsToReDiscoverSkaleNetwork,
                            "secondsToWaitForSkaleNetworkDiscovered":
                                opts.imaState.optsS2S.secondsToWaitForSkaleNetworkDiscovered
                        },
                        "nJsonRpcPort": opts.imaState.nJsonRpcPort,
                        "isCrossImaBlsMode": opts.imaState.isCrossImaBlsMode
                    }
                },
                "colorization": { "isEnabled": log.isEnabledColorization() }
            }
        };
        while( ! aClient.logicalInitComplete ) {
            log.information( "LOOP server is not initialized yet..." );
            await threadInfo.sleep( 1000 );
            aClient.send( jo );
        }
    }
    log.debug( "Loop module did created its ",
        gArrWorkers.length, " worker(s) in ", threadInfo.threadDescription() );
    log.trace( "Subscribe to inThread-arrSChainsCached event in ",
        threadInfo.threadDescription() );
    skaleObserver.events.on( "inThread-arrSChainsCached", function( eventData ) {
        log.trace( "Did arrived inThread-arrSChainsCached event in ",
            threadInfo.threadDescription() );
        if( threadInfo.isMainThread() )
            notifyCacheChangedSNB( eventData.detail.arrSChainsCached );
    } );
    // Force broadcast what we have in SNB right now because works above can start later than SNB
    // is finished download connected chains quickly
    log.debug( "Loop module will do first initial broadcast of arrSChainsCached to its ",
        cntWorkers, " worker(s) in ", threadInfo.threadDescription(), "..." );
    notifyCacheChangedSNB( skaleObserver.getLastCachedSChains() );
}

export async function runParallelLoops( opts ) {
    log.notice( "Will start parallel IMA transfer loops in ",
        threadInfo.threadDescription(), "..." );
    await ensureHaveWorkers( opts );
    log.success( "Done, did started parallel IMA transfer loops in ",
        threadInfo.threadDescription(), ", have ",
        gArrWorkers.length, " worker(s) and " +
        gArrClients.length, " clients(s)." );
    return true;
}

export async function spreadArrivedStateOfPendingWorkAnalysis( joMessage ) {
    if( ! ( joMessage && typeof joMessage == "object" &&
        "method" in joMessage && joMessage.method == "skale_imaNotifyLoopWork" )
    )
        return;
    const cntWorkers = gArrWorkers.length;
    for( let idxWorker = 0; idxWorker < cntWorkers; ++ idxWorker )
        gArrClients[idxWorker].send( joMessage );

}

export async function spreadUpdatedSChainNetwork( isFinal ) {
    const imaState = state.get();
    const joMessage = {
        "method": "spreadUpdatedSChainNetwork",
        "isFinal": ( !!isFinal ),
        "joSChainNetworkInfo": imaState.joSChainNetworkInfo
    };
    const cntWorkers = gArrWorkers.length;
    for( let idxWorker = 0; idxWorker < cntWorkers; ++ idxWorker )
        gArrClients[idxWorker].send( joMessage );
}
