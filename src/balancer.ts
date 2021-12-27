import portscanner from "portscanner";

/**
 * Describes important details of a connected worker
 */
interface worker {
    /**
     * The worker's socketio port
     */
    port: number,

    /**
     * The worker's connected IPC socket
     */
    socket: any,

    /**
     * The worker's amount of currently connected clients
     */
    clients: number
}

/**
 * Balancer object to balance load equally between worker servers
 */
 export default class Balancer {
    workers: Array<worker>;
    queue: Array<Function>;
    config: any;

    constructor(config: any){
        this.workers = [];
        this.queue = [];
        this.config = config;
    }
    
    /**
     * Add a worker
     * @param port The worker's socketio port
     * @param socket The worker's IPC socket
     */
    addWorker(port:number, socket: any){
        // add worker to list
        this.workers.push({ port: port, socket: socket, clients: 0 });
        // resolve queues if present
        if (this.workers.length >= this.config.minAvailableWorker) { 
            this.queue.forEach(resolve => resolve()); 
            this.queue = [] 
        };
        console.log("New Ithil Worker online on port " + port);
    }

    
    /**
     * Remove a worker
     * @param port The worker's  socketio port
     */
    removeWorker(port: number) {
        // remove worker
        this.workers.splice(this.workers.findIndex(worker => worker.port == port), 1); 
        console.log("Ithil Worker disconnected on port " + port);
    }
    
    /**
     * Refresh list of online workers, necessary if a worker crashes
     */
    updateOnlineWorker() {
        [...this.workers].forEach(
            worker => portscanner.checkPortStatus(worker.port, "127.0.0.1", (error, status) =>
                status == "closed" ? this.removeWorker(worker.port) : 1));
    }

    /**
     * Update the client count of a worker
     * @param port The port of the worker to update
     * @param clients The amount of clients the worker currently is conencted to
     */
    updateClients(port: number, clients: number) {
        let worker = this.workers.find(worker => worker.port == port);
        if (worker) worker.clients = clients;
    } 

    /**
     * Get the least busy worker of all
     * @returns A worker object which is the least busy of all
     */
    async getBalancedWorker() {
         // wait until minimum of workers are online
        await new Promise((resolve, reject) => {
            if (this.workers.length < this.config.minAvailableWorker) this.queue.push(resolve);
            else resolve(true);
        });

        // return worker with fewest clients
        return this.workers.sort((a, b) => a.clients - b.clients)[0]; 
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
