import https from 'https';
import fs from 'fs';
import cors from 'cors';
import express from "express";
import { Server as SocketioServer } from "socket.io";

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