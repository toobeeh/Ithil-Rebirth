import https from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import { Server as SocketioServer, Socket } from "socket.io";
import * as types from "./database/types";

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

export class TypoClientSocket extends Socket{
    
    subscribeEventAsync<TIncoming, TResponse>(eventName: string, handler: (incomingData: TIncoming) => Promise<TResponse>, withResponse: boolean = true, once: boolean = false){
        (once ? this.once : this.on)(eventName, async (incoming: TIncoming, socket: Socket)=>{
            const response = await handler(incoming);
            if(withResponse) socket.emit(eventName + " response", response);
        });
    }

    subscribeLoginEvent(handler: (incoming: loginEventdata) => Promise<loginResponseEventdata>){
        this.subscribeEventAsync<loginEventdata, loginResponseEventdata>(eventNames.login, handler, true, true);
    }

}

//interfaces and eventdata for client connection

export const eventNames = Object.freeze({
    onlineSprites: "online sprites",
    activeLobbies: "active lobbies",
    publicData: "public data",
    newDrop: "new drop",
    clearDrop: "clear drop",
    rankDrop: "rank drop",
    login: "login"
});

/**
 * Socketio eventdata for the online sprites event
 */
export interface onlineSpritesEventdata{
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
export interface activeLobbiesEventdata{
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
 export interface loginEventdata{
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
export interface loginResponseEventdata{
    /**
     * Signalizes wether the login attempt was successful
     */
    authenticated: boolean;

    /**
     * Currently active lobbies of all guilds the authenticated member is conencted to
     */
    activeLobbies: Array<types.activeGuildLobbies>;
    
    /**
     * The authenticated member
     */
    user: types.member;
}