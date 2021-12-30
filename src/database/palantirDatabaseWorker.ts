
import * as types from "./types";
import { expose } from "threads";
import PalantirDatabase from "./palantirDatabase";

/**
 * Interface to provide worker access to the database
 */
let database: PalantirDatabase | null;

const palantirDatabaseWorker = {

    /** Inits a {@link PalantirDatabase} in a worker*/
    init(path: string) {
        database = new PalantirDatabase(path);
    },

    /** Executes {@link PalantirDatabase.clearVolatile} in a worker*/
    clearVolatile() {
        if(!database) throw new Error("Database is not initialized.");
        return database.clearVolatile();
    },

    /** Executes {@link PalantirDatabase.getActiveLobbies} in a worker*/
    getActiveLobbies() {
        if(!database) throw new Error("Database is not initialized.");
        return database.getActiveLobbies();
    },

    /** Executes {@link PalantirDatabase.getDrop} in a worker*/
    getDrop(id: number = 0) {
        if(!database) throw new Error("Database is not initialized.");
        return database.getDrop(id);
    },

    /** Executes {@link PalantirDatabase.getLoginFromAccessToken} in a worker*/
    getLoginFromAccessToken(accessToken: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.getLoginFromAccessToken(accessToken);
    },

    /** Executes {@link PalantirDatabase.getPublicData} in a worker*/
    getPublicData() {
        if(!database) throw new Error("Database is not initialized.");
        return database.getPublicData();
    },

    /** Executes {@link PalantirDatabase.getUserByLogin} in a worker*/
    getUserByLogin(login: number) {
        if(!database) throw new Error("Database is not initialized.");
        return database.getUserByLogin(login);
    },

    /** Executes {@link PalantirDatabase.isPalantirLobbyOwner} in a worker*/
    isPalantirLobbyOwner(lobbyID: string, lobbyPlayerID: number) {
        if(!database) throw new Error("Database is not initialized.");
        return database.isPalantirLobbyOwner(lobbyID, lobbyPlayerID);
    },

    /** Executes {@link PalantirDatabase.rewardDrop} in a worker*/
    rewardDrop(login: string, eventdrop: number) {
        if(!database) throw new Error("Database is not initialized.");
        return database.rewardDrop(login, eventdrop);
    },

    /** Executes {@link PalantirDatabase.setLobby} in a worker*/
    setLobby(id: string, key: string, description?: string, restriction?: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.setLobby(id, key, description, restriction);
    },

    /** Executes {@link PalantirDatabase.setUserSprites} in a worker*/
    setUserSprites(login: number, sprites: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.setUserSprites(login, sprites);
    },

    /** Executes {@link PalantirDatabase.writePlayerStatus} in a worker*/
    writePlayerStatus(status: types.playerStatus, session: string) {
        if(!database) throw new Error("Database is not initialized.");
        return database.writePlayerStatus(status, session);
    },

    /** Executes {@link PalantirDatabase.writeReport} in a worker*/
    writeReport(lobbies: types.reportLobby[]) {
        if(!database) throw new Error("Database is not initialized.");
        return database.writeReport(lobbies);
    }
}

export type palantirDatabaseWorker = typeof palantirDatabaseWorker;

expose(palantirDatabaseWorker.clearVolatile);