module.exports = {
    apps: [
        {
            name: "Ithil-Rebirth Main Server",
            script: "./dist/mainServer.js",
            time: true
        }, {
            name: "Ithil-Rebirth Worker Server",
            script: "./dist/workerServer.js",
            exec_mode: "cluster",
            instances: 7,
            wait_ready: true,
            listen_timeout: 10000,
            time: true
        }, {
            name: "Ithil-Rebirth Worker Debug Server",
            script: "./dist/workerServer.js",
            exec_mode: "cluster",
            instances: 1,
            wait_ready: true,
            listen_timeout: 10000,
            time: true
        }, {
            name: "Ithil-Rebirth Drop Server",
            script: "./dist/dropServer.js",
            time: true
        }
    ],
    config: {
        mainIpcID: "main",
        mainPort: 4000,
        dropPort: 4001,
        workerRange: [4002, 4010],
        minAvailableWorker: 7,
        dbUser: "ithil",
        dbHost: env.DB_DOMAIN_NAME,
        dbPassword: ""
    }
};
