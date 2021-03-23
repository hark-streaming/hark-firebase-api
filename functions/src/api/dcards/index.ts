import * as express from "express";
import * as admin from "firebase-admin";
import { firestore } from "firebase-admin";

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
            streamRef = db.collection("dcards").limit(16);
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


// add a new dcard
// need to provide it with an auth token, just like jwtauth
dcardsRouter.post("/add", async (req: express.Request, res: express.Response) => {
    // the firestore
    const db = admin.firestore();

    let response;
    let status;
    try {
        // check user authorization
        const idToken = req.body.idToken;
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        let userId = decodedToken.uid;

        // let userId = req.body.idToken; //  was for testing

        // all the attributes the req should provide
        const title = req.body.title;
        const shortdesc = req.body.shortdesc;
        const longdesc = req.body.longdesc;
        const mainimage = req.body.mainimage;
        const bgimage = req.body.bgimage;
        const link = req.body.link;

        // add a new dcard to the collection
        // use the uid as the document title
        await db.collection("dcards").doc(userId).set({
            title: title,
            shortdesc: shortdesc,
            longdesc: longdesc,
            mainimage: mainimage,
            bgimage: bgimage,
            link: link,
        });

        response = {
            success: true,
            message: "donation card added!",
        }
        status = 200;
    }
    catch (err) {
        response = {
            success: false,
            error: err,
        }
        status = 500;
    }

    res.status(status).json(response);
});