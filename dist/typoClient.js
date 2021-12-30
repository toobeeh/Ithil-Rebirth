"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
/**
 * Manage dataflow and interactions with a client accessing from typo
 */
class TypoClient {
    /** Init a new client with all member-related data and bound events */
    constructor(socket, dbWorker, member, workerCache) {
        this.typosocket = socket;
        this.databaseWorker = dbWorker;
        this.workerCache = workerCache;
        this.member = member;
        this.username = member.memberDiscordDetails.UserName;
        this.login = member.memberDiscordDetails.UserLogin;
        // get flags - convert integer to bit
        this.flags = ("00000000" + (member.flags >>> 0).toString(2)).slice(-8).split("")
            .map(f => Number(f)).reverse();
        this.permaBan = this.flags[5] == 1;
        this.patron = this.flags[3] == 1 || this.flags[4] == 1;
        this.dropBan = this.flags[6] == 1;
        if (this.permaBan)
            return;
        // init events 
        this.typosocket.subscribeDisconnect(async (reason) => {
            await threads_1.Thread.terminate(this.databaseWorker);
            console.log("disconnected");
        });
        console.log("logged in");
    }
}
exports.default = TypoClient;
//# sourceMappingURL=typoClient.js.map