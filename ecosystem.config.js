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
            instances: 8,
            wait_ready: true,
            listen_timeout: 10000,
            time: true
        }
    ],
    config: {
        mainIpcID: "main",
        mainPort: 4100,
        dropPort: 4101,
        workerRange: [4102, 4110],
        minAvailableWorker: 7,
        certificatePath: '/etc/letsencrypt/live/typo.rip',
        palantirDbPath: '../debugDB/palantir.db',
        statDbPath: '../debugDB/typoStats.db',
        imageDbParentPath: '/etc/letsencrypt/live/typo.rip',
    }
};
