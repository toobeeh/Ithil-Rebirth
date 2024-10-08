import * as types from "./database/types";
import * as ithilSocketServer from "./ithilSocketServer";
import { dropClaimEventdata, lobbyReportEventdata, lobbyStatusEventdata, socketBroadcastEventdata } from './ipc';
import fetch from 'make-fetch-happen';
import { eventNames } from './ithilSocketServer';
import PalantirDatabase from './database/mysql/palantirDatabase';
import { S3CloudConnection } from './s3/cloud';


interface cachedData<TData> {
    date?: number,
    cache?: TData
}

interface Wrapped<T> {
    data: T;
}

function wrappedParams<T extends Record<string, Wrapped<any>>>(data: T, callback: (data: { [K in keyof T]: T[K]['data'] }) => void): void {
    const result: any = {};
    for (const key in data) {
        if (data.hasOwnProperty(key)) {
            result[key] = data[key].data;
        }
    }
    callback(result);
}

//wrappedParams({a: {data: 6}}, data => console.log(data.a));

function sp<TPromise>(promise: Promise<TPromise>) {
    let stack = (new Error()).stack;
    return new Promise<TPromise>(async (resolve, reject) => {
        setTimeout(() => {
            reject("Caught promise after 20s - " + stack);
        }, 20000);
        const result = await promise;
        resolve(result);
    });
}

function getSlotBaseCount(drops: number) {
    if (drops > 30000) {
        return 6 + Math.floor((drops - 30000) / 20000);
    } else if (drops > 15000) {
        return 5;
    } else if (drops > 7000) {
        return 4;
    } else if (drops > 3000) {
        return 3;
    } else if (drops > 1000) {
        return 2;
    } else {
        return 1;
    }
}

/**
 * Manage dataflow and interactions with a client socket accessing from skribbl.io using typo
 */
export default class TypoClient {

    /** Async database access in separate worker */
    palantirDatabaseWorker: PalantirDatabase;

    /** connection to s3 image cloud */
    cloud: S3CloudConnection;

    /** Socketio client socket instance */
    typosocket: ithilSocketServer.TypoSocketioClient;

    /** last posted webhook cache for rate-limiting */
    lastPostedWebhooks: Array<{ serverID: string, postDate: number }> = [];

    /**
     * Get cached data if valid
     * @param cache The cache object
     * @param validMs The validity limit
     * @returns Cached data
     */
    private getCache<TData>(cache: cachedData<TData>, validMs: number = 30000) {
        if (cache.date && cache.cache && cache.date + validMs > Date.now()) return cache.cache;
        else return undefined;
    }

    /**
     * Set cached data
     * @param cache The cache object
     * @param data The new cache data
     */
    private setCache<TData>(cache: cachedData<TData>, data: TData) {
        cache.cache = data;
        cache.date = Date.now();
    }

    /**
     * Clears cached data
     * @param cache The cache object
     */
    private clearCache<TData>(cache: cachedData<TData>) {
        cache.cache = undefined;
        cache.date = 0;
    }

    /** Get the authentificated member */
    get member() {
        const cache = this.getCache(this.memberCache);
        if (cache) return Promise.resolve(cache);
        else return new Promise<types.member>(async (resolve, reject) => {
            const result = (await sp(this.palantirDatabaseWorker.getUserByLogin(Number(this.login)))).result;
            this.setCache(this.memberCache, result);
            resolve(result);
        });
    }
    private memberCache: cachedData<types.member> = {};

    /** Get the member's current sprite slots */
    get spriteSlots() {
        return new Promise<number>(async resolve => {
            const member = await sp(this.member);
            const flags = await sp(this.flags);

            let slots = getSlotBaseCount(member.drops);
            if (flags.patron) slots++;
            if (flags.admin) slots += 100;

            resolve(slots);
        });
    }

    /** Get the member's current sprite inventory */
    get spriteInventory() {
        return new Promise<types.spriteProperty[]>(async resolve => {
            const inv = await sp(this.member);
            const sprites = inv.sprites.split(",").map(item => {
                return {
                    slot: item.split(".").length - 1,
                    id: Number(item.split(".").join(""))
                } as types.spriteProperty;
            });
            resolve(sprites);
        });
    }

