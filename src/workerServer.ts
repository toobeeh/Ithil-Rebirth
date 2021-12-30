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
import * as types from "./database/types";
import * as ithilSocketio from './socketioServer';
import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { ModuleThread, spawn, Thread, Worker } from "threads";
import { IthilIPCClient } from './ipc';
import TypoClient from "./typoClient";
import portscanner from "portscanner";
import { Socket } from 'socket.io';

const config = require("../ecosystem.config").config;

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
         * The worker socketio server
         */
        const workerSocketServer = new ithilSocketio.IthilSocketioServer(
            workerPort,
            config.certificatePath
        ).server;

        /**
         * The IPC connection to the main server
         */
        const ipcClient = new IthilIPCClient("worker@" + port);
        await ipcClient.connect(config.mainIpcID, port);

        /** The worker's cache of last received data from the main ipc socket */
        const workerCache: types.workerCache = {
            activeLobbies: [],
            publicData: { drops: [], scenes: [], sprites: [], onlineScenes: [], onlineSprites: [] }
        }

        // listen to ipc events
        ipcClient.onActiveLobbiesChanged = (data) => {
            workerCache.activeLobbies = data.activeLobbies;
            data.activeLobbies.forEach(guild => {

                // build eventdata
                const eventdata: ithilSocketio.activeLobbiesEventdata = {
                    activeLobbies: guild
                };

                // volatile emit to all sockets that are a member of this guild
                workerSocketServer.to("guild" + guild.guildID).volatile.emit(
                    ithilSocketio.eventNames.activeLobbies,
                    eventdata
                );
            });
        }

        ipcClient.onPublicDataChanged = (data) => {
            workerCache.publicData = data.publicData;

            // build eventdata
            const eventdata: ithilSocketio.onlineSpritesEventdata = {
                onlineScenes: data.publicData.onlineScenes,
                onlineSprites: data.publicData.onlineSprites
            }

            // volatile emit to all online sockets
            workerSocketServer.volatile.emit(
                ithilSocketio.eventNames.onlineSprites,
                eventdata
            );
        }

        /** array of currently connected sockets */
        let connectedSockets: Array<Socket> = [];

        // listen for new socket connections
        workerSocketServer.on("connection", (socket) => {

            // push socket to array and update worker balance
            connectedSockets.push(socket);
            ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });

            // remove socket from array and update balance on disconnect
            socket.on("disconnect", (reason) => {
                connectedSockets = connectedSockets.filter(sck => sck.id != socket.id);
                ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });
            });

            // send public data to newly connected socket
            const eventdata: ithilSocketio.publicDataEventdata = { publicData: workerCache.publicData };
            socket.emit(ithilSocketio.eventNames.publicData, eventdata);

            // listen once for login attempt
            socket.once(ithilSocketio.eventNames.login, async (data: ithilSocketio.loginEventdata) => {

                // create database worker and check access token
                const asyncDb = await spawn<palantirDatabaseWorker>(new Worker("./database/palantirDatabaseWorker"));
                await asyncDb.init(config.palantirDbPath);
                const loginResult = await asyncDb.getLoginFromAccessToken(data.accessToken);

                // if login succeeded, create a typo client and enable further events
                if (loginResult.success) {
                    const memberResult = await asyncDb.getUserByLogin(loginResult.result.login);
                    const client = new TypoClient(socket, asyncDb, memberResult.result, workerCache);
                }

                // if not successful, send empty response
                else {
                    const eventdata: ithilSocketio.loginResponseEventdata = {
                        authenticated: false,
                        activeLobbies: [],
                        user: {} as types.member
                    }
                    socket.emit(ithilSocketio.eventNames.login + " response", eventdata);
                }
            });
        });

        // send ready state to pm2
        setTimeout(() => {
            if (process.send) process.send("ready");
            else console.log("Failed to send ready state");
        }, 1000);
    }
);

