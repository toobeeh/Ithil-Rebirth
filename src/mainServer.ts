/*
 * Ithil Main Server
 * - public socketio server to redirect to Ithil Worker servers
 *   redirect port depending on load balance
 * - internal ipc server to coordinate Ithil Workers
 *   manages public data, lobbies & load balance
 */

// import libs and local modules
import mainHTTPS from 'https';
import fs from 'fs';
import cors from 'cors';
import ipc from 'node-ipc';
import portscanner from "portscanner";
import {Server as SocketServer} from "socket.io";
import {IthilIPCServer} from './ipc';
import PalantirDatabase from './database/palantirDatabase';
import palantirDb from "./database/statDatabase";
import StatDb from "./database/statDatabase";
import * as types from "./database/types";
const mainExpress = require('express')();
const config = require("../ecosystem.config").config;

/**
 * Palantir main database connection
 */
const palantirDB = new PalantirDatabase(config.palantirDbPath);

/**
 * Static balancer class to balance load equally between worker servers
 */
class Balancer {
    static workers: Array<{port:number, socket:any, clients: number}> = [];
    static queue: Array<Function> = [];
    
    /**
     * Add a worker
     */
    static addWorker(port:number, socket: any){
        // add worker to list
        this.workers.push({ port: port, socket: socket, clients: 0 });
        // resolve queues if present
        if (this.workers.length >= config.minAvailableWorker) { 
            this.queue.forEach(resolve => resolve()); 
            this.queue = [] 
        };
        console.log("New Ithil Worker online on port " + port);
    }

    
    /**
     * Remove a worker
     */
    static removeWorker(port: number) {
        // remove worker
        this.workers.splice(this.workers.findIndex(worker => worker.port == port), 1); 
        console.log("Ithil Worker disconnected on port " + port);
    }
    
    /**
     * Refresh list of online workers, necessary if a worker crashes
     */
    static updateOnlineWorker() {
        return [...this.workers].forEach(
            worker => portscanner.checkPortStatus(worker.port, "127.0.0.1", (error, status) =>
                status == "closed" ? this.removeWorker(worker.port) : 1));
    }

    /**
     * Update the client count of a worker
     */
    static updateClients(port: number, clients: number) {
        let worker = this.workers.find(worker => worker.port == port);
        if (worker) worker.clients = clients;
    } 

    /**
     * Get the least busy worker of all
     */
    static async getBalancedWorker() {
         // wait until minimum of workers are online
        await new Promise((resolve, reject) => {
            if (this.workers.length < config.minAvailableWorker) this.queue.push(resolve);
            else resolve(true);
        });

        // return worker with fewest clients
        return this.workers.sort((a, b) => a.clients - b.clients)[0]; 
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

/**
 * Ithil IPC coordination server
 */
const ipcServer = new IthilIPCServer("main");
ipcServer.workerConnect = (data, socket) => {
    Balancer.addWorker(data.port, socket);
}
ipcServer.workerDisconnect = (data, socket) => {
    Balancer.removeWorker(data.port);
}
ipcServer.updateBalance = (data, socket) => {
    if(data.port && data.clients) Balancer.updateClients(data.port, data.clients);
    console.log(Balancer.currentBalancing());
}