"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
/**
 * Palantir/Typo main db access
 */
class PalantirDatabase {
    /**
     * Create a new palantir db connection
     * @param path Path to the sqlite3 db file
     */
    constructor(path) {
        this.db = new better_sqlite3_1.default(path);
        this.db.pragma('journal_mode = WAL');
    }
    /**
     * Close the db connection
     */
    close() {
        this.db.close();
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
    /**
     * Get a palantir user by their login
     * @param login The user's login token
     * @returns The palantir user object
     */
    getUserByLogin(login) {
        let result = this.emptyResult();
        try {
            let row = this.db.prepare("SELECT * FROM Members WHERE Login = ?").get(login);
            result.result = {
                memberDiscordDetails: JSON.parse(row.Member),
                bubbles: Number(row.Bubbles),
                sprites: row.Sprites,
                drops: Number(row.Drops),
                flags: row.Flag,
                scenes: row.Scenes
            };
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
    getLoginFromAccessToken(accessToken) {
        let result = this.emptyResult();
        try {
            let row = this.db.prepare("SELECT * FROM AccessTokens WHERE AccessToken = ?").get(accessToken);
            result.result = {
                accessToken: row.AccessToken,
                login: row.Login,
                createdAt: row.CreatedAt
            };
            result.success = true;
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
    setUserSprites(login, sprites) {
        let result = false;
        try {
            this.db.prepare("UPDATE Members SET Sprites = ? WHERE Login = ?").run(sprites, login);
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
    getActiveLobbies() {
        let result = this.emptyResult();
        try {
            let rows = this.db.prepare(`SELECT '"' || GuildID || '"' as GuildID, Lobbies FROM GuildLobbies`).all();
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
    getPublicData() {
        let result = this.emptyResult();
        try {
            const eventdrops = this.db.prepare("SELECT * FROM EventDrops LEFT JOIN Events ON EventDrops.EventID = Events.EventID").all();
            // get active sprites
            const onlinesprites = this.db.prepare("SELECT * FROM OnlineSprites WHERE Slot > 0").all();
            // get active scenes
            const onlinescenes = this.db.prepare("SELECT * FROM OnlineSprites WHERE Slot < 0").all();
            // get sprites
            const sprites = this.db.prepare("SELECT * FROM Sprites").all();
            // get scenes
            const scenes = this.db.prepare("SELECT * FROM Scenes").all();
            result.result = {
                drops: eventdrops,
                onlineSprites: onlinesprites,
                onlineScenes: onlinescenes,
                sprites: sprites,
                scenes: scenes
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
    setLobby(id, key, description = "", restriction = "") {
        let success = false;
        try {
            this.db.prepare("REPLACE INTO Lobbies VALUES(?,?)").run(id, JSON.stringify({ ID: id, Key: key, Description: description, Restriction: restriction }));
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
    getLobby(value, indicator = "key") {
        let result = this.emptyResult();
        result.result = { found: false, lobby: null };
        try {
            if (indicator == "key") {
                let stmt = this.db.prepare("SELECT * FROM LOBBIES");
                // iterate through lobbies and check if lobby kay matches
                for (const row of stmt.iterate()) {
                    let lobby = JSON.parse(row.Lobby);
                    if (lobby.Key == value) {
                        result.result.lobby = lobby;
                        result.result.found = true;
                    }
                }
                result.success = true;
            }
            else if (indicator == "id") {
                let res = this.db.prepare("SELECT * FROM Lobbies WHERE LobbyID LIKE ?").get(value);
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
    writeReport(lobbies) {
        let success = false;
        try {
            lobbies.forEach(lobby => {
                this.db.prepare("REPLACE INTO REPORTS VALUES(?,?,?,datetime('now'))")
                    .run(lobby.ID, lobby.ObserveToken, JSON.stringify(lobby));
            });
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
    writePlayerStatus(status, session) {
        let success = false;
        try {
            this.db.prepare("REPLACE INTO Status VALUES(?,?,datetime('now'))").run(session, JSON.stringify(status));
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
    clearVolatile() {
        let success = false;
        try {
            this.db.prepare("DELETE FROM Reports WHERE Date < datetime('now', '-30 seconds')").run();
            this.db.prepare("DELETE FROM Status WHERE Date < datetime('now', '-10 seconds')").run();
            this.db.prepare("DELETE FROM OnlineSprites WHERE Date < datetime('now', '-30 seconds')").run();
            this.db.prepare("DELETE From Lobbies WHERE json_extract(Lobby, '$.ID') NOT IN (SELECT DISTINCT json_extract(Status, '$.LobbyID') from Status WHERE json_extract(Status, '$.LobbyID') IS NOT NULL) AND " + Date.now() + " - LobbyID > 60000;").run();
            // delete duplicate keys with different IDs
            let lobbies = this.db.prepare("SELECT LobbyID, json_extract(Lobby, '$.Key') as LobbyKey FROM Lobbies").all();
            lobbies.forEach((lobby, index) => {
                if (lobbies.findIndex(unique => lobby.LobbyKey == unique.LobbyKey) != index && lobby.LobbyKey.indexOf("https") < 0) {
                    console.log("dupe found:" + lobby.LobbyKey + lobby.LobbyID);
                    this.db.prepare("DELETE FROM Lobbies WHERE LobbyID = ?").run(lobby.LobbyID);
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
    getDrop(id = -1) {
        let result = this.emptyResult();
        try {
            // get drop
            let drop = id > -1 ? this.db.prepare("SELECT * FROM 'Drop' WHERE DropID = ?").get(id) :
                this.db.prepare("SELECT * FROM 'Drop'").get();
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
      * @param userid Lobby key of the claiming user
      * @param palyerName Skribbl name of the claiming user
      * @param dropID ID of the drop to claim, must be valid for successful claim
      * @param userid Discord ID of the claiming user
      * @returns Indicator if the query succeeded
      */
    claimDrop(lobbyKey, playerName, dropID, userid) {
        let success = false;
        try {
            // get drop
            this.db.prepare("UPDATE 'Drop' SET CaughtLobbyKey = ?, CaughtLobbyPlayerID = ? WHERE DropID = ?").run(lobbyKey, playerName, dropID);
            this.db.prepare("INSERT INTO PastDrops Select * From 'Drop' WHERE DropID = ?").run(dropID);
            this.db.prepare("UPDATE PastDrops SET CaughtLobbyPlayerID = ? WHERE DropID = ?").run(userid, dropID);
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
    rewardDrop(login, eventdrop) {
        let success = false;
        try {
            // get drop
            if (eventdrop > 0) {
                let result = this.db.prepare("UPDATE EventCredits SET Credit = Credit + 1 WHERE EventDropID = ? AND Login = ?").run(eventdrop, login);
                if (result.changes <= 0)
                    this.db.prepare("INSERT INTO EventCredits VALUES(?, ?, 1)").run(login, eventdrop);
            }
            else
                this.db.prepare("UPDATE Members SET Drops = Drops + 1 WHERE Login = ?").run(login);
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
      * @returns Indicator if the query succeeded
      */
    isPalantirLobbyOwner(lobbyID, lobbyPlayerID) {
        let result = this.emptyResult();
        try {
            let lobbyplayers = this.db.prepare("select json_extract(Status, '$.LobbyPlayerID') as playerid from Status where json_extract(Status, '$.LobbyID') = ?").all(lobbyID);
            result.result = !lobbyplayers.some(player => player.playerid < lobbyPlayerID);
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result.success;
    }
}
exports.default = PalantirDatabase;
