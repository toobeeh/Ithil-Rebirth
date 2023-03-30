"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const drops_1 = __importDefault(require("../../drops"));
const mysql2 = __importStar(require("mysql2/promise"));
/**
 * Palantir/Typo main db access
 */
class PalantirDatabase {
    async open(user, password, host, poolSize = 5) {
        this.pool = mysql2.createPool({
            host: host,
            user: user,
            password: password != "" ? password : undefined,
            database: "palantir",
            connectionLimit: poolSize,
            waitForConnections: true,
            queueLimit: 0
        });
    }
    async getConnection() {
        if (!this.pool)
            throw new Error("database pool has not been opened yet");
        return await this.pool.getConnection();
    }
    /**
     * Close the db connection
     */
    close() {
        this.pool?.end();
    }
    /**
     * Generates an empty database result
     */
    emptyResult() {
        let empty = {
            success: false,
            result: {}
        };
        return empty;
    }
    async get(query, values) {
        let conn = await this.getConnection();
        let [rows, fields] = await conn.query(query, values);
        return rows;
    }
    async update(query, values) {
        let conn = await this.getConnection();
        let [results, fields] = await conn.query(query, values);
        return results;
    }
    async first(query, values) {
        let results = await this.get(query, values);
        if (results.length > 0)
            return results[0];
        else
            return null;
    }
    /**
     * Get a palantir user by their login
     * @param login The user's login token
     * @returns The palantir user object
     */
    async getUserByLogin(login) {
        let result = this.emptyResult();
        try {
            let row = await this.first("SELECT * FROM Members WHERE Login = ?", [login]);
            if (!row)
                throw new Error("no member found");
            result.result = {
                member: JSON.parse(row.Member),
                bubbles: Number(row.Bubbles),
                sprites: row.Sprites,
                drops: Number(row.Drops),
                flags: row.Flag,
                scenes: row.Scenes ? row.Scenes : "",
                rainbowSprites: row.RainbowSprites ? row.RainbowSprites : "",
                webhooks: []
            };
            /* get weighted league drops */
            let weight = 0;
            let rows = await this.get(`SELECT LeagueWeight FROM PastDrops WHERE CaughtLobbyPlayerID = ? AND LeagueWeight > 0 AND EventDropID = 0`, [result.result.member.UserID]);
            rows.forEach(row => {
                try {
                    let time = Number(row.LeagueWeight);
                    let weighted = drops_1.default.leagueWeight(time / 1000);
                    weight += weighted;
                }
                catch (e) {
                    console.warn("Error calculating drop weight: ", e);
                }
            });
            result.result.drops += Math.floor(weight / 100);
            /* get webhooks */
            for (const guild of result.result.member.Guilds) {
                const guildHooks = await this.getServerWebhooks(guild.GuildID, true);
                result.result.webhooks = result.result.webhooks.concat(...guildHooks.result);
            }
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Get a palantir user login by access token
     * @param accessToken The user's access token
     * @returns The user's login token
     */
    async getLoginFromAccessToken(accessToken, silent) {
        let result = this.emptyResult();
        try {
            let row = await this.first("SELECT * FROM AccessTokens WHERE AccessToken = ?", [accessToken]);
            if (!row)
                throw new Error("no token found");
            result.result = {
                accessToken: row.AccessToken,
                login: row.Login,
                createdAt: row.CreatedAt.toString()
            };
            result.success = true;
        }
        catch (e) {
            if (!silent)
                console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Set the scenes of a palantir user
     * @param accessToken The user's access token
     * @returns An indicator for the query's success
     */
    async setUserScenes(login, scenes) {
        let result = false;
        try {
            await this.update("UPDATE Members SET Scenes = ? WHERE Login = ?", [scenes, login]);
            result = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Set the sprites of a palantir user
     * @param accessToken The user's access token
     * @returns An indicator for the query's success
     */
    async setUserSprites(login, sprites) {
        let result = false;
        try {
            await this.update("UPDATE Members SET Sprites = ? WHERE Login = ?", [sprites, login]);
            result = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Gets all active plantir lobbies
     * @returns An array of palantir lobbies
     */
    async getActiveLobbies() {
        let result = this.emptyResult();
        try {
            let rows = await this.get(`SELECT CONCAT('"', GuildID, '"') as GuildID, Lobbies FROM GuildLobbies`, []);
            result.result = [];
            rows.forEach(row => {
                try {
                    result.result?.push({
                        guildID: JSON.parse(row.GuildID),
                        guildLobbies: JSON.parse(row.Lobbies)
                    });
                }
                catch (e) {
                    console.warn("Error parsing lobby JSON: ", e);
                }
            });
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
      * Gets public data
      * @returns palantir public data
      */
    async getPublicData() {
        let result = this.emptyResult();
        try {
            const eventdrops = await this.get("SELECT * FROM EventDrops LEFT JOIN Events ON EventDrops.EventID = Events.EventID", []);
            // get active sprites
            const onlinesprites = await this.get("SELECT * FROM OnlineSprites WHERE Slot > 0", []);
            // get active scenes
            const onlinescenes = await this.get("SELECT * FROM OnlineSprites WHERE Slot < 0", []);
            // get sprites
            const sprites = await this.get("SELECT * FROM Sprites", []);
            // get scenes
            const scenes = await this.get("SELECT * FROM Scenes", []);
            // get online items
            let now = Math.round(Date.now() / 1000);
            const onlineitems = await this.get("SELECT * FROM OnlineItems WHERE Date > " + (now - 25).toString() + "", []);
            result.result = {
                drops: eventdrops.map(d => ({ EventDropID: d.EventDropID, EventID: d.EventID, Name: d.Name, URL: d.URL })),
                onlineSprites: onlinesprites,
                onlineScenes: onlinescenes,
                onlineItems: onlineitems,
                sprites: sprites,
                scenes: scenes.map(s => { if (!s.GuessedColor)
                    s.GuessedColor = ""; return s; })
            };
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Sets the properties of a lobby
     * @param id The id of the lobby
     * @param key The lobby key generated depending on its properties
     * @param description The lobby description for the Palantir bot
     * @param restriction The restriction state (unrestricted/ID/restricted)
     * @returns Indicator if the query succeeded
     */
    async setLobby(id, key, description = "", restriction = "") {
        let success = false;
        try {
            await this.update("REPLACE INTO Lobbies VALUES(?,?)", [id, JSON.stringify({ ID: id, Key: key, Description: description, Restriction: restriction })]);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
      * Gets a lobby either by its id or key
      * @param value The user's access token
      * @returns The palantir lobby
      */
    async getLobby(value, indicator = "key") {
        let result = this.emptyResult();
        result.result = { found: false, lobby: null };
        try {
            if (indicator == "key") {
                let rows = await this.get("SELECT * FROM Lobbies", []);
                // iterate through lobbies and check if lobby kay matches
                for (const row of rows) {
                    let lobby = JSON.parse(row.Lobby);
                    if (lobby.Key == value) {
                        result.result.lobby = lobby;
                        result.result.found = true;
                    }
                }
                result.success = true;
            }
            else if (indicator == "id") {
                let res = await this.first("SELECT * FROM Lobbies WHERE LobbyID LIKE ?", [value]);
                if (res) {
                    result.result.lobby = JSON.parse(res.Lobby);
                    result.result.found = true;
                }
                result.success = true;
            }
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Writes a lobby report for a player
     * @param lobbies An array of lobby reports, containing the lobby and guild data
     * @returns Indicator if the query succeeded
     */
    async writeReport(lobbies) {
        let success = false;
        try {
            let query = "REPLACE INTO Reports VALUES " + lobbies.map(s => "(?,?,?, CURRENT_TIMESTAMP)").join(", ");
            let params = lobbies.map(lobby => [lobby.ID, lobby.ObserveToken, JSON.stringify(lobby)]).flat();
            await this.update(query, params);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
      * Write a player's status for a certain session
      * @param status The status object containing status information
      * @param key The session id of the status
      * @returns Indicator if the query succeeded
      */
    async writePlayerStatusBulk(statuses) {
        let success = false;
        try {
            let query = "REPLACE INTO Status VALUES " + statuses.map(s => "(?, ?, CURRENT_TIMESTAMP)").join(", ");
            let params = statuses.map(s => [s.session, JSON.stringify(s.status)]).flat();
            this.update(query, params);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
     *  Clear volatile data as reports, status, onlinesprites etc
     * @returns Indicator if the query succeeded
     */
    async clearVolatile() {
        let success = false;
        try {
            await this.get("DELETE FROM Reports WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND)", []);
            await this.get("DELETE FROM Status WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -10 SECOND)", []);
            await this.get("DELETE FROM OnlineSprites WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND)", []);
            await this.get("DELETE FROM OnlineItems WHERE FROM_UNIXTIME(Date) < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND)", []);
            await this.get("DELETE FROM Lobbies WHERE json_extract(Lobby, '$.ID') NOT IN (SELECT DISTINCT json_extract(Status, '$.LobbyID') FROM Status WHERE json_extract(Status, '$.LobbyID') IS NOT NULL) AND FROM_UNIXTIME(LobbyID / 1000) < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -24 HOUR);", []);
            // delete duplicate keys with different IDs
            let lobbies = await this.get("SELECT LobbyID, json_extract(Lobby, '$.Key') as LobbyKey FROM Lobbies", []);
            lobbies.forEach(async (lobby, index) => {
                if (lobbies.findIndex(unique => lobby.LobbyKey == unique.LobbyKey) != index && lobby.LobbyKey.indexOf("https") < 0) {
                    console.log("dupe found:" + lobby.LobbyKey + lobby.LobbyID);
                    await this.get("DELETE FROM Lobbies WHERE LobbyID = ?", [lobby.LobbyID]);
                }
            });
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
      * Get a drop by its ID
      * @param id ID of the drop; if -1 the current drop is returned
      * @returns The drop
      */
    async getDrop(id = "") {
        let result = this.emptyResult();
        try {
            // get drop
            let drop = id != "" ?
                await this.first("SELECT * FROM NextDrop WHERE DropID = ?", [id]) :
                await this.first("SELECT * FROM NextDrop", []);
            result.success = true;
            result.result = drop;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
      * Claim a drop for a user
      * @param lobbyKey Lobby key of the claiming user
      * @param playerName Skribbl name of the claiming user
      * @param dropID ID of the drop to claim, must be valid for successful claim
      * @param userid Discord ID of the claiming user
      * @returns Indicator if the query succeeded
      */
    async claimDrop(lobbyKey, playerName, dropID, userid, leagueweight, dropOrigin) {
        let success = false;
        try {
            // get drop
            if (leagueweight == 0)
                this.update("UPDATE NextDrop SET CaughtLobbyKey = ?, CaughtLobbyPlayerID = ? WHERE DropID = ?", [lobbyKey, playerName, dropID]);
            await this.update("INSERT INTO PastDrops VALUES (?, ?, ?, ?, ?, ?)", [dropID, lobbyKey, userid, dropOrigin.ValidFrom, dropOrigin.EventDropID, leagueweight]);
            //this.db.prepare("UPDATE PastDrops SET CaughtLobbyPlayerID = ?, CaughtLobbyKey = ?, LeagueWeight = ? WHERE DropID = ?").run(userid, lobbyKey, leagueweight, dropID);
            // if league drop, free up for next claim
            //if(leagueweight > 0) this.db.prepare("UPDATE 'Drop' SET CaughtLobbyKey = '', CaughtLobbyPlayerID = '' WHERE DropID = ?").run(dropID);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
      * Reward a drop to a user
      * @param login The login of the player that is being rewarded
      * @param eventdrop ID of the eventdrop, if associated with an event
      * @returns Indicator if the query succeeded
      */
    async rewardDrop(login, eventdrop) {
        let success = false;
        try {
            // get drop
            if (eventdrop > 0) {
                let result = await this.update("UPDATE EventCredits SET Credit = Credit + 1 WHERE EventDropID = ? AND Login = ?", [eventdrop, login]);
                if (result.changedRows <= 0)
                    await this.get("INSERT INTO EventCredits VALUES(?, ?, 1)", [login, eventdrop]);
            }
            else
                await this.get("UPDATE Members SET Drops = Drops + 1 WHERE Login = ?", [login]);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }
    /**
      * Check if a player is the palantir owner of a lobby
      * @param lobbyID The ID of the target lobby
      * @param lobbyPlayerID The ID of the target player in the skribbl lobby
      * @returns Indicator if the passed id is the owner as well as the actual owner id
      */
    async isPalantirLobbyOwner(lobbyID, lobbyPlayerID) {
        let result = this.emptyResult();
        try {
            let lobbyplayers = await this.get("SELECT json_extract(Status, '$.LobbyPlayerID') as playerid from Status where json_extract(Status, '$.LobbyID') = ?", [lobbyID]);
            result.result.owner = !lobbyplayers.some(player => Number(player.playerid) < lobbyPlayerID);
            if (lobbyplayers.length > 0)
                result.result.ownerID = lobbyplayers.sort((a, b) => a.playerid - b.playerid)[0].playerid;
            else {
                // if there are no online players for this lobby, user is most likely owner and the status was not yet written 
                result.result.owner = true;
                result.result.ownerID = lobbyPlayerID;
            }
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
    /**
     * Check if a player is the palantir owner of a lobby
     * @param lobbyID The ID of the target lobby
     * @param lobbyPlayerID The ID of the target player in the skribbl lobby
     * @returns Indicator if the passed id is the owner as well as the actual owner id
     */
    async getServerWebhooks(serverID, censorURL = false) {
        let result = this.emptyResult();
        try {
            let rows = await this.get(`SELECT * FROM Webhooks WHERE ServerID = ?`, [serverID]);
            result.result = [];
            rows.forEach(row => {
                try {
                    result.result?.push({
                        ServerID: row.ServerID,
                        Name: row.Name,
                        WebhookURL: censorURL ? ":^)" : row.WebhookURL
                    });
                }
                catch (e) {
                    console.warn("Error adding webhook: ", e);
                }
            });
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
}
exports.default = PalantirDatabase;
//# sourceMappingURL=palantirDatabase.js.map