import * as express from "express";
import * as admin from "firebase-admin";
import { firestore } from "firebase-admin";
import { verifyIdToken } from "../../../old/indexOLD";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let dcardsRouter = express.Router();

// query a list of top 16 dcards
dcardsRouter.get("/get/list", async (req: express.Request, res: express.Response) => {
    // function to get the top cards and return a response
    // function is for reponse error handling
    async function getTopCards() {
        // the firestore
        const db = admin.firestore();
        let streamRef;
        try {
            // The reference to the live streams
            streamRef = db.collection("dcards").where("title", "!=", "My Foundation").limit(16);
            
        } catch (err) {
            // if error, return it
            return {
                success: false,
                status: 500,
                error: err
            };
        }
        // get the docs from the QuerySnapshot
        let cardDocs = await (await streamRef.get()).docs;

        // get the data in those docs
        let cardArray = cardDocs.map((doc) => {
            return doc.data();
        });

        // if success, return the data
        return {
            success: true,
            status: 200,
            cards: cardArray,
        };
    }

    // call the function to get the data (or the error response)
    let cards = await getTopCards();

    // send off the response!
    res.status(cards.status).json(cards);
});

// query a specific user's card
// (UNTESTED)
dcardsRouter.get("/:uid", async (req: express.Request, res: express.Response) => {
    const uid = req.params.uid;

    // the firestore
    const db = admin.firestore();

    // The document associated with the streamer
    const cardDoc = db.collection("dcards").doc(uid);

    // takes in the card doc and returns response
    async function getCardData(doc: firestore.DocumentReference) {
        const cardDoc = await doc.get();

        if (cardDoc.exists) {
            return cardDoc.data();
        }
        else {
            return { "success": false, "message": "Donation card not found" };
        }

    }

    // get the stream data if it exists
    let response = await getCardData(cardDoc);

    // status code
    let status = response?.success ? 200 : 404;

    // send off the data
    res.status(status).json(response);

});


/**
 * Create a donation card template the user is able to update
 * {
 *   idToken: of the man who calls it
 * }
 */
dcardsRouter.post("/make-template", async (req: express.Request, res: express.Response) => {
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }

    // get the uid from the id token
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    const uid = decodedToken.uid;

    //const uid = req.body.idToken;

    // the firestore
    const db = admin.firestore();

    // if they already have one send em back
    const cardDoc = await db.collection("dcards").doc(uid).get();
    if (cardDoc.exists) {
        res.status(200).send({
            success: false,
            status: 400,
            message: "User already has donation card"
        });
    }

    // make the template in the firestore so user can update on frontend
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = await userDoc.data();
        const tokenName = userData?.tokenName;
        const username = userData?.username;

        const streamerDoc = await db.collection("streams").doc(username).get();
        const streamerData = await streamerDoc.data();
        const tags = streamerData?.tags;

        await db.collection("dcards").doc(uid).set({
            title: "My Foundation",
            shortdesc: "Learn More",
            longdesc: "A longer summary",
            mainimage: "",
            bgimage: "",
            link: "https://example.com",
            owner: uid,
            tags: (tags ? tags : [""]),
            tokenName: (tokenName ? tokenName : ""),
        });

        res.status(200).send({
            success: true,
            status: 200,
            message: "Card successfully made"
        });
    }
    catch {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Error writing donation card"
        });
    }
});