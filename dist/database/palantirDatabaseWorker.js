"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const threads_1 = require("threads");
const palantirDatabase_1 = __importDefault(require("./palantirDatabase"));
/**
 * Interface to provide worker access to the database
 */
let database;
const error = () => { throw new Error("Database is not initialized!"); };
const palantirDatabaseWorker = {
    /** Inits a {@link PalantirDatabase} in a worker*/
    init(path) {
        database = new palantirDatabase_1.default(path);
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
    getDrop(id = 0) {
        return database ? database.getDrop(id) : error();
    },
    /** Executes {@link PalantirDatabase.getLoginFromAccessToken} in a worker*/
    getLoginFromAccessToken(accessToken) {
        return database ? database.getLoginFromAccessToken(accessToken) : error;
    },
    /** Executes {@link PalantirDatabase.getPublicData} in a worker*/
    getPublicData() {
        return database ? database.getPublicData() : error;
    },
    /** Executes {@link PalantirDatabase.getUserByLogin} in a worker*/
    getUserByLogin(login) {
        return database ? database.getUserByLogin(login) : error;
    },
    /** Executes {@link PalantirDatabase.isPalantirLobbyOwner} in a worker*/
    isPalantirLobbyOwner(lobbyID, lobbyPlayerID) {
        return database ? database.isPalantirLobbyOwner(lobbyID, lobbyPlayerID) : error;
    },
    /** Executes {@link PalantirDatabase.rewardDrop} in a worker*/
    rewardDrop(login, eventdrop) {
        return database ? database.rewardDrop(login, eventdrop) : error;
    },
    /** Executes {@link PalantirDatabase.setLobby} in a worker*/
    setLobby(id, key, description, restriction) {
        return database ? database.setLobby(id, key, description, restriction) : error;
    },
    /** Executes {@link PalantirDatabase.setUserSprites} in a worker*/
    setUserSprites(login, sprites) {
        return database ? database.setUserSprites(login, sprites) : error;
    },
    /** Executes {@link PalantirDatabase.writePlayerStatus} in a worker*/
    writePlayerStatus(status, session) {
        return database ? database.writePlayerStatus(status, session) : error;
    },
    /** Executes {@link PalantirDatabase.writeReport} in a worker*/
    writeReport(lobbies) {
        return database ? database.writeReport(lobbies) : error;
    }
};
(0, threads_1.expose)(palantirDatabaseWorker.clearVolatile);