    /** Get the member's current award inventory */
    get awardInventory() {
        return new Promise<Map<number, number[]>>(async resolve => {
            const inv = await sp(this.palantirDatabaseWorker.getUserAwardsInventory(this.login));
            if (inv.success === false) throw new Error("error reading awards");
            resolve(inv.result);
        });
    }

    /** Get the authentificated member's flags */
    get flags() {
        return new Promise<types.memberFlags>(async resolve => {

            // get flags - convert integer to bit
            const flags = (await sp(this.member)).flags;
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

    get dropMode() {
        if (!this.reportData.reportLobby) return 'normal';

        const noOneDrawing = this.reportData.reportLobby.Players.every(p => !p.Drawing);
        const allPlayersZeroScore = this.reportData.reportLobby.Players.every(p => p.Score == 0);
        const privateLobby = this.reportData.reportLobby.Private;
        const aloneInLobby = this.reportData.reportLobby.Players.length === 1;

        if (privateLobby && allPlayersZeroScore || !privateLobby && aloneInLobby) {
            return 'league';
        }
        else return 'normal';
    }

    /** The authentificated member's username */
    username: string;

    /** The authentificated member's login */
    login: string;

    /** The ms timestamp of login */
    loginDate: number;

    /** The worker's cached data */
    workerCache: types.workerCache;

    /** callback to send a drop claim */
    claimDropCallback?: (eventdata: dropClaimEventdata) => void = undefined;

    /** callback to report the clients lobbies */
    reportLobbyCallback?: (eventdata: lobbyReportEventdata) => void = undefined;

    /** callback to report the clients status */
    reportStatusCallback?: (eventdata: lobbyStatusEventdata) => void = undefined;

    /** callback to report the clients status */
    requestDataBroadcast?: (broadcast: socketBroadcastEventdata) => void = undefined;

    /** Object that represents the state of the socket for reporting playing status */
    reportData: {

        /** The socket's current status: idle, searching, waiting, playing */
        currentStatus: string,

        /** The nickname the player is playing as */
        nickname: string,

        /** The currently joined lobby */
        joinedLobby?: types.palantirLobby,

        /** The last reported lobbydata */
        reportLobby?: types.lobby,

        /** The interval in which the reports are written */
        updateLoop: () => Promise<void>
    };

    /** 
     * Init a new client with all member-related data and bound events 
     */
    constructor(socket: ithilSocketServer.TypoSocketioClient, dbWorker: PalantirDatabase, cloud: S3CloudConnection, memberInit: types.member, workerCache: types.workerCache) {
        this.typosocket = socket;
        this.palantirDatabaseWorker = dbWorker;
        this.cloud = cloud;
        this.workerCache = workerCache;
        this.username = memberInit.member.UserName;
        this.login = memberInit.member.UserLogin;
        this.loginDate = Date.now();

        // check banned
        setImmediate(async () => {
            if ((await this.flags).permaBan) this.typosocket.socket.disconnect();
        });

        // init events 
        this.typosocket.subscribeDisconnect(this.onDisconnect.bind(this));
        this.typosocket.subscribeGetUserEvent(this.getUser.bind(this));
        this.typosocket.subscribeSetSlotEvent(this.setSpriteSlot.bind(this));
        this.typosocket.subscribeSetComboEvent(this.setSpriteCombo.bind(this));
        this.typosocket.subscribeJoinLobbyEvent(this.joinLobby.bind(this));
        this.typosocket.subscribeSetLobbyEvent(this.setLobby.bind(this));
        this.typosocket.subscribeLeaveLobbyEvent(this.leaveLobby.bind(this));
        this.typosocket.subscribeSearchLobbyEvent(this.searchLobby.bind(this));
        this.typosocket.subscribeStoreDrawingEvent(this.storeDrawing.bind(this));
        this.typosocket.subscribeRemoveDrawingEvent(this.removeDrawing.bind(this));
        this.typosocket.subscribeGetMetaEvent(this.getMeta.bind(this));
        this.typosocket.subscribeClaimDropEvent(this.claimDrop.bind(this));
        this.typosocket.subscribePostImageEvent(this.postImage.bind(this));
        this.typosocket.susbcribeGetAwardsEvent(this.getAwards.bind(this));
        this.typosocket.susbcribeGiveAwardEvent(this.giveAward.bind(this));

        // init report data 
        this.reportData = {
            currentStatus: "idle",
            nickname: this.username,
            joinedLobby: undefined,
            reportLobby: undefined,
            updateLoop: async () => {
                if (!this.typosocket.socket.connected) return;
                await sp(this.updateStatus());
                setTimeout(this.reportData.updateLoop.bind(this), 2500);
            }
        };
        this.reportData.updateLoop();

        console.log(this.username + " logged in.");

        /**
         * drop specials
         */
        /* const dropSpecial = () => {
            setTimeout( async () => {
                if(Math.random() > 0.7) {
                    if(! ((await this.member).scenes.split(",").map(scene => scene.substring(scene.lastIndexOf("."))).some(scene => scene == "7"))){
                        this.sendSpecialDrop();
                        console.log("sent special drop to " + this.username);
                    }
                }
                dropSpecial();
            }, 1000 * 60 * 20 + 1000 * 60 * 40 * Math.random());
        }
        dropSpecial(); */
    }

    /**
     * Handler for a disconnect event
     * @param reason Socketio disconnect reason
     */
    async onDisconnect(reason: string) {
        const flags = await sp(this.flags);
        /*if (!flags.admin && !flags.patron && !flags.unlimitedCloud) { TODO reactivate
            await this.cloud.bulkDeleteOlderThan(31 * 3);
        }*/

        this.palantirDatabaseWorker.close();

        console.log(this.username + " disconnected.");
    }

    /**
     * Handler for get user waward inventory event
     * @returns the users currently availabe awards
     */
    async getAwards(): Promise<ithilSocketServer.getAwardsResponseEventdata> {
        const awards = await (sp(this.awardInventory));
        const mapped = Array.from(awards);
        return { awards: mapped };
    }

    /**
     * Handler for give award inventory
     * Gives a user in the same lobby an award
     */
    async giveAward(request: ithilSocketServer.giveAwardEventdata) {
        if (this.reportData.currentStatus !== "playing") throw new Error("wants to give an award but not playing");
        const lobby = this.reportData.joinedLobby;
        if (lobby === undefined) throw new Error("wants to give an award but no report lobby set");
        const player = this.reportData.reportLobby?.Players.find(p => p.LobbyPlayerID.toString() == request.lobbyPlayerId);
        if (player === undefined) throw new Error("wants to give an award but no player with that id");
        if (player.Drawing === false) throw new Error("wants to give an award but target is not drawing");

        const inv = await sp(this.awardInventory);
        const item = [...inv.values()].flat().find(awardId => awardId == request.awardInventoryId);
        if (item === undefined) {
            throw new Error("wants to give an award but does not posess inventory id");
        }
        const itemAwardId = [...inv.keys()].find(key => inv.get(key)?.includes(item) === true);
        const awards = await this.palantirDatabaseWorker.getAwards();
        const rarity = awards.result.find(a => a.ID == itemAwardId)?.Rarity
        const awardName = awards.result.find(a => a.ID == itemAwardId)?.Name

        let result;
        try {
            result = await this.palantirDatabaseWorker.giveAward(lobby.ID, request.lobbyPlayerId, request.awardInventoryId.toString(), itemAwardId + "", lobby.Key, this.login);
        }
        catch (e: any) {
            if (e.message == "receiver and giver are the same") { // somehow not working?
                this.postMessage({ message: "You can't give yourself awards.", title: "Sneaky one!" })
            }
            return;
        }

        if (rarity && rarity > 2) {
            const name = this.reportData.reportLobby?.Players.find(p => p.Sender)?.Name ?? "Unknown";
            await this.palantirDatabaseWorker.rewardSplits(
                result.result,
                rarity == 3 ? 20 : 21,
                awardName + " awarded from " + name
            );
        }

        if (result.success) {
            console.log(this.login + " gave award " + itemAwardId + " to " + result.result);
            const awardResult = {
                lobbyKey: lobby.Key,
                lobbyPlayerId: player.LobbyPlayerID,
                awardId: itemAwardId,
                awardInventoryId: item,
                from: this.reportData.reportLobby?.Players.find(p => p.Sender)?.LobbyPlayerID
            };
            this.requestDataBroadcast?.({ eventName: "drawingAwarded", eventData: awardResult, onlyForLoggedIn: false });
        }
    }

    /**
     * Handler for get user event
     * @returns Event response data containing user, flags and slots
     */
    async getUser() {
        this.clearCache(this.memberCache);
        const data: ithilSocketServer.getUserResponseEventdata = {
            user: await sp(this.member),
            flags: await sp(this.flags),
            slots: await sp(this.spriteSlots)
        };
        return data;
    }

    /**
     * Handler for set slot event
     * @param eventdata Eventdata conaining slot and sprite id
     * @returns Response data containing updated user, flags and slots
     */
    async setSpriteSlot(eventdata: ithilSocketServer.setSlotEventdata) {
        this.clearCache(this.memberCache);
        const slots = await this.spriteSlots;
        const currentInv = await this.spriteInventory;
        const flags = await this.flags;

        // check if slot is valid and sprite is owned
        if (flags.admin || slots >= eventdata.slot && eventdata.slot > 0 && (currentInv.some(inv => inv.id == eventdata.sprite) || eventdata.sprite == 0)) {

            // disable old slot sprite and activate new - if new is special, disable old special
            const targetIsSpecial = this.isSpecialSprite(eventdata.sprite);
            currentInv.forEach(prop => {
                if (prop.slot == eventdata.slot) prop.slot = 0;
                else if (targetIsSpecial && prop.slot > 0 && this.isSpecialSprite(prop.id)) prop.slot = 0
                else if (prop.id == eventdata.sprite) prop.slot = eventdata.slot;
            });

            const newInv = currentInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.palantirDatabaseWorker.setUserSprites(Number(this.login), newInv);
        }

        // return updated data
        this.clearCache<types.member>(this.memberCache);
        const data: ithilSocketServer.getUserResponseEventdata = {
            user: await this.member,
            flags: flags,
            slots: slots
        };
        return data;
    }

    /**
     * Handler for set combo event
     * @param eventdata Eventdata containing combo string comma-separated and dots indicating slot
     * @returns Response data containing updated user, flags and slots
     */
    async setSpriteCombo(eventdata: ithilSocketServer.setComboEventdata) {
        const combo = eventdata.combostring.split(",").map(slot => {
            return {
                id: Number(slot.split(".").join("")),
                slot: slot.split(".").length - 1
            } as types.spriteProperty;
        }).filter(slot => slot.id > 0);

        this.clearCache(this.memberCache);
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
            await this.palantirDatabaseWorker.setUserSprites(Number(this.login), newInvString);
        }

        // return updated data
        this.clearCache<types.member>(this.memberCache);
        const data: ithilSocketServer.getUserResponseEventdata = {
            user: await this.member,
            flags: flags,
            slots: slots
        };
        return data;
    }

    /**
     * Handler for post image event
     * @param eventdata Eventdata containing webhook name, server id, image URI
     */
    async postImage(eventdata: ithilSocketServer.postImageEventdata) {

        console.log(`${this.login} posted to ${eventdata.webhookName}`);

        const memberServers = (await this.getUser()).user.member.Guilds;
        const postServer = memberServers.find(server => server.GuildID == eventdata.serverID);

        /* if user is in this server */
        if (postServer) {

            const serverWebhooks = await this.palantirDatabaseWorker.getServerWebhooks(postServer.GuildID);
            const postWebhook = serverWebhooks.result.find(webhook => webhook.Name == eventdata.webhookName);

            /* if there exists a webhook of that name*/
            if (postWebhook) {

                /* if ratelimit not exceeded */
                if (!this.lastPostedWebhooks.some(
                    wh => wh.serverID == postServer.GuildID && Date.now() - wh.postDate > 60 * 1000
                )) {

                    /* save image with orthanc api */
                    const formdata = new URLSearchParams();
                    formdata.append("image", eventdata.imageURI);
                    formdata.append("accessToken", eventdata.accessToken);

                    const response = await fetch('https://tobeh.host/Orthanc/tokenapi/imagepost/', {
                        method: 'POST',
                        headers: {
                            'Accept': '*/*'
                        },
                        body: formdata
                    });
                    let url = await response.text();

                    /* build webhook data */
                    const webhookData: any = {};

                    if (eventdata.postOptions.onlyImage) {
                        webhookData.username = eventdata.postOptions.posterName.split("#")[0];
                        webhookData.avatar_url = 'https://cdn.discordapp.com/attachments/334696834322661376/988002446158741544/letter.png';
                        webhookData.content = url;
                    }
                    else {
                        webhookData.username = "Skribbl Image Post";
                        webhookData.avatar_url = 'https://cdn.discordapp.com/attachments/334696834322661376/988002446158741544/letter.png';
                        webhookData.embeds = [
                            {
                                "title": eventdata.postOptions.title,
                                "description": "Posted by " + eventdata.postOptions.posterName.split("#")[0],
                                "color": 4368373,
                                "image": {
                                    "url": url
                                },
                                "footer": {
                                    "icon_url": "https://cdn.discordapp.com/attachments/334696834322661376/860509383104528425/128CircleFit.png",
                                    "text": "skribbl typo"
                                },
                                "author": {
                                    "name": "Drawn by " + eventdata.postOptions.drawerName.split("#")[0],
                                    "url": "https://typo.rip",
                                    "icon_url": "https://skribbl.io/res/pen.gif"
                                }
                            }
                        ];
                    }

                    /* post webhook */
                    await fetch(postWebhook.WebhookURL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(webhookData)
                    });
                }
            }
        }
    }


    /**
     * Handler for join lobby event
     * @param eventdata Eventdata containing the joined lobby's key
     * @returns Response data containing the joined lobby data
     */
    async joinLobby(eventdata: ithilSocketServer.joinLobbyEventdata) {
        console.log(this.username + " joined a lobby.");

        this.reportData.currentStatus = "playing";
        const key = eventdata.key;
        let success = false;
        let lobby = {} as types.palantirLobby;
        const lobbyResult = await sp(this.palantirDatabaseWorker.getLobby(key, "key"));

        // create new lobby if none found for key, but query succeeded
        if (!lobbyResult.result.found || !lobbyResult.result.lobby) {
            if (lobbyResult.success) {
                const newLobbyResult = await sp(this.palantirDatabaseWorker.setLobby(Date.now().toString(), key));

                // if new lobby was successfully added, get it
                if (newLobbyResult) {
                    const createdLobbyResult = await sp(this.palantirDatabaseWorker.getLobby(key, "key"));
                    if (createdLobbyResult.success && createdLobbyResult.result.found && createdLobbyResult.result.lobby) {
                        lobby = createdLobbyResult.result.lobby;
                        this.reportData.joinedLobby = lobby;
                        success = true;
                    }
                }
            }
        }
        else {
            lobby = lobbyResult.result.lobby;
            this.reportData.joinedLobby = lobby;
            success = true;
        }

        // return found or created lobby
        const response: ithilSocketServer.joinLobbyResponseEventdata = {
            lobbyData: lobby,
            valid: success
        };
        return response;
    }

    /**
     * Handler for set lobby event
     * @param eventdata Eventdata containing lobby details as well as key, restriction, description
     * @returns Response data containing the new lobby data and owner information
     */
    async setLobby(eventdata: ithilSocketServer.setLobbyEventdata) {
        let owner = false;
        let ownerID = 0;
        let updatedLobby = {} as types.reportLobby;

        if (this.reportData.joinedLobby) {
            this.reportData.reportLobby = eventdata.lobby;
            const cached = this.reportData.joinedLobby;

            // get owner 
            const senderID = eventdata.lobby.Players.find(player => player.Sender)?.LobbyPlayerID;
            if (senderID) {
                const ownerResult = await sp(this.palantirDatabaseWorker.isPalantirLobbyOwner(this.reportData.joinedLobby.ID, senderID));
                if (ownerResult.success && ownerResult.result.owner != null && ownerResult.result.ownerID != null) {
                    owner = ownerResult.result.owner;
                    ownerID = ownerResult.result.ownerID;
                }
            }

            // if key, description, restriction differ from last cached lobby
            if (cached.Key != eventdata.lobbyKey || cached.Description != eventdata.description || cached.Restriction != eventdata.restriction) {
                // update lobby data
                let restriction = "unrestricted";
                let description = "";
                let key = eventdata.lobbyKey;

                if (owner) {
                    restriction = eventdata.restriction;
                    description = eventdata.description;
                }
                else {
                    const currentLobby = (await sp(this.palantirDatabaseWorker.getLobby(this.reportData.joinedLobby.ID, "id"))).result.lobby;
                    if (currentLobby) {
                        restriction = currentLobby.Restriction;
                        description = currentLobby.Description;
                    }
                }
                await sp(this.palantirDatabaseWorker.setLobby(this.reportData.joinedLobby.ID, key, description, restriction));
            }

            const updatedLobbyResult = (await sp(this.palantirDatabaseWorker.getLobby(this.reportData.joinedLobby.ID, "id"))).result.lobby;
            if (updatedLobbyResult) {
                updatedLobby.ID = updatedLobbyResult.ID;
                updatedLobby.Key = updatedLobbyResult.Key;
                updatedLobby.Restriction = updatedLobbyResult.Restriction;
                updatedLobby.Description = updatedLobbyResult.Description;
                this.reportData.joinedLobby = updatedLobby;
            }
        }

        // return updated lobby
        const response: ithilSocketServer.setLobbyResponseEventdata = {
            lobbyData: {
                lobby: updatedLobby
            },
            owner: owner,
            ownerID: ownerID,
            dropMode: this.dropMode
        };
        return response;
    }

    /**
     * Handler for search lobby event
     * @param eventdata Eventdata conatining search nickname of the client
     */
    async searchLobby(eventdata: ithilSocketServer.searchLobbyEventdata) {
        if (eventdata.searchData.waiting) this.reportData.currentStatus = "waiting";
        else this.reportData.currentStatus = "searching";
        this.reportData.nickname = eventdata.searchData.userName;
    }

    /**
     * Handler for leave lobby event
     * @returns Response currently active lobbies, if player was in playing state
     */
    async leaveLobby() {
        const previousState = this.reportData.currentStatus;
        this.reportData.currentStatus = "idle";
        this.reportData.joinedLobby = undefined;
        this.reportData.reportLobby = undefined;

        let activeLobbies: types.guildLobbyLink[] = [];
        if (previousState == "playing") {

            // send currently active lobbies if player was in a lobby (playing -> no broadcast of active lobbies)
            console.log(this.username + " left a lobby.");

            const guilds = (await sp(this.member)).member.Guilds;
            activeLobbies = this.workerCache.activeLobbies.filter(guildLobby => guilds.some(guild => guild.GuildID == guildLobby.guildId));
        }

        const response: ithilSocketServer.leaveLobbyResponseEventdata = {
            lobbyLinks: activeLobbies,
            activeLobbies: []
        };
        return response;
    }

    /**
     * Write a report for the socket's current report data:
     * - **idle**: nothing
     * - **searching, playing**: write status in db
     * - **playing**: write status in db, write lobby report in db
     */
    async updateStatus() {
        const statusIsAnyOf = (...statusNames: string[]) => statusNames.indexOf(this.reportData.currentStatus) >= 0;
        const currentMember = (await sp(this.member)).member;

        // set playing room definitely only if currently playing
        if (this.reportData.currentStatus == "playing") {
            if (!this.typosocket.socket.rooms.has("playing")) this.typosocket.socket.join("playing");
        }
        else {
            if (this.typosocket.socket.rooms.has("playing")) this.typosocket.socket.leave("playing");
        }

        if (statusIsAnyOf("playing")) {

            // write lobby report for each guild and set playing status
            if (this.reportData.reportLobby && this.reportData.joinedLobby) {

                // create a template report lobby where only ID and observe token have to be changed per guild
                const guildReportTemplate: types.guildLobby = {
                    GuildID: "",
                    ObserveToken: 0,
                    Description: this.reportData.joinedLobby.Description,
                    Key: this.reportData.joinedLobby.Key,
                    ID: this.reportData.joinedLobby.ID,
                    Restriction: this.reportData.joinedLobby.Restriction,
                    Players: this.reportData.reportLobby.Players,
                    Language: this.reportData.reportLobby.Language,
                    Private: this.reportData.reportLobby.Private,
                    Link: this.reportData.reportLobby.Link,
                    Round: this.reportData.reportLobby.Round,
                    Host: this.reportData.reportLobby.Host
                };

                // create guild-specific lobby and write to db
                const guildReportLobbies: types.guildLobby[] = [];
                (await sp(this.member)).member.Guilds.forEach(guild => {
                    const templateClone: types.guildLobby = { ...guildReportTemplate };
                    templateClone.ObserveToken = guild.ObserveToken;
                    templateClone.GuildID = guild.GuildID;
                    guildReportLobbies.push(templateClone);
                });
                //await sp(this.palantirDatabaseWorker.writeReport(guildReportLobbies));
                if (this.reportLobbyCallback) this.reportLobbyCallback({ session: this.typosocket.socket.id, lobbies: guildReportLobbies });

                // write player status to db
                const lobbyPlayerID = guildReportTemplate.Players.find(player => player.Sender)?.LobbyPlayerID;
                const status: types.playerStatus = {
                    PlayerMember: currentMember,
                    Status: this.reportData.currentStatus,
                    LobbyID: guildReportTemplate.ID,
                    LobbyPlayerID: (lobbyPlayerID ? lobbyPlayerID : 0).toString()
                }
                //await sp(this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id));
                if (this.reportStatusCallback) this.reportStatusCallback({ session: this.typosocket.socket.id, status: status, lobbyKey: guildReportTemplate.Key, login: Number(this.login) });
            }
        }
        else if (statusIsAnyOf("searching", "waiting")) {

            // write searching or waiting status
            if (this.reportData.nickname) currentMember.UserName = this.reportData.nickname;
            const status: types.playerStatus = {
                PlayerMember: currentMember,
                Status: this.reportData.currentStatus,
                LobbyID: "",
                LobbyPlayerID: ""
            }
            //await sp(this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id));
            if (this.reportStatusCallback) this.reportStatusCallback({ session: this.typosocket.socket.id, status: status, lobbyKey: "", login: Number(this.login) });
        }
        else if (statusIsAnyOf("idle")) {
            // do nothing. user is idling. yay.
        }
    }

    /**
     * Handler for store drawing event
     * @param eventdata Eventdata containing drawing meta, uri and commands
     * @returns Response data containing the stored drawing's id
     */
    async storeDrawing(eventdata: ithilSocketServer.storeDrawingEventdata) {

        function isDefined<T>(val: T | null | undefined): val is T { return val !== null && val !== undefined };

        // fill missing meta
        const sanitizedMeta: types.imageMeta = {
            author: isDefined(eventdata.meta.author) ? eventdata.meta.author : "Unknown",
            date: isDefined(eventdata.meta.date) ? eventdata.meta.date : (new Date).toString(),
            language: isDefined(eventdata.meta.language) ? eventdata.meta.language : "Unknown",
            login: this.login,
            name: isDefined(eventdata.meta.name) ? eventdata.meta.name.substring(0, 30) : "Unknown",
            own: isDefined(eventdata.meta.own) ? eventdata.meta.own : false,
            private: isDefined(eventdata.meta.private) ? eventdata.meta.private : true,
            thumbnail: isDefined(eventdata.meta.thumbnail) ? eventdata.meta.thumbnail : ""
        };

        const uuid = await this.cloud.saveDrawing({
            meta: sanitizedMeta,
            commands: eventdata.commands,
            uri: eventdata.uri
        });

        /* try to claim award drawing */
        if (eventdata.linkAwardId !== undefined) {
            await this.palantirDatabaseWorker.linkAwardToImage(eventdata.linkAwardId, uuid, this.login);
        }

        const response: ithilSocketServer.drawingIDEventdata = {
            id: uuid.toString()
        }
        return response;
    }

    /**
     * Handler for delete drawing event
     * @param eventdata Eventdata containing the target drawing's id 
     */
    async removeDrawing(eventdata: ithilSocketServer.drawingIDEventdata) {
        await this.cloud.removeDrawing(eventdata.id);
    }

    /**
     * Handler for get meta event
     * @param eventdata Eventdata containing the search metadata
     * @returns The array of drawings
     */
    async getMeta(eventdata: ithilSocketServer.getMetaEventdata) {
        const limit = eventdata.limit ? eventdata.limit : -1;
        const results = await sp(this.cloud.searchObjectsByTags(eventdata.query, limit));

        const response: ithilSocketServer.getMetaResponseEventdata = {
            images: results
        }
        return response;
    }

    async postMessage(msg: ithilSocketServer.sendMessageEventdata) {
        this.typosocket.emitEventAsync<ithilSocketServer.sendMessageEventdata, void>(eventNames.serverMessage, msg, false);
    }

    async sendSpecialDrop() {

        interface specialDropEventdata {
            key: number;
        }

        let key = Math.random();
        let now = Date.now();

        try {
            let response = await this.typosocket.emitEventAsync<specialDropEventdata, specialDropEventdata>("specialdrop", { key }, true);
            response = (response as any).payload;
            if (Date.now() - now < 10000 && response.key == key) {
                let scenes = (await this.member).scenes.split(",");
                scenes.push("7");
                let newScenes = scenes.join(",");
                await this.palantirDatabaseWorker.setUserScenes(Number(this.login), newScenes);
                this.postMessage({ title: "Merry Christmas!", message: "Oh, look what santa just dropped! Is that... an exclusive scene?! Check your inventory!" });
            }
            else {
                console.log("Special drop rejected:", response.key, key, Date.now() - now);
            }
        }
        catch (e) {
            console.log("Failed to catch special drop:" + e);
        }
    }

    /**
     * Handler for the claim drop event
     * @param eventdata Eventdata containing the claim details
     */
    async claimDrop(eventdata: ithilSocketServer.claimDropEventdata) {
        const claimTimestamp = Date.now();
        const flags = await this.flags;
        if (flags.dropBan || eventdata.timedOut
            || !this.claimDropCallback || !this.reportData.joinedLobby
            || !this.reportData.reportLobby) throw new Error("Unauthorized drop claim");

        const username = this.reportData.reportLobby.Players.find(p => p.Sender)?.Name;
        const lobbyKey = this.reportData.joinedLobby.Key;
        const userID = (await this.member).member.UserID;

        const claimData: dropClaimEventdata = {
            dropID: eventdata.dropID,
            login: this.login,
            username: username ? username : "Someone else",
            lobbyKey: lobbyKey,
            userID: userID,
            claimTicket: eventdata.claimTicket,
            claimTimestamp: claimTimestamp,
            claimVerifyDelay: Date.now() - claimTimestamp,
            workerEventloopLatency: 0,
            workerPort: 0,
            workerMasterDelay: Date.now(),
            dropMode: this.dropMode
        };
        this.claimDropCallback(claimData);
    }

    /**
     * Check if a sprite is special (replaces avatar)
     * @param spriteID The id of the target sprite
     * @returns Indicator if the sprite is special
     */
    isSpecialSprite(spriteID: number) {
        const result = this.workerCache.publicData.sprites.find(sprite => sprite.ID == spriteID);
        if (result && result.Special) return true;
        else return false;
    }

}
