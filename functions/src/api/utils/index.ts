//import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
//import { firestore } from "firebase-admin";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let utilsRouter = express.Router();

// gets a list of live channels, capped at 16
utilsRouter.get("/live", async function getUser(req: express.Request, res: express.Response) {

    // function to get the live channels and return a response
    // function is for reponse error handling
    async function getLiveChannels() {
        // the firestore
        const db = admin.firestore();
        let streamRef;
        try {
            // The reference to the live streams
            streamRef = db.collection("streams").where("live", "==", true).limit(16);
        } catch (err) {
            // if error, return it
            return {
                success: false,
                status: 500,
                error: err
            };
        }
        // get the docs from the QuerySnapshot
        let liveDocs = await (await streamRef.get()).docs;

        // get the data in those docs
        let liveArray = liveDocs.map((doc) => {
            return doc.data();
        });

        // if success, return the data
        // TODO: actually get make the 'streamers' field get non-live
        return {
            success: true,
            status: 200,
            live: liveArray,
            streamers: liveArray
        };
    }

    // call the function to get the data (or the error response)
    let liveChannels = await getLiveChannels();

    // send off the response!
    res.status(liveChannels.status).json(liveChannels);

});

// endpoint for jwt token auth for theta
utilsRouter.post("/jwtauth", async (req: express.Request, res: express.Response) => {
    /* expected query in body
    {
        idToken: firebaseidtoken
    }
    */

    let status = 0;
    let response;

    // get the decoded id token from the firebase id token sent from frontend
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);

        // taken from theta email
        const jwt = require('jsonwebtoken');
        const algorithm = { algorithm: "HS256" };
        let apiKey = functions.config().theta.api_key;
        let apiSecret = functions.config().theta.api_secret;
        let userId = decodedToken.uid;
        
        function genAccessToken(apiKey: string, apiSecret: string, userId: string) {
            let expiration = new Date().getTime() / 1000;
            expiration += 120; // 2 minutes is what we use
            let payload = {
                api_key: apiKey,
                user_id: userId,
                iss: "auth0",
                exp: expiration
            };
            return jwt.sign(payload, apiSecret, algorithm);
        }

        status = 200;
        let token = genAccessToken(apiKey, apiSecret, userId);

        response = {
            access_token: token
        }

        //let data = axios.get(`http://api-partner-testnet.thetatoken.org/user/${userId}/access_token`);
        
    }
    catch (err) {
        status = 401;
        response = {
            success: false,
            status: 401,
            // TODO: Remove this error output later for security
            error: err, 
        };
    }
    res.status(status).send(response);

});

// checks if a username has already been registered or not
// utilsRouter.post("/check-username", async (req: express.Request, res: express.Response) => {

// });
