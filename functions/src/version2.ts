// Compile ajv
const Ajv = require("ajv").default
//import * as schema_user from "./schema_user.json"
//import * as schema_document from "./schema_document.json"
export const ajv = new Ajv()
//ajv.addSchema(schema_user, "user")
//ajv.addSchema(schema_document, "document")


import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as cors from 'cors';

// Routers
import * as userApi from "./api/users";

admin.initializeApp({
    //credential: admin.credential.cert(serviceAccount)
    credential: admin.credential.applicationDefault()
});

const app = express();

// https://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
// also not working for some reason?
app.disable("x-powered-by");

// options for cors
var corsOptions = {
    //origin: "http://127.0.0.1:3001",
    //origin: ["https://demo.hark.tv", "http://127.0.0.1:3000"],
    origin: "*",
    optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}

// enable cors
app.use(cors(corsOptions));

app.use("/user", userApi.userRouter);

exports.v2 = functions.https.onRequest(app);
