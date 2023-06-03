import { exit } from 'process';
import { spawn, Worker } from "threads";
import yargs, { config } from 'yargs';
import { imageDatabaseWorker } from './database/imageDatabaseWorker';
import aws from 'aws-sdk';

// Retrieve the value of the "u" command-line argument
const argv = yargs(process.argv.slice(2)).argv;
const uValue = (argv as any).u;
const key = (argv as any).k;
const secret = (argv as any).s;

// Check if the "u" argument exists and log its value
if (uValue) {
    console.log('Exporting userdb to AWS from user:', uValue);
    console.log('S3 credentials:', key, secret);
} else {
    console.log('No "u" argument provided.');
    exit(1);
}

const udb_path = "/home/pi/Webroot/rippro/userdb/";


async function main() {
    const asyncImageDb = await spawn<imageDatabaseWorker>(new Worker("./database/imageDatabaseWorker"));
    await asyncImageDb.init(uValue, udb_path);

    const metas = await asyncImageDb.getUserMeta(uValue);
    console.log("user has " + metas.result.length + " drawings");

    // connect to aws s3
    const s3 = new aws.S3({
        accessKeyId: key,
        secretAccessKey: secret,
        endpoint: "https://eu2.contabostorage.com/"
    });

    /* TODO OTHER ID AS BUCKET NAME */
    const bucketName = "user-bucket-" + uValue;

    console.log("connected to s3");

    try {
        await s3.headBucket({ Bucket: bucketName }).promise()
    } catch (err) {
        await s3.createBucket({ Bucket: bucketName }).promise()
    }

    //upload all drawings
    for (let i = 0; i < metas.result.length; i++) {
        console.log("processing drawing " + i + " of " + metas.result.length);
        const meta = metas.result[i];
        const drawing = await asyncImageDb.getDrawing(meta.id);

        const image = Buffer.from(drawing.result.uri.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        const commandsString = JSON.stringify(drawing.result.commands);
        const metaString = JSON.stringify(meta.meta);

        // upload meta
        await s3.putObject({
            Bucket: bucketName,
            Key: `imgcloud-meta-` + meta.id, // Specify the desired file name in the bucket
            Body: metaString, // Specify the body of the file here
            ContentType: 'application/json',
            ACL: 'public-read'
        }).promise();

        // upload base64
        await s3.putObject({
            Bucket: bucketName,
            Key: `imgcloud-image-` + meta.id, // Specify the desired file name in the bucket
            Body: image, // Specify the body of the file here
            ContentType: 'image/png',
            ACL: 'public-read'
        }).promise();

        // upload commands
        await s3.putObject({
            Bucket: bucketName,
            Key: `imgcloud-commands-` + meta.id, // Specify the desired file name in the bucket
            Body: commandsString, // Specify the body of the file here
            ContentType: 'application/json',
            ACL: 'public-read'
        }).promise();
    }
}

main();