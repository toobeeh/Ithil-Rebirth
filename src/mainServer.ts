/*
 * Ithil Main Server
 * - public socketio server to redirect to Ithil Worker servers
 *   redirect port depending on load balance
 * - internal ipc server to coordinate Ithil Workers
 *   manages public data, lobbies & load balance
 */

// import libs and local modules
import portscanner from "portscanner";
import mainHttps from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import {Server as SocketioServer} from "socket.io";
import Balancer from './balancer';
import PalantirDatabase from './database/palantirDatabase';
import {IthilIPCServer} from './ipc';
import DataObserver from './dataObserver';
import xxx from "./database/statDatabase";
import StatDb from "./database/statDatabase";
import * as types from "./database/types";
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
const ipcServer = new IthilIPCServer("main");

// add callbacks to balancer events
ipcServer.workerConnect = (data, socket) => {
    balancer.addWorker(data.port, socket);
    // broadcast data
}
ipcServer.workerDisconnect = (data, socket) => {
    balancer.removeWorker(data.port);
}
ipcServer.updateBalance = (data, socket) => {
    if(data.port && data.clients) balancer.updateClients(data.port, data.clients);
    console.log(balancer.currentBalancing());
}

/**
 * Data observer that broadcasts shared data to all workers os they dont have to fetch from the db
 */
const dataObserver = new DataObserver(
    palantirDb, 
    (event, data) => ipcServer.broadcast(event, data)
);
dataObserver.observe();

// Start the https server with cors on main port
const mainExpress = express();
mainExpress.use(cors());
const mainServer = mainHttps.createServer({
    key: fs.readFileSync(config.certificatePath + '/privkey.pem', 'utf8'),
    cert: fs.readFileSync(config.certificatePath + '/cert.pem', 'utf8'),
    ca: fs.readFileSync(config.certificatePath + '/chain.pem', 'utf8')
}, mainExpress);
mainServer.listen(config.mainPort);

// start socket.io server on the https server
const masterSocketServer = new SocketioServer(mainServer, {
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
    });
});

console.log("all done");