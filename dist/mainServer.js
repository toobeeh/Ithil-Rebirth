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
const ithilSocketServer_1 = require("./ithilSocketServer");
const balancer_1 = __importDefault(require("./balancer"));
const drops_1 = __importDefault(require("./drops"));
const ipc_1 = require("./ipc");
const dataObserver_1 = __importDefault(require("./dataObserver"));
const statDatabase_1 = __importDefault(require("./database/statDatabase"));
const palantirDatabase_1 = __importDefault(require("./database/palantirDatabase"));
const threads_1 = require("threads");
const config = require("../ecosystem.config").config;
// async setup
async function setup() {
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
    ipcServer.onWorkerConnected = (data, socket) => {
        balancer.addWorker(data.port, socket);
        ipcServer.broadcastActiveLobbies({ activeLobbies: dataObserver.activeLobbies });
        ipcServer.broadcastPublicData({ publicData: dataObserver.publicData });
    };
    ipcServer.onWorkerDisconnected = (socket, socketID) => {
        balancer.updateOnlineWorker();
        console.log("Worker disconnected: ", socketID);
    };
    ipcServer.onBalanceChanged = (data, socket) => {
        balancer.updateClients(data.port, data.clients);
        console.log(balancer.currentBalancing());
    };
    ipcServer.onLobbyReport = (data, socket) => {
        dataObserver.clientLobbyReports.set(data.session, data.lobbies);
    };
    ipcServer.onStatusReport = (data, socket) => {
        dataObserver.clientPlayerStatuses.set(data.session, data.status);
    };
    // add callbacks to data observer events
    dataObserver.onActiveLobbiesChanged = (lobbies) => {
        ipcServer.broadcastActiveLobbies({ activeLobbies: lobbies });
    };
    dataObserver.onPublicDataChanged = (data) => {
        ipcServer.broadcastPublicData({ publicData: data });
    };
    /**
     * The balancer socketio server
     */
    const mainSocketServer = new ithilSocketServer_1.IthilSocketioServer(config.mainPort, config.certificatePath).server;
    // listen for socket connection events
    mainSocketServer.on("connection", socket => {
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
    // start drops
    const dropDbWorker = await (0, threads_1.spawn)(new threads_1.Worker("./database/palantirDatabaseWorker"));
    await dropDbWorker.init(config.palantirDbPath);
    /** Drop handler that conatisn all drop logic and handling */
    const dropHandler = new drops_1.default(dropDbWorker, ipcServer); // lgtm [js/unused-local-variable]
    console.log("all done");
}
setup();
//# sourceMappingURL=mainServer.js.map