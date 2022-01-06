"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
const imageDatabase_1 = __importDefault(require("./imageDatabase"));
/**
 * Interface to provide worker access to the image database
 */
let database;
const imageDatabaseWorker = {
    /** Inits a {@link ImageDatabase} in a worker*/
    init(login, parentPath) {
        database = new imageDatabase_1.default(login, parentPath);
    },
    /** Closes a {@link ImageDatabase} in a worker*/
    close() {
        if (!database)
            throw new Error("Database is not initialized.");
        database.close();
    },
    /** Executes {@link ImageDatabase.addDrawing} in a worker*/
    addDrawing(login, id, meta) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.addDrawing(login, id, meta);
    },
    /** Executes {@link ImageDatabase.addDrawCommands} in a worker*/
    addDrawCommands(id, commands) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.addDrawCommands(id, commands);
    },
    /** Executes {@link ImageDatabase.addURI} in a worker*/
    addURI(id, uri) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.addURI(id, uri);
    },
    /** Executes {@link ImageDatabase.getDrawing} in a worker*/
    getDrawing(id) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.getDrawing(id);
    },
    /** Executes {@link ImageDatabase.getUserMeta} in a worker*/
    getUserMeta(login, limit = -1, query = {}) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.getUserMeta(login, limit, query);
    },
    /** Executes {@link ImageDatabase.removeEntries} in a worker*/
    removeEntries(login, deletedate) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.removeEntries(login, deletedate);
    },
    /** Executes {@link ImageDatabase.removeDrawing} in a worker*/
    removeDrawing(login, id) {
        if (!database)
            throw new Error("Database is not initialized.");
        return database.removeDrawing(login, id);
    }
};
(0, threads_1.expose)(imageDatabaseWorker);
//# sourceMappingURL=imageDatabaseWorker.js.map