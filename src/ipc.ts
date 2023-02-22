import { IPC } from 'node-ipc';
import * as types from "./database/types";

// extract the type of an ipc client... yeah, ugly hack
let ipcAbused = new IPC().of[""];
export type IpcClient = typeof ipcAbused;

export const ipcEvents = Object.freeze({
    workerConnect: "workerConnect",
    workerDisconnect: "socket.disconnected",
    updateBalance: "updatePortBalance",
    publicData: "publicData",
    activeLobbies: "activeLobbies",
    nextDrop: "nextDrop",
    dropDispatched: "dropDispatched",
    dropClaim: "dropClaim",
    clearDrop: "clearDrop",
    rankDrop: "rankDrop",
    lobbyReport: "lobbyReport",
    statusReport: "statusReport"
});

export interface workerConnectEventdata {
    port: number;
}

export interface updatePortBalanceEventdata {
    clients: number;
    port: number;
}

export interface publicDataEventdata {
    publicData: types.publicData;
}

export interface activeLobbiesEventdata {
    activeLobbies: Array<types.activeGuildLobbies>;
}

export interface nextDropEventdata {
    dropID: string;
    eventDropID: string;
}

export interface dispatchedDropEventdata {
    dispatchTimestamp: number;
    dispatchDelays: Array<{ claimTicket: number, delay: number }>;
}

export interface dropClaimEventdata {
    dropID: string;
    login: string;
    username: string;
    userID: string;
    lobbyKey: string;
    claimTimestamp: number;
    claimTicket: number;
    claimVerifyDelay: number;
    workerEventloopLatency: number;
    workerPort: number;
    workerMasterDelay: number;
}

export interface lobbyReportEventdata {
    lobbies: types.guildLobby[],
    session: string
}

export interface lobbyStatusEventdata {
    status: types.playerStatus;
    session: string
}

export interface clearDropEventdata {
    dropID: string;
    caughtPlayer: string;
    caughtLobbyKey: string;
    claimTicket: number;
    leagueWeight: number;
}

export interface rankDropEventdata {
    dropID: string;
    ranks: Array<string>;
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
     * @param data {@link workerConnectEventdata}
     * @param socket The worker's ipc socket
     */
    onWorkerConnected?: (data: workerConnectEventdata, socket: IpcClient) => void;

    /**
     * Callback when the IPC connection to a worker crashes, most likely due to a crash on the worker
     * @param socketID The disconnected socket's ID
     * @param socket The dsiconnected worker's ipc socket
     */
    onWorkerDisconnected?: (socket: IpcClient, socketID: string) => void;

    /**
     * Callback when a worker's load is changed
     * @param data {@link updatePortBalanceEventdata}
     * @param socket The worker's ipc socket
     */
    onBalanceChanged?: (data: updatePortBalanceEventdata, socket: IpcClient) => void;

    /**
     * Callback when a drop was dispatched by the drop server
     * @param data {@link dispatchedDropEventdata}
     * @param socket The worker's ipc socket
     */
    onDropDispatched?: (data: dispatchedDropEventdata, socket: IpcClient) => void;

    /**
     * Callback when a drop was claimed by a client on a worker server
     * @param data {@link dropClaimedEventdata}
     * @param socket The worker's ipc socket
     */
    onDropClaim?: (data: dropClaimEventdata, socket: IpcClient) => void;

    /**
     * Callback when a client reports to its connected servers
     * @param data {@link lobbyReportEventdata}
     * @param socket The worker's ipc socket
     */
    onLobbyReport?: (data: lobbyReportEventdata, socket: IpcClient) => void;

    /**
     * Callback when a client reports its current status
     * @param data {@link lobbyStatusEventdata}
     * @param socket The worker's ipc socket
     */
    onStatusReport?: (data: lobbyStatusEventdata, socket: IpcClient) => void;

    /**
     * Broadcast public data to all connected workers
     * @param data The public data object {@link publicDataEventdata}
     */
    broadcastPublicData: (data: publicDataEventdata) => void;

    /**
     * Broadcast active lobbies to all connected workers
     * @param data The active lobbies array {@link activeLobbiesEventdata}
     */
    broadcastActiveLobbies: (data: activeLobbiesEventdata) => void;

    /**
     * Broadcast next drop
     * @param data The next drop properties {@link nextDropEventdata}
     */
    broadcastNextDrop: (data: nextDropEventdata) => void;

    /**
     * Broadcast clear drop
     * @param data Drop result data {@link clearDropEventdata}
     */
    broadcastClearDrop: (data: clearDropEventdata) => void;

