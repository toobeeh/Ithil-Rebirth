"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventNames = exports.TypoSocketioClient = exports.IthilSocketioServer = void 0;
const https_1 = __importDefault(require("https"));
const fs_1 = __importDefault(require("fs"));
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const socket_io_1 = require("socket.io");
/**
 * A wrapper class for all required socketio server initialization
 */
class IthilSocketioServer {
    /**
     * Init https & express and start the socketio server
     * @param port The socketio port
     * @param certPath The path to the SSL certificate
     */
    constructor(port, certPath) {
        // Start the https server with cors on main port
        const mainExpress = (0, express_1.default)();
        mainExpress.use((0, cors_1.default)());
        const mainServer = https_1.default.createServer({
            key: fs_1.default.readFileSync(certPath + '/privkey.pem', 'utf8'),
            cert: fs_1.default.readFileSync(certPath + '/cert.pem', 'utf8'),
            ca: fs_1.default.readFileSync(certPath + '/chain.pem', 'utf8')
        }, mainExpress);
        this.server = new socket_io_1.Server(mainServer, {
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
}
exports.TypoSocketioClient = TypoSocketioClient;
//interfaces and event names for socketio communication
exports.eventNames = Object.freeze({
    onlineSprites: "online sprites",
    activeLobbies: "active lobbies",
    publicData: "public data",
    newDrop: "new drop",
    clearDrop: "clear drop",
    rankDrop: "rank drop",
    login: "login",
    getUser: "get user"
});
//# sourceMappingURL=ithilSocketio.js.map