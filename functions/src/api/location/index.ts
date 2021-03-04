// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import * as express from "express";
import * as admin from "firebase-admin";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let locationRouter = express.Router();

// gets state data
// TODO: gotta make the country variable instead of just usa
locationRouter.get("/usa/:state", getStateData);
async function getStateData(req: express.Request, res: express.Response) {
    // the firestore
    const db = admin.firestore();

    // gets the state data
    const state = req.params.state;
    const stateDataRes = await db.collection("locations")
        .doc('usa').collection('states')
        .doc(state).get();

    function getStateData() {
        if (stateDataRes.exists) {
            const stateData = stateDataRes.data();
            return {
                success: true,
                status: 200,
                ...stateData
            };
        } else {
            return {
                success: false,
                status: 200,
                state: state
            };
        }
    }

    const stateData = getStateData();
    res.status(200).send(stateData);

}

// (this method is basically just a test and can remove later) -kevin
// Now that we have a router, we can define routes which this router
// will handle. Please look into the Express documentation for more info.
locationRouter.get("/:uid", async function getUser(req: express.Request, res: express.Response) {
    const uid = req.params.uid;
    res.status(200).send(`You requested location with UID = ${uid}`);
});

// (this method is basically just a test and can remove later) -kevin
// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
locationRouter.get("*", async (req: express.Request, res: express.Response) => {
    res.status(404).send("This route does not exist.");
});