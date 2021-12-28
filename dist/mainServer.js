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
const balancer_1 = __importDefault(require("./balancer"));
const palantirDatabase_1 = __importDefault(require("./database/palantirDatabase"));
const ipc_1 = require("./ipc");
const dataObserver_1 = __importDefault(require("./dataObserver"));
const mainExpress = require('express')();
const config = require("../ecosystem.config").config;
/**
 * Palantir main database connection
 */
const palantirDB = new palantirDatabase_1.default(config.palantirDbPath);
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
const dataObserver = new dataObserver_1.default(palantirDB, ipcServer.broadcast);
dataObserver.observe();
