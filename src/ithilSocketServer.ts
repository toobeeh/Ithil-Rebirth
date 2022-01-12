import https from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import * as ws from "ws";
import { Server as SocketioServer, Socket } from "socket.io";
import * as types from "./database/types";

/**
 * A https server with certs loaded and cors enabled
 */
class IthilHttpsServer{

    /**
     * The https server
     */
    httpsServer: https.Server;

    /**
     * Init https & express server
     * @param certPath The path to the SSL certificate
     */
    constructor(certPath: string){

        // Start the https server with cors on main port
        const serverExpress = express();
        serverExpress.use(cors());
        const server = https.createServer({
            key: fs.readFileSync(certPath + '/privkey.pem', 'utf8'),
            cert: fs.readFileSync(certPath + '/cert.pem', 'utf8'),
            ca: fs.readFileSync(certPath + '/chain.pem', 'utf8')
        }, serverExpress);

        this.httpsServer = server;
    }
}

/**
 * A wrapper class for all required websocket server initialization
 */
export class IthilWebsocketServer extends IthilHttpsServer {
    /**
     * The websocket server instance
     */
    server: ws.WebSocketServer;

    /**
     * Init https & express and start the websocket server
     * @param port The socketio port 
     * @param certPath The path to the SSL certificate
     */
     constructor(port: number, certPath: string) {

        // Call base constructor
        super(certPath);

        // start websocket server and listen
        this.server = new ws.WebSocketServer({server: this.httpsServer});
        this.httpsServer.listen(port);
     }
}

/**
 * A wrapper class for all required socketio server initialization
 */
export class IthilSocketioServer extends IthilHttpsServer {
    /**
     * The socketio server instance
     */
    server: SocketioServer;

    /**
     * Init https & express and start the socketio server
     * @param port The socketio port 
     * @param certPath The path to the SSL certificate
     */
    constructor(port: number, certPath: string) {

        // Call base constructor
        super(certPath);

        // Start the socketio server
        this.server = new SocketioServer(
            this.httpsServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST", "OPTIONS"]
            },
            pingTimeout: 20000
        });

        // start listening 
        this.httpsServer.listen(port);
    }
}

/**
 * A wrapper class for a connected socketio client, enabling type-safe event listeners and responses
 */
export class TypoSocketioClient {

    /** The underlying socketio client */
    socket: Socket;

    /** Init wrapper class */
    constructor(socket: Socket) {
        this.socket = socket;
    }

    /**
     * Subscribe to an event with an async handler
     * @param eventName The event to listen for
     * @param handler The async handler to process incoming data and return response data
     * @param withResponse Indicates wether a response should be made
     * @param once Indicates wether the listener is once or permanent
     */
    subscribeEventAsync<TIncoming, TResponse>(eventName: string, handler: (incomingData: TIncoming) => Promise<TResponse>, withResponse: boolean = true, once: boolean = false) {
        const callback = async (incoming: eventBase<TIncoming>, socket: Socket) => {

            // get the payload from the event data consisting of eventname and payload
            const response = await handler(incoming.payload);
            if (withResponse) {

                // build a response of the handler's result and emit it
                const base: eventBase<TResponse> = {
                    event: eventName + " response",
                    payload: response
                }
                this.socket.emit(eventName + " response", base);
            }
        };
        if (once) this.socket.once(eventName, callback);
        else this.socket.on(eventName, callback);
    }

