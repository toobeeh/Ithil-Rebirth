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
import https from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import {Server as SocketioServer} from "socket.io";
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

// Start the https server with cors on main port
const mainExpress = express();
mainExpress.use(cors());
const mainServer = https.createServer({
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, mainExpress);
mainServer.listen(config.mainPort);

/**
 * The balancer socketio server
 */
const masterSocketServer = new SocketioServer(
    mainServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    },
    pingTimeout: 20000
});

// listen for socket connection events
masterSocketServer.on("connection", socket =>{

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