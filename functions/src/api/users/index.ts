// Based from https://medium.com/@atbe/firebase-functions-true-routing-2cb17a5cd288
import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";



// This is the router which will be imported in our
// api hub (the index.ts which will be sent to Firebase Functions).
export let userRouter = express.Router();

// Now that we have a router, we can define routes which this router
// will handle. Please look into the Express documentation for more info.
userRouter.get("/:uid", async function getUser(req: express.Request, res: express.Response) {
  // ...

  // just like before
  const uid = req.params.uid;
  res.status(200).send(`You requested user with UID = ${uid}`);

  // ...
});

userRouter.post("/register", async function getUser(req: express.Request, res: express.Response) {
    
    // TODO: check the captcha token (req.body.captcha)
    const hcaptchaRes = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${process.env.HCAPTCHA_SECRET_KEY}&response=${req.body.captcha}`,
        {},
        {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=utf-8"
            },
        },
    );

    if(!hcaptchaRes.data.success) {
        // TODO: firgure out error handling
        // return res.status(501).json({
        //     success: false,
        //     message: "oh noooo"
        // });
    }


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
            //password: req.body.password,
            //captcha: req.body.captchaToken,
    });

    res.status(200).json({
        success: true,
        message: "oh yeahhh"
    });
});


// Useful: Let's make sure we intercept un-matched routes and notify the client with a 404 status code
userRouter.get("*", async (req: express.Request, res: express.Response) => {
	res.status(404).send("This route does not exist.");
});