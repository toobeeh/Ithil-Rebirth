"use strict";
/*
 * Ithil Main Server
 * - public socketio server to redirect to Ithil Worker servers
 *   redirect port depending on load balance
 * - internal ipc server to coordinate Ithil Workers
 *   manages public data, lobbies & load balance
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const https_1 = __importDefault(require("https"));
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
const ipcServer = new ipc_1.IthilIPCServer("main");
// add callbacks to balancer events
ipcServer.workerConnect = (data, socket) => {
    balancer.addWorker(data.port, socket);
    // broadcast data
};
ipcServer.workerDisconnect = (data, socket) => {
    balancer.removeWorker(data.port);
};
ipcServer.updateBalance = (data, socket) => {
    if (data.port && data.clients)
        balancer.updateClients(data.port, data.clients);
    console.log(balancer.currentBalancing());
};
/**
 * Data observer that broadcasts shared data to all workers os they dont have to fetch from the db
 */
const dataObserver = new dataObserver_1.default(palantirDb, (event, data) => ipcServer.broadcast(event, data));
dataObserver.observe();
// Start the https server with cors on main port
const mainExpress = (0, express_1.default)();
mainExpress.use((0, cors_1.default)());
const mainServer = https_1.default.createServer({
// key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
// cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
// ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, mainExpress);
mainServer.listen(config.mainPort);
// start socket.io server on the https server
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
    });
});
console.log("all done");
