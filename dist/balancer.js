"use strict";
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
/**
 * Balancer object to balance load equally between worker servers
 */
class Balancer {
    constructor(config) {
        this.workers = [];
        this.queue = [];
        this.config = config;
    }
    /**
     * Add a worker
     * @param port The worker's socketio port
     * @param socket The worker's IPC socket
     */
    addWorker(port, socket) {
        // add worker to list
        this.workers.push({ port: port, socket: socket, clients: 0 });
        // resolve queues if present
        if (this.workers.length >= this.config.minAvailableWorker) {
            this.queue.forEach(resolve => resolve());
            this.queue = [];
        }
        ;
        console.log("New Ithil Worker online on port " + port);
    }
    /**
     * Remove a worker
     * @param port The worker's  socketio port
     */
    removeWorker(port) {
        // remove worker
        this.workers.splice(this.workers.findIndex(worker => worker.port == port), 1);
        console.log("Ithil Worker disconnected on port " + port);
    }
    /**
     * Refresh list of online workers, necessary if a worker crashes
     */
    updateOnlineWorker() {
        [...this.workers].forEach(worker => portscanner_1.default.checkPortStatus(worker.port, "127.0.0.1", (error, status) => status == "closed" ? this.removeWorker(worker.port) : 1));
    }
    /**
     * Update the client count of a worker
     * @param port The port of the worker to update
     * @param clients The amount of clients the worker currently is conencted to
     */
    updateClients(port, clients) {
        let worker = this.workers.find(worker => worker.port == port);
        if (worker)
            worker.clients = clients;
    }
    /**
     * Get the least busy worker of all
     * @returns A worker object which is the least busy of all
     */
    getBalancedWorker() {
        return __awaiter(this, void 0, void 0, function* () {
            // wait until minimum of workers are online
            yield new Promise((resolve, reject) => {
                if (this.workers.length < this.config.minAvailableWorker)
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
     * @returns A string containing the balancing
     */
    currentBalancing() {
        return this.workers.reduce((sum, worker) => sum + Number(worker.clients), 0)
            + " clients | "
            + this.workers.map(worker => `${worker.clients}@:${worker.port}`).join(", ");
    }
}
exports.default = Balancer;
