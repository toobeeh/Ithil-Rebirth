"use strict";
/*
 * Ithil Main Server
 * - public socketio server to redirect to Ithil Worker servers
 *   redirect port depending on load balance
 * - internal ipc server to coordinate Ithil Workers
 *   manages public data, lobbies & load balance
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const portscanner_1 = __importDefault(require("portscanner"));
const ipc_1 = require("./ipc");
const palantirDatabase_1 = __importDefault(require("./database/palantirDatabase"));
const mainExpress = require('express')();
const config = require("../ecosystem.config").config;
/**
 * Palantir main database connection
 */
const palantirDB = new palantirDatabase_1.default(config.palantirDbPath);
/**
 * Static balancer class to balance load equally between worker servers
 */
class Balancer {
    /**
     * Add a worker
     */
    static addWorker(port, socket) {
        // add worker to list
        this.workers.push({ port: port, socket: socket, clients: 0 });
        // resolve queues if present
        if (this.workers.length >= config.minAvailableWorker) {
            this.queue.forEach(resolve => resolve());
            this.queue = [];
        }
        ;
        console.log("New Ithil Worker online on port " + port);
    }
    /**
     * Remove a worker
     */
    static removeWorker(port) {
        // remove worker
        this.workers.splice(this.workers.findIndex(worker => worker.port == port), 1);
        console.log("Ithil Worker disconnected on port " + port);
    }
    /**
     * Refresh list of online workers, necessary if a worker crashes
     */
    static updateOnlineWorker() {
        return [...this.workers].forEach(worker => portscanner_1.default.checkPortStatus(worker.port, "127.0.0.1", (error, status) => status == "closed" ? this.removeWorker(worker.port) : 1));
    }
    /**
     * Update the client count of a worker
     */
    static updateClients(port, clients) {
        let worker = this.workers.find(worker => worker.port == port);
        if (worker)
            worker.clients = clients;
    }
    /**
     * Get the least busy worker of all
     */
    static getBalancedWorker() {
        return __awaiter(this, void 0, void 0, function* () {
            // wait until minimum of workers are online
            yield new Promise((resolve, reject) => {
                if (this.workers.length < config.minAvailableWorker)
                    this.queue.push(resolve);
                else
                    resolve(true);
            });
            // return worker with fewest clients
            return this.workers.sort((a, b) => a.clients - b.clients)[0];
        });
    }
    /**
     * Get a string containing current balancing information
     */
    static currentBalancing() {
        return this.workers.reduce((sum, worker) => sum + Number(worker.clients), 0)
            + " clients | "
            + this.workers.map(worker => `${worker.clients}@:${worker.port}`).join(", ");
    }
}
Balancer.workers = [];
Balancer.queue = [];
/**
 * Ithil IPC coordination server
 */
const ipcServer = new ipc_1.IthilIPCServer("main");
ipcServer.workerConnect = (data, socket) => {
    Balancer.addWorker(data.port, socket);
};
ipcServer.workerDisconnect = (data, socket) => {
    Balancer.removeWorker(data.port);
};
ipcServer.updateBalance = (data, socket) => {
    if (data.port && data.clients)
        Balancer.updateClients(data.port, data.clients);
    console.log(Balancer.currentBalancing());
};
