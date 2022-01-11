import sqlite3 from "better-sqlite3";
import fs from "fs";
import * as types from "./types";

/**
 * Image db access
 */
class ImageDatabase {
    db: sqlite3.Database;
    path: string;

    /**
     * Create a new image db connection
     * @param login The user's login
     * @param parentPath The path to the aprent imagedb fodler, **with** trailing / at the end
     */
    constructor(login: string, parentPath: string) {
        this.path = parentPath + "udb" + login + ".db";

        // check if db exists, if not create new db
        const exists = fs.existsSync(this.path);
        this.db = new sqlite3(this.path);
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
    emptyResult<Type>() {
        let empty: types.dbResult<Type> = {
            success: false,
            result: {} as Type
        }
        return empty;
    }

    /**
     * Update the last connection timestamp of a client via pseudo-ID
     * @param login Login of the image db owner
     * @param id ID of the drawing, recommended is just the unix epoch
     * @param meta Drawing metadata
     */
    addDrawing(login: string, id: string, meta: types.imageMeta) {
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
    addDrawCommands(id: string, commands: Array<Array<number | Array<number>>>) {
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
    addURI(id: string, uri: string) {
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
    getDrawing(id: string) {
        let result = this.emptyResult<types.imageData>();
        try {
            result.result.meta = this.db.prepare("SELECT * FROM Drawings WHERE id = ?").get(id).meta;
            result.result.commands = JSON.parse(this.db.prepare("SELECT * FROM Commands WHERE id = ?").get(id).commands);
            result.result.uri = this.db.prepare("SELECT * FROM BaseURI WHERE id = ?").get(id).uri;
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
    getUserMeta(login: string, limit: number = -1, query: Partial<types.imageMeta> = {}) {
        let result = this.emptyResult<Array<{ id: string, meta: types.imageMeta }>>();
        try {

            // build a where statement based on meta search
            let where = "";
            if (query.own === true) where += " AND json_extract(meta,'$.own') ";
            if (query.name) where += " AND json_extract(meta,'$.name') like '%" + query.name + "%'";
            if (query.author) where += " AND json_extract(meta,'$.author') like '%" + query.author + "%'";
            if (query.date) where += " AND json_extract(meta,'$.date') like '%" + query.date + "%'";

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
    removeEntries(login: string, deletedate: number) {
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
    removeDrawing(login: string, id: string) {
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

export default ImageDatabase;