import { IPC } from 'node-ipc';

const ipcEvents = Object.freeze({
    workerConnect: "workerConnect",
    workerDisconnect: "socket.disconnected",
    updateBalance: "updatePortBalance"
});

/**
 * Abstract IPC class with common config
 * @abstract
 */
abstract class IthilIPC {
    /**
     * The core ipc object
     */
    ipc;
    
    /**
     * All IPC events
     */
    static events = ipcEvents;

    constructor(id: string) {
        this.ipc = new IPC();
        this.ipc.config.id = id;
        this.ipc.config.silent = true;
        this.ipc.config.retry = 1500;
    }
}

/**
 * The Ithil IPC server that listens for worker events and broadcasts data that is to be shared with the workers
 */
export class IthilIPCServer extends IthilIPC {
    /**
     * Callback when a worker is online and ready
     */
    workerConnect?: (data: any, socket: any) => void;

    /**
     * Callback when the IPC connection to a worker crashes, most likely due to a crash on the worker
     */
    workerDisconnect?: (data: any, socket: any) => void;

    /**
     * Callback when a worker's load is changed
     */
    updateBalance?: (data: any, socket: any) => void;


    /**
     * Create a new ithil worker ipc server
     * @param id The ID of the ipc server
     */
    constructor(id: string) {
        super(id);
        this.ipc.serve(() => {
            // execute callbacks on evens, if they are set
            this.on(ipcEvents.workerConnect, (data, socket) => {
                if (this.workerConnect) this.workerConnect(data, socket);
            });

            this.on(ipcEvents.workerDisconnect, (data, socket) => {
                // execute with timeout because of reasons i simply forgot
                setTimeout(() => {
                    if (this.workerDisconnect) this.workerDisconnect(data, socket);
                },100);
            });

            this.on(ipcEvents.updateBalance, (data, socket) => {
                if (this.updateBalance) this.updateBalance(data, socket);
            });
        });
        this.ipc.server.start();
    }

    /**
     * Broadcast an event to all connected ipc sockets
     * @param event The event name
     * @param data The data object
     */
    broadcast(event: string, data: any) {
        this.ipc.server.broadcast(event, data);
    }

    /**
     * Listen for an event 
     * @param event The event name
     * @param callback The event callback, arguments being the received event data and the event source socket
     */
    on(event: string, callback: (data: any, socket: any) => void) {
        this.ipc.server.on(event, callback);
    }
}


/**
 * An Ithil IPC client that listens for server events
 */
export class IthilIPCClient extends IthilIPC {
    connected: boolean = false;

    constructor(id: string) {
        super(id);
    }

    async connect(id: string){
        
    }

}