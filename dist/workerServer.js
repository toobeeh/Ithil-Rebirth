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
// import libs and local modules
const ithilSocketio = __importStar(require("./socketioServer"));
const ipc_1 = require("./ipc");
const portscanner_1 = __importDefault(require("portscanner"));
const config = require("../ecosystem.config").config;
//const database = await spawn<palantirDatabaseWorker>("./database/palantirDatabaseWorker");
// find a free worker port and proceed startup as soon as found / errored
portscanner_1.default.findAPortNotInUse(config.workerRange[0], config.workerRange[1], "127.0.0.1", async (error, port) => {
    // check if port was found
    if (error) {
        console.log(error);
        process.exit(1);
    }
    const workerPort = port;
    /**
     * The worker socketio server
     */
    const workerSocketServer = new ithilSocketio.IthilSocketioServer(workerPort, config.certificatePath).server;
    /**
     * The IPC connection to the main server
     */
    const ipcClient = new ipc_1.IthilIPCClient("worker@" + port);
    await ipcClient.connect(config.mainIpcID, port);
    const palantirData = {
        activeLobbies: [],
        publicData: {}
    };
    // listen to ipc events
    ipcClient.onActiveLobbiesChanged = (data) => {
        palantirData.activeLobbies = data.activeLobbies;
        data.activeLobbies.forEach(guild => {
            // build eventdata
            const eventdata = {
                activeLobbies: guild
            };
            // volatile emit to all sockets that are a member of this guild
            workerSocketServer.to("guild" + guild.guildID).volatile.emit(ithilSocketio.eventNames.activeLobbies, eventdata);
        });
    };
    ipcClient.onPublicDataChanged = (data) => {
        palantirData.publicData = data.publicData;
        // build eventdata
        const eventdata = {
            onlineScenes: data.publicData.onlineScenes,
            onlineSprites: data.publicData.onlineSprites
        };
        // volatile emit to all online sockets
        workerSocketServer.volatile.emit(ithilSocketio.eventNames.onlineSprites, eventdata);
    };
    // init socketio client connection
    workerSocketServer.on("connection", (socket) => {
        console.log(socket);
    });
    // send ready state to pm2
    setTimeout(() => {
        if (process.send)
            process.send("ready");
        else
            console.log("Failed to send ready state");
    }, 1000);
});
