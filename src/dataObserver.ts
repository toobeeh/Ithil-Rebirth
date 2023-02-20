import PalantirDatabase from "./database/palantirDatabase";
import * as types from "./database/types";

/**
 * Class that observes changes in the palantir db and broadcasts data if new data is found
 */
export default class DataObserver{
    /**
     * The source database
     */
    database: PalantirDatabase;

    /**
     * Collection of currently active lobbies
     */
    activeLobbies: Array<types.activeGuildLobbies>;

    /**
     * Palantir shared data object
     */
    publicData: types.publicData;

    clientLobbyReports: Map<string, types.guildLobby[]>;

    clientPlayerStatuses: Map<string, types.playerStatus>;

    /**
     * The callback which fires when changes in active lobbies were found
     */
    onActiveLobbiesChanged?: (lobbies: Array<types.activeGuildLobbies>) => void;

    /**
     * The callback which fires when changes in active lobbies were found
     */
     onPublicDataChanged?: (data: types.publicData) => void;

    /**
     * The interval in which active lobbies are monitored
     */
    lobbiesInterval: NodeJS.Timer | null = null;

    /**
     * The interval in which public data is monitored
     */
    dataInterval: NodeJS.Timer | null = null;

    /**
     * The interval in which volatile data like onlinesprites is cleared
     */
    clearInterval: NodeJS.Timer | null = null;

    /**
     * The interval in whichclient data is written
     */
    clientDataWriteInterval: NodeJS.Timer | null = null;

    /**
     * The interval time in ms of the data refresh interval
     */
    dataRefreshRate: number = 5000;

    /**
     * The interval time in ms of the lobbies refresh interval
     */
    lobbiesRefreshRate: number = 3000;

    /**
     * The interval time in ms of the client data write interval
     */
    clientDataWriteRate: number = 2000;

    /**
     * The interval time in ms of the data clear interval
     */
    clearRate: number = 2000;

    /**
     * Inits a new observer; dont forget to start!
     */
    constructor(database: PalantirDatabase){
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
        }
    }

    /**
     * Checks for changes in active lobbies and invoke callback if set
     */
    refreshActiveLobbies(){
        let dbResult = this.database.getActiveLobbies();
        if(dbResult.success && dbResult.result != null){
            if(JSON.stringify(this.activeLobbies) != JSON.stringify(dbResult.result)
                && this.onActiveLobbiesChanged){
                this.onActiveLobbiesChanged(dbResult.result);
            }
            this.activeLobbies = dbResult.result;
        }
    }

    /**
     * Checks for changes in public data and invoke callback if set
     */
    refreshPublicData(){
        let dbResult = this.database.getPublicData();
        if(dbResult.success && dbResult.result != null){
            if((JSON.stringify(this.publicData.onlineScenes) != JSON.stringify(dbResult.result.onlineScenes) 
                || JSON.stringify(this.publicData.onlineSprites) != JSON.stringify(dbResult.result.onlineSprites)
                || JSON.stringify(this.publicData.onlineItems) != JSON.stringify(dbResult.result.onlineItems))
                && this.onPublicDataChanged){
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
    
    writeClientReports(){
        let reports = [...this.clientLobbyReports.values()].flat();
        let statuses = [...this.clientPlayerStatuses.entries()].map(e => ({session: e[0], status: e[1]}));

        this.clientLobbyReports.clear();
        this.clientPlayerStatuses.clear();

        this.database.writePlayerStatusBulk(statuses);
        this.database.writeReport(reports);
    }

    /**
     * Start data observation
     */
    observe(){
        if(!this.lobbiesInterval) {
            this.lobbiesInterval = setInterval(() => this.refreshActiveLobbies(), this.lobbiesRefreshRate);
        }
        if(!this.dataInterval) {
            this.dataInterval = setInterval(() => this.refreshPublicData(), this.dataRefreshRate);
        }
        if(!this.clearInterval){
            this.clearInterval = setInterval(() => this.clearVolatile(), this.clearRate);
        }
        if(!this.clientDataWriteInterval){
            this.clientDataWriteInterval = setInterval(() => this.writeClientReports(), this.clientDataWriteRate);
        }
    }

    /**
     * Stop observation of data
     */
    stop(){
        if(this.lobbiesInterval) {
            clearInterval(this.lobbiesInterval);
            this.lobbiesInterval = null;
        }
        if(this.dataInterval) {
            clearInterval(this.dataInterval);
            this.dataInterval = null;
        }
        if(this.clearInterval) {
            clearInterval(this.clearInterval);
            this.clearInterval = null;
        }
        if(this.clientDataWriteInterval) {
            clearInterval(this.clientDataWriteInterval);
            this.clientDataWriteInterval = null;
        }
    }
}