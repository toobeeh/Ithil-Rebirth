"use strict";
/*
 * # Ithil Main Server
 *
 * ## Tasks
 * The main server is focussed on internal organisation, not external socketio clients:
 * - coordinate worker servers
 * - balance worker servers load by forwarding clients
 * - observe palantir data and distribute to workers
 *
 * ## Implementation
 * - Palantir/Stat db object for database access
 * - Balancer object to track conected workers and their load
 * - IPC server to communicate with workers
 * - Socketio SSL server to forward clients to a worker's port
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// import libs and local modules
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
const balancer_1 = __importDefault(require("./balancer"));
const palantirDatabase_1 = __importDefault(require("./database/palantirDatabase"));
const ipc_1 = require("./ipc");
const dataObserver_1 = __importDefault(require("./dataObserver"));
const statDatabase_1 = __importDefault(require("./database/statDatabase"));
const config = require("../ecosystem.config").config;
/**
 * Palantir main database connection
 */
const palantirDb = new palantirDatabase_1.default(config.palantirDbPath);
/**
 * Statistics database for logging user count
 */
const statDb = new statDatabase_1.default(config.statDbPath);
/**
 * Ithil workers load balancer
 */
const balancer = new balancer_1.default(config);
/**
 * Ithil IPC coordination server
 */
const ipcServer = new ipc_1.IthilIPCServer(config.mainIpcID);
/**
 * Data observer that broadcasts shared data to all workers os they dont have to fetch from the db
 */
const dataObserver = new dataObserver_1.default(palantirDb);
dataObserver.observe();
// add callbacks to ipc balancer events
ipcServer.workerConnected = (data, socket) => {
    balancer.addWorker(data.port, socket);
    ipcServer.broadcastActiveLobbies({ activeLobbies: dataObserver.activeLobbies });
    ipcServer.broadcastPublicData({ publicData: dataObserver.publicData });
};
ipcServer.workerDisconnected = (socket, socketID) => {
    balancer.updateOnlineWorker();
    console.log("Worker disconnected: ", socketID);
};
ipcServer.balanceChanged = (data, socket) => {
    if (data.port && data.clients)
        balancer.updateClients(data.port, data.clients);
    console.log(balancer.currentBalancing());
};
// add callbacks to data observer events
dataObserver.activeLobbiesChanged = (lobbies) => {
    ipcServer.broadcastActiveLobbies({ activeLobbies: lobbies });
};
dataObserver.publicDataChanged = (data) => {
    ipcServer.broadcastPublicData({ publicData: data });
};
// Start the https server with cors on main port
const mainExpress = (0, express_1.default)();
mainExpress.use((0, cors_1.default)());
const mainServer = https_1.default.createServer({
    key: fs_1.default.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs_1.default.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs_1.default.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, mainExpress);
mainServer.listen(config.mainPort);
/**
 * The balancer socketio server
 */
const masterSocketServer = new socket_io_1.Server(mainServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    },
    pingTimeout: 20000
});
// listen for socket connection events
masterSocketServer.on("connection", socket => {
    // create listener for port request
    socket.on("request port", async (data) => {
        // find and respond the least busy port, log client and close socket
        const port = (await balancer.getBalancedWorker()).port;
        statDb.updateClientContact(data.client);
        socket.emit("balanced port", { port: port });
        socket.disconnect();
        console.log("Sent client to port " + port);
    });
});
console.log("all done");
