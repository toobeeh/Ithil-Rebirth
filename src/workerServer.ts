/*
 * # Ithil Worker Server

 * ## Tasks
 * A worker server instance's primary task is to interact and manage external client socket connections.
 * - provide a socketio server 
 * - authentificate clients
 * - implement all client features: joining lobbies, writing reports, setting sprites, etc
 * To keep the event loop latency as low as possible, database tasks should run in separate worker/threads.
 * 
 * ## Implementation
 * - find a port in the worker range that is unused 
 * - start ipc socket and connect to server
 * - start socketio server and wait for clients
 * - create typoclient object for each client
 * - emit data broadcasts to clients
 */

// import libs and local modules
import { IthilSocketioServer } from './socketioServer';
import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { IthilIPCClient } from './ipc';
import portscanner from "portscanner";
const config = require("../ecosystem.config").config;

//const database = await spawn<palantirDatabaseWorker>("./database/palantirDatabaseWorker");

// find a free worker port and proceed startup as soon as found / errored
portscanner.findAPortNotInUse(
    config.workerRange[0],
    config.workerRange[1],
    "127.0.0.1", async (error, port) => {
        // check if port was found
        if (error) {
            console.log(error);
            process.exit(1);
        }
        const workerPort = port;

        /**
         * The IPC connection to the main server
         */
        const ipcClient = new IthilIPCClient("worker@" + port);
        await ipcClient.connect(config.mainIpcID, port);

        /**
         * The worker socketio server
         */
        const workerSocketServer = new IthilSocketioServer(workerPort, config.certificatePath).server;
        workerSocketServer.on("connection", (socket)=>{
            console.log(socket);
        });

        // send ready state to pm2
        setTimeout(() => {
            if (process.send) process.send("ready");
            else console.log("Failed to send ready state");
        }, 1000);
    }
);