    /**
     * Emit an event to the client and wait async for a response
     * @param eventName The event to emit
     * @param outgoingData The data that is to be sent to the client
     * @param withResponse Indicates wether a response should be waited for
     * @param unique If true, the event name is added a unique string to identify it from same named events
     * @param timeout The max timeout when the promise gets rejected
     * @returns A promise of the expected return data
     */
    async emitEventAsync<TOutgoing, TResponse>(eventName: string, outgoingData: TOutgoing, withResponse: boolean = true, unique: boolean = false, timeout: number = 15000) {

        // generate unique event name if set
        let uniqueName = eventName;
        if (unique) uniqueName = uniqueName + "@" + Date.now();

        // create promise that holds response data
        const promise = new Promise<TResponse>((resolve, reject) => {

            // if resopnse is awaited, add a listener that will resolve on the event - else resolve instantly with empty data
            if (withResponse) {

                // a event handler that removes itself and resolves the promise as soon as the right unique event was received
                const handler = (data: eventBase<TResponse>) => {
                    if (unique && data.event == uniqueName || !unique) {
                        resolve(data.payload);
                        this.socket.off(eventName, handler);
                    }
                }
                this.socket.on(eventName + " response", handler);

                // set timeout to reject promise
                setTimeout(() => reject("Timed out"), timeout);
            }
            else resolve({} as TResponse);
        });
        const base: eventBase<TOutgoing> = {
            event: uniqueName,
            payload: outgoingData
        }
        this.socket.emit(eventName, base);
        return promise;
    }

    /**
     * Send public data to the client
     * @param data The public data eventdata
     */
    emitPublicData(data: publicDataEventdata) {
        this.emitEventAsync<publicDataEventdata, void>(eventNames.publicData, data, false);
    }

    /**
     * Subscribe to the disconnect event
     * @param handler Handler that is fired on the socket disconnect
     */
    subscribeDisconnect(handler: (reason: string) => Promise<void>) {
        this.socket.on("disconnect", handler);
    }

    /**
     * Subscribe to the login event - client is trying to log in
     * @param handler Handler that should process login data and respond state
     */
    subscribeLoginEvent(handler: (incoming: loginEventdata) => Promise<loginResponseEventdata>) {
        this.subscribeEventAsync<loginEventdata, loginResponseEventdata>(eventNames.login, handler, true, true);
    }

    /**
     * Subscribe to the get user event - client is requesting user data
     * @param handler Handler that fetches and returns user data
     */
    subscribeGetUserEvent(handler: () => Promise<getUserResponseEventdata>) {
        this.subscribeEventAsync<void, getUserResponseEventdata>(eventNames.getUser, handler, true, false);
    }

    /**
     * Subscribe to the set slot event - client is requesting to set a sprite on one of their slots
     * @param handler Handler that processes the request and responds with the new member data
     */
    subscribeSetSlotEvent(handler: (incoming: setSlotEventdata) => Promise<getUserResponseEventdata>) {
        this.subscribeEventAsync<setSlotEventdata, getUserResponseEventdata>(eventNames.setSlot, handler, true, false);
    }

    /**
     * Subscribe to the set combo event - client is requesting to activate a sprite combo
     * @param handler Handler that processes the combo data and responds with the new member data
     */
    subscribeSetComboEvent(handler: (incoming: setComboEventdata) => Promise<getUserResponseEventdata>) {
        this.subscribeEventAsync<setComboEventdata, getUserResponseEventdata>(eventNames.setCombo, handler, true, false);
    }

    /**
     * Subscribe to the join lobby event - client has joined a lobby and requests status update
     * @param handler Handler that processes the lobby key and eventually adds a db entry, returns corresponding lobby data
     */
    subscribeJoinLobbyEvent(handler: (incoming: joinLobbyEventdata) => Promise<joinLobbyResponseEventdata>) {
        this.subscribeEventAsync<joinLobbyEventdata, joinLobbyResponseEventdata>(eventNames.joinLobby, handler, true, false);
    }

    /**
     * Subscribe to the set lobby event - client observed lobby change and reports new data
     * @param handler Handler that processes the lobby data and responds with verified new data
     */
    subscribeSetLobbyEvent(handler: (incoming: setLobbyEventdata) => Promise<setLobbyResponseEventdata>) {
        this.subscribeEventAsync<setLobbyEventdata, setLobbyResponseEventdata>(eventNames.setLobby, handler, true, false);
    }

