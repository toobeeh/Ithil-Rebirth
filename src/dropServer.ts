/*
 * # Ithil Drop Server

 * ## Tasks
 * The drop server's only task is to emit drops as fast as possible to all clients and process the claims
 * To keep overhead and background tasks minimal, a websocket server instead of a socketio server is used
 * 
 * ## Implementation
 * - start the websocket server
 * - listen for new drop from ipc
 * - ONLY send drop to all clients, processing is done via typo clients & main server!
 */

// import libs and local modules
import * as ithilSocketServer from './ithilSocketServer';
import { IthilIPCClient } from './ipc';

const config = require("../ecosystem.config").config;

/** Minimal websocket server using cors and https */
const wsServer = new ithilSocketServer.IthilWebsocketServer(config.dropPort, config.certificatePath);

/** IPC Client to listen for new drops */
const ipcClient = new IthilIPCClient("dropserver");

// listen for drops and dispatch them to the clients
ipcClient.onNextDropReceived = async data => {
    const msgTemplate = data.dropID + ":" + data.eventDropID + ":";
    let claimTicket = 0;
    const dispatches: Array<{delay: number, claimTicket: number}> = [];
    const dispatchTimestamp = Date.now();

    console.log("Dispatching drop..");
    wsServer.server.clients.forEach(client => {
        client.send(msgTemplate + (++claimTicket));
        dispatches.push({claimTicket: claimTicket, delay: Date.now() - dispatchTimestamp});
    });

    ipcClient.sendDispatchedDropData?.({
        dispatchDelays: dispatches,
        dispatchTimestamp: dispatchTimestamp
    });
}