"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
/**
 * Manage dataflow and interactions with a client socket accessing from skribbl.io using typo
 */
class TypoClient {
    /**
     * Init a new client with all member-related data and bound events
     */
    constructor(socket, dbWorker, imageDbWorker, memberInit, workerCache) {
        /** The interval in which the current playing status is processed */
        this.updateStatusInterval = undefined;
        /** The interval in which the current playing status is processed */
        this.claimDropCallback = undefined;
        this.typosocket = socket;
        this.palantirDatabaseWorker = dbWorker;
        this.imageDatabaseWorker = imageDbWorker;
        this.workerCache = workerCache;
        this.username = memberInit.member.UserName;
        this.login = memberInit.member.UserLogin;
        this.loginDate = Date.now();
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
        // init report data 
        this.reportData = {
            currentStatus: "idle",
            nickname: this.username,
            joinedLobby: undefined,
            reportLobby: undefined,
            updateInterval: setInterval(this.updateStatus.bind(this), 2500)
        };
        console.log(this.username + " logged in.");
    }
    /** Get the authentificated member */
    get member() {
        return new Promise(async (resolve) => {
            resolve((await this.palantirDatabaseWorker.getUserByLogin(Number(this.login))).result);
        });
    }
    /** Get the member's current sprite slots */
    get spriteSlots() {
        return new Promise(async (resolve) => {
            const member = await this.member;
            const flags = await this.flags;
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
            const inv = await this.member;
            const sprites = inv.sprites.split(",").map(item => {
                return {
                    slot: item.split(".").length - 1,
                    id: Number(item.replace(".", ""))
                };
            });
            resolve(sprites);
        });
    }
    /** Get the authentificated member's flags */
    get flags() {
        return new Promise(async (resolve) => {
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
    /**
     * Handler for a disconnect event
     * @param reason Socketio disconnect reason
     */
    async onDisconnect(reason) {
        const flags = await this.flags;
        if (!flags.admin || !flags.patron || !flags.unlimitedCloud) {
            await this.imageDatabaseWorker.removeEntries(this.login, this.loginDate - 1000 * 60 * 60 * 24 * 30);
        }
        await this.palantirDatabaseWorker.close();
        await this.imageDatabaseWorker.close();
        await threads_1.Thread.terminate(this.palantirDatabaseWorker);
        await threads_1.Thread.terminate(this.imageDatabaseWorker);
        console.log(this.username + " disconnected and closed threads/dbs.");
    }
    /**
     * Handler for get user event
     * @returns Event response data containing user, flags and slots
     */
    async getUser() {
        const data = {
            user: await this.member,
            flags: await this.flags,
            slots: await this.spriteSlots
        };
        return data;
    }
    /**
     * Handler for set slot event
     * @param eventdata Eventdata conaining slot and sprite id
     * @returns Response data containing updated user, flags and slots
     */
    async setSpriteSlot(eventdata) {
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
                id: Number(slot.replace(".", "")),
                slot: slot.split(".").length - 1
            };
        });
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
        const data = {
            user: await this.member,
            flags: flags,
            slots: slots
        };
        return data;
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
        const lobbyResult = await this.palantirDatabaseWorker.getLobby(key, "key");
        // create new lobby if none found for key, but query succeeded
        if (!lobbyResult.result.found || !lobbyResult.result.lobby) {
            if (lobbyResult.success) {
                const newLobbyResult = await this.palantirDatabaseWorker.setLobby(Date.now().toString(), key);
                // if new lobby was successfully added, get it
                if (newLobbyResult) {
                    const createdLobbyResult = await this.palantirDatabaseWorker.getLobby(key, "key");
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
                const ownerResult = await this.palantirDatabaseWorker.isPalantirLobbyOwner(this.reportData.joinedLobby.ID, senderID);
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
                    const currentLobby = (await this.palantirDatabaseWorker.getLobby(this.reportData.joinedLobby.ID, "id")).result.lobby;
                    if (currentLobby) {
                        restriction = currentLobby.Restriction;
                        description = currentLobby.Description;
                    }
                }
                await this.palantirDatabaseWorker.setLobby(this.reportData.joinedLobby.ID, key, description, restriction);
            }
            const updatedLobbyResult = (await this.palantirDatabaseWorker.getLobby(this.reportData.joinedLobby.ID, "id")).result.lobby;
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
            const guilds = (await this.member).member.Guilds;
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
        const currentMember = (await this.member).member;
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
                (await this.member).member.Guilds.forEach(guild => {
                    const templateClone = { ...guildReportTemplate };
                    templateClone.ObserveToken = guild.ObserveToken;
                    templateClone.GuildID = guild.GuildID;
                    guildReportLobbies.push(templateClone);
                });
                await this.palantirDatabaseWorker.writeReport(guildReportLobbies);
                // write player status to db
                const lobbyPlayerID = guildReportTemplate.Players.find(player => player.Sender)?.LobbyPlayerID;
                const status = {
                    PlayerMember: currentMember,
                    Status: this.reportData.currentStatus,
                    LobbyID: guildReportTemplate.ID,
                    LobbyPlayerID: (lobbyPlayerID ? lobbyPlayerID : 0).toString()
                };
                await this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id);
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
            await this.palantirDatabaseWorker.writePlayerStatus(status, this.typosocket.socket.id);
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
        await this.imageDatabaseWorker.addDrawing(this.login, id, sanitizedMeta);
        await this.imageDatabaseWorker.addDrawCommands(id, eventdata.commands);
        await this.imageDatabaseWorker.addURI(id, eventdata.uri);
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
        const dbRes = await this.imageDatabaseWorker.getDrawing(eventdata.id);
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
        await this.imageDatabaseWorker.removeDrawing(this.login, eventdata.id);
    }
    /**
     * Handler for get commands event
     * @param eventdata Eventdata containing the target drawing's id
     * @returns The array of commands
     */
    async getCommands(eventdata) {
        const dbResult = await this.imageDatabaseWorker.getDrawing(eventdata.id);
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
        const dbResult = await this.imageDatabaseWorker.getUserMeta(this.login, limit, eventdata.meta);
        const response = {
            drawings: dbResult.result
        };
        return response;
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
            claimVerifyDelay: Date.now() - claimTimestamp
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