    /**
     * Subscribe to the leave lobby event - client leaves a lobby
     * @param handler Handler returns currently active lobbies 
     */
    subscribeLeaveLobbyEvent(handler: (incoming: void) => Promise<leaveLobbyResponseEventdata>) {
        this.subscribeEventAsync<void, leaveLobbyResponseEventdata>(eventNames.leaveLobby, handler, true, false);
    }

    /**
     * Subscribe to the search lobby event - client searches for a lobby
     * @param handler Handler processes search data
     */
    subscribeSearchLobbyEvent(handler: (incoming: searchLobbyEventdata) => Promise<void>) {
        this.subscribeEventAsync<searchLobbyEventdata, void>(eventNames.searchLobby, handler, false, false);
    }

    /**
     * Subscribe to the store drawing event - client wants to store a drawing in their image db
     * @param handler Handler that saves the drawing and returns its id
     */
    subscribeStoreDrawingEvent(handler: (incoming: storeDrawingEventdata) => Promise<drawingIDEventdata>) {
        this.subscribeEventAsync<storeDrawingEventdata, drawingIDEventdata>(eventNames.storeDrawing, handler, true, false);
    }

    /**
     * Subscribe to the fetch drawing event - client wants to retrieve a drawing from their image db
     * @param handler Handler gets the drawing by id and returns its data
     */
    subscribeFetchDrawingEvent(handler: (incoming: fetchDrawingEventdata) => Promise<fetchDrawingResponseEventdata>) {
        this.subscribeEventAsync<fetchDrawingEventdata, fetchDrawingResponseEventdata>(eventNames.fetchDrawing, handler, true, false);
    }

    /**
     * Subscribe to the remove drawing event - client wants to remove a drawing from their image db
     * @param handler Handler that removes the drawing
     */
    subscribeRemoveDrawingEvent(handler: (incoming: drawingIDEventdata) => Promise<void>) {
        this.subscribeEventAsync<drawingIDEventdata, void>(eventNames.removeDrawing, handler, false, false);
    }

    /**
     * Subscribe to the get commands event - client wants to fetch draw commands of an image
     * @param handler Handler that returns the draw commands
     */
    subscribeGetCommandsEvent(handler: (incoming: drawingIDEventdata) => Promise<getCommandsResponseEventdata>) {
        this.subscribeEventAsync<drawingIDEventdata, getCommandsResponseEventdata>(eventNames.getCommands, handler, true, false);
    }

    /**
     * Subscribe to the get meta event - client wants to get all drawings that match search meta
     * @param handler Handler that returns the drawing results
     */
    subscribeGetMetaEvent(handler: (incoming: getMetaEventdata) => Promise<getMetaResponseEventdata>) {
        this.subscribeEventAsync<getMetaEventdata, getMetaResponseEventdata>(eventNames.getMeta, handler, true, false);
    }

    /**
     * Subscribe to the claim drop event - client wants to claim a drop
     * @param handler Handler that processes claim data and sends an ipc message to the main server
     */
    subscribeClaimDropEvent(handler: (incoming: claimDropEventdata) => Promise<void>) {
        this.subscribeEventAsync<claimDropEventdata, void>(eventNames.claimDrop, handler, false, false);
    }

}

//interfaces and event names for socketio communication

export const eventNames = Object.freeze({
    onlineSprites: "online sprites",
    activeLobbies: "active lobbies",
    publicData: "public data",
    claimDrop: "claim drop",
    clearDrop: "clear drop",
    rankDrop: "rank drop",
    login: "login",
    getUser: "get user",
    setSlot: "set slot",
    setCombo: "set combo",
    joinLobby: "join lobby",
    setLobby: "set lobby",
    searchLobby: "search lobby",
    leaveLobby: "leave lobby",
    storeDrawing: "store drawing",
    fetchDrawing: "fetch drawing",
    removeDrawing: "remove drawing",
    getCommands: "get commands",
    getMeta: "get meta"
});

