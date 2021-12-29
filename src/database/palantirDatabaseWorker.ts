
import * as types from "./types";
import { expose } from "threads";
import PalantirDatabase from "./palantirDatabase";

/**
 * Interface to provide worker access to the database
 */
let database: PalantirDatabase | null;

const error = () => { throw new Error("Database is not initialized!");}

const palantirDatabaseWorker = {

    /** Inits a {@link PalantirDatabase} in a worker*/
    init(path: string) {
        database = new PalantirDatabase(path);
    },

    /** Executes {@link PalantirDatabase.clearVolatile} in a worker*/
    clearVolatile() {
        return database ? database.clearVolatile() : error();
    },

    /** Executes {@link PalantirDatabase.getActiveLobbies} in a worker*/
    getActiveLobbies() {
        return database ? database.getActiveLobbies() : error();
    },

    /** Executes {@link PalantirDatabase.getDrop} in a worker*/
    getDrop(id: number = 0) {
        return database ? database.getDrop(id): error();
    },

    /** Executes {@link PalantirDatabase.getLoginFromAccessToken} in a worker*/
    getLoginFromAccessToken(accessToken: string) {
        return database ? database.getLoginFromAccessToken(accessToken) : error;
    },

    /** Executes {@link PalantirDatabase.getPublicData} in a worker*/
    getPublicData() {
        return database ? database.getPublicData() : error;
    },

    /** Executes {@link PalantirDatabase.getUserByLogin} in a worker*/
    getUserByLogin(login: number) {
        return database ? database.getUserByLogin(login) : error;
    },

    /** Executes {@link PalantirDatabase.isPalantirLobbyOwner} in a worker*/
    isPalantirLobbyOwner(lobbyID: string, lobbyPlayerID: number) {
        return database ? database.isPalantirLobbyOwner(lobbyID, lobbyPlayerID) : error;
    },

    /** Executes {@link PalantirDatabase.rewardDrop} in a worker*/
    rewardDrop(login: string, eventdrop: number) {
        return database ? database.rewardDrop(login, eventdrop) : error;
    },

    /** Executes {@link PalantirDatabase.setLobby} in a worker*/
    setLobby(id: string, key: string, description?: string, restriction?: string) {
        return database ? database.setLobby(id, key, description, restriction) : error;
    },

    /** Executes {@link PalantirDatabase.setUserSprites} in a worker*/
    setUserSprites(login: number, sprites: string) {
        return database ? database.setUserSprites(login, sprites) : error;
    },

    /** Executes {@link PalantirDatabase.writePlayerStatus} in a worker*/
    writePlayerStatus(status: types.playerStatus, session: string) {
        return database ? database.writePlayerStatus(status, session) : error;
    },

    /** Executes {@link PalantirDatabase.writeReport} in a worker*/
    writeReport(lobbies: types.reportLobby[]) {
        return database ? database.writeReport(lobbies) : error;
    }
}

export type palantirDatabaseWorker = typeof palantirDatabaseWorker;

expose(palantirDatabaseWorker.clearVolatile);