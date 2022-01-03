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
            const member = await this.member;
            const flags = await this.flags;

            let slots = 1;
            slots += Math.floor(member.drops / 1000);
            if (flags.patron) slots++;
            if (flags.admin) slots += 100;

            resolve(slots);
        });
    }

    /** The member's current sprite inventory */
    get spriteInventory() {
        return new Promise<types.spriteProperty[]>(async resolve => {
            const inv = await this.member;
            const sprites = inv.sprites.split(",").map(item => {
                return {
                    slot: item.split(".").length - 1,
                    id: Number(item.replace(".", ""))
                } as types.spriteProperty;
            });
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

        // init events 
        this.typosocket.subscribeDisconnect(this.onDisconnect.bind(this));
        this.typosocket.subscribeGetUserEvent(this.getUser.bind(this));
        this.typosocket.subscribeSetSlotEvent(this.setSpriteSlot.bind(this));

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
        const flags = await this.flags;

        // check if slot is valid and sprite is owned
        if (flags.admin || slots >= eventdata.slot && eventdata.slot > 0 && currentInv.some(inv => inv.id == eventdata.sprite)) {

            // disable old slot sprite and activate new - if new is special, disable old special
            const targetIsSpecial = this.isSpecialSprite(eventdata.sprite);
            currentInv.forEach(prop => {
                if (prop.slot == eventdata.slot) prop.slot = 0;
                else if (targetIsSpecial && prop.slot > 0 && this.isSpecialSprite(prop.id)) prop.slot = 0
                else if (prop.id == eventdata.sprite) prop.slot = eventdata.slot;
            });

            const newInv = currentInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.databaseWorker.setUserSprites(Number(this.login), newInv);
        }

        // return updated data
        const data: ithilSocket.getUserResponseEventdata = {
            user: await this.member,
            flags: flags,
            slots: slots
        };
        return data;
    }

    async setSpriteCombo(eventdata: ithilSocket.setComboEventdata) {
        const combo = eventdata.combostring.split(",").map(slot => {
            return {
                id: Number(slot.replace(".", "")),
                slot: slot.split(".").length - 1
            } as types.spriteProperty;
        });
        const currentInv = await this.spriteInventory;
        const slots = await this.spriteSlots;
        const flags = await this.flags;

        // validate combo - if there are no sprites in the combo which are not in the inventory, and max slot is valid
        const spritesValid = !combo.some(comboSprite => !currentInv.some(invSprite => invSprite.id == comboSprite.id));
        const maxSlotValid = Math.max.apply(Math, combo.map(slot => slot.slot)) <= slots;

        // change combo only if full combo is valid, else abort *all*
        if (flags.admin || maxSlotValid && spritesValid) {
            const newInv: Array<types.spriteProperty> = [];
            currentInv.forEach(sprite => {
                const spriteInCombo = combo.find(comboSprite => comboSprite.id == sprite.id);
                if (spriteInCombo) newInv.push(spriteInCombo);
                else newInv.push({ id: sprite.id, slot: 0 });
            });

            const newInvString = newInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.databaseWorker.setUserSprites(Number(this.login), newInvString);
        }

        // return updated data
        const data: ithilSocket.getUserResponseEventdata = {
            user: await this.member,
            flags: flags,
            slots: slots
        };
        return data;
    }

    isSpecialSprite(spriteID: number) {
        const result = this.workerCache.publicData.sprites.find(sprite => sprite.ID == spriteID);
        if (result && result.Special) return true;
        else return false;
    }

}