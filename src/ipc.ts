import {IPC} from 'node-ipc';
import * as types from "./database/types";

// extract the type of an ipc client... yeah, ugly hack
let ipcAbused = new IPC().of[""];
export type IpcClient = typeof ipcAbused;

export const ipcEvents = Object.freeze({
    workerConnect: "workerConnect",
    workerDisconnect: "socket.disconnected",
    updateBalance: "updatePortBalance",
    publicData: "publicData",
    activeLobbies: "activeLobbies"
});

namespace EventdataInterfaces{

    export interface workerConnectEventdata{
        port: number;
    }
    
    export interface updatePortBalanceEventdata{
        clients: number;
        port: number;
    }

    export interface publicDataEventdata {
        publicData: types.publicData;
    }

    export interface activeLobbiesEventdata{
        activeLobbies: Array<types.activeGuildLobbies>;
    }
}


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
    workerConnect?: (data: EventdataInterfaces.workerConnectEventdata, socket: IpcClient) => void;

    /**
     * Callback when the IPC connection to a worker crashes, most likely due to a crash on the worker
     */
    workerDisconnect?: (socket: IpcClient, socketID: string) => void;

    /**
     * Callback when a worker's load is changed
     */
    updateBalance?: (data: EventdataInterfaces.updatePortBalanceEventdata, socket: IpcClient) => void;

    /**
     * Broadcast public data to all connected workers
     * @param data The public data object
     */
    broadcastPublicData: (data:EventdataInterfaces.publicDataEventdata) => void;

    /**
     * Broadcast active lobbies to all connected workers
     * @param data The active lobbies array
     */
    broadcastActiveLobbies: (data:EventdataInterfaces.activeLobbiesEventdata) => void;


    /**
     * Create a new ithil worker ipc server
     * @param id The ID of the ipc server
     */
    constructor(id: string) {
        super(id);
        this.ipc.serve(() => {

            // listen to disconnect event
            this.ipc.server.on(ipcEvents.workerDisconnect, (socket: IpcClient, socketID: string) => {
                
                // execute with timeout because of reasons i simply forgot
                setTimeout(() => {
                    if (this.workerDisconnect) this.workerDisconnect(socket, socketID);
                },100);
            });

            // listen to predefined events and make callbacks easy to set
            this.on(ipcEvents.workerConnect, (data: EventdataInterfaces.workerConnectEventdata, socket: IpcClient) => {
                if (this.workerConnect) this.workerConnect(data, socket);
            });

            this.on(ipcEvents.updateBalance, (data: EventdataInterfaces.updatePortBalanceEventdata, socket: IpcClient) => {
                if (this.updateBalance) this.updateBalance(data, socket);
            });
        });
        this.ipc.server.start();

        // init predefined broadcast functions
        this.broadcastPublicData = (data) => this.broadcast(ipcEvents.publicData, data);

        this.broadcastActiveLobbies = (data) => this.broadcast(ipcEvents.activeLobbies, data);
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
    on(event: string, callback: (data: any, socket: IpcClient) => void) {
        this.ipc.server.on(event, callback);
    }
}


/**
 * An Ithil IPC client that listens for server events and occasionally communicates with it
 */
export class IthilIPCClient extends IthilIPC {
    server: IpcClient | null;

    /**
     * Emit an event to the main server to update load for this port. 
     * Is null when the server isn't connected yet.
     * @param data Event data containing the current client load and worker port
     */
    updatePortBalance?: (data: EventdataInterfaces.updatePortBalanceEventdata) => void;

    /**
     * Create a new ithil client ipc socket
     * @param id The ID of the ipc socket
     */
    constructor(id: string) {
        super(id);
        this.server = null;
    }

    /**
     * Connects thsi socket to the ipc main server
     * @param serverID The ID of the ipc server to connect
     * @param workerPort The socketio port of this worker
     * @returns A promise that resolves as soon as the ipc socket is connected
     */
    async connect(serverID: string, workerPort: number){
        return new Promise<void>((resolve, reject) => {
            setTimeout(()=>reject(), 15000);

            // connect to server
            this.ipc.connectTo(serverID, ()=>{
                this.server = this.ipc.of[serverID];

                // say hello and tell server which port is in use
                const eventdata: EventdataInterfaces.workerConnectEventdata = {port: workerPort};
                this.emit(ipcEvents.workerConnect, eventdata);

                // init predefined emits
                this.updatePortBalance = (data) => this.emit(ipcEvents.updateBalance, data);

                resolve();
            });
        });
    }

    /**
     * Emits an event to the ipc main server
     * @param event The event name
     * @param data The event data
     */
    emit(event: string, data: any){
        if(this.server){
            this.server.emit(event, data);
        }
        else throw new Error("IPC client is not connected to any server.");        
    }

    /**
     * Listens for an event from the ipc main server
     * @param event The event name
     * @param callback The event callback, arguments being the received event data and the event source socket
     */
    on(event: string, callback: (data: any, socket: IpcClient) => void){
        if(this.server){
            this.server.on(event, callback);
        }
        else throw new Error("IPC client is not connected to any server.");        
    }
}