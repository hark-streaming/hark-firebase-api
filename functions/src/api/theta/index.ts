// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
//import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
//import * as functions from "firebase-functions";

export let thetaRouter = express.Router();

/**
 * Retrieves the wallet address of a user.
 */
thetaRouter.get("/address/:uid", async function getUser(req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    
    let getAddressData = () => {
        if(userDoc.exists) {
            const userData = userDoc.data();
            if(userData != null && userData.wallet != null) {
                return {
                    success: true,
                    status: 200,
                    wallet: userData.wallet
                }
            }
        }

        return {
            success: false,
            status: 200
        };
    }

    res.status(200).send(getAddressData());
});

/**
 * Donates a specified amount of tfuel to a user.
 */
/*
thetaRouter.post("/donate/:uid", async function getUser(req : express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.body.amount;

    // first checks to see if the user being donated to has a governance system
    const userData

    // if 
});
*/

// (this method is basically just a test and can remove later) -kevin
// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
thetaRouter.get("*", async (req: express.Request, res: express.Response) => {
    res.status(404).send("This route does not exist.");
});