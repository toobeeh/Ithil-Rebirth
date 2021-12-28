module.exports = {
    apps: [
        {
            name: "Ithil Main Server",
            script: "./dist/mainServer.js",
            time: true
        } /* , {
            name: "Ithil Worker Server",
            script: "ithilWorker.js",
            exec_mode: "cluster",
            instances: 8,
            wait_ready: true,
            listen_timeout: 10000,
            time: true
        } */
    ],
    config: {
        masterPort: 4000,
        dropPort: 4001,
        workerRange: [4002, 4010],
        minAvailableWorker: 7,
        certificatePath: '/etc/letsencrypt/live/typo.rip',
        palantirDbPath: '../debugDB/palantir.db',
        statDbPath: '/etc/letsencrypt/live/typo.rip',
        imageDbParentPath: '/etc/letsencrypt/live/typo.rip',
    }
};
