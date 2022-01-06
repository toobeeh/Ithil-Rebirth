module.exports = {
    apps: [
        {
            name: "Ithil-Rebirth Main Server",
            script: "./dist/mainServer.js",
            time: true,
            node_args: "--inspect=9229"
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
        palantirDbPath: '/home/pi/Database/imagedb/palantir.db',
        statDbPath: '/home/pi/Database/imagedb/typoStats.db',
        imageDbParentPath: '/home/pi/Database/imagedb/',
    }
};
