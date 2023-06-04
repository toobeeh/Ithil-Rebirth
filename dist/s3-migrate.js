"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const process_1 = require("process");
const threads_1 = require("threads");
const yargs_1 = __importDefault(require("yargs"));
const cloud_1 = require("./s3/cloud");
const palantirDatabase_1 = __importDefault(require("./database/mysql/palantirDatabase"));
const config = require("../ecosystem.config").config;
// Retrieve the value of the "u" command-line argument
const argv = (0, yargs_1.default)(process.argv.slice(2)).argv;
const uValue = argv.u;
const key = argv.k;
const secret = argv.s;
// Check if the "u" argument exists and log its value
if (uValue) {
    console.log('Exporting userdb to AWS from user:', uValue);
    console.log('S3 credentials:', key, secret);
}
else {
    console.log('No "u" argument provided.');
    (0, process_1.exit)(1);
}
async function main() {
    /* init user img db */
    const asyncImageDb = await (0, threads_1.spawn)(new threads_1.Worker("./database/imageDatabaseWorker"));
    const udb_path = "C:\\Users\\User\\";
    await asyncImageDb.init(uValue, udb_path);
    const metas = await asyncImageDb.getUserMeta(uValue);
    /* init ptr db */
    const database = new palantirDatabase_1.default();
    await database.open(config.dbUser, config.dbPassword, config.dbHost);
    /* init s3 */
    const s3 = new cloud_1.S3CloudConnection(key, secret, uValue, database);
    await s3.init();
    /*  console.log("started import");
 
     //upload all drawings
     for (let i = 0; i < metas.result.length; i++) {
         console.log("processing drawing " + i + " of " + metas.result.length);
         const meta = metas.result[i];
         const drawing = await asyncImageDb.getDrawing(meta.id);
 
         s3.saveDrawing(drawing.result);
     }
 
     console.log("finished import"); */
    const results = await s3.searchObjectsByTags({ own: false });
    console.log(results);
    /* for (let r of results) {
        await s3.removeDrawing(r.uuid);
    }

    const results2 = await s3.searchObjectsByTags({})
    console.log(results2); */
    return;
}
main();
//# sourceMappingURL=s3-migrate.js.map