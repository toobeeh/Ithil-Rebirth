"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Class that observes drops and processes/creates all needed events
 */
class Drops {
    /**
     * Construct object and immediately start drop loop
     * @param db Palantir DB worker thread
     * @param ipcServer IPC Main Server
     */
    constructor(db, ipcServer) {
        this.db = db;
        this.ipcServer = ipcServer;
        // start async loop
        setImmediate(this.loop.bind(this));
    }
    /**
     *The loop that contains all drop processing
     */
    async loop() {
        while (true) {
            try {
                let nextTimeout = null;
                let nextDrop = null;
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
                console.log("Dispatching drop...");
                let dispatchStats;
                const claimBuffer = [];
                const listenStartTimestamp = Date.now();
                this.ipcServer.onDropClaim = data => claimBuffer.push(data);
                this.ipcServer.onDropDispatched = data => dispatchStats = data;
                this.ipcServer.broadcastNextDrop({ dropID: nextDrop.DropID, eventDropID: nextDrop.EventDropID.toString() });
                // poll claim buffer while drop is not timed out
                console.log("Processing claims...");
                const dropTimeout = 5000;
                const bufferPoll = 50;
                let lastClaim;
                while (!dispatchStats || Date.now() - dispatchStats.dispatchTimestamp < dropTimeout) {
                    // get the first claim and process it
                    lastClaim = claimBuffer.shift();
                    if (lastClaim && lastClaim.dropID == nextDrop.DropID) {
                        // get claimed drop and double-check if drop still valid
                        const claimTarget = (await this.db.getDrop(nextDrop.DropID)).result;
                        if (claimTarget && claimTarget.CaughtLobbyPlayerID == "") {
                            // claim and reward drop
                            await this.db.rewardDrop(lastClaim.login, nextDrop.EventDropID);
                            await this.db.claimDrop(lastClaim.lobbyKey, lastClaim.username, nextDrop.DropID, lastClaim.userID);
                            // clear drop and exit loop
                            const clearData = {
                                dropID: nextDrop.DropID,
                                caughtLobbyKey: lastClaim.lobbyKey,
                                claimTicket: lastClaim.claimTicket,
                                caughtPlayer: "<abbr title='Drop ID: " + nextDrop.DropID + "'>" + lastClaim.username + "</abbr>"
                            };
                            this.ipcServer.broadcastClearDrop(clearData);
                            break;
                        }
                    }
                    else
                        await this.idle(bufferPoll);
                    lastClaim = undefined;
                }
                // build leaderboard and result data, if a claim successful and some claims left in buffer
                console.log("Building ranks...");
                if (lastClaim && claimBuffer.length > 0 && dispatchStats) {
                    const ranks = [];
                    let firstRank = `<abbr title="
                            - internal dispatch delay: ${listenStartTimestamp - dispatchStats.dispatchTimestamp}ms&#013;&#010;
                            - individual socket dispatch delay: "> ${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.delay}ms&#013;&#010;
                            - dispatch position: #${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.claimTicket}&#013;&#010;
                            - claim verify delay: ${lastClaim.claimVerifyDelay}ms
                    ">
                        ${lastClaim.username} (after ${Math.round(lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp)}ms)
                    </abbr>`;
                    ranks.push(firstRank);
                    claimBuffer.forEach(claim => {
                        let otherRank = `<abbr title="
                                - individual socket dispatch delay: "> ${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.delay}ms&#013;&#010;
                                - dispatch position: #${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.claimTicket}&#013;&#010;
                                - claim verify delay: ${claim.claimVerifyDelay}ms
                        ">
                            ${claim.username} (+${Math.round(claim.claimTimestamp - lastClaim.claimTimestamp)}ms)
                        </abbr>`;
                        ranks.push(otherRank);
                    });
                    this.ipcServer.broadcastRankDrop({
                        dropID: nextDrop.DropID,
                        ranks: ranks
                    });
                }
            }
            catch (e) {
                console.log("Error in drops:", e);
            }
        }
    }
    async idle(timeoutMsDuration) {
        return new Promise(resolve => {
            setTimeout(() => { resolve(); }, timeoutMsDuration);
        });
    }
}
exports.default = Drops;
//# sourceMappingURL=drops.js.map