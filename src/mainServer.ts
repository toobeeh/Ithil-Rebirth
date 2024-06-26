/*
 * # Ithil Main Server
 *
 * ## Tasks
 * The main server is focussed on internal organisation, not external socketio clients:
 * - coordinate worker servers
 * - balance worker servers load by forwarding clients
 * - observe palantir data and distribute to workers
 * 
 * ## Implementation
 * - Palantir/Stat db object for database access
 * - Balancer object to track conected workers and their load
 * - IPC server to communicate with workers
 * - Socketio SSL server to forward clients to a worker's port
 */

// import libs and local modules
import { IthilSocketioServer } from './ithilSocketServer';
import Balancer from './balancer';
import Drops from './drops';
import { IthilIPCServer } from './ipc';
import DataObserver from './dataObserver';
import PalantirDatabase from './database/mysql/palantirDatabase';
import { Configuration, LobbiesApi } from './api';

const config = require("../ecosystem.config").config;

// const api = new LobbiesApi(new Configuration({ basePath: "http://localhost:3000", accessToken: () => "knb76p7ReZxm70kG7ovH5JmWn5qBbgUTCgrpblWfCjBbUkds83FWZnnKVHoQiS63" }));


// async setup
async function setup() {

    /* const l = await api.getAllLobbies();
    console.log(l);
    return; */

    /**
     * Palantir main database connection
     */
    const palantirDb = new PalantirDatabase();
    await palantirDb.open(config.dbUser, config.dbPassword, config.dbHost);


    /**
     * Palantir public data database connection
     */
    const dataDb = new PalantirDatabase();
    await dataDb.open(config.dbUser, config.dbPassword, config.dbHost);

    /**
     * Ithil workers load balancer
     */
    const balancer = new Balancer(config);

    /**
     * Ithil IPC coordination server
     */
    const ipcServer = new IthilIPCServer(config.mainIpcID);

    /**
     * Data observer that broadcasts shared data to all workers os they dont have to fetch from the db
     */
    const dataObserver = new DataObserver(dataDb);
    dataObserver.observe();

    // add callbacks to ipc balancer events
    ipcServer.onWorkerConnected = (data, socket) => {
        balancer.addWorker(data.port, socket);
        ipcServer.broadcastActiveLobbies({ activeLobbies: dataObserver.activeLobbies });
        ipcServer.broadcastPublicData({ publicData: dataObserver.publicData });
    }

    ipcServer.onWorkerDisconnected = (socket, socketID) => {
        balancer.updateOnlineWorker();
        console.log("Worker disconnected: ", socketID)
    }

    ipcServer.onBalanceChanged = (data, socket) => {
        balancer.updateClients(data.port, data.clients);
        console.log(balancer.currentBalancing());
    }

    ipcServer.onLobbyReport = (data, socket) => {
        dataObserver.clientLobbyReports.set(data.session, data.lobbies);
    }

    ipcServer.onStatusReport = (data, socket) => {
        dataObserver.clientPlayerStatuses.set(data.session, { status: data.status, lobbyKey: data.lobbyKey, login: data.login });
    }

    // add callbacks to data observer events
    dataObserver.onActiveLobbiesChanged = (lobbies) => {
        ipcServer.broadcastActiveLobbies({ activeLobbies: lobbies });
        console.log("broadcasted lobbies: " + lobbies.length)
    }

    dataObserver.onPublicDataChanged = (data) => {
        ipcServer.broadcastPublicData({ publicData: data });
    }

    /**
     * The balancer socketio server
     */
    const mainSocketServer = new IthilSocketioServer(config.mainPort, config.certificatePath).server;

    // listen for socket connection events
    mainSocketServer.on("connection", socket => {

        // create listener for port request
        socket.on("request port", async data => {

            // find and respond the least busy port, log client and close socket
            const port = (await balancer.getBalancedWorker()).port;
            const alias = `worker-${port - config.workerRange[0] + 1}`;
            socket.emit("balanced port", { port: port, alias: alias });
            socket.disconnect();

            console.log("Sent client to port " + port);
        });
    });

    // start drops

    /** Drop handler that conatisn all drop logic and handling */
    const dropHandler = new Drops(palantirDb, ipcServer); // lgtm [js/unused-local-variable]

    console.log("all done");
}
setup();