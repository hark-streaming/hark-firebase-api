import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as usersApi from "./api/users";

//admin.initializeApp(functions.config().firebase);
// reminder: https://stackoverflow.com/questions/57397608/the-default-firebase-app-does-not-exist-make-sure-you-call-initializeapp-befo
admin.initializeApp();

const app = express();
// https://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

// Any requests to /api/users will be routed to the user router!
app.use("/users", usersApi.userRouter);

// Again, lets be nice and help the poor wandering servers, any requests to /api
// that are not /api/users will result in 404.
app.get("*", async (req: express.Request, res: express.Response) => {
    res.status(404).send("This route does not exist.");
});

exports.api = functions.https.onRequest(app);


// additional listeners

// adds user to database upon creation
exports.addUserToDb = functions.auth.user().onCreate(async (user) => {
    // the firestore
    const db = admin.firestore();
    await db.collection("users").doc(user.uid).set({
        username: user.displayName,
        email: user.email,
        uid: user.uid,
        /*password: this.user.password,
        captcha: this.captchaToken,*/
    });
});

