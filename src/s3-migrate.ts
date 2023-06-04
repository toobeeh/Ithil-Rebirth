import { exit } from 'process';
import { spawn, Worker } from "threads";
import yargs, { config } from 'yargs';
import { imageDatabaseWorker } from './database/imageDatabaseWorker';
import { S3CloudConnection } from './s3/cloud';
import PalantirDatabase from './database/mysql/palantirDatabase';
const config = require("../ecosystem.config").config;

// Retrieve the value of the "u" command-line argument
const argv = yargs(process.argv.slice(2)).argv;
const uValue = (argv as any).u;
const key = (argv as any).k;
const secret = (argv as any).s;
const userOverride = (argv as any).o;
const udb_path = (argv as any).p;

// Check if the "u" argument exists and log its value
if (uValue) {
    console.log('Exporting userdb to AWS from user:', uValue);
    console.log('S3 credentials:', key, secret);
} else {
    console.log('No "u" argument provided.');
    exit(1);
}

async function main() {

    /* init user img db */
    const asyncImageDb = await spawn<imageDatabaseWorker>(new Worker("./database/imageDatabaseWorker"));
    await asyncImageDb.init(uValue, udb_path);
    const metas = await asyncImageDb.getUserMeta(userOverride ?? uValue);

    /* init ptr db */
    const database = new PalantirDatabase();
    await database.open(config.dbUser, config.dbPassword, config.dbHost);

    /* init s3 */
    const s3 = new S3CloudConnection(key, secret, uValue, database);
    await s3.init();

    console.log("started import");

    let errorCount = 0;

    //upload all drawings
    for (let i = 0; i < metas.result.length; i++) {
        console.log("processing drawing " + i + " of " + metas.result.length);
        try {

            const meta = metas.result[i];
            const drawing = await asyncImageDb.getDrawing(meta.id);

            await s3.saveDrawing(drawing.result);
        }
        catch (e) {
            errorCount++;
            console.log(e);
            try {
                await s3.removeDrawing(metas.result[i].id);
            }
            catch (e) {
                console.log("failed to remove failed drawing", e);
            }
        }
    }

    console.log("finished import with " + errorCount + " errors");

    const results = await s3.searchObjectsByTags({ own: true })
    console.log(results);

    /* for (let r of results) {
        await s3.removeDrawing(r.uuid);
    }

    const results2 = await s3.searchObjectsByTags({})
    console.log(results2); */

    return;
}

main();