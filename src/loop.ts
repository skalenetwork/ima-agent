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
 * @file loop.ts
 * @copyright SKALE Labs 2019-Present
 */

import * as networkLayer from "./socket.js";
import * as url from "url";
import * as threadInfo from "./threadInfo.js";
import * as path from "path";
import * as log from "./log.js";
import * as IMA from "./imaCore.js";
import * as imaHelperAPIs from "./imaHelperAPIs.js";
import * as imaTransferErrorHandling from "./imaTransferErrorHandling.js";
import * as imaOracleOperations from "./imaOracleOperations.js";
import * as owaspUtils from "./owaspUtils.js";
import * as imaBLS from "./bls.js";
import * as skaleObserver from "./observer.js";
import * as pwa from "./pwa.js";
import * as state from "./state.js";
import type * as worker_threads from "worker_threads";

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname: string = path.dirname( url.fileURLToPath( import.meta.url ) );

export interface TExtraSignOpts {
    chainNameSrc: string
    chainIdSrc: string
    chainNameDst: string
    chainIdDst: string
    joAccountSrc?: state.TAccount
    joAccountDst?: state.TAccount
    ethersProviderSrc?: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider
    ethersProviderDst?: owaspUtils.ethersMod.ethers.providers.JsonRpcProvider
}

export interface TRuntimeOpts {
    isInsideWorker: boolean
    idxChainKnownForS2S: number
    cntChainsKnownForS2S: number
    joExtraSignOpts?: TExtraSignOpts
}

export interface TLoopOptions {
    joRuntimeOpts: TRuntimeOpts
    isDelayFirstRun: boolean
    enableStepOracle: boolean
    enableStepM2S: boolean
    enableStepS2M: boolean
    enableStepS2S: boolean
}

export interface TParallelLoopRunOptions {
    imaState: state.TIMAState
    details: log.TLogger
}

// Run transfer loop

export function checkTimeFraming(
    d: Date | null, strDirection: string, joRuntimeOpts: TRuntimeOpts ): boolean {
    try {
        const imaState: state.TIMAState = state.get();
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
        let bSkip = ( nActiveNodeFrameIndex != imaState.nNodeNumber );
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
        let strFrameInfo = log.fmtDebug( "\n",
            "    Unix UTC time stamp", "........",
            log.fmtInformation( "{}", nUtcUnixTimeStamp ), "\n",
            "    All Chains Range", "...........", nSecondsRangeForAllSChains, "\n",
            "    S-Chain Range Mod", "..........", log.fmtInformation( "{}", nMod ), "\n",
            "    Active Node Frame Index", "....",
            log.fmtInformation( "{}", nActiveNodeFrameIndex ), "\n",
            "    Testing Frame Index", "........",
            log.fmtInformation( "{}", imaState.nNodeNumber ), "\n",
            "    Transfer Direction", ".........",
            log.fmtInformation( "{bright}", strDirection || "NA" ), "\n" );
        if( nFrameShift > 0 ) {
            strFrameInfo += log.fmtDebug(
                "    Frame Shift", "................",
                log.fmtInformation( "{}", nFrameShift ), "\n",
                "    S2S known chain index", "......",
                log.fmtInformation( "{}", joRuntimeOpts.idxChainKnownForS2S ), "\n",
                "    S2S known chains count", ".....",
                log.fmtInformation( "{}", joRuntimeOpts.cntChainsKnownForS2S ), "\n"
            );
            if( "joExtraSignOpts" in joRuntimeOpts &&
                typeof joRuntimeOpts.joExtraSignOpts === "object" ) {
                strFrameInfo += log.fmtDebug( "    S-Chain source", ".............",
                    log.fmtInformation( "{}", joRuntimeOpts.joExtraSignOpts.chainNameSrc ),
                    "/", log.fmtInformation( "{}", joRuntimeOpts.joExtraSignOpts.chainIdSrc ),
                    "\n" );
            } else {
                const s1: string = log.fmtInformation( "{}",
                    joRuntimeOpts.joExtraSignOpts
                        ? joRuntimeOpts.joExtraSignOpts.chainNameDst : "N/A" )
                const s2: string = log.fmtInformation( "{}",
                    joRuntimeOpts.joExtraSignOpts
                        ? joRuntimeOpts.joExtraSignOpts.chainIdDst : "N/A" )
                strFrameInfo += log.fmtDebug( "    S-Chain destination", "........",
                    s1, "/", s2, "\n" );
            }
        }
        strFrameInfo += log.fmtDebug(
            "    Is skip", "....................", log.yn( bSkip ), "\n",
            "    Is inside gap", "..............", log.yn( bInsideGap ), "\n",
            "    Range Start", "................", log.fmtInformation( "{}", nRangeStart ), "\n",
            "    Frame Start", "................", log.fmtInformation( "{}", nFrameStart ), "\n",
            "    Gap Start", "..................", log.fmtInformation( "{}", nGapStart ), "\n" );
        log.write( strFrameInfo );
        if( bSkip )
            return false;
    } catch ( err ) {
        log.error( "Exception in time framing check in {}: {err}, stack is:{}{stack}",
            threadInfo.threadDescription(), err, "\n", err );
    }
    return true;
};

