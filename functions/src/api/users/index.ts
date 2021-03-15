// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let userRouter = express.Router();

// (this method is basically just a test and can remove later) -kevin
// Now that we have a router, we can define routes which this router
// will handle. Please look into the Express documentation for more info.
userRouter.get("/:uid", async function getUser(req: express.Request, res: express.Response) {
    // ...

    // just like before
    const uid = req.params.uid;
    res.status(200).send(`You requested user with UID = ${uid}`);

    // ...
});

// checks captcha, then registers user
// their account type is based on the fields sent in the request
userRouter.post("/register", async function getUser(req: express.Request, res: express.Response) {
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
userRouter.post("/registernocaptcha", async function getUser(req: express.Request, res: express.Response) {

    let response = await registerUser(req);
    let status = response.status;

    // return response
    res.status(status).json(response);

});

// registers a user to firebase given the basic information
// TODO: if the req has streamer/poltician fields, do more data set up
// TODO: add field santization before register
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

    // if they are a default user (viewer)
    // add an entry into the firestore with their data
    await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username: req.body.username,
        email: req.body.email,
        streamkey: "",
        ein: req.body.ein,
        name: req.body.name,
        phone: req.body.phone
    });

    // if they are a streamer
    // add an entry into the firestore with their data
    // create a stream doc in the firestore
    if (req.body.role == "streamer") {
        // temporarily doomtube data for testing purposes
        await db.collection("streams").doc(req.body.username).set({
            title: req.body.username,
            description: "Default description!",
            timestamp: Date.now(),
            poster: "https://cdn.bitwave.tv/static/img/Bitwave_Banner.jpg",
            thumbnail: "https://cdn.discordapp.com/attachments/814278920168931382/820548508192342056/hrk.png",
            live: true,
            nsfw: false,
            archive: false,
            url: "http://13.59.151.129:8080/hls/" + req.body.username + ".m3u8",
            name: req.body.username,
            owner: userRecord.uid,
            avatar: "https://cdn.bitwave.tv/uploads/v2/avatar/c94aa96a-2b2b-4f33-a426-ad709f30c72f-128.png",
            to: "/channel/" + req.body.username,
            banned: false,
            tags: req.body.tags
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

// verifies the hcaptcha and returns the result
async function verifyCaptcha(req: express.Request) {
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', req.body.captcha);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

    return hcaptchaRes;
}

// (this method is basically just a test and can remove later) -kevin
// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
userRouter.get("*", async (req: express.Request, res: express.Response) => {
    res.status(404).send("This route does not exist.");
});