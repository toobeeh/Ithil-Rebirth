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
import * as ithilSocketServer from './ithilSocketServer';
import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { imageDatabaseWorker } from './database/imageDatabaseWorker';
import { spawn, Worker } from "threads";
import { IthilIPCClient } from './ipc';
import TypoClient from "./typoClient";
import portscanner from "portscanner";

const config = require("../ecosystem.config").config;

// measure eventloop latency
let eventLoopLatency = 0;
setInterval(() => {
    const last = process.hrtime.bigint();        
    setImmediate(function() {
        const now =process.hrtime.bigint();
        const delta = Number((last - now) / BigInt(1000)); 
        eventLoopLatency = delta;
        if(delta > 50) console.log("Eventloop latency: " + delta + "ms");
    });
}, 200);

// find a free worker port and proceed startup as soon as found / errored
portscanner.findAPortNotInUse(
    config.workerRange[0],
    config.workerRange[1],
    "127.0.0.1", async (error, workerPort) => {

        // check if port was found
        if (error) {
            console.log(error);
            process.exit(1);
        }

        /**
         * The worker socketio server
         */
        const workerSocketServer = new ithilSocketServer.IthilSocketioServer(workerPort, config.certificatePath).server;

        /**
         * The IPC connection to the main server
         */
        const ipcClient = new IthilIPCClient("worker@" + workerPort);
        await ipcClient.connect(config.mainIpcID, workerPort);

        /** The worker's cache of last received data from the main ipc socket */
        const workerCache: types.workerCache = {
            activeLobbies: [],
            publicData: { drops: [], scenes: [], sprites: [], onlineScenes: [], onlineSprites: [] }
        };

        // listen to ipc lobbies update event
        ipcClient.onActiveLobbiesChanged = (data) => {
            workerCache.activeLobbies = data.activeLobbies;
            data.activeLobbies.forEach(guild => {

                // build eventdata
                const eventdata: ithilSocketServer.eventBase<ithilSocketServer.activeLobbiesEventdata> = {
                    event: ithilSocketServer.eventNames.activeLobbies,
                    payload: {
                        activeLobbies: guild
                    }
                };

                // volatile emit to all sockets that are a member of this guild and not playing
                workerSocketServer.in("guild" + guild.guildID).except("playing").volatile.emit(
                    ithilSocketServer.eventNames.activeLobbies,
                    eventdata
                );
            });
        };

        // listen to ipc public data update event
        ipcClient.onPublicDataChanged = (data) => {
            workerCache.publicData = data.publicData;

            // build eventdata
            const eventdata: ithilSocketServer.eventBase<ithilSocketServer.onlineSpritesEventdata> = {
                event: ithilSocketServer.eventNames.onlineSprites,
                payload: {
                    onlineScenes: data.publicData.onlineScenes,
                    onlineSprites: data.publicData.onlineSprites
                }
            };

            // volatile emit to all online sockets
            workerSocketServer.volatile.emit(
                ithilSocketServer.eventNames.onlineSprites,
                eventdata
            );
        };

        ipcClient.onDropClear = (data) => {
            const dropClearData: ithilSocketServer.clearDropEventdata = {
                dropID: data.dropID,
                claimTicket: data.claimTicket,
                caughtLobbyKey: data.caughtLobbyKey,
                caughtPlayer: data.caughtPlayer
            };

            workerSocketServer.volatile.to("playing").emit(
                ithilSocketServer.eventNames.clearDrop,
                dropClearData
            );
        };

        ipcClient.onDropRank = (data) => {
            const dropRankData: ithilSocketServer.rankDropEventdata = {
                dropID: data.dropID,
                ranks: data.ranks
            };
            
            workerSocketServer.volatile.to("playing").emit(
                ithilSocketServer.eventNames.rankDrop,
                dropRankData
            );
        };

        /** 
         * Array of currently connected sockets 
         */
        let connectedSockets: Array<ithilSocketServer.TypoSocketioClient> = [];

        // listen for new socket connections
        workerSocketServer.on("connection", (socket) => {

            // cast socket to enable easier and typesafe event subscribing
            const clientSocket = new ithilSocketServer.TypoSocketioClient(socket);

            // push socket to array and update worker balance
            connectedSockets.push(clientSocket);
            ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });

            // remove socket from array and update balance on disconnect
            clientSocket.subscribeDisconnect(async (reason) => {
                connectedSockets = connectedSockets.filter(clientSocket => clientSocket.socket.connected);
                ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });
            });

            // send public data to newly connected socket
            clientSocket.emitPublicData({ publicData: workerCache.publicData });

            // listen for login event
            clientSocket.subscribeLoginEvent(async (loginData) => {

                // create database worker and check access token - prepare empty event response
                const id = "thread " + Date.now();
                console.log("spawning worker threads: " + id);

                const asyncDb = await spawn<palantirDatabaseWorker>(new Worker("./database/palantirDatabaseWorker", {name: "PDB " + id}));
                await asyncDb.init(config.palantirDbPath);

                const loginResult = await asyncDb.getLoginFromAccessToken(loginData.accessToken);
                const response: ithilSocketServer.loginResponseEventdata = {
                    authorized: false,
                    activeLobbies: [],
                    member: {} as types.member
                };

                // if login succeeded, create a typo client and enable further events
                if (loginResult.success) {
                    const memberResult = await asyncDb.getUserByLogin(loginResult.result.login);
                    const asyncImageDb = await spawn<imageDatabaseWorker>(new Worker("./database/imageDatabaseWorker", {name: "IDB " + id}));
                    await asyncImageDb.init(loginResult.result.login.toString(), config.imageDbParentPath);
                    
                    const client = new TypoClient(clientSocket, asyncDb, asyncImageDb, memberResult.result, workerCache);
                    client.claimDropCallback = (eventdata) => {
                        ipcClient.claimDrop?.(eventdata);
                    };
                    memberResult.result.member.Guilds.forEach(guild => clientSocket.socket.join("guild" + guild.GuildID));

                    // fill login response data
                    response.authorized = true;
                    response.member = memberResult.result;
                    response.activeLobbies = workerCache.activeLobbies.filter(
                        guild => memberResult.result.member.Guilds.some(connectedGuild => connectedGuild.GuildID == guild.guildID)
                    );
                }

                return response;
            });
        });

        // send ready state to pm2
        setTimeout(() => {
            if (process.send) process.send("ready");
            else console.log("Failed to send ready state");
        }, 1000);
    }
);

