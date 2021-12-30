"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
const ithilSocket = __importStar(require("./socketioServer"));
/**
 * Manage dataflow and interactions with a client accessing from typo
 */
class TypoClient {
    /** Init a new client with all member-related data and bound events */
    constructor(socket, dbWorker, member, workerCache) {
        this.socket = socket;
        this.databaseWorker = dbWorker;
        this.workerCache = workerCache;
        this.member = member;
        this.username = member.memberDiscordDetails.UserName;
        this.login = member.memberDiscordDetails.UserLogin;
        // get flags - convert integer to bit array
        this.flags = ("00000000" + (member.flags >>> 0).toString(2)).slice(-8).split("")
            .map(f => Number(f)).reverse();
        this.permaBan = this.flags[5] == 1;
        this.patron = this.flags[3] == 1 || this.flags[4] == 1;
        this.dropBan = this.flags[6] == 1;
        if (this.permaBan)
            return;
        // init events 
        this.socket.on("disconnect", () => {
            threads_1.Thread.terminate(this.databaseWorker);
        });
        // send login response
        const responseEventdata = {
            authenticated: true,
            user: this.member,
            // filter the user's connected guilds
            activeLobbies: this.workerCache.activeLobbies.filter(guild => this.member.memberDiscordDetails.Guilds.some(connectedGuild => connectedGuild.GuildID == guild.guildID))
        };
        this.socket.emit(ithilSocket.eventNames.activeLobbies, responseEventdata);
    }
}
exports.default = TypoClient;
