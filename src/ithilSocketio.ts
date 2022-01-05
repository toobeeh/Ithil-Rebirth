import https from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import { Server as SocketioServer, Socket } from "socket.io";
import * as types from "./database/types";

/**
 * A wrapper class for all required socketio server initialization
 */
export class IthilSocketioServer {
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

        // Start the https server with cors on main port
        const mainExpress = express();
        mainExpress.use(cors());
        const mainServer = https.createServer({
            key: fs.readFileSync(certPath + '/privkey.pem', 'utf8'),
            cert: fs.readFileSync(certPath + '/cert.pem', 'utf8'),
            ca: fs.readFileSync(certPath + '/chain.pem', 'utf8')
        }, mainExpress);

        this.server = new SocketioServer(
            mainServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST", "OPTIONS"]
            },
            pingTimeout: 20000
        });

        // start listening 
        mainServer.listen(port);
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
        this.subscribeEventAsync<searchLobbyEventdata, void>(eventNames.searchLobby, handler, true, false);
    }

}

//interfaces and event names for socketio communication

export const eventNames = Object.freeze({
    onlineSprites: "online sprites",
    activeLobbies: "active lobbies",
    publicData: "public data",
    newDrop: "new drop",
    clearDrop: "clear drop",
    rankDrop: "rank drop",
    login: "login",
    getUser: "get user",
    setSlot: "set slot",
    setCombo: "set combo",
    joinLobby: "join lobby",
    setLobby: "set lobby",
    searchLobby: "search lobby",
    leaveLobby: "leave lobby"
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
    activeLobbies: types.activeGuildLobbies;
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
    key: string;

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

    /**
     * The user's current ingame nickname
     */
    userName: string;

    /**
     * Indicator if the search is paused due to a full lobby
     */
    waiting: boolean;
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