/** 
 * Interface for all typo client communication - extra event name property 
 */
export interface eventBase<TEventdata> {
    /**
     * The event's name
     */
    event: string;

    /**
     * The event's payload
     */
    payload: TEventdata;
}

/**
 * Socketio eventdata for the online sprites event
 */
export interface onlineSpritesEventdata {
    /**
     * Currently online sprites array
     */
    onlineSprites: Array<types.onlineSprite>;

    /**
     * Currently online scenes array
     */
    onlineScenes: Array<types.onlineSprite>;
}

/**
 * Socketio eventdata for the active lobbies event
 */
export interface activeLobbiesEventdata {
    /**
     * Currently active guildlobbies
     */
    activeGuildLobbies: types.activeGuildLobbies;
}

/**
 * Socketio eventdata for the public data event
 */
export interface publicDataEventdata {
    /**
     * Public data containing sprites, scenes, online data
     */
    publicData: types.publicData;
}

/**
 * Socketio eventdata for the login event
 */
export interface loginEventdata {
    /**
     * The user's access token
     */
    accessToken: string;

    /**
     * The user's login, may be removed in future
     */
    login: number;
}

/**
 * Socketio eventdata for the login event response
 */
export interface loginResponseEventdata {
    /**
     * Signalizes wether the login attempt was successful
     */
    authorized: boolean;

    /**
     * Currently active lobbies of all guilds the authenticated member is conencted to
     */
    activeLobbies: Array<types.activeGuildLobbies>;

    /**
     * The authenticated member
     */
    member: types.member;
}

/**
 * Socketio eventdata for the get member response
 */
export interface getUserResponseEventdata {
    /**
     * The connected member
     */
    user: types.member;

    /**
     * The member's sprite slot count
     */
    slots: number;

    /**
     * The member's permission flags
     */
    flags: types.memberFlags;
}

/**
 * Socketio eventdata for the set sprite slot event:
 * User requests to set a sprite on a specific sprite slot
 */
export interface setSlotEventdata {
    /**
     * The target slot (>0)
     */
    slot: number;

    /**
     * The target sprite id
     */
    sprite: number;
}

/**
 * Socketio eventdata for the set combo event:
 * User requests to activate a sprite combo
 */
export interface setComboEventdata {
    /**
     * The sprite combo string - as inventory sprite IDs spearated with , and . to indicate slot ID
     */
    combostring: string;
}

/**
 * Socketio eventdata for the join lobby event:
 * User joined a lobby and requests their status update
 */
export interface joinLobbyEventdata {

    /**
     * The lobby key of the joined lobby
     */
    key: string;
}

/**
 * Socketio eventdata for the join lobby event response
 */
export interface joinLobbyResponseEventdata {

    /**
     * The lobby data of the joined lobby
     */
    lobbyData: types.palantirLobby;

    /**
     * Indicator wether the lobby could be found/added
     */
    valid: boolean;
}

/**
 * Socketio eventdata for the set lobby event:
 * User observed a change in their current lobby and reports the data
 */
export interface setLobbyEventdata {

    /**
     * The lobby key of the lobby
     */
    lobbyKey: string;

    /**
     * The new lobby data
     */
    lobby: types.reportLobby;

    /**
     * The new lobby description
     */
    description: string;

    /**
     * The new lobby restriction
     */
    restriction: string;
}

/**
 * Socketio eventdata for the set lobby event response
 */
export interface setLobbyResponseEventdata {

    /**
     * The updated lobby data of the target lobby - capsulated due to compatibility!
     */
    lobbyData: {
        lobby: types.palantirLobby;
    }

    /**
     * Indicator if the client is the palantir lobby owner
     */
    owner: boolean;

    /**
     * The actual owner's lobby player ID
     */
    ownerID: number;
}

/**
 * Socketio eventdata for the search lobby event:
 * User searchs for a lobby and requests their status update
 */
