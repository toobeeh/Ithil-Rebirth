import Drops from "../../drops";
import * as types from "../types";
import * as schema from "./schema";
import * as mysql2 from "mysql2/promise"
import { OkPacket, RowDataPacket } from "mysql2/typings/mysql/lib/protocol/packets";
import { metaTags } from "../../s3/cloud";
import {guildLobbyLink} from "../types";

/**
 * Palantir/Typo main db access
 */
class PalantirDatabase {
    /**
     * The Sqlite3 database pool
     */
    private pool?: mysql2.Pool;

    async open(user: string, password: string, host: string, poolSize: number = 5) {
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

    private async getConnection() {
        if (!this.pool) throw new Error("database pool has not been opened yet");
        return await this.pool.getConnection();
    }

    /**
     * Close the db connection
     */
    close() {
        try {
            this.pool?.end();
            this.pool = undefined;
        }
        catch { };
    }

    /**
     * Generates an empty database result
     */
    emptyResult<Type>() {
        let empty: types.dbResult<Type> = {
            success: false,
            result: {} as Type
        }
        return empty;
    }

    async get<TTable>(query: string, values: any[]) {
        let conn = await this.getConnection();
        try {
            let [rows, fields] = await conn.query<Array<TTable & RowDataPacket>>(query, values);
            conn.release();
            return rows;
        }
        catch (e) {
            conn.release();
            throw e;
        }
    }

    async update(query: string, values: any[]) {
        let conn = await this.getConnection();
        try {
            let [results, fields] = await conn.query<OkPacket>(query, values);
            conn.release();
            return results;
        }
        catch (e) {
            conn.release();
            throw e;
        }
    }

    async first<TTable>(query: string, values: any[]) {
        let results = await this.get<TTable>(query, values);
        if (results.length > 0) return results[0];
        else return null;
    }

    /**
     * Get a palantir user by their login
     * @param login The user's login token
     * @returns The palantir user object
     */
    async getUserByLogin(login: number) {
        let result = this.emptyResult<types.member>();
        try {
            let row = await this.first<schema.Members>("SELECT * FROM Members WHERE Login = ?", [login]);
            if (!row) throw new Error("no member found");
            result.result = {
                member: JSON.parse(row.Member),
                bubbles: Number(row.Bubbles),
                sprites: row.Sprites,
                drops: Math.round(Number(row.Drops) *10)/10,
                flags: row.Flag,
                scenes: row.Scenes ? row.Scenes : "",
                rainbowSprites: row.RainbowSprites ? row.RainbowSprites : "",
                webhooks: []
            }

            let guilds = await this.get("SELECT CAST(ServerConnections.GuildId AS char) AS GuildId, LobbyBotOptions.Name, LobbyBotOptions.Invite FROM ServerConnections LEFT JOIN LobbyBotOptions ON ServerConnections.GuildId = LobbyBotOptions.GuildId WHERE Login = ? AND Ban = 0;", [login]);
            result.result.member.Guilds = guilds.map(g => ({
                GuildID: g.GuildId + "",
                GuildName: g.Name,
                ObserveToken: g.Invite + "" as any,
                ChannelID: "",
                MessageID: "",
                Webhooks: []
            }));

            /* get weighted league drops */
            /*let weight = 0;
            let rows = await this.get<schema.PastDrops>(`SELECT LeagueWeight FROM PastDrops WHERE CaughtLobbyPlayerID = ? AND LeagueWeight > 0 AND EventDropID = 0`, [result.result.member.UserID]);
            rows.forEach(row => {
                try {
                    let time = Number(row.LeagueWeight);
                    let weighted = Drops.leagueWeight(time / 1000);
                    weight += weighted;
                }
                catch (e) {
                    console.warn("Error calculating drop weight: ", e);
                }
            });
            result.result.drops += Math.floor(weight / 100);*/

            /* get webhooks */
            for (const guild of result.result.member.Guilds) {
                const guildHooks = await this.getServerWebhooks(guild.GuildID, true);
                const mapped = guildHooks.result.map(hook => ({...hook, Token: guild.ObserveToken}));
                try {
                    result.result.webhooks = result.result.webhooks.concat(...mapped);
                }
                catch {
                    result.result.webhooks = [];
                }
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
    async getLoginFromAccessToken(accessToken: string, silent: boolean) {
        let result = this.emptyResult<types.accessToken>();

        try {
            let row = await this.first<schema.AccessTokens>("SELECT * FROM AccessTokens WHERE AccessToken = ?", [accessToken]);
            if (!row) throw new Error("no token found");
            result.result = {
                accessToken: row.AccessToken,
                login: row.Login,
                createdAt: row.CreatedAt.toString()
            };
            result.success = true;
        }
        catch (e) {
            if (!silent) console.warn("Error in query: ", e);
        }
        return result;
    }

    /**
     * Set the scenes of a palantir user
     * @param accessToken The user's access token
     * @returns An indicator for the query's success
     */
    async setUserScenes(login: number, scenes: string) {
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
    async setUserSprites(login: number, sprites: string) {
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
        let result = this.emptyResult<Array<types.guildLobbyLink>>();

        try {
            let rows = await this.get<guildLobbyLink>(`SELECT CONCAT('"', GuildId, '"') as guildId, Link as link, SlotAvailable as slotAvailable, Username as username FROM ServerLobbyLinks`, []);
            result.result = [];
            const fixGuildId = (id: string) => id.replace("\"", "").replace("\"", "");
            rows.forEach(row => result.result.push({username: row.username, guildId: fixGuildId(row.guildId), link: row.link, slotAvailable: row.slotAvailable}));

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
        let result = this.emptyResult<types.publicData>();

        try {
            const eventdrops = await this.get<schema.EventDrops>("SELECT * FROM EventDrops LEFT JOIN Events ON EventDrops.EventID = Events.EventID", []);
            // get active sprites
            const onlinesprites = await this.get<schema.OnlineSprites>("SELECT LobbyKey, LobbyPlayerID, ItemID as Sprite, Date, Slot, CONCAT(LobbyKey, ItemID) as ID FROM `OnlineItems` WHERE ItemType = 'sprite';", []);
            // get active scenes
            const onlinescenes = await this.get<schema.OnlineSprites>("SELECT LobbyKey, LobbyPlayerID, ItemID as Sprite, Date, '-1' as Slot, CONCAT(LobbyKey, ItemID) as ID FROM `OnlineItems` WHERE ItemType = 'scene';", []);
            // get sprites
            const sprites = await this.get<schema.Sprites>("SELECT * FROM Sprites", []);
            // get scenes
            const scenes = await this.get<schema.Scenes>("SELECT * FROM Scenes", []);

            // get online items
            let now = Math.round(Date.now() / 1000);
            const onlineitems = await this.get<schema.OnlineItems>("SELECT * FROM OnlineItems WHERE ItemType LIKE 'award' OR Date > " + (now - 25).toString() + "", []);

            result.result = {
                drops: eventdrops.map(d => ({ EventDropID: d.EventDropID, EventID: d.EventID, Name: d.Name, URL: d.URL })),
                onlineSprites: onlinesprites,
                onlineScenes: onlinescenes,
                onlineItems: onlineitems,
                sprites: sprites as Array<types.sprite>,
                scenes: scenes.map(s => { if (!s.GuessedColor) s.GuessedColor = ""; return s as types.scene; })
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
    async setLobby(id: string, key: string, description: string = "", restriction: string = "") {
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
    async getLobby(value: string, indicator: string = "key") {
        let result = this.emptyResult<{ found: boolean, lobby: types.palantirLobby | null }>();
        result.result = { found: false, lobby: null };
        try {
            if (indicator == "key") {
                let rows = await this.get<schema.Lobbies>("SELECT * FROM Lobbies", []);
                // iterate through lobbies and check if lobby kay matches
                for (const row of rows) {
                    let lobby: types.palantirLobby = JSON.parse(row.Lobby);
                    if (lobby.Key == value) {
                        result.result.lobby = lobby;
                        result.result.found = true;
                    }
                }
                result.success = true;
            }
            else if (indicator == "id") {
                let res = await this.first<schema.Lobbies>("SELECT * FROM Lobbies WHERE LobbyID LIKE ?", [value]);
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
    async writeReport(lobbies: Array<types.guildLobby>) {
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
    async writePlayerStatusBulk(statuses: Array<{ session: string, status: types.playerStatus, lobbyKey: string, login: number }>) {
        let success = false;
        try {
            /* insert statuses */
            let query = "REPLACE INTO Status VALUES " + statuses.map(s => "(?, ?, CURRENT_TIMESTAMP)").join(", ");
            let params = statuses.map(s => [s.session, JSON.stringify(s.status)]).flat();
            await this.update(query, params);

            /* insert online rewardee tags and remove old */
            /*const playing = statuses.filter(s => s.status.Status === "playing");
            await this.update("DELETE FROM OnlineItems WHERE ItemType LIKE 'rewardee'", []);
            let queryR = "INSERT INTO OnlineItems VALUES " + playing.map(s => "('rewardee',1,?,?,?, UNIX_TIMESTAMP())").join(", ");
            let paramsR = playing.map(s => [s.status.LobbyID, s.lobbyKey, s.status.LobbyPlayerID]).flat();
            await this.update(queryR, paramsR);*/

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
        return true;
        let success = false;
        try {
            await this.get("DELETE FROM Reports WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND)", []);
            await this.get("DELETE FROM Status WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -10 SECOND)", []);
            await this.get("DELETE FROM OnlineSprites WHERE Date < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND)", []);
            await this.get("DELETE FROM OnlineItems WHERE FROM_UNIXTIME(Date) < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -30 SECOND) AND ItemType NOT LIKE 'award'", []);
            await this.get("DELETE FROM OnlineItems WHERE FROM_UNIXTIME(Date) < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -2 DAY) AND ItemType LIKE 'award'", []);
            await this.get("DELETE FROM Lobbies WHERE json_extract(Lobby, '$.ID') NOT IN (SELECT DISTINCT json_extract(Status, '$.LobbyID') FROM Status WHERE json_extract(Status, '$.LobbyID') IS NOT NULL) AND FROM_UNIXTIME(LobbyID / 1000) < DATE_ADD(CURRENT_TIMESTAMP, INTERVAL -24 HOUR);", []);

            // delete duplicate keys with different IDs
            let lobbies = await this.get<{ LobbyID: string, LobbyKey: string }>("SELECT LobbyID, json_extract(Lobby, '$.Key') as LobbyKey FROM Lobbies", []);
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
    async getDrop(id: string = "") {
        let result = this.emptyResult<schema.NextDrop | null>();
        try {
            // get drop
            let drop = id != "" ?
                await this.first<schema.NextDrop>("SELECT * FROM NextDrop WHERE DropID = ?", [id]) :
                await this.first<schema.NextDrop>("SELECT * FROM NextDrop", []);
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
    async claimDrop(lobbyKey: string, playerName: string, dropID: string, userid: string, leagueweight: number, dropOrigin: schema.NextDrop) {
        let success = false;
        try {
            // get drop
            if (leagueweight == 0) throw new Error("regular drops not supported");
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
    async rewardDrop(login: string, eventdrop: number, value: number) {
        let success = false;
        try {
            // get drop
            if (eventdrop > 0) {
                let result = await this.update("UPDATE EventCredits SET Credit = Credit + ? WHERE EventDropID = ? AND Login = ?", [value, eventdrop, login]);
                if (result.changedRows <= 0) await this.get("INSERT INTO EventCredits VALUES(?, ?, ?)", [login, eventdrop, value]);
            }
            else await this.get("UPDATE Members SET Drops = Drops + ? WHERE Login = ?", [value, login]);
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
    async isPalantirLobbyOwner(lobbyID: string, lobbyPlayerID: number) {
        let result = this.emptyResult<{ owner: boolean | null, ownerID: number | null }>();
        try {
            let lobbyplayers = await this.get<{ playerid: number }>("SELECT json_unquote(json_extract(Status, '$.LobbyPlayerID')) as playerid from Status where json_extract(Status, '$.LobbyID') = ?", [lobbyID]);
            result.result.owner = !lobbyplayers.some(player => Number(player.playerid) < lobbyPlayerID);
            if (lobbyplayers.length > 0) result.result.ownerID = lobbyplayers.sort((a, b) => a.playerid - b.playerid)[0].playerid;
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
    async getServerWebhooks(serverID: string, censorURL: boolean = false) {
        let result = this.emptyResult<Array<types.palantirWebhook>>();

        try {
            let rows = await this.get(`SELECT CAST(ServerWebhooks.GuildId AS char) AS GuildId, Name, Url FROM ServerWebhooks WHERE GuildId = ?`, [serverID]);
            result.result = [];
            rows.forEach(row => {
                try {
                    result.result?.push({
                        ServerID: row.GuildId,
                        Name: row.Name,
                        WebhookURL: censorURL ? ":^)" : row.Url,
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

    async addCloudMeta(meta: metaTags, ownerLogin: string, uuid: string) {
        let success = false;
        try {
            await this.update("INSERT INTO CloudTags VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [ownerLogin, uuid, meta.title, meta.author, meta.own, meta.date, meta.language, meta.private]);

            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }

    async getCloudMetaMatch(meta: Partial<metaTags>, ownerLogin: string, limit: number = -1) {
        let result = this.emptyResult<Array<string>>();

        try {

            let where = "";
            let whereParams = [];
            if (meta.own !== undefined) {
                where += " AND Own = ?";
                whereParams.push(meta.own);
            }
            if (meta.title) {
                where += " AND Title like ?";
                whereParams.push("%" + meta.title + "%");
            }
            if (meta.author) {
                where += " AND Author like ?";
                whereParams.push("%" + meta.author + "%");
            }
            if (meta.date) {
                where += " AND Date > ?";
                whereParams.push(meta.date);
            }

            let rows = await this.get<schema.CloudTags>("SELECT CAST(ImageID as varchar(20)) as ImageID FROM CloudTags WHERE OWNER = ? " + where + " ORDER BY ImageID DESC" + (limit > 0 ? " LIMIT " + limit : ""), [ownerLogin, ...whereParams]);
            result.result = [];
            rows.forEach(row => {
                try {
                    result.result?.push(row["ImageID"].toString());
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

    async removeCloudMeta(imageIDs: string[], ownerLogin: string) {
        let success = false;
        try {
            await this.update("DELETE FROM CloudTags WHERE Owner = ? AND ImageID IN (?)", [ownerLogin, imageIDs]);
            success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return success;
    }

    async getDeletableCloudMetaOlderThan(days: number, ownerLogin: number) {

        let result = this.emptyResult<Array<string>>();
        const deleteFrom = Date.now() - (days * 24 * 60 * 60 * 1000);

        try {

            let rows = await this.get<schema.CloudTags>(`
                SELECT CAST(ImageID as varchar(20)) as ImageID FROM CloudTags 
                WHERE OWNER = ? AND Date < ?  AND (ImageID NOT IN (SELECT ImageID FROM Awardees WHERE Awardees.AwardeeLogin = ? AND ImageID IS NOT NULL))`, [ownerLogin, deleteFrom, ownerLogin]);
            result.result = [];
            rows.forEach(row => {
                try {
                    result.result?.push(row["ImageID"].toString());
                }
                catch (e) {
                    console.warn("Error getting meta older than: ", e);
                }
            });
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }

    async getUserAwardsInventory(userLogin: string) {
        let result = this.emptyResult<Map<number, number[]>>();

        try {
            let rows = await this.get<schema.Awardees>(`SELECT * FROM Awardees WHERE OwnerLogin = ? AND AwardeeLogin IS NULL`, [userLogin]);
            result.result = rows.reduce((map, current) => {
                const list = map.get(current.Award);
                if (list === undefined) map.set(current.Award, [current.ID]);
                else list.push(current.ID);
                return map;
            }, new Map<number, number[]>());
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }

    async getAwards() {
        let result = this.emptyResult<schema.Awards[]>();

        try {
            let rows = await this.get<schema.Awards>(`SELECT * FROM Awards`, []);
            result.result = rows;
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }

    async giveAward(awardeeLobbyID: string, awardeeLobbyPlayerID: string, awardInventoryID: string, awardId: string, awardeeLobbyKey: string, awarderLogin: string) {
        let result = this.emptyResult<number>();

        try {
            let receiver = await this.first<schema.Status>(`SELECT * FROM Status WHERE json_extract(Status, '$.LobbyID') = ? AND json_extract(Status, '$.LobbyPlayerID') = ?`, [awardeeLobbyID, awardeeLobbyPlayerID]);
            if (receiver == null) throw new Error("award receiver does not exist for " + awardeeLobbyID + ":" + awardeeLobbyPlayerID);
            const receiverLogin = JSON.parse(receiver.Status).PlayerMember.UserLogin;
            if (receiverLogin == awarderLogin) throw new Error("receiver and giver are the same");

            let update = await this.update(`UPDATE Awardees SET AwardeeLogin = ?, Date = ? WHERE ID = ?`, [receiverLogin, Date.now(), awardInventoryID]);
            if (update.affectedRows !== 1) {
                throw new Error("did not update exactly one awardee");
            }

            /* add to online items */
            let now = Math.round(Date.now() / 1000);
            update = await this.update(`REPLACE INTO OnlineItems VALUES ('award', ?, ?, ?, ?, ?)`, [awardId, awardId, awardeeLobbyKey, awardeeLobbyPlayerID, now]);

            result.result = receiverLogin;
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }

    async linkAwardToImage(awardInventoryID: number, imageID: string, ownerLogin: string) {
        let result = this.emptyResult<boolean>();

        try {
            let update = await this.update(`UPDATE Awardees SET ImageID = ? WHERE ID = ? AND AwardeeLogin = ? `, [imageID, awardInventoryID, ownerLogin]);
            result.result = update.affectedRows === 1;
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }

    async rewardSplits(receiverLogin: number, splitId: number, comment: string, valueOverride: number = -1) {
        let result = this.emptyResult<boolean>();

        try {
            let update = await this.update(`INSERT INTO SplitCredits VALUES (DEFAULT, ?, ?, DATE_FORMAT(NOW(), '%d/%m/%Y'), ?, ?)`, [receiverLogin, splitId, comment, valueOverride]);
            result.success = true;
        }
        catch (e) {
            console.warn("Error in query: ", e);
        }
        return result;
    }
}

export default PalantirDatabase;