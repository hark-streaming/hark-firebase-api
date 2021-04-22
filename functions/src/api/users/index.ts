// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import axios from "axios";
//import * as thetajs from "@thetalabs/theta-js";
//const thetajs = require("@thetalabs/theta-js");
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { body, validationResult } from 'express-validator';

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let userRouter = express.Router();

/**
 * Check if a username is unique or not
 */
userRouter.get("/check-username/:username", async function (req: express.Request, res: express.Response) {
    const exists = await checkUsernameExists(req.body.username);
    if (exists) {
        res.status(200).send({
            success: true,
            status: 200,
            valid: false,
            message: "Username already exists"
        });
        return;
    }
    else {
        res.status(200).send({
            success: true,
            status: 200,
            valid: true,
            message: "Username is valid"
        });
        return;
    }
});

/**
 * Registers a user to the firebase
 * Requires a valid hcaptcha token
 */
userRouter.post("/register",
    body("username").trim().isAlphanumeric().isLength({ min: 3 }),
    body("email").isEmail().normalizeEmail(),
    body("password").isLength({ min: 8 }),
    async function (req: express.Request, res: express.Response) {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Verify captcha token with hcaptcha
        const hcaptchaSuccess = await verifyCaptcha(req.body.captcha);

        // register the user if captcha passes
        if (hcaptchaSuccess) {

            // all the fields needed for a user
            const username = req.body.username;
            const email = req.body.email;
            const password = req.body.password;
            const role = req.body.role;

            const ein = req.body.ein;
            const name = req.body.name;
            const phone = req.body.phone;
            let tags: string[] = [];
            if (req.body.tags) {
                req.body.tags.forEach((element: { name: string; }) => {
                    tags.push(element.name);
                });
            }


            // check if username is unique
            const exists = await checkUsernameExists(req.body.username);
            if (exists) {
                res.status(200).send({
                    success: false,
                    status: 400,
                    message: "Username already exists"
                });
                return;
            }

            // register the user
            try {
                const result = await registerUser(username, email, password, role, ein, name, phone, tags);
                if (result.success) {
                    res.status(200).send({
                        success: true,
                        status: 200,
                        message: "User registered"
                    });
                    return;
                }
            }
            catch (err) {
                console.log(err);
                res.status(200).send({
                    success: false,
                    status: 500,
                    message: "Registration error",
                    //err: err
                });
                return;
            }


            res.status(200).send({
                success: false,
                status: 500,
                message: "unknown registration error"
            });
            return;
        }
        else {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Captcha verification failed"
            });
            return;
        }
    });

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
userRouter.post("/upgrade/:uid", async function (req: express.Request, res: express.Response) {
    // Verify captcha token with hcaptcha
    const hcaptchaSuccess = await verifyCaptcha(req.body.captcha);

    // upgrade the user if captcha passes
    if (hcaptchaSuccess) {
        // the firestore
        const db = admin.firestore();

        // all the fields needed for a user
        const uid = req.params.uid;
        const ein = req.body.ein;
        const name = req.body.name;
        const phone = req.body.phone;
        let tags: string[] = [];
        req.body.tags.forEach((element: { name: string; }) => {
            tags.push(element.name);
        });

        // update their user doc with new info
        const userRef = db.collection("users").doc(uid);
        await userRef.update({
            ein: ein,
            name: name,
            phone: phone,
        });

        // get their username
        const userDoc = await userRef.get();
        const userData = await userDoc.data();
        const username = userData?.username;

        // then create a streamdoc
        try {
            const result = await createStreamDoc(username, uid, tags);
            if (result.success) {
                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "User upgraded to streamer"
                });
                return;
            }
        }
        catch {
            res.status(200).send({
                success: true,
                status: 200,
                message: "Streamer upgrade error"
            });
            return;
        }

        res.status(200).send({
            success: true,
            status: 200,
            message: "Streamer upgrade failed"
        });
        return;
    }
    else {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Captcha verification failed"
        });
        return;
    }

});

/**
 *  Registers a user to firebase given the required information
 */
// TODO: if the req has streamer/poltician fields, do more data set up
// TODO: add field santization before register
// TODO: add error handling
// Make sure non-viewers have strict information requirements in order to register
async function registerUser(username: string, email: string, password: string, role: string, ein: number, name: string, phone: number, tags: string[]) {
    // the firestore
    const db = admin.firestore();

    // register the user with email, password, username
    // TODO: better error handling (maybe add a middleware?)
    let userRecord = await admin.auth().createUser({
        email: email,
        emailVerified: false,
        password: password,
        displayName: username,
        photoURL: 'http://www.example.com/12345678/photo.png',
        disabled: false,
    });

    // create theta wallets for the user
    const vaultWallet = await generateVaultWallet(userRecord.uid);

    // if they are a default user (viewer)
    // add an entry into the firestore with their data
    await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: username,
        email: email,
        streamkey: "",
        ein: ein,
        name: name,
        phone: phone,
        vaultWallet: vaultWallet,
    });

    // add their username into another doc to track it
    const arrayUnion = admin.firestore.FieldValue.arrayUnion;
    await db.collection("users").doc("info").update({
        usernames: arrayUnion(username)
    });

    // if they are a streamer
    // add an entry into the firestore with their data
    // create a stream doc in the firestore
    if (role == "streamer") {
        await createStreamDoc(username, userRecord.uid, tags);
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

/**
 * Helper function to query whether a username is unique or not
 */
async function checkUsernameExists(username: string) {
    // the firestore
    const db = admin.firestore();

    // grab the doc that has all usernames
    // inside info, there is an array called usernames that holds all usernames
    const infoDoc = await db.collection("users").doc("info").get();
    if (!infoDoc.exists) {
        await db.collection("users").doc("info").set({
            usernames: []
        });
    }
    const infoData = infoDoc.data();
    const usernames = infoData?.usernames;
    
    // checks each username. if
    if(!username) return false;
    for(let i = 0; i < usernames.length; i++) {
        if(usernames[i].toLowerCase() == username) return true;
    }

    return false;
}

/**
 * Creates a streamer doc in the firebase given proper data
 */
async function createStreamDoc(username: string, uid: string, tags: string[]) {
    // the firestore
    const db = admin.firestore();

    await db.collection("streams").doc(username.toLowerCase()).set({
        title: username,
        description: "Default description!",
        timestamp: Date.now(),
        poster: "https://media.discordapp.net/attachments/814278920168931382/819072942507556914/hark-logo-high-res.png?width=1025&height=280",
        thumbnail: "https://cdn.discordapp.com/attachments/814278920168931382/820548508192342056/hrk.png",
        live: false,
        nsfw: false,
        archive: false,
        url: "https://stream.hark.tv/hls/" + username + ".m3u8",
        name: username,
        owner: uid,
        avatar: "https://media.discordapp.net/attachments/814278920168931382/819073087021776906/hark-logo-h-high-res.png?width=499&height=499",
        to: "/channel/" + username,
        banned: false,
        tags: tags,
        donateMsg: "Donate",
        donateOn: false,
        donateUrl: "https://hark.tv/",
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

    await db.collection("users").doc(uid).update({
        streamkey: generateP(),
    });

    return {
        success: true,
        status: 200,
        message: "oh yeah streamer registered"
    };
}

/**
 * Verifies the hCaptcha with hCaptcha
 * Returns true if successful
 */
async function verifyCaptcha(token: string) {
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', token);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

    return hcaptchaRes.data.success;
}

/**
 * Generate a vault wallet for a user using theta's services
 */
async function generateVaultWallet(uid: String) {

    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data.body.address;
}
