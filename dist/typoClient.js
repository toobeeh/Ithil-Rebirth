"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
/**
 * Manage dataflow and interactions with a client accessing from typo
 */
class TypoClient {
    /**
     * Init a new client with all member-related data and bound events
     */
    constructor(socket, dbWorker, memberInit, workerCache) {
        this.typosocket = socket;
        this.databaseWorker = dbWorker;
        this.workerCache = workerCache;
        this.username = memberInit.memberDiscordDetails.UserName;
        this.login = memberInit.memberDiscordDetails.UserLogin;
        // init events 
        this.typosocket.subscribeDisconnect(this.onDisconnect);
        this.typosocket.subscribeGetUserEvent(this.getUser);
        console.log("logged in");
    }
    /** The authentificated member */
    get member() {
        return new Promise(async (resolve) => {
            resolve((await this.databaseWorker.getUserByLogin(Number(this.login))).result);
        });
    }
    /** The member's current sprite slots */
    get spriteSlots() {
        return new Promise(async (resolve) => {
            resolve((await this.member).bubbles);
        });
    }
    /** The authentificated member's flags */
    get flags() {
        return new Promise(async (resolve) => {
            // get flags - convert integer to bit
            const flags = (await this.member).flags;
            const flagArray = ("00000000" + (flags >>> 0).toString(2)).slice(-8).split("")
                .map(f => Number(f)).reverse();
            // parse array to interface
            resolve({
                bubbleFarming: flagArray[0] == 1,
                admin: flagArray[1] == 1,
                moderator: flagArray[2] == 1,
                unlimitedCloud: flagArray[3] == 1,
                patron: flagArray[4] == 1,
                permaBan: flagArray[5] == 1,
                dropBan: flagArray[6] == 1,
                patronizer: flagArray[7] == 1,
            });
        });
    }
    async onDisconnect(reason) {
        await threads_1.Thread.terminate(this.databaseWorker);
    }
    async getUser() {
        const data = {
            user: await this.member,
            flags: await this.flags,
            slots: await this.spriteSlots
        };
        return data;
    }
}
exports.default = TypoClient;
//# sourceMappingURL=typoClient.js.map