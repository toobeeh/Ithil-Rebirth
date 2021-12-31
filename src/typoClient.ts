import { palantirDatabaseWorker } from './database/palantirDatabaseWorker';
import { ModuleThread, spawn, Thread, Worker } from "threads";
import * as types from "./database/types";
import * as ithilSocket from "./ithilSocketio";
import type { Socket } from 'socket.io';
import { resolve } from 'path/posix';

/**
 * Manage dataflow and interactions with a client accessing from typo
 */
export default class TypoClient {

    /** Async database access in separate worker */
    databaseWorker: ModuleThread<palantirDatabaseWorker>;

    /** Socketio client socket instance */
    typosocket: ithilSocket.TypoSocketioClient;

    
    /** The authentificated member */
    get member() {
        return new Promise<types.member>(async resolve => {
            resolve((await this.databaseWorker.getUserByLogin(Number(this.login))).result);
        });
    }

    /** The member's current sprite slots */
    get spriteSlots() {
        return new Promise<number>(async resolve => {
            resolve((await this.member).bubbles)
        });
    }

    /** The authentificated member's flags */
    get flags() {
        return new Promise<types.memberFlags>(async resolve => {

            // get flags - convert integer to bit
            const flags = (await this.member).flags;
            const flagArray = ("00000000" + (flags >>> 0).toString(2)).slice(-8).split("")
                .map(f => Number(f)).reverse();

            // parse array to interface
            resolve({
                bubbleFarming: flagArray[0] == 1,
                admin: flagArray[1] == 1,
                moderator: flagArray[2] == 1,
                unlimitedCloud: flagArray[3] == 1,
                patron: flagArray[4] == 1,
                permaBan: flagArray[5] == 1,
                dropBan: flagArray[6] == 1,
                patronizer: flagArray[7] == 1,
            });
        });
    }

    /** The authentificated member's username */
    username: string;

    /** The authentificated member's login */
    login: string;

    /** The worker's cached data */
    workerCache: types.workerCache;

    /** 
     * Init a new client with all member-related data and bound events 
     */
    constructor(socket: ithilSocket.TypoSocketioClient, dbWorker: ModuleThread<palantirDatabaseWorker>, memberInit: types.member, workerCache: types.workerCache) {
        this.typosocket = socket;
        this.databaseWorker = dbWorker;
        this.workerCache = workerCache;
        this.username = memberInit.memberDiscordDetails.UserName;
        this.login = memberInit.memberDiscordDetails.UserLogin;
        
        // init events 
        this.typosocket.subscribeDisconnect(this.onDisconnect);
        this.typosocket.subscribeGetUserEvent(this.getUser);

        console.log("logged in");
    }

    async onDisconnect(reason: string){
        await Thread.terminate(this.databaseWorker);
    }

    async getUser(){
        console.log(this);
        const member = await this.member;
        const flags = await this.flags;
        const slots = await this.spriteSlots;
        const data: ithilSocket.getUserResponseEventdata = {
            user: member,
            flags: flags,
            slots: slots
        };
        return data;
    }

}