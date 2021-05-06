// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import * as express from "express";
import * as admin from "firebase-admin";
import { firestore } from "firebase-admin";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let channelRouter = express.Router();

// gets the username's stream from the firestore
// we use the username as the doc id since the uid is very inefficient to access from the nginx server
channelRouter.get("/:username", async function getUser(req: express.Request, res: express.Response) {

    const username = req.params.username;

    // the firestore
    const db = admin.firestore();

    // The document associated with the streamer
    const streamDoc = db.collection("streams").doc(username);

    // get the stream data if it exists
    let response = await getStreamData(streamDoc);

    // status code
    let status = response?.hasOwnProperty("name") ? 200 : 404;

    // send off the data
    res.status(status).json(response);
});

// takes in the streamer doc and returns the data as JSON if it exists
// otherwise, return a JSON with error message
async function getStreamData(doc: firestore.DocumentReference) {
    const streamDoc = await doc.get();

    if (streamDoc.exists) {
        return streamDoc.data();
    }
    else {
        return { "success": false, "message": "Channel not found" };
    }

}

