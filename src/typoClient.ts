import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { ModuleThread, spawn, Thread, Worker } from "threads";
import * as types from "./database/types";
import * as ithilSocket from "./socketioServer";
import type { Socket } from 'socket.io';
import { resolve } from 'path/posix';

/**
 * Manage dataflow and interactions with a client accessing from typo
 */
export default class TypoClient {

    /** Async database access in separate worker */
    databaseWorker: ModuleThread<palantirDatabaseWorker>;

    /** Socketio client socket instance */
    socket: Socket;

    /** The authentificated member */
    member: types.member;

    /** The authentificated member's username */
    username: string;

    /** The authentificated member's login */
    login: string;

    /** The authentificated member's flags array */
    flags: Array<number>;

    /** The authentificated member's parsed patron flag */
    patron: boolean;

    /** The authentificated member's permaban flag */
    permaBan: boolean;

    /** The authentificated member's dropban flag */
    dropBan: boolean;

    /** The worker's cached data */
    workerCache: types.workerCache;

    /** Init a new client with all member-related data and bound events */
    constructor(socket: Socket, dbWorker: ModuleThread<palantirDatabaseWorker>, member: types.member, workerCache: types.workerCache){
        this.socket = socket;
        this.databaseWorker = dbWorker;
        this.workerCache = workerCache;
        this.member = member;
        this.username = member.memberDiscordDetails.UserName;
        this.login = member.memberDiscordDetails.UserLogin;

        // get flags - convert integer to bit
        this.flags = ("00000000" + (member.flags >>> 0).toString(2)).slice(-8).split("")
            .map(f => Number(f)).reverse();
        this.permaBan = this.flags[5] == 1;
        this.patron = this.flags[3] == 1 || this.flags[4] == 1;
        this.dropBan = this.flags[6] == 1;

        if(this.permaBan) return;

        // init events 
        this.socket.on("disconnect", ()=>{
            Thread.terminate(this.databaseWorker);
        });
    }

}