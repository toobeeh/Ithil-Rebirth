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
const ipc_1 = require("./ipc");
const balancer_1 = __importDefault(require("./balancer"));
const palantirDatabase_1 = __importDefault(require("./database/palantirDatabase"));
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
};
ipcServer.workerDisconnect = (data, socket) => {
    balancer.removeWorker(data.port);
};
ipcServer.updateBalance = (data, socket) => {
    if (data.port && data.clients)
        balancer.updateClients(data.port, data.clients);
    console.log(balancer.currentBalancing());
};