export interface searchLobbyEventdata {
    searchData: {

        /**
         * The user's current ingame nickname
         */
        userName: string;

        /**
         * Indicator if the search is paused due to a full lobby
         */
        waiting: boolean;
    }
}

/**
 * Socketio eventdata for the leave lobby event response
 */
export interface leaveLobbyResponseEventdata {

    /**
     * Currently active lobbies of all guilds the authenticated member is conencted to
     * Sent to instantly update the current lobbies because client wouldn't receive updates while playing
     */
    activeLobbies: Array<types.activeGuildLobbies>;
}

/**
 * Socketio eventdata for the store drawing event
 */
export interface storeDrawingEventdata {

    /**
     * The image's meta, not necessarily complete, see {@link types.imageData.meta}
     */
    meta: Partial<types.imageMeta>;

    /**
     * The image's uri, see {@link types.imageData.uri}
     */
    uri: string;

    /**
     * The image's draw commands, see {@link types.imageData.commands}
     */
    commands: Array<Array<Array<number> | number>>;
}

/**
 * Socketio eventdata containing a drawing's id, used for:
 * - store drawing response
 * - remove drawing
 * - fetch drawing
 * - get commands
 */
export interface drawingIDEventdata {

    /**
     * The id of an image
     */
    id: string;
}

/**
 * Socketio eventdata for the fetch drawing event
 */
export interface fetchDrawingEventdata {

    /**
     * The id of an image
     */
    id: string;

    /**
     * Indicates wether commands should be included in the response
     */
    withCommands: boolean;
}

/**
 * Socketio eventdata for the fetch drawing event response
 */
export interface fetchDrawingResponseEventdata {

    /**
     * The image result
     */
    drawing: types.imageData;
}

/**
 * Socketio eventdata for the get commands event response
 */
export interface getCommandsResponseEventdata {

    /**
     * The image's draw commands, see {@link types.imageData.commands}
     */
    commands: Array<Array<Array<number> | number>>;
}

/**
 * Socketio eventdata for the get meta event
 */
export interface getMetaEventdata {

    /**
     * The search meta, containing only desired properties, see {@link types.imageData.meta}
     */
    query: Partial<types.imageMeta>;

    /**
    * The search result limitor
    */
    limit?: number;
}

/**
 * Socketio eventdata for the get meta event response
 */
export interface getMetaResponseEventdata {

    /**
     * The image results
     */
    drawings: Array<{id:string, meta: types.imageMeta}>;
}

/**
 * Socketio eventdata for the get meta event response
 */
 export interface getMetaResponseEventdata {

    /**
     * The image results
     */
    drawings: Array<{id:string, meta: types.imageMeta}>;
}

/**
 * Socketio eventdata for the get meta event response
 */
 export interface claimDropEventdata {
     
    /**
     * The target drop ID
     */
    dropID: string;

    /**
     * The drop claim ticket provided by the drop server
     */
    claimTicket: number;
}

/**
 * Socketio eventdata for the claim drop event
 */
 export interface claimDropEventdata {
     
    /**
     * The target drop ID
     */
    dropID: string;

    /**
     * The drop claim ticket provided by the drop server
     */
    claimTicket: number;

    /**
     * Details about the claim
     */
    claimDetails: string;

    /**
     * Indicates if the claim was an automated timeout collection
     */
    timedOut: boolean;
}

/**
 * Socketio eventdata for the get rank drop event
 */
 export interface rankDropEventdata {
     
    /**
     * The target drop ID
     */
    dropID: string;

    /**
     * The array of rank strings
     */
    ranks: Array<string>;
}

/**
 * Socketio eventdata for the clear drop event
 */
 export interface clearDropEventdata {
     
    /**
     * The target drop ID
     */
    dropID: string;

    /**
     * The caught player message
     */
    caughtPlayer: string;

    /**
     * The lobby key where the drop was caught
     */
    caughtLobbyKey: string;

    /**
     * The ticket of the person that caught the drop; to identify and customize message
     */
    claimTicket: number;
}




