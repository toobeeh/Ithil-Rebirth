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
import { IthilIPCClient } from './ipc';
import TypoClient from "./typoClient";
import portscanner from "portscanner";
import PalantirDatabase from "./database/mysql/palantirDatabase";
import { S3CloudConnection } from "./s3/cloud";
import Dict = NodeJS.Dict;
import {guildLobbyLink} from "./database/types";

const config = require("../ecosystem.config").config;

// disable listener limit - bug in threads.js described here:https://github.com/andywer/threads.js/issues/312
//require('events').EventEmitter.defaultMaxListeners = 0;
let maxRecordedRam = 0;
setInterval(() => {
    let ram = process.memoryUsage();
    let ramRss = Math.round(ram.rss / 1024 / 1024 * 100) / 100;
    let ramHeap = Math.round(ram.heapUsed / 1024 / 1024 * 100) / 100;
    if (maxRecordedRam * 1.05 < ramRss) {
        // memory load is higher than the last recorded value + 5%
        maxRecordedRam = ramRss;
        console.log(
            "RAM: " + ramRss + " MB (Heap: " + ramHeap + " MB)",
            "INFO"
        );
    }
}, 5000);

// measure eventloop latency
let eventLoopLatency = 0;
setInterval(() => {
    const last = process.hrtime.bigint();
    setImmediate(function () {
        const now = process.hrtime.bigint();
        const delta = Number((now - last) / BigInt(1000));
        eventLoopLatency = delta;
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

        console.log("Worker online on port " + workerPort);

        /**
         * The worker socketio server
         */
        const workerSocketServer = new ithilSocketServer.IthilSocketioServer(workerPort, config.certificatePath).server;

        /**
         * Database worker to validate incoming member requests
         */
        const database = new PalantirDatabase();
        await database.open(config.dbUser, config.dbPassword, config.dbHost, 20);

        /**
         * The IPC connection to the main server
         */
        const ipcClient = new IthilIPCClient("worker@" + workerPort);
        await ipcClient.connect(config.mainIpcID, workerPort);

        /** The worker's cache of last received data from the main ipc socket */
        const workerCache: types.workerCache = {
            activeLobbies: [],
            publicData: { drops: [], scenes: [], sprites: [], onlineScenes: [], onlineSprites: [], onlineItems: [] }
        };

        // listen to ipc lobbies update event
        ipcClient.onActiveLobbiesChanged = (data) => {
            workerCache.activeLobbies = data.activeLobbies;
            const guildsDictionary: {[id: string]: guildLobbyLink[]} = {}
            data.activeLobbies.forEach(link => guildsDictionary[link.guildId] ? guildsDictionary[link.guildId].push(link) : guildsDictionary[link.guildId] = [link]);


            Object.keys(guildsDictionary).forEach(guild => {

                // build eventdata
                const eventdata: ithilSocketServer.eventBase<ithilSocketServer.activeLobbiesEventdata> = {
                    event: ithilSocketServer.eventNames.activeLobbies,
                    payload: {
                        activeGuildLobbies: guildsDictionary[guild]
                    }
                };

                // volatile emit to all sockets that are a member of this guild and not playing
                workerSocketServer.in("guild" + guild).except("playing").volatile.emit(
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
                    onlineSprites: data.publicData.onlineSprites,
                    onlineItems: data.publicData.onlineItems
                }
            };

            // volatile emit to all online sockets
            workerSocketServer.volatile.emit(
                ithilSocketServer.eventNames.onlineSprites,
                eventdata
            );
        };

        // listen to ipc drop clear event when someone successfully claimed a drop
        ipcClient.onDropClear = (data) => {
            const dropClearData: ithilSocketServer.eventBase<ithilSocketServer.clearDropEventdata> = {
                event: ithilSocketServer.eventNames.clearDrop,
                payload: {
                    dropID: data.dropID,
                    claimTicket: data.claimTicket,
                    caughtLobbyKey: data.caughtLobbyKey,
                    caughtPlayer: data.caughtPlayer,
                    leagueWeight: data.leagueWeight
                }
            };

            workerSocketServer.volatile.to("playing").emit(
                ithilSocketServer.eventNames.clearDrop,
                dropClearData
            );
        };

        ipcClient.onNextDropReceived = () => console.log("Drop received timestamp: " + Date.now());

        // listen to ipc drop rank event when a drop raking was generated
        ipcClient.onDropRank = (data) => {
            const dropRankData: ithilSocketServer.eventBase<ithilSocketServer.rankDropEventdata> = {
                event: ithilSocketServer.eventNames.rankDrop,
                payload: {
                    dropID: data.dropID,
                    ranks: data.ranks
                }
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

        /* broadcast data */
        ipcClient.onSocketBroadcast = (data) => {
            const eventData: ithilSocketServer.eventBase<ithilSocketServer.rankDropEventdata> = {
                event: data.eventName,
                payload: data.eventData
            };
            if (data.onlyForLoggedIn === true) workerSocketServer.volatile.to("authorized").emit(data.eventName, eventData);
            else workerSocketServer.volatile.emit(data.eventName, eventData);
        };

        // listen for new socket connections
        workerSocketServer.on("connection", (socket) => {

            // cast socket to enable easier and typesafe event subscribing
            const clientSocket = new ithilSocketServer.TypoSocketioClient(socket);

            // push socket to array and update worker balance
            connectedSockets.push(clientSocket);
            connectedSockets = connectedSockets.filter(clientSocket => clientSocket.socket.connected);
            ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });

            // remove disconnected sockets from array and update balance on disconnect
            clientSocket.subscribeDisconnect(async (reason) => {
                connectedSockets = connectedSockets.filter(clientSocket => clientSocket.socket.connected);
                ipcClient.updatePortBalance?.({ port: workerPort, clients: connectedSockets.length });
            });

            // send public data to newly connected socket
            clientSocket.emitPublicData({ publicData: workerCache.publicData });

            // listen for login event
            clientSocket.subscribeLoginEvent(async (loginData) => {

                // check if login data is valid
                const loginResult = await database.getLoginFromAccessToken(loginData.accessToken, true);
                const response: ithilSocketServer.loginResponseEventdata = {
                    authorized: false,
                    activeLobbies: [],
                    lobbyLinks: [],
                    member: {} as types.member
                };

                // if login succeeded, create a typo client and enable further events
                if (loginResult.success) {

                    // spawn database workers
                    const asyncPalantirDb = new PalantirDatabase();
                    await asyncPalantirDb.open(config.dbUser, config.dbPassword, config.dbHost);

                    const memberResult = await asyncPalantirDb.getUserByLogin(loginResult.result.login);

                    console.log("Init S3 for " + memberResult.result.member.UserName);
                    const s3 = new S3CloudConnection(config.s3key, config.s3secret, Number(memberResult.result.member.UserLogin), asyncPalantirDb);
                    await s3.init();

                    console.log("Init client for " + memberResult.result.member.UserName);
                    const client = new TypoClient(clientSocket, asyncPalantirDb, s3, memberResult.result, workerCache);
                    clientSocket.socket.join("authorized");
                    client.claimDropCallback = (eventdata) => {
                        eventdata.workerEventloopLatency = eventLoopLatency;
                        eventdata.workerPort = workerPort;
                        ipcClient.claimDrop?.(eventdata);
                    };
                    client.reportLobbyCallback = eventdata => { ipcClient.sendLobbyReport?.(eventdata); }
                    client.reportStatusCallback = eventdata => { ipcClient.sendLobbyStatus?.(eventdata); }
                    client.requestDataBroadcast = eventdata => { ipcClient.sendSocketBroadcastRequest?.(eventdata); }

                    memberResult.result.member.Guilds.forEach(guild => clientSocket.socket.join("guild" + guild.GuildID));

                    // fill login response data
                    response.authorized = true;
                    response.member = memberResult.result;
                    response.activeLobbies = [];
                    response.lobbyLinks = workerCache.activeLobbies.filter(
                        guild => memberResult.result.member.Guilds.some(connectedGuild => connectedGuild.GuildID == guild.guildId)
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

