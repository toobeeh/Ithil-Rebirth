"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
const make_fetch_happen_1 = __importDefault(require("make-fetch-happen"));
const ithilSocketServer_1 = require("./ithilSocketServer");
function sp(promise) {
    let stack = (new Error()).stack;
    return new Promise(async (resolve, reject) => {
        setTimeout(() => {
            reject("Caught promise after 20s - " + stack);
        }, 20000);
        const result = await promise;
        resolve(result);
    });
}
/**
 * Manage dataflow and interactions with a client socket accessing from skribbl.io using typo
 */
class TypoClient {
    /**
     * Init a new client with all member-related data and bound events
     */
    constructor(socket, dbWorker, imageDbWorker, memberInit, workerCache) {
        /** last posted webhook cache for rate-limiting */
        this.lastPostedWebhooks = [];
        this.memberCache = {};
        /** The interval in which the current playing status is processed */
        this.claimDropCallback = undefined;
        this.typosocket = socket;
        this.palantirDatabaseWorker = dbWorker;
        this.imageDatabaseWorker = imageDbWorker;
        this.workerCache = workerCache;
        this.username = memberInit.member.UserName;
        this.login = memberInit.member.UserLogin;
        this.loginDate = Date.now();
        // check banned
        setImmediate(async () => {
            if ((await this.flags).permaBan)
                this.typosocket.socket.disconnect();
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
        this.typosocket.subscribeFetchDrawingEvent(this.fetchDrawing.bind(this));
        this.typosocket.subscribeRemoveDrawingEvent(this.removeDrawing.bind(this));
        this.typosocket.subscribeGetCommandsEvent(this.getCommands.bind(this));
        this.typosocket.subscribeGetMetaEvent(this.getMeta.bind(this));
        this.typosocket.subscribeClaimDropEvent(this.claimDrop.bind(this));
        this.typosocket.subscribePostImageEvent(this.postImage.bind(this));
        // init report data 
        this.reportData = {
            currentStatus: "idle",
            nickname: this.username,
            joinedLobby: undefined,
            reportLobby: undefined,
            updateLoop: async () => {
                if (!this.typosocket.socket.connected)
                    return;
                await sp(this.updateStatus());
                setTimeout(this.reportData.updateLoop.bind(this), 2500);
            }
        };
        this.reportData.updateLoop();
        console.log(this.username + " logged in.");
        /**
         * drop specials
         */
        const dropSpecial = () => {
            setTimeout(async () => {
                if (Math.random() > 0.7) {
                    if (!((await this.member).scenes.split(",").map(scene => scene.substring(scene.lastIndexOf("."))).some(scene => scene == "7"))) {
                        this.sendSpecialDrop();
                        console.log("sent special drop to " + this.username);
                    }
                }
                dropSpecial();
            }, 1000 * 60 * 20 + 1000 * 60 * 40 * Math.random());
        };
        dropSpecial();
    }
    /**
     * Get cached data if valid
     * @param cache The cache object
     * @param validMs The validity limit
     * @returns Cached data
     */
    getCache(cache, validMs = 30000) {
        if (cache.date && cache.cache && cache.date + validMs > Date.now())
            return cache.cache;
        else
            return undefined;
    }
    /**
     * Set cached data
     * @param cache The cache object
     * @param data The new cache data
     */
    setCache(cache, data) {
        cache.cache = data;
        cache.date = Date.now();
    }
    /**
     * Clears cached data
     * @param cache The cache object
     */
    clearCache(cache) {
        cache.cache = undefined;
        cache.date = 0;
    }
    /** Get the authentificated member */
    get member() {
        const cache = this.getCache(this.memberCache);
        if (cache)
            return Promise.resolve(cache);
        else
            return new Promise(async (resolve, reject) => {
                const result = (await sp(this.palantirDatabaseWorker.getUserByLogin(Number(this.login)))).result;
                this.setCache(this.memberCache, result);
                resolve(result);
            });
    }
    /** Get the member's current sprite slots */
    get spriteSlots() {
        return new Promise(async (resolve) => {
            const member = await sp(this.member);
            const flags = await sp(this.flags);
            let slots = 1;
            slots += Math.floor(member.drops / 1000);
            if (flags.patron)
                slots++;
            if (flags.admin)
                slots += 100;
            resolve(slots);
        });
    }
    /** Get the member's current sprite inventory */
    get spriteInventory() {
        return new Promise(async (resolve) => {
            const inv = await sp(this.member);
            const sprites = inv.sprites.split(",").map(item => {
                return {
                    slot: item.split(".").length - 1,
                    id: Number(item.split(".").join(""))
                };
            });
            resolve(sprites);
        });
    }
    /** Get the authentificated member's flags */
    get flags() {
        return new Promise(async (resolve) => {
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
    /**
     * Handler for a disconnect event
     * @param reason Socketio disconnect reason
     */
    async onDisconnect(reason) {
        const flags = await sp(this.flags);
        if (!flags.admin || !flags.patron || !flags.unlimitedCloud) {
            await sp(this.imageDatabaseWorker.removeEntries(this.login, this.loginDate - 1000 * 60 * 60 * 24 * 30));
        }
        this.imageDatabaseWorker.close();
        this.palantirDatabaseWorker.close();
        threads_1.Thread.terminate(this.imageDatabaseWorker);
        threads_1.Thread.terminate(this.palantirDatabaseWorker);
        console.log(this.username + " disconnected.");
    }
    /**
     * Handler for get user event
     * @returns Event response data containing user, flags and slots
     */
    async getUser() {
        this.clearCache(this.memberCache);
        const data = {
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
    async setSpriteSlot(eventdata) {
        this.clearCache(this.memberCache);
        const slots = await this.spriteSlots;
        const currentInv = await this.spriteInventory;
        const flags = await this.flags;
        // check if slot is valid and sprite is owned
        if (flags.admin || slots >= eventdata.slot && eventdata.slot > 0 && currentInv.some(inv => inv.id == eventdata.sprite)) {
            // disable old slot sprite and activate new - if new is special, disable old special
            const targetIsSpecial = this.isSpecialSprite(eventdata.sprite);
            currentInv.forEach(prop => {
                if (prop.slot == eventdata.slot)
                    prop.slot = 0;
                else if (targetIsSpecial && prop.slot > 0 && this.isSpecialSprite(prop.id))
                    prop.slot = 0;
                else if (prop.id == eventdata.sprite)
                    prop.slot = eventdata.slot;
            });
            const newInv = currentInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.palantirDatabaseWorker.setUserSprites(Number(this.login), newInv);
        }
        // return updated data
        this.clearCache(this.memberCache);
        const data = {
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
    async setSpriteCombo(eventdata) {
        const combo = eventdata.combostring.split(",").map(slot => {
            return {
                id: Number(slot.split(".").join("")),
                slot: slot.split(".").length - 1
            };
        });
        this.clearCache(this.memberCache);
        const currentInv = await this.spriteInventory;
        const slots = await this.spriteSlots;
        const flags = await this.flags;
        // validate combo - if there are no sprites in the combo which are not in the inventory, and max slot is valid
        const spritesValid = !combo.some(comboSprite => !currentInv.some(invSprite => invSprite.id == comboSprite.id));
        const maxSlotValid = Math.max.apply(Math, combo.map(slot => slot.slot)) <= slots;
        // change combo only if full combo is valid, else abort *all*
        if (flags.admin || maxSlotValid && spritesValid) {
            const newInv = [];
            currentInv.forEach(sprite => {
                const spriteInCombo = combo.find(comboSprite => comboSprite.id == sprite.id);
                if (spriteInCombo)
                    newInv.push(spriteInCombo);
                else
                    newInv.push({ id: sprite.id, slot: 0 });
            });
            const newInvString = newInv.map(prop => ".".repeat(prop.slot) + prop.id).join(",");
            await this.palantirDatabaseWorker.setUserSprites(Number(this.login), newInvString);
        }
        // return updated data
        this.clearCache(this.memberCache);
        const data = {
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
    async postImage(eventdata) {
        const memberServers = (await this.getUser()).user.member.Guilds;
        const postServer = memberServers.find(server => server.GuildID == eventdata.serverID);
        /* if user is in this server */
        if (postServer) {
            const serverWebhooks = await this.palantirDatabaseWorker.getServerWebhooks(postServer.GuildID);
            const postWebhook = serverWebhooks.result.find(webhook => webhook.Name == eventdata.webhookName);
            /* if there exists a webhook of that name*/
            if (postWebhook) {
                /* if ratelimit not exceeded */
                if (!this.lastPostedWebhooks.some(wh => wh.serverID == postServer.GuildID && Date.now() - wh.postDate > 60 * 1000)) {
                    /* save image with orthanc api */
                    const formdata = new URLSearchParams();
                    formdata.append("image", eventdata.imageURI);
                    formdata.append("accessToken", eventdata.accessToken);
                    const response = await (0, make_fetch_happen_1.default)('https://tobeh.host/Orthanc/tokenapi/imagepost/', {
                        method: 'POST',
                        headers: {
                            'Accept': '*/*'
                        },
                        body: formdata
                    });
                    let url = await response.text();
                    /* build webhook data */
                    const webhookData = {};
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
                    await (0, make_fetch_happen_1.default)(postWebhook.WebhookURL, {
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
    async joinLobby(eventdata) {
        console.log(this.username + " joined a lobby.");
        this.reportData.currentStatus = "playing";
        const key = eventdata.key;
        let success = false;
        let lobby = {};
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
        const response = {
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
    async setLobby(eventdata) {
        let owner = false;
        let ownerID = 0;
        let updatedLobby = {};
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
        const response = {
            lobbyData: {
                lobby: updatedLobby
            },
            owner: owner,
            ownerID: ownerID
        };
        return response;
    }
    /**
     * Handler for search lobby event
     * @param eventdata Eventdata conatining search nickname of the client
     */
    async searchLobby(eventdata) {
        if (eventdata.searchData.waiting)
            this.reportData.currentStatus = "waiting";
        else
            this.reportData.currentStatus = "searching";
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
        let activeLobbies = [];
        if (previousState == "playing") {
            // send currently active lobbies if player was in a lobby (playing -> no broadcast of active lobbies)
            console.log(this.username + " left a lobby.");
            const guilds = (await sp(this.member)).member.Guilds;
            activeLobbies = this.workerCache.activeLobbies.filter(guildLobby => guilds.some(guild => guild.GuildID == guildLobby.guildID));
        }
        const response = {
            activeLobbies: activeLobbies
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
        const statusIsAnyOf = (...statusNames) => statusNames.indexOf(this.reportData.currentStatus) >= 0;
        const currentMember = (await sp(this.member)).member;
        // set playing room definitely only if currently playing
        if (this.reportData.currentStatus == "playing") {
            if (!this.typosocket.socket.rooms.has("playing"))
                this.typosocket.socket.join("playing");
        }
        else {
            if (this.typosocket.socket.rooms.has("playing"))
                this.typosocket.socket.leave("playing");
        }
        if (statusIsAnyOf("playing")) {
            // write lobby report for each guild and set playing status
            if (this.reportData.reportLobby && this.reportData.joinedLobby) {
                // create a template report lobby where only ID and observe token have to be changed per guild
                const guildReportTemplate = {
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
                const guildReportLobbies = [];
                (await sp(this.member)).member.Guilds.forEach(guild => {
                    const templateClone = { ...guildReportTemplate };
                    templateClone.ObserveToken = guild.ObserveToken;
                    templateClone.GuildID = guild.GuildID;
                    guildReportLobbies.push(templateClone);
                });
                await sp(this.palantirDatabaseWorker.writeReport(guildReportLobbies));
                // write player status to db
                const lobbyPlayerID = guildReportTemplate.Players.find(player => player.Sender)?.LobbyPlayerID;
                const status = {
                    PlayerMember: currentMember,
                    Status: this.reportData.currentStatus,
                    LobbyID: guildReportTemplate.ID,
                    LobbyPlayerID: (lobbyPlayerID ? lobbyPlayerID : 0).toString()
                };
                await sp(this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id));
            }
        }
        else if (statusIsAnyOf("searching", "waiting")) {
            // write searching or waiting status
            if (this.reportData.nickname)
                currentMember.UserName = this.reportData.nickname;
            const status = {
                PlayerMember: currentMember,
                Status: this.reportData.currentStatus,
                LobbyID: "",
                LobbyPlayerID: ""
            };
            await sp(this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id));
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
    async storeDrawing(eventdata) {
        // fill missing meta
        const sanitizedMeta = {
            author: eventdata.meta.author ? eventdata.meta.author : "Unknown artist",
            date: eventdata.meta.date ? eventdata.meta.date : (new Date).toString(),
            language: eventdata.meta.language ? eventdata.meta.language : "Unknown language",
            login: this.login,
            name: eventdata.meta.name ? eventdata.meta.name : "Unknown name",
            own: eventdata.meta.own ? eventdata.meta.own : false,
            private: eventdata.meta.private ? eventdata.meta.private : true,
            thumbnail: eventdata.meta.thumbnail ? eventdata.meta.thumbnail : ""
        };
        // add content to tables
        const id = Date.now().toString();
        await sp(this.imageDatabaseWorker.addDrawing(this.login, id, sanitizedMeta));
        await sp(this.imageDatabaseWorker.addDrawCommands(id, eventdata.commands));
        await sp(this.imageDatabaseWorker.addURI(id, eventdata.uri));
        const response = {
            id: id
        };
        return response;
    }
    /**
     * Handler for fetch drawing event
     * @param eventdata Eventdata containing the target drawing's id and wether the commands should be sent
     * @returns Response data containing image data
     */
    async fetchDrawing(eventdata) {
        const dbRes = await sp(this.imageDatabaseWorker.getDrawing(eventdata.id));
        if (!eventdata.withCommands)
            dbRes.result.commands = [];
        const response = {
            drawing: dbRes.result
        };
        return response;
    }
    /**
     * Handler for delete drawing event
     * @param eventdata Eventdata containing the target drawing's id
     */
    async removeDrawing(eventdata) {
        await sp(this.imageDatabaseWorker.removeDrawing(this.login, eventdata.id));
    }
    /**
     * Handler for get commands event
     * @param eventdata Eventdata containing the target drawing's id
     * @returns The array of commands
     */
    async getCommands(eventdata) {
        const dbResult = await sp(this.imageDatabaseWorker.getDrawing(eventdata.id));
        const response = {
            commands: dbResult.result.commands
        };
        return response;
    }
    /**
     * Handler for get meta event
     * @param eventdata Eventdata containing the search metadata
     * @returns The array of drawings
     */
    async getMeta(eventdata) {
        const limit = eventdata.limit ? eventdata.limit : -1;
        const dbResult = await sp(this.imageDatabaseWorker.getUserMeta(this.login, limit, eventdata.query));
        const response = {
            drawings: dbResult.result
        };
        return response;
    }
    async postMessage(msg) {
        this.typosocket.emitEventAsync(ithilSocketServer_1.eventNames.serverMessage, msg, false);
    }
    async sendSpecialDrop() {
        let key = Math.random();
        let now = Date.now();
        try {
            let response = await this.typosocket.emitEventAsync("specialdrop", { key }, true);
            response = response.payload;
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
    async claimDrop(eventdata) {
        const flags = await this.flags;
        const claimTimestamp = Date.now();
        if (flags.dropBan || eventdata.timedOut
            || !this.claimDropCallback || !this.reportData.joinedLobby
            || !this.reportData.reportLobby)
            throw new Error("Unauthorized drop claim");
        const username = this.reportData.reportLobby.Players.find(p => p.Sender)?.Name;
        const lobbyKey = this.reportData.joinedLobby.Key;
        const userID = (await this.member).member.UserID;
        const claimData = {
            dropID: eventdata.dropID,
            login: this.login,
            username: username ? username : "Someone else",
            lobbyKey: lobbyKey,
            userID: userID,
            claimTicket: eventdata.claimTicket,
            claimTimestamp: claimTimestamp,
            claimVerifyDelay: Date.now() - claimTimestamp,
            workerEventloopLatency: 0,
            workerPort: 0
        };
        this.claimDropCallback(claimData);
    }
    /**
     * Check if a sprite is special (replaces avatar)
     * @param spriteID The id of the target sprite
     * @returns Indicator if the sprite is special
     */
    isSpecialSprite(spriteID) {
        const result = this.workerCache.publicData.sprites.find(sprite => sprite.ID == spriteID);
        if (result && result.Special)
            return true;
        else
            return false;
    }
}
exports.default = TypoClient;
//# sourceMappingURL=typoClient.js.map