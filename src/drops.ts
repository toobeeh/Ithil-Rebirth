import * as ipc from './ipc';
import fetch from 'make-fetch-happen';
import PalantirDatabase from "./database/mysql/palantirDatabase";
import { NextDrop } from "./database/mysql/schema";

/**
 * Class that observes drops and processes/creates all needed events
 */
export default class Drops {
    /**
     * Instance of a palantir db worker thread
     */
    db: PalantirDatabase;

    /**
     * Instance of a ipc server that is used to listen to and emit events
     */
    ipcServer: ipc.IthilIPCServer;

    static leagueWeight(s: number) {
        s = s * 1000;
        if (s < 0) return 0;
        if (s > 1000) return 30;
        return -1.78641975945623 * Math.pow(10, -9) * Math.pow(s, 4) + 0.00000457264006980028 * Math.pow(s, 3) - 0.00397188791256729 * Math.pow(s, 2) + 1.21566760222325 * s;
    }

    /**
     * Construct object and immediately start drop loop
     * @param db Palantir DB worker thread
     * @param ipcServer IPC Main Server
     */
    constructor(db: PalantirDatabase, ipcServer: ipc.IthilIPCServer) {
        this.db = db;
        this.ipcServer = ipcServer;

        // start async loop
        setImmediate(this.loop.bind(this));
    }

    /**
     *The loop that contains all drop processing 
     */
    private async loop() {
        while (true) {
            try {
                let nextTimeout: number | null = null;
                let nextDrop: NextDrop | null = null;

                // poll for next drop
                while (!nextTimeout || nextTimeout < 0 || !nextDrop) {
                    await this.idle(100);
                    nextDrop = (await this.db.getDrop()).result;

                    if (nextDrop && nextDrop.CaughtLobbyPlayerID == "") {
                        nextTimeout = (new Date(nextDrop.ValidFrom + " UTC")).getTime() - Date.now();
                    }
                }

                // wait until drop is valid
                console.log(`Next drop (${nextDrop.DropID}) in ${nextTimeout / 1000}s`);
                await this.idle(nextTimeout);

                // dispatch drop and listen for claims
                console.log("Starting drop events...");
                let dispatchStats: ipc.dispatchedDropEventdata | undefined;
                const claimBuffer: Array<ipc.dropClaimEventdata> = [];
                const listenStartTimestamp = Date.now();

                this.ipcServer.onDropClaim = data => {
                    console.log("claim for ticket " + data.claimTicket);
                    data.workerMasterDelay = (data.workerMasterDelay - Date.now()) * -1;
                    claimBuffer.push(data);
                }
                this.ipcServer.onDropDispatched = data => dispatchStats = data;
                this.ipcServer.broadcastNextDrop({ dropID: nextDrop.DropID.toString(), eventDropID: nextDrop.EventDropID.toString() });

                // poll until dispatch data is set
                while (!dispatchStats) await this.idle(50);

                // poll claim buffer while drop is not timed out
                console.log("Waiting for claims...");
                const dropTimeout = 2000;
                const bufferPoll = 30;
                let lastClaim: ipc.dropClaimEventdata | undefined;
                let successfulClaims: Array<{ claim: ipc.dropClaimEventdata, leagueWeight: number, mode: 'league' | 'normal' }> = [];

                // random league drop extension
                const claimedUsers: Array<string> = [];

                while (Date.now() - dispatchStats.dispatchTimestamp < dropTimeout) {

                    // get the first claim and process it
                    lastClaim = claimBuffer.shift();
                    if (lastClaim && lastClaim.dropID == nextDrop.DropID.toString()) {

                        if (lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp < 187) {
                            console.log("rejected spam from " + lastClaim.username, lastClaim);
                            continue;
                        }

                        // check that user has not claimed before
                        if (!claimedUsers.some(user => user == lastClaim?.userID)) {

                            // save user claimed
                            claimedUsers.push(lastClaim.userID);
                            const claimTarget = {...nextDrop};

                            /* detect if it was caught below 1s => leaguedrop */
                            /*let leagueDrop = lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp < 1000 + leagueRandom;*/

                            /* reject if drop was caught in league mode, but no league drop */
                            /*if (!leagueDrop && lastClaim.dropMode === 'league') {
                                console.log("rejected slow league mode");
                                continue;
                            }*/

                            /* set league mode indicator */
                            if (lastClaim.dropMode === 'league') {
                                claimTarget.EventDropID = -1;
                            }

                            /* time if league drop */
                            const leagueTime = lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp;
                            const isLastClaim = leagueTime > 1000;

                            // claim and reward drop
                            await this.db.claimDrop(lastClaim.lobbyKey, lastClaim.username, nextDrop.DropID.toString(), lastClaim.userID, leagueTime, claimTarget);

                            // clear drop and exit loop
                            const clearData: ipc.clearDropEventdata = {
                                dropID: nextDrop.DropID.toString(),
                                caughtLobbyKey: lastClaim.lobbyKey,
                                claimTicket: lastClaim.claimTicket,
                                caughtPlayer: "<abbr title='Drop ID: " + nextDrop.DropID + "'>" + lastClaim.username + "</abbr>",
                                leagueWeight: Drops.leagueWeight(leagueTime / 1000)
                            };
                            this.ipcServer.broadcastClearDrop(clearData);

                            /* collect claim */
                            successfulClaims.push({ claim: lastClaim, leagueWeight: leagueTime, mode: lastClaim.dropMode });

                            /* if it was below 1000ms, accept other drops */
                            console.log("drop claimed with weight " + leagueTime);
                            if (isLastClaim) break;

                        }
                        else console.log("Rejected claim.", lastClaim);
                    }
                    else await this.idle(bufferPoll);
                    lastClaim = undefined;
                }

                // build leaderboard and result data, if a claim successful and some claims left in buffer after 1s
                await this.idle(2000);
                console.log("Building ranks...");
                if (successfulClaims.length > 0 && dispatchStats) {
                    const ranks: Array<string> = [];

                    successfulClaims.forEach(claim => {
                        const emote = claim.leagueWeight < 1000 ? (claim.mode === 'normal' ? " 💎 " : " 🧿 ") : " 💧 ";
                        let successfulRank = `<abbr title="`
                            + `- drop server dispatch delay: ${dispatchStats!.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                            + `- individual socket dispatch delay: ${dispatchStats!.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.delay}ms&#013;&#010;`
                            + `- individual dispatch position: #${dispatchStats!.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.claimTicket}&#013;&#010;`
                            + `- worker port/ID: ${claim.claim.workerPort}&#013;&#010;`
                            + `- worker eventloop latency: ${claim.claim.workerEventloopLatency}ms&#013;&#010;`
                            + `- worker claim verify delay: ${claim.claim.claimVerifyDelay}ms`
                            + `- worker to main delay: ${claim.claim.workerMasterDelay}ms
                        ">
                            ${claim.claim.username} (${emote}after ${Math.round(claim.claim.claimTimestamp - dispatchStats!.dispatchTimestamp)}ms)
                        </abbr>`;
                        ranks.push(successfulRank);
                    });

                    this.ipcServer.broadcastRankDrop({
                        dropID: nextDrop.DropID.toString(),
                        ranks: ranks
                    });
                }
            }
            catch (e) {
                console.log("Error in drops:", e);
            }
        }
    }

    private async idle(timeoutMsDuration: number) {
        return new Promise<void>(resolve => {
            setTimeout(() => { resolve(); }, timeoutMsDuration);
        });
    }
}