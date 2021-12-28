"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ipc_1 = require("./ipc");
/**
 * Class that observes changes in the palantir db and broadcasts data if new data is found
 */
class DataObserver {
    /**
     * Inits a new observer; dont forget to start!
     */
    constructor(database, emitter) {
        /**
         * The interval in which active lobbies are monitored
         */
        this.lobbiesInterval = null;
        /**
         * The interval in which public data is monitored
         */
        this.dataInterval = null;
        /**
         * The interval in which volatile data like onlinesprites is cleared
         */
        this.clearInterval = null;
        /**
         * The interval time in ms of the data refresh interval
         */
        this.dataRefreshRate = 5000;
        /**
         * The interval time in ms of the lobbies refresh interval
         */
        this.lobbiesRefreshRate = 3000;
        /**
         * The interval time in ms of the data clear interval
         */
        this.clearRate = 2000;
        this.database = database;
        this.activeLobbies = [];
        this.publicData = {
            sprites: [],
            scenes: [],
            drops: [],
            onlineScenes: [],
            onlineSprites: []
        };
        this.emitter = emitter;
    }
    /**
     * Checks for changes in active lobbies and emits if so
     */
    refreshActiveLobbies() {
        let dbResult = this.database.getActiveLobbies();
        if (dbResult.success && dbResult.result != null) {
            if (JSON.stringify(this.activeLobbies) != JSON.stringify(dbResult.result)) {
                this.emitter(ipc_1.ipcEvents.activeLobbies, dbResult.result);
            }
            this.activeLobbies = dbResult.result;
        }
    }
    /**
     * Checks for changes in public data and emits if so
     */
    refreshPublicData() {
        let dbResult = this.database.getPublicData();
        if (dbResult.success && dbResult.result != null) {
            if (JSON.stringify(this.publicData.onlineScenes) != JSON.stringify(dbResult.result.onlineScenes)
                || JSON.stringify(this.publicData.onlineSprites) != JSON.stringify(dbResult.result.onlineSprites)) {
                this.emitter(ipc_1.ipcEvents.publicData, dbResult.result);
            }
            this.publicData = dbResult.result;
        }
    }
    /**
     * Clears volatile data in the database
     */
    clearVolatile() {
        this.database.clearVolatile();
    }
    /**
     * Start data observation
     */
    observe() {
        if (!this.lobbiesInterval) {
            this.lobbiesInterval = setInterval(() => this.refreshActiveLobbies(), this.lobbiesRefreshRate);
        }
        if (!this.dataInterval) {
            this.dataInterval = setInterval(() => this.refreshPublicData(), this.dataRefreshRate);
        }
        if (!this.clearInterval) {
            this.clearInterval = setInterval(() => this.clearVolatile(), this.clearRate);
        }
    }
    /**
     * Stop observation of data
     */
    stop() {
        if (this.lobbiesInterval) {
            clearInterval(this.lobbiesInterval);
            this.lobbiesInterval = null;
        }
        if (this.dataInterval) {
            clearInterval(this.dataInterval);
            this.dataInterval = null;
        }
        if (this.clearInterval) {
            clearInterval(this.clearInterval);
            this.clearInterval = null;
        }
    }
}
exports.default = DataObserver;
