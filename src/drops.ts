import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { ModuleThread } from "threads";
import * as ipc from './ipc';
import * as types from "./database/types";

/**
 * Class that observes drops and processes/creates all needed events
 */
export default class Drops {
    /**
     * Instance of a palantir db worker thread
     */
    db: ModuleThread<palantirDatabaseWorker>;

    /**
     * Instance of a ipc server that is used to listen to and emit events
     */
    ipcServer: ipc.IthilIPCServer;

    leagueWeight(s: number){
        return -372.505925447102 * Math.pow(s,4) + 1093.85046326223 *  Math.pow(s,3) - 988.674423615601 *  Math.pow(s,2) + 187.221934927817 * s + 90.1079508726569;
    } 

    /**
     * Construct object and immediately start drop loop
     * @param db Palantir DB worker thread
     * @param ipcServer IPC Main Server
     */
    constructor(db: ModuleThread<palantirDatabaseWorker>, ipcServer: ipc.IthilIPCServer) {
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
            try{
                let nextTimeout: number | null = null;
                let nextDrop: types.drop | null = null;
    
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
    
                this.ipcServer.onDropClaim = data => claimBuffer.push(data);
                this.ipcServer.onDropDispatched = data => dispatchStats = data;
                this.ipcServer.broadcastNextDrop({ dropID: nextDrop.DropID, eventDropID: nextDrop.EventDropID.toString() });
    
                // poll until dispatch data is set
                while(!dispatchStats) await this.idle(50);

                // poll claim buffer while drop is not timed out
                console.log("Waiting for claims...");
                const dropTimeout = 5000;
                const bufferPoll = 30;
                let lastClaim: ipc.dropClaimEventdata | undefined;
                let successfulClaims: Array<{claim: ipc.dropClaimEventdata, leagueWeight: number}> = [];
                while (Date.now() - dispatchStats.dispatchTimestamp < dropTimeout) {
    
                    // get the first claim and process it
                    lastClaim = claimBuffer.shift();
                    if (lastClaim && lastClaim.dropID == nextDrop.DropID) {
    
                        // get claimed drop and double-check if drop still valid
                        console.log("Shifted claim:", lastClaim);
                        const claimTarget = (await this.db.getDrop(nextDrop.DropID));
                        if (claimTarget.result && claimTarget.result.CaughtLobbyPlayerID == "") {
    
                            /* detect if it was caught below 1s => leaguedrop */
                            let leagueDrop = false; //lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp < 1000;

                            /* time if league drop */
                            let leagueTime = leagueDrop ? lastClaim.claimTimestamp - dispatchStats.dispatchTimestamp : 0;

                            // claim and reward drop
                            if(!leagueDrop) await this.db.rewardDrop(lastClaim.login, nextDrop.EventDropID);
                            await this.db.claimDrop(lastClaim.lobbyKey, lastClaim.username, nextDrop.DropID, lastClaim.userID, leagueTime);
    
                            // clear drop and exit loop
                            const clearData: ipc.clearDropEventdata = {
                                dropID: nextDrop.DropID,
                                caughtLobbyKey: lastClaim.lobbyKey,
                                claimTicket: lastClaim.claimTicket,
                                caughtPlayer: "<abbr title='Drop ID: " + nextDrop.DropID + "'>" + lastClaim.username + "</abbr>",
                                leagueWeight: leagueDrop ? this.leagueWeight(leagueTime/1000) : 0
                            };
                            this.ipcServer.broadcastClearDrop(clearData);

                            /* collect claim */
                            successfulClaims.push({claim: lastClaim, leagueWeight: leagueTime});

                            /* if it was a league drop, accept other drops */
                            if(!leagueDrop) break;
                            else console.log("league drop claimed with weight " + leagueTime);
                        }
                        else console.log("Rejected claim.", claimTarget);
                    }
                    else await this.idle(bufferPoll);
                    lastClaim = undefined;
                }
    
                // build leaderboard and result data, if a claim successful and some claims left in buffer after 1s
                await this.idle(2000);
                console.log("Building ranks...");
                if(successfulClaims.length > 0 && dispatchStats){
                    const ranks: Array<string> = [];
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
                                + `- drop server dispatch delay: ${dispatchStats!.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                                + `- individual socket dispatch delay: ${dispatchStats!.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.delay}ms&#013;&#010;`
                                + `- individual dispatch position: #${dispatchStats!.dispatchDelays.find(d => d.claimTicket == lastClaim?.claimTicket)?.claimTicket}&#013;&#010;`
                                + `- worker port/ID: ${claim.claim.workerPort}&#013;&#010;`
                                + `- worker eventloop latency: ${claim.claim.workerEventloopLatency}ms&#013;&#010;`
                                + `- worker claim verify delay: ${claim.claim.claimVerifyDelay}ms
                        ">
                            ${claim.claim.username} (${ claim.leagueWeight != 0 ? " 💎 " : ""}after ${Math.round(claim.claim.claimTimestamp - dispatchStats!.dispatchTimestamp)}ms)
                        </abbr>`;
                        ranks.push(successfulRank);
                    });
    
                    claimBuffer.forEach(claim => {
                        let otherRank = `<abbr title="`
                                + `- drop server dispatch delay: ${dispatchStats!.dispatchTimestamp - listenStartTimestamp}ms&#013;&#010;`
                                + `- individual socket dispatch delay: ${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.delay}ms&#013;&#010;`
                                + `- individual dispatch position: #${dispatchStats?.dispatchDelays.find(d => d.claimTicket == claim.claimTicket)?.claimTicket}&#013;&#010;`
                                + `- worker port/ID: ${claim.workerPort}&#013;&#010;`
                                + `- worker eventloop latency: ${claim.workerEventloopLatency}ms&#013;&#010;`
                                + `- worker claim verify delay: ${claim.claimVerifyDelay}ms
                        ">
                            ${claim.username} (+${Math.round(claim.claimTimestamp - lastClaim!.claimTimestamp)}ms)
                        </abbr>`;
                        ranks.push(otherRank);
                    });
    
                    this.ipcServer.broadcastRankDrop({
                        dropID: nextDrop.DropID,
                        ranks: ranks
                    });
                }
            }
            catch(e){
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