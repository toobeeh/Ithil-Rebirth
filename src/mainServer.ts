/*
 * Ithil Main Server
 * - public socketio server to redirect to Ithil Worker servers
 *   redirect port depending on load balance
 * - internal ipc server to coordinate Ithil Workers
 *   manages public data, lobbies & load balance
 */

// import libs and local modules
import portscanner from "portscanner";
import mainHTTPS from 'https';
import fs from 'fs';
import cors from 'cors';
import {Server as SocketServer} from "socket.io";
import Balancer from './balancer';
import PalantirDatabase from './database/palantirDatabase';
import {IthilIPCServer} from './ipc';
import DataObserver from './dataObserver';
import xxx from "./database/statDatabase";
import StatDb from "./database/statDatabase";
import * as types from "./database/types";
const mainExpress = require('express')();
const config = require("../ecosystem.config").config;

/**
 * Palantir main database connection
 */
const palantirDb = new PalantirDatabase(config.palantirDbPath);

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
const dataObserver = new DataObserver(palantirDb, ipcServer.broadcast);
dataObserver.observe();