"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Class that observes changes in the palantir db and broadcasts data if new data is found
 */
class DataObserver {
    /**
     * Inits a new observer; dont forget to start!
     */
    constructor(database) {
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
         * The interval in whichclient data is written
         */
        this.clientDataWriteInterval = null;
        /**
         * The interval time in ms of the data refresh interval
         */
        this.dataRefreshRate = 5000;
        /**
         * The interval time in ms of the lobbies refresh interval
         */
        this.lobbiesRefreshRate = 3000;
        /**
         * The interval time in ms of the client data write interval
         */
        this.clientDataWriteRate = 2000;
        /**
         * The interval time in ms of the data clear interval
         */
        this.clearRate = 2000;
        this.database = database;
        this.activeLobbies = [];
        this.clientLobbyReports = new Map();
        this.clientPlayerStatuses = new Map();
        this.publicData = {
            sprites: [],
            scenes: [],
            drops: [],
            onlineScenes: [],
            onlineSprites: [],
            onlineItems: []
        };
    }
    /**
     * Checks for changes in active lobbies and invoke callback if set
     */
    refreshActiveLobbies() {
        let dbResult = this.database.getActiveLobbies();
        if (dbResult.success && dbResult.result != null) {
            if (JSON.stringify(this.activeLobbies) != JSON.stringify(dbResult.result)
                && this.onActiveLobbiesChanged) {
                this.onActiveLobbiesChanged(dbResult.result);
            }
            this.activeLobbies = dbResult.result;
        }
    }
    /**
     * Checks for changes in public data and invoke callback if set
     */
    refreshPublicData() {
        let dbResult = this.database.getPublicData();
        if (dbResult.success && dbResult.result != null) {
            if ((JSON.stringify(this.publicData.onlineScenes) != JSON.stringify(dbResult.result.onlineScenes)
                || JSON.stringify(this.publicData.onlineSprites) != JSON.stringify(dbResult.result.onlineSprites)
                || JSON.stringify(this.publicData.onlineItems) != JSON.stringify(dbResult.result.onlineItems))
                && this.onPublicDataChanged) {
                this.onPublicDataChanged(dbResult.result);
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
    writeClientReports() {
        let reports = [...this.clientLobbyReports.values()].flat();
        let statuses = [...this.clientPlayerStatuses.entries()].map(e => ({ session: e[0], status: e[1] }));
        this.clientLobbyReports.clear();
        this.clientPlayerStatuses.clear();
        if (reports.length > 0)
            this.database.writePlayerStatusBulk(statuses);
        if (statuses.length > 0)
            this.database.writeReport(reports);
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
        if (!this.clientDataWriteInterval) {
            this.clientDataWriteInterval = setInterval(() => this.writeClientReports(), this.clientDataWriteRate);
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
        if (this.clientDataWriteInterval) {
            clearInterval(this.clientDataWriteInterval);
            this.clientDataWriteInterval = null;
        }
    }
}
exports.default = DataObserver;
//# sourceMappingURL=dataObserver.js.map