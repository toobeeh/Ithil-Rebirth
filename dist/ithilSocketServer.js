"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventNames = exports.TypoSocketioClient = exports.IthilSocketioServer = exports.IthilWebsocketServer = void 0;
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const ws = __importStar(require("ws"));
const socket_io_1 = require("socket.io");
/**
 * A https server with certs loaded and cors enabled
 */
class IthilHttpsServer {
    /**
     * Init https & express server
     * @param certPath The path to the SSL certificate
     */
    constructor(certPath) {
        // Start the https server with cors on main port
        const serverExpress = (0, express_1.default)();
        serverExpress.use((0, cors_1.default)());
        const server = https_1.default.createServer({
            key: fs_1.default.readFileSync(certPath + '/privkey.pem', 'utf8'),
            cert: fs_1.default.readFileSync(certPath + '/cert.pem', 'utf8'),
            ca: fs_1.default.readFileSync(certPath + '/chain.pem', 'utf8')
        }, serverExpress);
        this.httpsServer = server;
    }
}
/**
 * A wrapper class for all required websocket server initialization
 */
class IthilWebsocketServer extends IthilHttpsServer {
    /**
     * Init https & express and start the websocket server
     * @param port The socketio port
     * @param certPath The path to the SSL certificate
     */
    constructor(port, certPath) {
        // Call base constructor
        super(certPath);
        // start websocket server and listen
        this.server = new ws.WebSocketServer({ server: this.httpsServer });
        this.httpsServer.listen(port);
    }
}
exports.IthilWebsocketServer = IthilWebsocketServer;
/**
 * A wrapper class for all required socketio server initialization
 */
