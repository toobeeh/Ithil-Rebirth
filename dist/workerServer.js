"use strict";
/*
 * # Ithil Worker Server

 * ## Tasks
 * A worker server instance's primary task is to interact and manage external client socket connections.
 * - provide a socketio server
 * - authentificate clients
 * - implement all client features: joining lobbies, writing reports, setting sprites, etc
 * To keep the event loop latency as low as possible, database tasks should run in separate worker/threads.
 *
 * ## Implementation
 * - find a port in the worker range that is unused
 * - start ipc socket and connect to server
 * - start socketio server and wait for clients
 * - create typoclient object for each client
 * - emit data broadcasts to clients
 */
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ithilSocketServer = __importStar(require("./ithilSocketServer"));
const threads_1 = require("threads");
const ipc_1 = require("./ipc");
const typoClient_1 = __importDefault(require("./typoClient"));
const portscanner_1 = __importDefault(require("portscanner"));
const config = require("../ecosystem.config").config;
// disable listener limit - bug in threads.js described here:https://github.com/andywer/threads.js/issues/312
//require('events').EventEmitter.defaultMaxListeners = 0;
let maxRecordedRam = 0;
setInterval(() => {
    let ram = process.memoryUsage();
    let ramRss = Math.round(ram.rss / 1024 / 1024 * 100) / 100;
    let ramHeap = Math.round(ram.heapUsed / 1024 / 1024 * 100) / 100;
    if (maxRecordedRam * 1.05 < ramRss) {
        // memory load is higher than the last recorded value + 5%
        maxRecordedRam = ramRss;
        console.log("RAM: " + ramRss + " MB (Heap: " + ramHeap + " MB)", "INFO");
    }
}, 5000);
// measure eventloop latency
let eventLoopLatency = 0;
setInterval(() => {
    const last = process.hrtime.bigint();
    setImmediate(function () {
        const now = process.hrtime.bigint();
        const delta = Number((now - last) / BigInt(1000));
        eventLoopLatency = delta;
    });
}, 200);
// find a free worker port and proceed startup as soon as found / errored
portscanner_1.default.findAPortNotInUse(config.workerRange[0], config.workerRange[1], "127.0.0.1", async (error, workerPort) => {
    // check if port was found
    if (error) {
        console.log(error);
        process.exit(1);
    }
    /**
     * The worker socketio server
     */
    const workerSocketServer = new ithilSocketServer.IthilSocketioServer(workerPort, config.certificatePath).server;
    /**
     * Database worker to validate incoming member requests
     */
    const databaseWorker = await (0, threads_1.spawn)(new threads_1.Worker("./database/palantirDatabaseWorker"));
    await databaseWorker.init(config.palantirDbPath);
    /**
     * The IPC connection to the main server
     */
    const ipcClient = new ipc_1.IthilIPCClient("worker@" + workerPort);
    await ipcClient.connect(config.mainIpcID, workerPort);
    /** The worker's cache of last received data from the main ipc socket */
    const workerCache = {
        activeLobbies: [],
        publicData: { drops: [], scenes: [], sprites: [], onlineScenes: [], onlineSprites: [], onlineItems: [] }
    };
    // listen to ipc lobbies update event
    ipcClient.onActiveLobbiesChanged = (data) => {
        workerCache.activeLobbies = data.activeLobbies;
        data.activeLobbies.forEach(guild => {
            // build eventdata
            const eventdata = {
                event: ithilSocketServer.eventNames.activeLobbies,
                payload: {
                    activeGuildLobbies: guild
                }
            };
            // volatile emit to all sockets that are a member of this guild and not playing
            workerSocketServer.in("guild" + guild.guildID).except("playing").volatile.emit(ithilSocketServer.eventNames.activeLobbies, eventdata);
        });
    };
    // listen to ipc public data update event
    ipcClient.onPublicDataChanged = (data) => {
        workerCache.publicData = data.publicData;
        console.log(data.publicData.onlineItems.length);
        // build eventdata
        const eventdata = {
            event: ithilSocketServer.eventNames.onlineSprites,
            payload: {
                onlineScenes: data.publicData.onlineScenes,
                onlineSprites: data.publicData.onlineSprites,
                onlineItems: data.publicData.onlineItems
            }
        };
        // volatile emit to all online sockets
        workerSocketServer.volatile.emit(ithilSocketServer.eventNames.onlineSprites, eventdata);
    };
    // listen to ipc drop clear event when someone successfully claimed a drop
    ipcClient.onDropClear = (data) => {
        const dropClearData = {
            event: ithilSocketServer.eventNames.clearDrop,
            payload: {
                dropID: data.dropID,
                claimTicket: data.claimTicket,
                caughtLobbyKey: data.caughtLobbyKey,
                caughtPlayer: data.caughtPlayer,
                leagueWeight: data.leagueWeight
            }
        };
        workerSocketServer.volatile.to("playing").emit(ithilSocketServer.eventNames.clearDrop, dropClearData);
    };
    // listen to ipc drop rank event when a drop raking was generated
    ipcClient.onDropRank = (data) => {
        const dropRankData = {
            event: ithilSocketServer.eventNames.rankDrop,
            payload: {
                dropID: data.dropID,
                ranks: data.ranks
            }
        };
        workerSocketServer.volatile.to("playing").emit(ithilSocketServer.eventNames.rankDrop, dropRankData);
    };
    /**
     * Array of currently connected sockets
     */
    let connectedSockets = [];
    // listen for new socket connections
    workerSocketServer.on("connection", (socket) => {
        // cast socket to enable easier and typesafe event subscribing
        const clientSocket = new ithilSocketServer.TypoSocketioClient(socket);
        // push socket to array and update worker balance
        connectedSockets.push(clientSocket);
        connectedSockets = connectedSockets.filter(clientSocket => clientSocket.socket.connected);
        ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });
        // remove disconnected sockets from array and update balance on disconnect
        clientSocket.subscribeDisconnect(async (reason) => {
            connectedSockets = connectedSockets.filter(clientSocket => clientSocket.socket.connected);
            ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });
        });
        // send public data to newly connected socket
        clientSocket.emitPublicData({ publicData: workerCache.publicData });
        // listen for login event
        clientSocket.subscribeLoginEvent(async (loginData) => {
            // check if login data is valid
            const loginResult = await databaseWorker.getLoginFromAccessToken(loginData.accessToken, true);
            const response = {
                authorized: false,
                activeLobbies: [],
                member: {}
            };
            // if login succeeded, create a typo client and enable further events
            if (loginResult.success) {
                // spawn database workers
                const asyncPalantirDb = await (0, threads_1.spawn)(new threads_1.Worker("./database/palantirDatabaseWorker"));
                const asyncImageDb = await (0, threads_1.spawn)(new threads_1.Worker("./database/imageDatabaseWorker"));
                await asyncPalantirDb.init(config.palantirDbPath);
                await asyncImageDb.init(loginResult.result.login.toString(), config.imageDbParentPath);
                const memberResult = await asyncPalantirDb.getUserByLogin(loginResult.result.login);
                const client = new typoClient_1.default(clientSocket, asyncPalantirDb, asyncImageDb, memberResult.result, workerCache);
                client.claimDropCallback = (eventdata) => {
                    eventdata.workerEventloopLatency = eventLoopLatency;
                    eventdata.workerPort = workerPort;
                    ipcClient.claimDrop?.(eventdata);
                };
                memberResult.result.member.Guilds.forEach(guild => clientSocket.socket.join("guild" + guild.GuildID));
                // fill login response data
                response.authorized = true;
                response.member = memberResult.result;
                response.activeLobbies = workerCache.activeLobbies.filter(guild => memberResult.result.member.Guilds.some(connectedGuild => connectedGuild.GuildID == guild.guildID));
            }
            return response;
        });
    });
    // send ready state to pm2
    setTimeout(() => {
        if (process.send)
            process.send("ready");
        else
            console.log("Failed to send ready state");
    }, 1000);
});
//# sourceMappingURL=workerServer.js.map