"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
// import libs and local modules
const ithilSocketServer = __importStar(require("./ithilSocketServer"));
const ipc_1 = require("./ipc");
const config = require("../ecosystem.config").config;
/** Minimal websocket server using cors and https */
const wsServer = new ithilSocketServer.IthilWebsocketServer(config.dropPort, config.certificatePath);
/** IPC Client to listen for new drops */
const ipcClient = new ipc_1.IthilIPCClient("dropserver");
ipcClient.connect(config.mainIpcID);
// listen for drops and dispatch them to the clients
ipcClient.onNextDropReceived = async (data) => {
    const msgTemplate = data.dropID + ":" + data.eventDropID + ":";
    let claimTicket = 0;
    const dispatches = [];
    const dispatchTimestamp = Date.now();
    console.log("Dispatching drop..");
    wsServer.server.clients.forEach(client => {
        client.send(msgTemplate + (++claimTicket));
        dispatches.push({ claimTicket: claimTicket, delay: Date.now() - dispatchTimestamp });
    });
    ipcClient.sendDispatchedDropData?.({
        dispatchDelays: dispatches,
        dispatchTimestamp: dispatchTimestamp
    });
};
//# sourceMappingURL=dropServer.js.map