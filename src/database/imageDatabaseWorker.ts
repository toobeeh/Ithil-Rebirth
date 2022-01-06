
import * as types from "./types";
import { expose } from "threads";
import ImageDatabase from "./imageDatabase";

/**
 * Interface to provide worker access to the image database
 */
let database: ImageDatabase | null;

const imageDatabaseWorker = {

    /** Inits a {@link ImageDatabase} in a worker*/
    init(login: string, parentPath: string) {
        database = new ImageDatabase(login, parentPath);
    },

    /** Closes a {@link ImageDatabase} in a worker*/
    close() {
        if(!database) throw new Error("Database is not initialized.");
        database.close();
    },

    /** Executes {@link ImageDatabase.addDrawing} in a worker*/
    addDrawing(login: string, id: string, meta: types.imageMeta){
        if(!database) throw new Error("Database is not initialized.");
        return database.addDrawing(login, id, meta);
    },

    /** Executes {@link ImageDatabase.addDrawCommands} in a worker*/
    addDrawCommands(id: string, commands: Array<Array<number | Array<number>>>) {
        if(!database) throw new Error("Database is not initialized.");
        return database.addDrawCommands(id, commands);
    },

    /** Executes {@link ImageDatabase.addURI} in a worker*/
    addURI(id: string, uri: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.addURI(id, uri);
    },

    /** Executes {@link ImageDatabase.getDrawing} in a worker*/
    getDrawing(id: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.getDrawing(id);
    },

    /** Executes {@link ImageDatabase.getUserMeta} in a worker*/
    getUserMeta(login: string, limit: number = -1, query: Partial<types.imageMeta> = {}) {
        if(!database) throw new Error("Database is not initialized.");
        return database.getUserMeta(login, limit, query);
    },

    /** Executes {@link ImageDatabase.removeEntries} in a worker*/
    removeEntries(login: string, deletedate: number) {
        if(!database) throw new Error("Database is not initialized.");
        return database.removeEntries(login, deletedate);
    },

    /** Executes {@link ImageDatabase.removeDrawing} in a worker*/
    removeDrawing(login: string, id: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.removeDrawing(login, id);
    }
}

export type imageDatabaseWorker = typeof imageDatabaseWorker;

expose(imageDatabaseWorker);