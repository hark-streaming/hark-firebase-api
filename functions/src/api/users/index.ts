// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import axios from "axios";
//import * as thetajs from "@thetalabs/theta-js";
const thetajs = require("@thetalabs/theta-js");
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let userRouter = express.Router();

// gets all public facing information about a user
// avatar, name, wallets,
// userRouter.get("/:uid", async function getUser(req: express.Request, res: express.Response) {

// });

/**
 * Upgrade the provided uid of a normal user to a streamer, given the correct info
 * {
 *   captcha: the captcha token
 *   ein: 12132
 *   phone: 1231231
 *   name: John Guy
 *   tags: [{name: tag}, {name2: tag2}]
 * }
 */
/* TODO: to be finished
userRouter.post("/upgrade/:uid", async function (req: express.Request, res: express.Response) {
    // Verify captcha token with hcaptcha
    const hcaptchaRes = await verifyCaptcha(req);

    // upgrade the user if captcha passes
    let response;
    let status;
    if (hcaptchaRes.data.success) {
        // update their user doc with new info

        // then create a streamdoc
        response = await registerStreamer(req);
        status = response.status;
    }
    else {
        status = 500;
        response = hcaptchaRes.data;
    }

    // return response
    res.status(status).json(response);

});*/

// checks captcha, then registers user
// their account type is based on the fields sent in the request
userRouter.post("/register", async function (req: express.Request, res: express.Response) {
    // Verify captcha token with hcaptcha
    const hcaptchaRes = await verifyCaptcha(req);

    // register the user if captcha passes
    let response;
    let status;
    if (hcaptchaRes.data.success) {
        response = await registerUser(req);
        status = response.status;
    }
    else {
        status = 500;
        response = hcaptchaRes.data;
    }

    // return response
    res.status(status).json(response);

});


// temp endpoint to register a user with no captcha
// MAKE SURE TO REMOVE ON PRODUCTION
// userRouter.post("/registernocaptcha", async function getUser(req: express.Request, res: express.Response) {

//     let response = await registerUser(req);
//     let status = response.status;

//     // return response
//     res.status(status).json(response);

// });

// registers a user to firebase given the basic information
// TODO: if the req has streamer/poltician fields, do more data set up
// TODO: add field santization before register
// TODO: add error handling
// Make sure non-viewers have strict information requirements in order to register
async function registerUser(req: express.Request) {
    // the firestore
    const db = admin.firestore();

    // register the user with email, password, username
    // TODO: error handling (maybe add a middleware?)
    let userRecord = await admin.auth().createUser({
        email: req.body.email,
        emailVerified: false,
        password: req.body.password,
        displayName: req.body.username,
        photoURL: 'http://www.example.com/12345678/photo.png',
        disabled: false,
    });

    // create theta wallets for the user
    const p2pWallet = await generateP2PWallet(userRecord.uid);
    const tokenWallet = await generateTokenWallet();

    // if they are a default user (viewer)
    // add an entry into the firestore with their data
    await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: req.body.username,
        email: req.body.email,
        streamkey: "",
        ein: req.body.ein,
        name: req.body.name,
        phone: req.body.phone,
        p2pWallet: p2pWallet,
        tokenWallet: tokenWallet.address,
    });

    await db.collection("private").doc(userRecord.uid).set({
        tokenWallet: {
            privateKey: tokenWallet.privateKey,
            mnemonic: tokenWallet._mnemonic().phrase,
            address: tokenWallet.address
        }
    });

    // if they are a streamer
    // add an entry into the firestore with their data
    // create a stream doc in the firestore
    if (req.body.role == "streamer") {

        let tags: string[] = [];
        req.body.tags.forEach((element: { name: string; }) => {
            tags.push(element.name);
        });

        await db.collection("streams").doc(req.body.username).set({
            title: req.body.username,
            description: "Default description!",
            timestamp: Date.now(),
            poster: "https://media.discordapp.net/attachments/814278920168931382/819072942507556914/hark-logo-high-res.png?width=1025&height=280",
            thumbnail: "https://cdn.discordapp.com/attachments/814278920168931382/820548508192342056/hrk.png",
            live: false,
            nsfw: false,
            archive: false,
            url: "http://13.59.151.129:8080/hls/" + req.body.username + ".m3u8",
            name: req.body.username,
            owner: userRecord.uid,
            avatar: "https://media.discordapp.net/attachments/814278920168931382/819073087021776906/hark-logo-h-high-res.png?width=499&height=499",
            to: "/channel/" + req.body.username,
            banned: false,
            tags: tags,
            donateMsg: "",
            donateOn: "",
            donateUrl: "",
        });

        function generateP() {
            var pass = '';
            var str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
                'abcdefghijklmnopqrstuvwxyz0123456789';

            for (let i = 1; i <= 8; i++) {
                var char = Math.floor(Math.random()
                    * str.length + 1);

                pass += str.charAt(char)
            }

            return pass;
        }

        await db.collection("users").doc(userRecord.uid).update({
            streamkey: generateP(),
        });
    }

    // if they are a politician
    // add an entry into the firestore with their data
    // create a stream doc in the firestore


    // return a json response
    return {
        success: true,
        status: 200,
        message: "oh yeah user registered"
    };
}

/* TODO: to be finished
async function createStreamer(uid: String, tag: String[],) {
    // the firestore
    const db = admin.firestore();

    // add an entry into the firestore with their streamer data
    let tags: string[] = [];
    req.body.tags.forEach((element: { name: string; }) => {
        tags.push(element.name);
    });

    await db.collection("streams").doc(req.body.username).set({
        title: req.body.username,
        description: "Default description!",
        timestamp: Date.now(),
        poster: "https://media.discordapp.net/attachments/814278920168931382/819072942507556914/hark-logo-high-res.png?width=1025&height=280",
        thumbnail: "https://cdn.discordapp.com/attachments/814278920168931382/820548508192342056/hrk.png",
        live: false,
        nsfw: false,
        archive: false,
        url: "http://13.59.151.129:8080/hls/" + req.body.username + ".m3u8",
        name: req.body.username,
        owner: userRecord.uid,
        avatar: "https://media.discordapp.net/attachments/814278920168931382/819073087021776906/hark-logo-h-high-res.png?width=499&height=499",
        to: "/channel/" + req.body.username,
        banned: false,
        tags: tags,
        donateMsg: "",
        donateOn: "",
        donateUrl: "",
    });

    function generateP() {
        var pass = '';
        var str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
            'abcdefghijklmnopqrstuvwxyz0123456789';

        for (let i = 1; i <= 8; i++) {
            var char = Math.floor(Math.random()
                * str.length + 1);

            pass += str.charAt(char)
        }

        return pass;
    }

    await db.collection("users").doc(userRecord.uid).update({
        streamkey: generateP(),
    });

    return {
        success: true,
        status: 200,
        message: "oh yeah streamer registered"
    };
}*/

// verifies the hcaptcha and returns the result
async function verifyCaptcha(req: express.Request) {
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', req.body.captcha);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

    return hcaptchaRes;
}

// wallet from theta's partner service
async function generateTokenWallet() {
    const wallet = thetajs.Wallet.createRandom();

    return wallet;
}

// wallet from theta's javascript sdk
// used for governance token transactions
async function generateP2PWallet(uid: String) {

    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data.body.address;
}

// (this method is basically just a test and can remove later) -kevin
// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
// userRouter.get("/test/test", async (req: express.Request, res: express.Response) => {
//     let awallet = await generateTokenWallet();
//     res.status(469).send(awallet._mnemonic().phrase);
//     //res.status(404).send("This route does not exist.");
// });