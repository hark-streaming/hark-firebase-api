// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let userRouter = express.Router();

// this method is basically just a test and can remove later
// Now that we have a router, we can define routes which this router
// will handle. Please look into the Express documentation for more info.
userRouter.get("/:uid", async function getUser(req: express.Request, res: express.Response) {
  // ...

  // just like before
  const uid = req.params.uid;
  res.status(200).send(`You requested user with UID = ${uid}`);

  // ...
});

// registers a default user (cannot stream)
userRouter.post("/register", async function getUser(req: express.Request, res: express.Response) {
    
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', req.body.captcha);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);
    
    // register the user if captcha passes
    let response;
    let status;
    if(hcaptchaRes.data.success) {
        response = await registerUser(req);
        status = response.status;
    }
    else {
        status = 500;

        response = hcaptchaRes.data;
    }

    res.status(status).json(response);
    
});

// registers a user to firebase given the basic information
async function registerUser(req: express.Request){
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

    // add an entry into the firestore with their data
    await db.collection("users").doc(userRecord.uid).set({
            uid: userRecord.uid,    
            username: req.body.username,
            email: req.body.email,
            streamkey: "",
    });

    // return a json response
    return {
        success: true,
        status: 200,
        message: "oh yeah user registered"
    };
}

// verifies the hcaptcha and returns the result
async function verifyCaptcha(req: express.Request){
    // Verify captcha token with hcaptcha
    const params = new URLSearchParams();
    params.append('response', req.body.captcha);
    params.append('secret', functions.config().hcaptcha_secret.key);
    const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

    return hcaptchaRes;
}

// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
userRouter.get("*", async (req: express.Request, res: express.Response) => {
	res.status(404).send("This route does not exist.");
});