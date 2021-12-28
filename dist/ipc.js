"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IthilIPCClient = exports.IthilIPCServer = void 0;
const node_ipc_1 = require("node-ipc");
const ipcEvents = Object.freeze({
    workerConnect: "workerConnect",
    workerDisconnect: "socket.disconnected",
    updateBalance: "updatePortBalance"
});
/**
 * Abstract IPC class with common config
 * @abstract
 */
class IthilIPC {
    constructor(id) {
        this.ipc = new node_ipc_1.IPC();
        this.ipc.config.id = id;
        this.ipc.config.silent = true;
        this.ipc.config.retry = 1500;
    }
}
/**
 * All IPC events
 */
IthilIPC.events = ipcEvents;
/**
 * The Ithil IPC server that listens for worker events and broadcasts data that is to be shared with the workers
 */
class IthilIPCServer extends IthilIPC {
    /**
     * Create a new ithil worker ipc server
     * @param id The ID of the ipc server
     */
    constructor(id) {
        super(id);
        this.ipc.serve(() => {
            // execute callbacks on evens, if they are set
            this.on(ipcEvents.workerConnect, (data, socket) => {
                if (this.workerConnect)
                    this.workerConnect(data, socket);
            });
            this.on(ipcEvents.workerDisconnect, (data, socket) => {
                // execute with timeout because of reasons i simply forgot
                setTimeout(() => {
                    if (this.workerDisconnect)
                        this.workerDisconnect(data, socket);
                }, 100);
            });
            this.on(ipcEvents.updateBalance, (data, socket) => {
                if (this.updateBalance)
                    this.updateBalance(data, socket);
            });
        });
        this.ipc.server.start();
    }
    /**
     * Broadcast an event to all connected ipc sockets
     * @param event The event name
     * @param data The data object
     */
    broadcast(event, data) {
        this.ipc.server.broadcast(event, data);
    }
    /**
     * Listen for an event
     * @param event The event name
     * @param callback The event callback, arguments being the received event data and the event source socket
     */
    on(event, callback) {
        this.ipc.server.on(event, callback);
    }
}
exports.IthilIPCServer = IthilIPCServer;
/**
 * An Ithil IPC client that listens for server events
 */
class IthilIPCClient extends IthilIPC {
    constructor(id) {
        super(id);
        this.connected = false;
    }
    async connect(id) {
    }
}
exports.IthilIPCClient = IthilIPCClient;
