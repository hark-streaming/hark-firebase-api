import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as usersApi from "./api/users";

admin.initializeApp(functions.config().firebase);

//const db = admin.firestore();

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

