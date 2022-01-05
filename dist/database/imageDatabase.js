"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = __importDefault(require("fs"));
/**
 * Image db access
 */
class ImageDatabase {
    /**
     * Create a new image db connection
     * @param login The user's login
     * @param parentPath The path to the aprent imagedb fodler, **with** trailing / at the end
     */
    constructor(login, parentPath) {
        this.path = parentPath + login + ".db";
        // check if db exists, if not create new db
        const exists = fs_1.default.existsSync(this.path);
        this.db = new better_sqlite3_1.default(this.path);
        this.db.pragma('journal_mode = WAL');
        if (!exists) {
            this.db.prepare('CREATE TABLE Commands("id" STRING, "commands" STRING);').run();
            this.db.prepare('CREATE TABLE BaseURI("id" STRING, "uri" STRING);').run();
            this.db.prepare('CREATE TABLE Drawings ("login" STRING, "id" STRING, "meta" STRING);').run();
        }
    }
    /**
     * Close the image db connection
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
     * Update the last connection timestamp of a client via pseudo-ID
     * @param login Login of the image db owner
     * @param id ID of the drawing, recommended is just the unix epoch
     * @param meta Drawing metadata
     */
    addDrawing(login, id, meta) {
        let success = false;
        try {
            this.db.prepare("INSERT INTO Drawings VALUES(?,?,?)").run(login, id, JSON.stringify(meta));
            success = true;
        }
        catch (e) {
            console.warn("Error adding meta: ", e);
        }
        return success;
    }
    /**
     * Update the last connection timestamp of a client via pseudo-ID
     * @param id ID of the drawing, recommended is just the unix epoch
     * @param commands Jagged array of commands: either old action-format (commands[action[command[data]]]) or new flat ([commands[command[data]]])
     */
    addDrawCommands(id, commands) {
        let success = false;
        try {
            this.db.prepare("INSERT INTO Commands VALUES(?,?)").run(id, JSON.stringify(commands));
            success = true;
        }
        catch (e) {
            console.warn("Error adding commands: ", e);
        }
        return success;
    }
    /**
     * Update the last connection timestamp of a client via pseudo-ID
     * @param id ID of the drawing, recommended is just the unix epoch
     * @param uri Base64 data uri; including *data:image/png;base64,*
     */
    addURI(id, uri) {
        let success = false;
        try {
            this.db.prepare("INSERT INTO BaseURI VALUES(?,?)").run(id, uri);
            success = true;
        }
        catch (e) {
            console.warn("Error adding uri: ", e);
        }
        return success;
    }
    /**
     * Get all drawing data from the database
     * @param id ID of the drawing
     * @returns all drawing-related data available
     */
    getDrawing(id) {
        let result = this.emptyResult();
        try {
            result.result.meta = this.db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).meta;
            result.result.commands = JSON.parse(this.db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).commands);
            result.result.uri = JSON.parse(this.db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).uri);
            result.success = true;
        }
        catch (e) {
            console.warn("Error finding drawing: ", e);
        }
        return result;
    }
    /**
     * Get all metadata of images that match search meta
     * @param login verificator to deny access except the owner's
     * @param limit max rows to fetch to avoid big latency of huge databases
     * @param query optional meta properties to match meta entries
     * @returns an array of all found meta entries and their corresponding image IDs
     */
    getUserMeta(login, limit, query = {}) {
        let result = this.emptyResult();
        try {
            // build a where statement based on meta search
            let where = "";
            if (query.own === true)
                where += " AND json_extract(meta,'$.own') ";
            if (query.name)
                where += " AND json_extract(meta,'$.name') like '%" + query.name + "%'";
            if (query.author)
                where += " AND json_extract(meta,'$.author') like '%" + query.author + "%'";
            if (query.date)
                where += " AND json_extract(meta,'$.date') like '%" + query.date + "%'";
            const rows = this.db.prepare("SELECT * FROM Drawings WHERE login = ? " + where + " ORDER BY id DESC" + (limit > 0 ? " LIMIT " + limit : "")).all(login);
            result.result = [];
            rows.forEach(row => {
                result.result.push({ id: row.id, meta: JSON.parse(row.meta) });
            });
            result.success = true;
        }
        catch (e) {
            console.warn("Error searching meta: ", e);
        }
        return result;
    }
    /**
     * Removes entries from all tables that are before a given date
     * @param login the user's login as authorization
     * @param deletedate the date to compare; IDs have to be the unix epoch to make this work!
     * @returns indicator if the query succeeded
     */
    removeEntries(login, deletedate) {
        let success = false;
        try {
            // delete from all tables where drawings id are before date 
            this.db.prepare("DELETE FROM BaseURI WHERE id IN (SELECT id FROM Drawings WHERE login = ? AND id < ?)").run(login, deletedate);
            this.db.prepare("DELETE FROM Commands WHERE id IN (SELECT id FROM Drawings WHERE login = ? AND id < ?)").run(login, deletedate);
            this.db.prepare("DELETE FROM Drawings WHERE login = ? AND id < ?").run(login, deletedate);
            success = true;
        }
        catch (e) {
            console.warn("Error removing entries: ", e);
        }
        return success;
    }
    /**
     * Removes a drawing from all tables
     * @param login the user's login as authorization
     * @param id id of the drawing to delete
     * @returns indicator if the query succeeded
     */
    removeDrawing(login, id) {
        let success = false;
        try {
            // delete from all tables
            if (this.db.prepare("SELECT * FROM Drawings WHERE ID = ?").get(id).login != login) {
                throw new Error("Unauthorized delete request");
            }
            this.db.prepare("DELETE FROM Drawings WHERE ID = ?").run(id);
            this.db.prepare("DELETE FROM BaseURI WHERE ID = ?").run(id);
            this.db.prepare("DELETE FROM Commands WHERE ID = ?").run(id);
            success = true;
        }
        catch (e) {
            console.warn("Error removing drawing: ", e);
        }
        return success;
    }
}
exports.default = ImageDatabase;
//# sourceMappingURL=imageDatabase.js.map