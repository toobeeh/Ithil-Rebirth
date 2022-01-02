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

    /** The member's current sprite inventory */
    get spriteInventory() {
        return new Promise<types.spriteProperty[]>(async resolve => {
            const inv = await this.member;
            const sprites = inv.sprites.split(",").map(item => {
                return {
                    slot: item.split(".").length,
                    id: Number(item.replace(".", ""))
                } as types.spriteProperty;
            })
            resolve(sprites);
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

        this.getUser();
        // init events 
        this.typosocket.subscribeDisconnect(this.onDisconnect.bind(this));
        this.typosocket.subscribeGetUserEvent(this.getUser.bind(this));

        console.log("logged in");
    }

    async onDisconnect(reason: string) {
        await Thread.terminate(this.databaseWorker);
    }

    async getUser() {
        const data: ithilSocket.getUserResponseEventdata = {
            user: await this.member,
            flags: await this.flags,
            slots: await this.spriteSlots
        };
        return data;
    }

    async setSpriteSlot(eventdata: ithilSocket.setSlotEventdata) {
        const slots = await this.spriteSlots;
        const currentInv = await this.spriteInventory;
        
        if(slots >= eventdata.slot && eventdata.slot > 0 && currentInv.some(inv => inv.id == eventdata.sprite)){

            // disable old slot sprite and activate new
            currentInv.forEach(prop => {
                if(prop.slot == eventdata.slot) prop.slot = 0;
                else if(prop.id == eventdata.sprite) prop.slot = eventdata.slot;
            });

            const newInv = currentInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.databaseWorker.setUserSprites(Number(this.login), newInv);
        }

        // return updated data
        const data: ithilSocket.getUserResponseEventdata = {
            user: await this.member,
            flags: await this.flags,
            slots: await this.spriteSlots
        };
        return data;

    }

}