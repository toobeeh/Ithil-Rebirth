"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const make_fetch_happen_1 = __importDefault(require("make-fetch-happen"));
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
    static leagueWeight(s) {
        s = s * 1000;
        if (s < 0)
            return 0;
        if (s > 1000)
            return 30;
        return -1.78641975945623 * Math.pow(10, -9) * Math.pow(s, 4) + 0.00000457264006980028 * Math.pow(s, 3) - 0.00397188791256729 * Math.pow(s, 2) + 1.21566760222325 * s;
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
                console.log("Starting drop events...");
                let dispatchStats;
                const claimBuffer = [];
                const listenStartTimestamp = Date.now();
                this.ipcServer.onDropClaim = data => claimBuffer.push(data);
                this.ipcServer.onDropDispatched = data => dispatchStats = data;
                this.ipcServer.broadcastNextDrop({ dropID: nextDrop.DropID, eventDropID: nextDrop.EventDropID.toString() });
                // poll until dispatch data is set
                while (!dispatchStats)
                    await this.idle(50);
                // poll claim buffer while drop is not timed out
                console.log("Waiting for claims...");
                const dropTimeout = 5000;
                const bufferPoll = 30;
                let lastClaim;
                let successfulClaims = [];
                let leagueDropClaimed = false;
                // random league drop extension
                const leagueRandom = Math.random() * 100;
                const claimedUsers = [];
                while (Date.now() - dispatchStats.dispatchTimestamp < dropTimeout) {
                    // get the first claim and process it
                    lastClaim = claimBuffer.shift();
                    if (lastClaim && lastClaim.dropID == nextDrop.DropID) {
                        // get claimed drop and double-check if drop still valid
                        console.log("Shifted claim:", lastClaim);
                        const claimTarget = (await this.db.getDrop(nextDrop.DropID));
                        if (!claimedUsers.some(user => user == lastClaim?.userID) && claimTarget.result && claimTarget.result.CaughtLobbyPlayerID == "") {
                            // save user claimed
                            claimedUsers.push(lastClaim.userID);
                            /* detect if it was caught below 1s => leaguedrop */
                            let leagueDrop = lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp < 1000 + leagueRandom;
                            /* time if league drop */
                            let leagueTime = leagueDrop ? lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp : 0;
                            // claim and reward drop
                            if (!leagueDrop)
                                await this.db.rewardDrop(lastClaim.login, nextDrop.EventDropID);
                            await this.db.claimDrop(lastClaim.lobbyKey, lastClaim.username, nextDrop.DropID, lastClaim.userID, leagueTime, claimTarget.result);
                            // clear drop and exit loop
                            const clearData = {
                                dropID: nextDrop.DropID,
                                caughtLobbyKey: lastClaim.lobbyKey,
                                claimTicket: lastClaim.claimTicket,
                                caughtPlayer: "<abbr title='Drop ID: " + nextDrop.DropID + "'>" + lastClaim.username + "</abbr>",
                                leagueWeight: leagueDrop ? Drops.leagueWeight(leagueTime / 1000) : 0
                            };
                            this.ipcServer.broadcastClearDrop(clearData);
                            /* collect claim */
                            successfulClaims.push({ claim: lastClaim, leagueWeight: leagueTime });
                            /* if it was a league drop, accept other drops */
                            if (!leagueDrop)
                                break;
                            else {
                                console.log("league drop claimed with weight " + leagueTime);
                                leagueDropClaimed = true;
                            }
                        }
                        else
                            console.log("Rejected claim.", claimTarget);
                    }
                    else
                        await this.idle(bufferPoll);
                    lastClaim = undefined;
                }
                // build leaderboard and result data, if a claim successful and some claims left in buffer after 1s
                await this.idle(2000);
                console.log("Building ranks...");
                if (successfulClaims.length > 0 && dispatchStats) {
                    const ranks = [];
                    /* let firstRank = `<abbr title="`
                            + `- drop server dispatch delay: ${dispatchStats.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                            + `- individual socket dispatch delay: ${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.delay}ms&#013;&#010;`
                            + `- individual dispatch position: #${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.claimTicket}&#013;&#010;`
                            + `- worker port/ID: ${lastClaim.workerPort}&#013;&#010;`
                            + `- worker eventloop latency: ${lastClaim.workerEventloopLatency}ms&#013;&#010;`
                            + `- worker claim verify delay: ${lastClaim.claimVerifyDelay}ms
                    ">
                        ${lastClaim.username} (after ${Math.round(lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp)}ms)
                    </abbr>`;
                    ranks.push(firstRank); */
                    successfulClaims.forEach(claim => {
                        let successfulRank = `<abbr title="`
                            + `- drop server dispatch delay: ${dispatchStats.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                            + `- individual socket dispatch delay: ${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.delay}ms&#013;&#010;`
                            + `- individual dispatch position: #${dispatchStats.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.claimTicket}&#013;&#010;`
                            + `- worker port/ID: ${claim.claim.workerPort}&#013;&#010;`
                            + `- worker eventloop latency: ${claim.claim.workerEventloopLatency}ms&#013;&#010;`
                            + `- worker claim verify delay: ${claim.claim.claimVerifyDelay}ms
                        ">
                            ${claim.claim.username} (${claim.leagueWeight != 0 ? " 💎 " : ""}after ${Math.round(claim.claim.claimTimestamp - dispatchStats.dispatchTimestamp)}ms)
                        </abbr>`;
                        ranks.push(successfulRank);
                    });
                    // disable regular drop ranking
                    false && claimBuffer.forEach(claim => {
                        let otherRank = `<abbr title="`
                            + `- drop server dispatch delay: ${dispatchStats.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                            + `- individual socket dispatch delay: ${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.delay}ms&#013;&#010;`
                            + `- individual dispatch position: #${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.claimTicket}&#013;&#010;`
                            + `- worker port/ID: ${claim.workerPort}&#013;&#010;`
                            + `- worker eventloop latency: ${claim.workerEventloopLatency}ms&#013;&#010;`
                            + `- worker claim verify delay: ${claim.claimVerifyDelay}ms
                        ">
                            ${claim.username} (+${Math.round(claim.claimTimestamp - lastClaim.claimTimestamp)}ms)
                        </abbr>`;
                        ranks.push(otherRank);
                    });
                    this.ipcServer.broadcastRankDrop({
                        dropID: nextDrop.DropID,
                        ranks: ranks
                    });
                    // SEND WEBHOOK 
                    (0, make_fetch_happen_1.default)('https://discordapp.com/api/webhooks/738983040323289120/mzhXrZz0hqOuUaPUjB_RBTE8XJUFLe8fe9mgeJjQCaxjHX14c3SW3ZR199_CDEI-xT56', {
                        method: 'post',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            // the username to be displayed
                            username: 'Drop Log',
                            // the avatar to be displayed
                            avatar_url: 'https://media.discordapp.net/attachments/334696834322661376/987821727688036352/league_rnk1_drop.gif',
                            // contents of the message to be sent
                            content: ranks.join("\n")
                        }),
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