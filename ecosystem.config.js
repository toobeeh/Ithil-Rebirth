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
            time: true,
            node_args: "--inspect=9229"
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
        certificatePath: '/etc/letsencrypt/live/typo.rip',
        palantirDbPath: '/home/pi/Database/palantir.db',
        statDbPath: '/home/pi/Database/typoStats.db',
        imageDbParentPath: '/home/pi/Database/imagedb/',
        dbUser: "palantir",
        dbPassword: ""
    }
};
