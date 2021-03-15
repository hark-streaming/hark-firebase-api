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

// gets a list of live channels, capped at 16
// probably move this into another folder/router so it doesnt interfere with the individual channel query
// channelRouter.get("/functions/live", async function getUser(req: express.Request, res: express.Response) {

//     // function to get the live channels and return a response
//     // function is for reponse error handling
//     async function getLiveChannels() {
//         // the firestore
//         const db = admin.firestore();
//         let streamRef;
//         try {
//             // The reference to the live streams
//             streamRef = db.collection("streams").where("live", "==", true).limit(16);
//         } catch (err) {
//             // if error, return it
//             return {
//                 success: false,
//                 status: 500,
//                 error: err
//             };
//         }
//         // get the docs from the QuerySnapshot
//         let liveDocs = await (await streamRef.get()).docs;

//         // get the data in those docs
//         let liveArray = liveDocs.map((doc) => {
//             return doc.data();
//         });

//         // if success, return the data
//         // TODO: actually get make the 'streamers' field get non-live
//         return {
//             success: true,
//             status: 200,
//             live: liveArray,
//             streamers: liveArray
//         };
//     }

//     // call the function to get the data (or the error response)
//     let liveChannels = await getLiveChannels();

//     // send off the response!
//     res.status(liveChannels.status).json(liveChannels);

// });

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

