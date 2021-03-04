import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as cors from 'cors';

import * as usersApi from "./api/users";
import * as channelApi from "./api/channel";
import * as locationApi from "./api/location";

//admin.initializeApp(functions.config().firebase);
// reminder: https://stackoverflow.com/questions/57397608/the-default-firebase-app-does-not-exist-make-sure-you-call-initializeapp-befo
admin.initializeApp();

const app = express();
// https://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
// also not working for some reason?
app.disable("x-powered-by"); 

// options for cors
// TODO: change origin permissions
var corsOptions = {
    origin: "*",
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
  }

// enable cors
app.use(cors(corsOptions));

// Any requests to /api/users will be routed to the user router!
app.use("/users", usersApi.userRouter);

// route /channel requests
app.use("/channel", channelApi.channelRouter);

// you get the gist
app.use("/location", locationApi.locationRouter);

// Again, lets be nice and help the poor wandering servers, any requests to /api
// that are not /api/users will result in 404.
app.get("*", async (req: express.Request, res: express.Response) => {
    res.status(404).send("This route does not exist.");
});

exports.api = functions.https.onRequest(app);