class IthilSocketioServer extends IthilHttpsServer {
    /**
     * Init https & express and start the socketio server
     * @param port The socketio port
     * @param certPath The path to the SSL certificate
     */
    constructor(port, certPath) {
        // Call base constructor
        super(certPath);
        // Start the socketio server
        this.server = new socket_io_1.Server(this.httpsServer, {
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
exports.IthilSocketioServer = IthilSocketioServer;
/**
 * A wrapper class for a connected socketio client, enabling type-safe event listeners and responses
 */
class TypoSocketioClient {
    /** Init wrapper class */
    constructor(socket) {
        this.socket = socket;
    }
    /**
     * Subscribe to an event with an async handler
     * @param eventName The event to listen for
     * @param handler The async handler to process incoming data and return response data
     * @param withResponse Indicates wether a response should be made
     * @param once Indicates wether the listener is once or permanent
     */
    subscribeEventAsync(eventName, handler, withResponse = true, once = false) {
        const callback = async (incoming, socket) => {
            // get the payload from the event data consisting of eventname and payload
            const response = await handler(incoming.payload);
            if (withResponse) {
                // build a response of the handler's result and emit it
                const base = {
                    event: eventName + " response",
                    payload: response
                };
                this.socket.emit(eventName + " response", base);
            }
        };
        if (once)
            this.socket.once(eventName, callback);
        else
            this.socket.on(eventName, callback);
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
    async emitEventAsync(eventName, outgoingData, withResponse = true, unique = false, timeout = 15000) {
        // generate unique event name if set
        let uniqueName = eventName;
        if (unique)
            uniqueName = uniqueName + "@" + Date.now();
        // create promise that holds response data
        const promise = new Promise((resolve, reject) => {
            // if resopnse is awaited, add a listener that will resolve on the event - else resolve instantly with empty data
            if (withResponse) {
                // a event handler that removes itself and resolves the promise as soon as the right unique event was received
                const handler = (data) => {
                    if (unique && data.event == uniqueName || !unique) {
                        resolve(data.payload);
                        this.socket.off(eventName, handler);
                    }
                };
                this.socket.on(eventName + " response", handler);
                // set timeout to reject promise
                setTimeout(() => reject("Timed out"), timeout);
            }
            else
                resolve({});
        });
        const base = {
            event: uniqueName,
            payload: outgoingData
        };
        this.socket.emit(eventName, base);
        return promise;
    }
    /**
     * Send public data to the client
     * @param data The public data eventdata
     */
    emitPublicData(data) {
        this.emitEventAsync(exports.eventNames.publicData, data, false);
    }
    /**
     * Subscribe to the disconnect event
     * @param handler Handler that is fired on the socket disconnect
     */
    subscribeDisconnect(handler) {
        this.socket.on("disconnect", handler);
    }
    /**
     * Subscribe to the login event - client is trying to log in
     * @param handler Handler that should process login data and respond state
     */
    subscribeLoginEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.login, handler, true, true);
    }
    /**
     * Subscribe to the get user event - client is requesting user data
     * @param handler Handler that fetches and returns user data
     */
    subscribeGetUserEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.getUser, handler, true, false);
    }
    /**
     * Subscribe to the set slot event - client is requesting to set a sprite on one of their slots
     * @param handler Handler that processes the request and responds with the new member data
     */
    subscribeSetSlotEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.setSlot, handler, true, false);
    }
    /**
     * Subscribe to the set combo event - client is requesting to activate a sprite combo
     * @param handler Handler that processes the combo data and responds with the new member data
     */
    subscribeSetComboEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.setCombo, handler, true, false);
    }
    /**
     * Subscribe to the join lobby event - client has joined a lobby and requests status update
     * @param handler Handler that processes the lobby key and eventually adds a db entry, returns corresponding lobby data
     */
    subscribeJoinLobbyEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.joinLobby, handler, true, false);
    }
    /**
     * Subscribe to the set lobby event - client observed lobby change and reports new data
     * @param handler Handler that processes the lobby data and responds with verified new data
     */
    subscribeSetLobbyEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.setLobby, handler, true, false);
    }
    /**
     * Subscribe to the leave lobby event - client leaves a lobby
     * @param handler Handler returns currently active lobbies
     */
    subscribeLeaveLobbyEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.leaveLobby, handler, true, false);
    }
    /**
     * Subscribe to the search lobby event - client searches for a lobby
     * @param handler Handler processes search data
     */
    subscribeSearchLobbyEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.searchLobby, handler, false, false);
    }
    /**
     * Subscribe to the store drawing event - client wants to store a drawing in their image db
     * @param handler Handler that saves the drawing and returns its id
     */
    subscribeStoreDrawingEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.storeDrawing, handler, true, false);
    }
    /**
     * Subscribe to the fetch drawing event - client wants to retrieve a drawing from their image db
     * @param handler Handler gets the drawing by id and returns its data
     */
    subscribeFetchDrawingEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.fetchDrawing, handler, true, false);
    }
    /**
     * Subscribe to the remove drawing event - client wants to remove a drawing from their image db
     * @param handler Handler that removes the drawing
     */
    subscribeRemoveDrawingEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.removeDrawing, handler, false, false);
    }
    /**
     * Subscribe to the get commands event - client wants to fetch draw commands of an image
     * @param handler Handler that returns the draw commands
     */
    subscribeGetCommandsEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.getCommands, handler, true, false);
    }
    /**
     * Subscribe to the get meta event - client wants to get all drawings that match search meta
     * @param handler Handler that returns the drawing results
     */
    subscribeGetMetaEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.getMeta, handler, true, false);
    }
    /**
     * Subscribe to the claim drop event - client wants to claim a drop
     * @param handler Handler that processes claim data and sends an ipc message to the main server
     */
    subscribeClaimDropEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.claimDrop, handler, false, false);
    }
    /**
     * Subscribe to the claim drop event - client wants to claim a drop
     * @param handler Handler that processes claim data and sends an ipc message to the main server
     */
    subscribePostImageEvent(handler) {
        this.subscribeEventAsync(exports.eventNames.postImage, handler, false, false);
    }
}
exports.TypoSocketioClient = TypoSocketioClient;
//interfaces and event names for socketio communication
exports.eventNames = Object.freeze({
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
    getMeta: "get meta",
    postImage: "post image"
});
//# sourceMappingURL=ithilSocketServer.js.map