async function singleTransferLoopPartOracle( optsLoop: TLoopOptions, strLogPrefix: string ) {
    const imaState: state.TIMAState = state.get();
    let b0 = true;
    if( optsLoop.enableStepOracle && imaOracleOperations.getEnabledOracle() ) {
        log.notice( "{p}Will invoke Oracle gas price setup in {}...",
            strLogPrefix, threadInfo.threadDescription() );
        try {
            if( !await pwa.checkOnLoopStart( imaState, "oracle" ) ) {
                imaState.loopState.oracle.wasInProgress = false;
                log.notice( "{p}Skipped(oracle) in {} due to cancel mode reported from PWA",
                    strLogPrefix, threadInfo.threadDescription() );
            } else {
                if( checkTimeFraming( null, "oracle", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.oracle.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "oracle" );
                    if( !imaState.chainProperties.mn.ethersProvider )
                        throw new Error( "No provider for MN" );
                    if( !imaState.chainProperties.sc.ethersProvider )
                        throw new Error( "No provider for SC" );
                    if( !imaState.joCommunityLocker )
                        throw new Error( "No CommunityLocker contract" );
                    b0 = await imaOracleOperations.doOracleGasPriceSetup(
                        imaState.chainProperties.mn.ethersProvider,
                        imaState.chainProperties.sc.ethersProvider,
                        imaState.chainProperties.sc.transactionCustomizer,
                        imaState.joCommunityLocker,
                        imaState.chainProperties.sc.joAccount,
                        imaState.chainProperties.mn.chainId.toString(),
                        imaState.chainProperties.sc.chainId.toString(),
                        imaBLS.doSignU256
                    );
                    imaState.loopState.oracle.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "oracle" );
                } else {
                    log.notice( "{p}Skipped(oracle) in {} due to time framing check",
                        strLogPrefix, threadInfo.threadDescription() );
                }
            }
        } catch ( err ) {
            log.error( "{p}Oracle operation exception: {} in {err}, stack is:{}{stack}",
                strLogPrefix, err, threadInfo.threadDescription(), "\n", err );
            imaState.loopState.oracle.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "oracle" );
            throw err;
        }
        log.information( "{p}Oracle gas price setup done in {}: {}",
            strLogPrefix, threadInfo.threadDescription(), b0 );
    }
    return b0;
}