    /**
     * Broadcast rank drop
     * @param data Drop rank data {@link rankDropEventdata}
     */
    broadcastRankDrop: (data: rankDropEventdata) => void;


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
                    if (this.onWorkerDisconnected) this.onWorkerDisconnected(socket, socketID);
                }, 100);
            });

            // listen to predefined events and make callbacks easy to set
            this.on(ipcEvents.workerConnect, (data: workerConnectEventdata, socket: IpcClient) => {
                if (this.onWorkerConnected) this.onWorkerConnected(data, socket);
            });

            this.on(ipcEvents.updateBalance, (data: updatePortBalanceEventdata, socket: IpcClient) => {
                if (this.onBalanceChanged) this.onBalanceChanged(data, socket);
            });

            this.on(ipcEvents.dropDispatched, (data: dispatchedDropEventdata, socket: IpcClient) => {
                if (this.onDropDispatched) this.onDropDispatched(data, socket);
            });

            this.on(ipcEvents.dropClaim, (data: dropClaimEventdata, socket: IpcClient) => {
                if (this.onDropClaim) this.onDropClaim(data, socket);
            });

            this.on(ipcEvents.statusReport, (data: lobbyStatusEventdata, socket: IpcClient) => {
                if (this.onStatusReport) this.onStatusReport(data, socket);
            });

            this.on(ipcEvents.lobbyReport, (data: lobbyReportEventdata, socket: IpcClient) => {
                if (this.onLobbyReport) this.onLobbyReport(data, socket);
            });
        });
        this.ipc.server.start();

        // init predefined broadcast functions
        this.broadcastPublicData = (data) => this.broadcast(ipcEvents.publicData, data);
        this.broadcastActiveLobbies = (data) => this.broadcast(ipcEvents.activeLobbies, data);
        this.broadcastNextDrop = (data) => this.broadcast(ipcEvents.nextDrop, data);
        this.broadcastClearDrop = (data) => this.broadcast(ipcEvents.clearDrop, data);
        this.broadcastRankDrop = (data) => this.broadcast(ipcEvents.rankDrop, data);
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
    updatePortBalance?: (data: updatePortBalanceEventdata) => void;

    /**
     * Emit an event to the main server containing data about an dispatched drop. 
     * @param data Event data containing the dispatch data
     */
    sendDispatchedDropData?: (data: dispatchedDropEventdata) => void;

    /**
     * Emit an event to the main server containing the clients current status. 
     * @param data Event data containing the dispatch data
     */
    sendLobbyStatus?: (data: lobbyStatusEventdata) => void;

    /**
     * Emit an event to the main server containingthe clients latest lobby reports. 
     * @param data Event data containing the dispatch data
     */
    sendLobbyReport?: (data: lobbyReportEventdata) => void;

    /**
     * Emit an event to the main server containing a drop claim request.
     * @param data Event data containing the dro pclaim
     */
    claimDrop?: (data: dropClaimEventdata) => void;

    /**
     * Callback when new active lobbies data is received from the ipc socket
     * @param data {@link EventdataInterfaces.activeLobbiesEventdata}
     */
    onActiveLobbiesChanged?: (data: activeLobbiesEventdata) => void;

    /**
     * Callback when new public data is received from the ipc socket
     * @param data {@link EventdataInterfaces.publicDataEventdata}
     */
    onPublicDataChanged?: (data: publicDataEventdata) => void;

    /**
     * Callback when the server has a new drop ready to dispatch
     * @param data {@link EventdataInterfaces.nextDropEventdata}
     */
    onNextDropReceived?: (data: nextDropEventdata) => void;

    /**
     * Callback when the server clears a drop
     * @param data {@link EventdataInterfaces.clearDropEventdata}
     */
    onDropClear?: (data: clearDropEventdata) => void;

    /**
     * Callback when the server ranks a drop
     * @param data {@link EventdataInterfaces.rankDropEventdata}
     */
    onDropRank?: (data: rankDropEventdata) => void;

    /**
     * Create a new ithil client ipc socket
     * @param id The ID of the ipc socket
     */
    constructor(id: string) {
        super(id);
        this.server = null;
    }

    /**
     * Connects this socket to the ipc main server
     * @param serverID The ID of the ipc server to connect
     * @param workerPort The socketio port of this worker
     * @returns A promise that resolves as soon as the ipc socket is connected
     */
    async connect(serverID: string, workerPort: number = -1) {
        return new Promise<void>((resolve, reject) => {
            setTimeout(() => reject(), 15000);

            // connect to server
            this.ipc.connectTo(serverID, () => {
                this.server = this.ipc.of[serverID];

                // if client has a port, say hello and tell server which port is in use
                if(workerPort >= 0){
                    const eventdata: workerConnectEventdata = { port: workerPort };
                    this.emit(ipcEvents.workerConnect, eventdata);
                }

                // init predefined emits
                this.updatePortBalance = (data) => this.emit(ipcEvents.updateBalance, data);
                this.sendDispatchedDropData = (data) => this.emit(ipcEvents.dropDispatched, data);
                this.claimDrop = (data) => this.emit(ipcEvents.dropClaim, data);
                this.sendLobbyReport = data => this.emit(ipcEvents.lobbyReport, data);
                this.sendLobbyStatus = data => this.emit(ipcEvents.statusReport, data);

                // init predefined events
                this.on(ipcEvents.activeLobbies, (data, socket) => {
                    this.onActiveLobbiesChanged?.(data);
                });

                this.on(ipcEvents.publicData, (data, socket) => {
                    this.onPublicDataChanged?.(data);
                });

                this.on(ipcEvents.nextDrop, (data, socket) => {
                    this.onNextDropReceived?.(data);
                });

                this.on(ipcEvents.clearDrop, (data, socket) => {
                    this.onDropClear?.(data);
                });

                this.on(ipcEvents.rankDrop, (data, socket) => {
                    this.onDropRank?.(data);
                });

                resolve();
            });
        });
    }

    /**
     * Emits an event to the ipc main server
     * @param event The event name
     * @param data The event data
     */
    emit(event: string, data: any) {
        if (this.server) {
            this.server.emit(event, data);
        }
        else throw new Error("IPC client is not connected to any server.");
    }

    /**
     * Listens for an event from the ipc main server
     * @param event The event name
     * @param callback The event callback, arguments being the received event data and the event source socket
     */
    on(event: string, callback: (data: any, socket: IpcClient) => void) {
        if (this.server) {
            this.server.on(event, callback);
        }
        else throw new Error("IPC client is not connected to any server.");
    }
}