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

// import libs and local modules
import { IthilSocketioServer } from './socketioServer';
import Balancer from './balancer';
import PalantirDatabase from './database/palantirDatabase';
import {IthilIPCServer} from './ipc';
import DataObserver from './dataObserver';
import StatDb from "./database/statDatabase";
const config = require("../ecosystem.config").config;

/**
 * Palantir main database connection
 */
const palantirDb = new PalantirDatabase(config.palantirDbPath);

/** 
 * Statistics database for logging user count 
 */
const statDb = new StatDb(config.statDbPath);

/**
 * Ithil workers load balancer
 */
const balancer = new Balancer(config);

/**
 * Ithil IPC coordination server
 */
 const ipcServer = new IthilIPCServer(config.mainIpcID);

/**
 * Data observer that broadcasts shared data to all workers os they dont have to fetch from the db
 */
 const dataObserver = new DataObserver(palantirDb);
dataObserver.observe();

// add callbacks to ipc balancer events
ipcServer.workerConnected = (data, socket) => {
    balancer.addWorker(data.port, socket);
    ipcServer.broadcastActiveLobbies({activeLobbies: dataObserver.activeLobbies});
    ipcServer.broadcastPublicData({publicData: dataObserver.publicData});
}

ipcServer.workerDisconnected = (socket, socketID) => {
    balancer.updateOnlineWorker();
    console.log("Worker disconnected: ", socketID)
}

ipcServer.balanceChanged = (data, socket) => {
    if(data.port && data.clients) balancer.updateClients(data.port, data.clients);
    console.log(balancer.currentBalancing());
}

// add callbacks to data observer events
dataObserver.activeLobbiesChanged = (lobbies) => {
    ipcServer.broadcastActiveLobbies({activeLobbies: lobbies});
}

dataObserver.publicDataChanged = (data) => {
    ipcServer.broadcastPublicData({publicData: data});
}

/**
 * The balancer socketio server
 */
const mainSocketServer = new IthilSocketioServer(config.mainPort, config.certificatePath).server;

// listen for socket connection events
mainSocketServer.on("connection", socket =>{

    // create listener for port request
    socket.on("request port", async data => {

        // find and respond the least busy port, log client and close socket
        const port = (await balancer.getBalancedWorker()).port;
        statDb.updateClientContact(data.client);
        socket.emit("balanced port", {port: port});
        socket.disconnect();

        console.log("Sent client to port " + port);
    });
});

console.log("all done");