async function singleTransferLoopPartM2S( optsLoop: TLoopOptions, strLogPrefix: string ) {
    const imaState: state.TIMAState = state.get();
    let b1 = true;
    if( optsLoop.enableStepM2S ) {
        log.notice( "{p}Will invoke M2S transfer in {}...",
            strLogPrefix, threadInfo.threadDescription() );
        try {
            if( !await pwa.checkOnLoopStart( imaState, "m2s" ) ) {
                imaState.loopState.m2s.wasInProgress = false;
                log.notice( "{p}Skipped(m2s) in {} due to cancel mode reported from PWA",
                    strLogPrefix, threadInfo.threadDescription() );
            } else {
                if( checkTimeFraming( null, "m2s", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.m2s.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "m2s" );
                    if( !imaState.chainProperties.mn.ethersProvider )
                        throw new Error( "No provider for MN" );
                    if( !imaState.chainProperties.sc.ethersProvider )
                        throw new Error( "No provider for SC" );
                    if( !imaState.joMessageProxyMainNet )
                        throw new Error( "No MessageProxyMainNet contract" );
                    if( !imaState.joMessageProxySChain )
                        throw new Error( "No MessageProxySChain ) contract" );
                    b1 = await IMA.doTransfer( // main-net --> s-chain
                        "M2S",
                        optsLoop.joRuntimeOpts,
                        imaState.chainProperties.mn.ethersProvider,
                        imaState.joMessageProxyMainNet,
                        imaState.chainProperties.mn.joAccount,
                        imaState.chainProperties.sc.ethersProvider,
                        imaState.joMessageProxySChain,
                        imaState.chainProperties.sc.joAccount,
                        imaState.chainProperties.mn.strChainName,
                        imaState.chainProperties.sc.strChainName,
                        imaState.chainProperties.mn.chainId.toString(),
                        imaState.chainProperties.sc.chainId.toString(),
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
                    imaState.loopState.m2s.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "m2s" );
                } else {
                    log.notice( "{p}Skipped(m2s) in {} due to time framing check",
                        strLogPrefix, threadInfo.threadDescription() );
                }
            }
        } catch ( err ) {
            log.error( "{p}M2S transfer exception in {}: {err}, stack is:{}{stack}",
                strLogPrefix, threadInfo.threadDescription(), err, "\n", err );
            imaState.loopState.m2s.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "m2s" );
            throw err;
        }
        log.information( "{p}M2S transfer done in {}: {}",
            strLogPrefix, threadInfo.threadDescription(), b1 );
    } else
        log.debug( "{p}Skipped M2S transfer in {}.", strLogPrefix, threadInfo.threadDescription() );

    return b1;
}

async function singleTransferLoopPartS2M( optsLoop: TLoopOptions, strLogPrefix: string ) {
    const imaState: state.TIMAState = state.get();
    let b2 = true;
    if( optsLoop.enableStepS2M ) {
        log.notice( "{p}Will invoke S2M transfer in {}...",
            strLogPrefix, threadInfo.threadDescription() );
        try {
            if( !await pwa.checkOnLoopStart( imaState, "s2m" ) ) {
                imaState.loopState.s2m.wasInProgress = false;
                log.notice( "{p}Skipped(s2m) in {} due to cancel mode reported from PWA",
                    strLogPrefix, threadInfo.threadDescription() );
            } else {
                if( checkTimeFraming( null, "s2m", optsLoop.joRuntimeOpts ) ) {
                    imaState.loopState.s2m.isInProgress = true;
                    await pwa.notifyOnLoopStart( imaState, "s2m" );
                    if( !imaState.chainProperties.mn.ethersProvider )
                        throw new Error( "No provider for MN" );
                    if( !imaState.chainProperties.sc.ethersProvider )
                        throw new Error( "No provider for SC" );
                    if( !imaState.joMessageProxyMainNet )
                        throw new Error( "No MessageProxyMainNet contract" );
                    if( !imaState.joMessageProxySChain )
                        throw new Error( "No MessageProxySChain contract" );
                    b2 = await IMA.doTransfer( // s-chain --> main-net
                        "S2M",
                        optsLoop.joRuntimeOpts,

                        imaState.chainProperties.sc.ethersProvider,
                        imaState.joMessageProxySChain,
                        imaState.chainProperties.sc.joAccount,

                        imaState.chainProperties.mn.ethersProvider,
                        imaState.joMessageProxyMainNet,
                        imaState.chainProperties.mn.joAccount,

                        imaState.chainProperties.sc.strChainName,
                        imaState.chainProperties.mn.strChainName,
                        imaState.chainProperties.sc.chainId.toString(),
                        imaState.chainProperties.mn.chainId.toString(),

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
                    imaState.loopState.s2m.isInProgress = false;
                    await pwa.notifyOnLoopEnd( imaState, "s2m" );
                } else {
                    log.notice( "{p}Skipped(s2m) in {} due to time framing check",
                        strLogPrefix, threadInfo.threadDescription() );
                }
            }
        } catch ( err ) {
            log.error( "{p}S2M transfer exception in {err}: , stack is:{}{stack}",
                strLogPrefix, threadInfo.threadDescription(), err, "\n", err );
            imaState.loopState.s2m.isInProgress = false;
            await pwa.notifyOnLoopEnd( imaState, "s2m" );
            throw err;
        }
        log.information( "{p}S2M transfer done in {}: {}",
            strLogPrefix, threadInfo.threadDescription(), b2 );
    } else {
        log.debug( "{p}Skipped S2M transfer in {}.",
            strLogPrefix, threadInfo.threadDescription() );
    }
    return b2;
}

async function singleTransferLoopPartS2S( optsLoop: TLoopOptions, strLogPrefix: string ) {
    const imaState: state.TIMAState = state.get();
    let b3 = true;
    if( optsLoop.enableStepS2S && imaState.optsS2S.isEnabled ) {
        log.notice( "{p}Will invoke all S2S transfers...", strLogPrefix );
        try {
            if( !imaState.chainProperties.sc.ethersProvider )
                throw new Error( "No provider for SC" );
            if( !imaState.joMessageProxySChain )
                throw new Error( "No MessageProxySChain contract" );
            if( !imaState.joTokenManagerETH )
                throw new Error( "No TokenManagerETH contract" );
            b3 = await IMA.doAllS2S( // s-chain --> s-chain
                optsLoop.joRuntimeOpts,
                imaState,
                skaleObserver,
                imaState.chainProperties.sc.ethersProvider,
                imaState.joMessageProxySChain,
                imaState.chainProperties.sc.joAccount,
                imaState.chainProperties.sc.strChainName,
                imaState.chainProperties.sc.chainId.toString(),
                imaState.joTokenManagerETH, // for logs validation on s-chain
                imaState.nTransferBlockSizeS2S,
                imaState.nTransferStepsS2S,
                imaState.nMaxTransactionsS2S,
                imaState.nBlockAwaitDepthS2S,
                imaState.nBlockAgeS2S,
                imaBLS.doSignMessagesS2S,
                imaState.chainProperties.sc.transactionCustomizer
            );
        } catch ( err ) {
            log.error( "{p}S2S transfer exception in {}: {err}, stack is:{}{stack}",
                strLogPrefix, threadInfo.threadDescription(), err, "\n", err );
            throw err;
        }
        log.information( "{p}All S2S transfers done in {}: {}",
            strLogPrefix, threadInfo.threadDescription(), b3 );
    } else
        log.debug( "{p}Skipped S2S transfer in {}.", strLogPrefix, threadInfo.threadDescription() );

    return b3;
}

function printLoopPartSkippedWarning( strLoopPartName: string ) {
    log.warning( "Skipped {} transfer loop part due to other single transfer loop is in " +
        "progress right now", strLoopPartName );
}

export async function singleTransferLoop( optsLoop: TLoopOptions ) {
    const imaState: state.TIMAState = state.get();
    const strLogPrefix = `Single Loop in ${threadInfo.threadDescription( false )} `;
    try {
        log.debug( "{p}{p}", strLogPrefix, imaHelperAPIs.longSeparator );
        let b0 = false; let b1 = false; let b2 = false; let b3 = false;
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
        log.notice( "{p}Final completion status for all performed transfer loop parts is {}",
            strLogPrefix, bResult );
        return bResult;
    } catch ( err ) {
        log.error( "{p}Exception in transfer loop: {err}, stack is:{}{stack}", strLogPrefix,
            err, "\n", err );
    }
    imaState.loopState.oracle.isInProgress = false;
    imaState.loopState.m2s.isInProgress = false;
    imaState.loopState.s2m.isInProgress = false;
    imaState.loopState.s2s.isInProgress = false;
    return false;
}
export async function singleTransferLoopWithRepeat( optsLoop: TLoopOptions ) {
    const imaState: state.TIMAState = state.get();
    await singleTransferLoop( optsLoop );
    setTimeout( function() {
        singleTransferLoopWithRepeat( optsLoop ).then( function() {} ).catch( function() {} );
    }, imaState.nLoopPeriodSeconds * 1000 );
};
export async function runTransferLoop( optsLoop: TLoopOptions ) {
    const imaState: state.TIMAState = state.get();
    const isDelayFirstRun = owaspUtils.toBoolean( optsLoop.isDelayFirstRun );
    if( isDelayFirstRun ) {
        setTimeout( function() {
            singleTransferLoopWithRepeat( optsLoop ).then( function() {} ).catch( function() {} );
        }, imaState.nLoopPeriodSeconds * 1000 );
    } else
        await singleTransferLoopWithRepeat( optsLoop );
    return true;
}

// Parallel thread based loop

const gArrWorkers: worker_threads.Worker[] = [];
const gArrClients: networkLayer.OutOfWorkerSocketClientPipe[] = [];

function constructChainProperties( opts: TParallelLoopRunOptions ) {
    return {
        mn: {
            joAccount: {
                privateKey: opts.imaState.chainProperties.mn.joAccount.privateKey,
                address_: opts.imaState.chainProperties.mn.joAccount.address_,
                strTransactionManagerURL:
                    opts.imaState.chainProperties.mn.joAccount.strTransactionManagerURL,
                nTmPriority: opts.imaState.chainProperties.mn.joAccount.nTmPriority,
                strSgxURL: opts.imaState.chainProperties.mn.joAccount.strSgxURL,
                strSgxKeyName: opts.imaState.chainProperties.mn.joAccount.strSgxKeyName,
                strPathSslKey: opts.imaState.chainProperties.mn.joAccount.strPathSslKey,
                strPathSslCert: opts.imaState.chainProperties.mn.joAccount.strPathSslCert,
                strBlsKeyName: opts.imaState.chainProperties.mn.joAccount.strBlsKeyName
            },
            ethersProvider: null,
            strURL: opts.imaState.chainProperties.mn.strURL,
            strChainName: opts.imaState.chainProperties.mn.strChainName,
            chainId: opts.imaState.chainProperties.mn.chainId,
            joAbiIMA: opts.imaState.chainProperties.mn.joAbiIMA,
            bHaveAbiIMA: opts.imaState.chainProperties.mn.bHaveAbiIMA
        },
        sc: {
            joAccount: {
                privateKey: opts.imaState.chainProperties.sc.joAccount.privateKey,
                address_: opts.imaState.chainProperties.sc.joAccount.address_,
                strTransactionManagerURL:
                    opts.imaState.chainProperties.sc.joAccount.strTransactionManagerURL,
                nTmPriority: opts.imaState.chainProperties.sc.joAccount.nTmPriority,
                strSgxURL: opts.imaState.chainProperties.sc.joAccount.strSgxURL,
                strSgxKeyName: opts.imaState.chainProperties.sc.joAccount.strSgxKeyName,
                strPathSslKey: opts.imaState.chainProperties.sc.joAccount.strPathSslKey,
                strPathSslCert: opts.imaState.chainProperties.mn.joAccount.strPathSslCert,
                strBlsKeyName: opts.imaState.chainProperties.mn.joAccount.strBlsKeyName
            },
            ethersProvider: null,
            strURL: opts.imaState.chainProperties.sc.strURL,
            strChainName: opts.imaState.chainProperties.sc.strChainName,
            chainId: opts.imaState.chainProperties.sc.chainId,
            joAbiIMA: opts.imaState.chainProperties.sc.joAbiIMA,
            bHaveAbiIMA: opts.imaState.chainProperties.sc.bHaveAbiIMA
        },
        tc: {
            joAccount: {
                privateKey: opts.imaState.chainProperties.tc.joAccount.privateKey,
                address_: opts.imaState.chainProperties.tc.joAccount.address_,
                strTransactionManagerURL:
                    opts.imaState.chainProperties.tc.joAccount.strTransactionManagerURL,
                nTmPriority: opts.imaState.chainProperties.tc.joAccount.nTmPriority,
                strSgxURL: opts.imaState.chainProperties.tc.joAccount.strSgxURL,
                strSgxKeyName: opts.imaState.chainProperties.tc.joAccount.strSgxKeyName,
                strPathSslKey: opts.imaState.chainProperties.tc.joAccount.strPathSslKey,
                strPathSslCert: opts.imaState.chainProperties.tc.joAccount.strPathSslCert,
                strBlsKeyName: opts.imaState.chainProperties.tc.joAccount.strBlsKeyName
            },
            ethersProvider: null,
            strURL: opts.imaState.chainProperties.tc.strURL,
            strChainName: opts.imaState.chainProperties.tc.strChainName,
            chainId: opts.imaState.chainProperties.tc.chainId,
            joAbiIMA: opts.imaState.chainProperties.tc.joAbiIMA,
            bHaveAbiIMA: opts.imaState.chainProperties.tc.bHaveAbiIMA
        }
    };
}

function getDefaultOptsLoop( idxWorker: number ): TLoopOptions {
    const optsLoop: TLoopOptions = {
        joRuntimeOpts: {
            isInsideWorker: true, idxChainKnownForS2S: 0, cntChainsKnownForS2S: 0
        },
        isDelayFirstRun: false,
        enableStepOracle: ( idxWorker == 0 ),
        enableStepM2S: ( idxWorker == 0 ),
        enableStepS2M: ( idxWorker == 1 ),
        enableStepS2S: ( idxWorker == 0 )
    };
    return optsLoop;
}

interface TWorkerData {
    url: string
    colorization: {
        isEnabled: boolean
    }
}

export async function ensureHaveWorkers( opts: TParallelLoopRunOptions ) {
    if( gArrWorkers.length > 0 )
        return gArrWorkers;
    const cntWorkers = 2;
    log.debug( "Loop module will create its ",
        cntWorkers, " worker(s) in ", threadInfo.threadDescription(), "..." );
    for( let idxWorker = 0; idxWorker < cntWorkers; ++idxWorker ) {
        const workerData: TWorkerData = {
            url: "ima_loop_server" + idxWorker,
            colorization: { isEnabled: log.isEnabledColorization() }
        };
        gArrWorkers.push( new threadInfo.Worker(
            path.join( __dirname, "loopWorker.js" ),
            { // "type": "module",
                workerData
            }
        ) );
        gArrWorkers[idxWorker].on( "message", function( jo: any ) {
            networkLayer.outOfWorkerAPIs.onMessage( gArrWorkers[idxWorker], jo );
        } );
        const aClient = new networkLayer.OutOfWorkerSocketClientPipe(
            workerData.url, gArrWorkers[idxWorker] );
        gArrClients.push( aClient );
        aClient.logicalInitComplete = false;
        aClient.errorLogicalInit = null;
        aClient.on( "message", async function( eventData: any ) {
            const joMessage = eventData.message;
            switch ( joMessage.method ) {
            case "init":
                if( !joMessage.error ) {
                    aClient.logicalInitComplete = true;
                    break
                }
                aClient.errorLogicalInit = joMessage.error;
                opts.details.critical(
                    " Loop worker thread {} reported/returned init error: {err}",
                    idxWorker, joMessage.error );
                break
            case "log":
                log.information( "LOOP WORKER {} {}", workerData.url, joMessage.message );
                break
            case "saveTransferError":
                imaTransferErrorHandling.saveTransferError(
                    joMessage.message.category, joMessage.message.textLog, joMessage.message.ts );
                break
            case "saveTransferSuccess":
                imaTransferErrorHandling.saveTransferSuccess( joMessage.message.category );
                break
            } // switch ( joMessage.method )
        } );
        const jo: any = {
            method: "init",
            message: {
                opts: {
                    imaState: {
                        optsLoop: getDefaultOptsLoop( idxWorker ),
                        verbose_: log.verboseGet(),
                        expose_details_: log.exposeDetailsGet(),
                        loopState: state.gDefaultValueForLoopState,
                        isPrintGathered: opts.imaState.isPrintGathered,
                        isPrintSecurityValues: opts.imaState.isPrintSecurityValues,
                        isPrintPWA: opts.imaState.isPrintPWA,
                        isDynamicLogInDoTransfer: opts.imaState.isDynamicLogInDoTransfer,
                        isDynamicLogInBlsSigner: opts.imaState.isDynamicLogInBlsSigner,
                        bIsNeededCommonInit: false,
                        bSignMessages: opts.imaState.bSignMessages,
                        joSChainNetworkInfo: opts.imaState.joSChainNetworkInfo,
                        strPathBlsGlue: opts.imaState.strPathBlsGlue,
                        strPathHashG1: opts.imaState.strPathHashG1,
                        strPathBlsVerify: opts.imaState.strPathBlsVerify,
                        isEnabledMultiCall: opts.imaState.isEnabledMultiCall,
                        bNoWaitSChainStarted: opts.imaState.bNoWaitSChainStarted,
                        nMaxWaitSChainAttempts: opts.imaState.nMaxWaitSChainAttempts,
                        nTransferBlockSizeM2S: opts.imaState.nTransferBlockSizeM2S,
                        nTransferBlockSizeS2M: opts.imaState.nTransferBlockSizeS2M,
                        nTransferBlockSizeS2S: opts.imaState.nTransferBlockSizeS2S,
                        nTransferStepsM2S: opts.imaState.nTransferStepsM2S,
                        nTransferStepsS2M: opts.imaState.nTransferStepsS2M,
                        nTransferStepsS2S: opts.imaState.nTransferStepsS2S,
                        nMaxTransactionsM2S: opts.imaState.nMaxTransactionsM2S,
                        nMaxTransactionsS2M: opts.imaState.nMaxTransactionsS2M,
                        nMaxTransactionsS2S: opts.imaState.nMaxTransactionsS2S,

                        nBlockAwaitDepthM2S: opts.imaState.nBlockAwaitDepthM2S,
                        nBlockAwaitDepthS2M: opts.imaState.nBlockAwaitDepthS2M,
                        nBlockAwaitDepthS2S: opts.imaState.nBlockAwaitDepthS2S,
                        nBlockAgeM2S: opts.imaState.nBlockAgeM2S,
                        nBlockAgeS2M: opts.imaState.nBlockAgeS2M,
                        nBlockAgeS2S: opts.imaState.nBlockAgeS2S,

                        nLoopPeriodSeconds: opts.imaState.nLoopPeriodSeconds,
                        nNodeNumber: opts.imaState.nNodeNumber,
                        nNodesCount: opts.imaState.nNodesCount,
                        nTimeFrameSeconds: opts.imaState.nTimeFrameSeconds,
                        nNextFrameGap: opts.imaState.nNextFrameGap,

                        joCommunityPool: null,
                        joDepositBoxETH: null,
                        joDepositBoxERC20: null,
                        joDepositBoxERC721: null,
                        joDepositBoxERC1155: null,
                        joDepositBoxERC721WithMetadata: null,
                        joLinker: null,
                        isWithMetadata721: false,

                        joTokenManagerETH: null,
                        joTokenManagerETHTarget: null,
                        joTokenManagerERC20: null,
                        joTokenManagerERC20Target: null,
                        joTokenManagerERC721: null,
                        joTokenManagerERC721Target: null,
                        joTokenManagerERC1155: null,
                        joTokenManagerERC1155Target: null,
                        joTokenManagerERC721WithMetadata: null,
                        joTokenManagerERC721WithMetadataTarget: null,
                        joCommunityLocker: null,
                        joCommunityLockerTarget: null,
                        joMessageProxyMainNet: null,
                        joMessageProxySChain: null,
                        joMessageProxySChainTarget: null,
                        joTokenManagerLinker: null,
                        joTokenManagerLinkerTarget: null,
                        joEthErc20: null,
                        joEthErc20Target: null,

                        chainProperties: constructChainProperties( opts ),
                        joAbiSkaleManager: opts.imaState.joAbiSkaleManager,
                        bHaveSkaleManagerABI: opts.imaState.bHaveSkaleManagerABI,
                        strChainNameOriginChain: opts.imaState.strChainNameOriginChain,
                        isPWA: opts.imaState.isPWA,
                        nTimeoutSecondsPWA: opts.imaState.nTimeoutSecondsPWA,
                        strReimbursementChain: opts.imaState.strReimbursementChain,
                        isShowReimbursementBalance: opts.imaState.isShowReimbursementBalance,
                        nReimbursementRecharge: opts.imaState.nReimbursementRecharge,
                        nReimbursementWithdraw: opts.imaState.nReimbursementWithdraw,
                        nReimbursementRange: opts.imaState.nReimbursementRange,
                        joSChainDiscovery: {
                            isSilentReDiscovery:
                                opts.imaState.joSChainDiscovery.isSilentReDiscovery,
                            repeatIntervalMilliseconds:
                                opts.imaState.joSChainDiscovery.repeatIntervalMilliseconds,
                            periodicDiscoveryInterval:
                                opts.imaState.joSChainDiscovery.periodicDiscoveryInterval
                        },
                        optsS2S: { // S-Chain to S-Chain transfer options
                            isEnabled: true,
                            strNetworkBrowserPath: opts.imaState.optsS2S.strNetworkBrowserPath
                        },
                        nJsonRpcPort: opts.imaState.nJsonRpcPort,
                        isCrossImaBlsMode: opts.imaState.isCrossImaBlsMode
                    }
                },
                colorization: { isEnabled: log.isEnabledColorization() }
            }
        };
        while( !aClient.logicalInitComplete ) {
            log.information( "LOOP server is not initialized yet..." );
            await threadInfo.sleep( 1000 );
            aClient.send( jo );
        }
    }
    log.debug( "Loop module did created its ",
        gArrWorkers.length, " worker(s) in ", threadInfo.threadDescription() );
}

export async function runParallelLoops( opts: TParallelLoopRunOptions ) {
    log.notice( "Will start parallel IMA transfer loops in {}...", threadInfo.threadDescription() );
    await ensureHaveWorkers( opts );
    log.success( "Done, did started parallel IMA transfer loops in {}, have {} worker(s) and {} " +
        "clients(s).", threadInfo.threadDescription(), gArrWorkers.length, gArrClients.length );
    return true;
}

export async function spreadArrivedStateOfPendingWorkAnalysis( joMessage: any ) {
    if( !( joMessage && typeof joMessage === "object" &&
        "method" in joMessage && joMessage.method == "skale_imaNotifyLoopWork" )
    )
        return;
    const cntWorkers = gArrWorkers.length;
    for( let idxWorker = 0; idxWorker < cntWorkers; ++idxWorker )
        gArrClients[idxWorker].send( joMessage );
}

export async function spreadUpdatedSChainNetwork( isFinal: boolean ) {
    const imaState: state.TIMAState = state.get();
    const joMessage: any = {
        method: "spreadUpdatedSChainNetwork",
        isFinal: ( !!isFinal ),
        joSChainNetworkInfo: imaState.joSChainNetworkInfo
    };
    const cntWorkers = gArrWorkers.length;
    for( let idxWorker = 0; idxWorker < cntWorkers; ++idxWorker )
        gArrClients[idxWorker].send( joMessage );
}
