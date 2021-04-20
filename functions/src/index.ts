import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import * as cors from 'cors';
import axios from "axios";

import * as usersApi from "./api/users";
import * as channelApi from "./api/channel";
import * as locationApi from "./api/location";
import * as utilsApi from "./api/utils";
import * as dcardsApi from "./api/dcards";
import * as thetaApi from "./api/theta";

//admin.initializeApp(functions.config().firebase);
// reminder: https://stackoverflow.com/questions/57397608/the-default-firebase-app-does-not-exist-make-sure-you-call-initializeapp-befo
// also: https://stackoverflow.com/questions/58127896/error-could-not-load-the-default-credentials-firebase-function-to-firestore/58409339#58409339
// MAKE SURE TO GET THIS CREDENTIAL FROM THE FIREBASE
// DEV
const serviceAccount = require("../hark-e2efe-firebase-adminsdk-vmx2u-c09484c0ad.json"); 
// PROD
//const serviceAccount = require("../hark-prod-firebase-adminsdk-5pfgm-fde2d4b1a6.json"); 
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const app = express();
// https://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
// also not working for some reason?
app.disable("x-powered-by");

// options for cors
// TODO: change origin permissions
var corsOptions = {
  //origin: "http://127.0.0.1:3001",
  //origin: ["https://demo.hark.tv", "http://127.0.0.1:3000"],
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

// route utility functions
app.use("/utils", utilsApi.utilsRouter);

// route dcards
app.use("/dcards", dcardsApi.dcardsRouter);

// route theta funcs
app.use("/theta", thetaApi.thetaRouter);

app.post("/reports", async function getUser(req: express.Request, res: express.Response) {
  // Verify captcha token with hcaptcha
  const params = new URLSearchParams();
  params.append('response', req.body.captcha);
  params.append('secret', functions.config().hcaptcha_secret.key);
  const hcaptchaRes = await axios.post('https://hcaptcha.com/siteverify', params);

  let response;
  let status;
  const db = admin.firestore();
  if (hcaptchaRes.data.success) {
    await db.collection("reports").doc().set({
      name: req.body.name,
      email: req.body.email,
      subject: req.body.subject,
      report: req.body.report
    });
    response = { success: true };
    status = 200;
  }
  else {
    status = 500;
    response = hcaptchaRes.data;
  }

  res.status(status).json(response);
});

// Again, lets be nice and help the poor wandering servers, any requests to /api
// that are not /api/users will result in 404.
app.get("*", async (req: express.Request, res: express.Response) => {
  res.status(404).send("This route does not exist.");
});

exports.api = functions.https.onRequest(app);

// to make tag data
/*
app.get("/dingle", async(req: express.Request, res: express.Response) => {
    const db = admin.firestore();

    let startingId = 6;
    const jsonFile = [
      { id: 0, slug: "death-penalty", name: "Death Penalty" },
      { id: 0, slug: "women", name: "Women" },
      { id: 0, slug: "race", name: "Race & Racism" },
      { id: 0, slug: "healthcare", name: "Healthcare" },
      { id: 0, slug: "voting-rights", name: "Voting Rights" },
      { id: 0, slug: "diversity", name: "Diversity" },
      { id: 0, slug: "gender", name: "Gender" },
      { id: 0, slug: "minorities", name: "Minorities" },
      { id: 0, slug: "majority", name: "Majority" },
      { id: 0, slug: "free-speech", name: "Free Speech" },
      { id: 0, slug: "education", name: "Education" },
      { id: 0, slug: "diversity", name: "Diversity" },
      { id: 0, slug: "money", name: "Money" },
      { id: 0, slug: "drug-policy", name: "Drug Policy" },
      { id: 0, slug: "law-justice", name: "Law & Justice" },
      { id: 0, slug: "technology", name: "Technology" },
      { id: 0, slug: "surveillance", name: "Surveillance" },
      { id: 0, slug: "war", name: "War" },
      { id: 0, slug: "net-neutrality", name: "Net Neutrality" },
      { id: 0, slug: "equal-pay", name: "Equal Pay" },
      { id: 0, slug: "tax", name: "Taxes" },
      { id: 0, slug: "corporations", name: "Corporations" },
      { id: 0, slug: "stimulus", name: "Stimulus" },
      { id: 0, slug: "ubi", name: "UBI" },
      { id: 0, slug: "unions", name: "Unions" },
      { id: 0, slug: "international", name: "International" },
      { id: 0, slug: "nafta", name: "NAFTA" },
      { id: 0, slug: "immigration", name: "Immigration" },
      { id: 0, slug: "assimilation", name: "Assimilation" },
      { id: 0, slug: "citizenship", name: "Citizenship" },
      { id: 0, slug: "environment", name: "Environment" },
      { id: 0, slug: "alternative-energy", name: "Alternative Energy" },
      { id: 0, slug: "paris-climate-accords", name: "Paris Climate Accords" },
      { id: 0, slug: "animal-cruelty", name: "Animal Cruelty" },
      { id: 0, slug: "cute", name: "Cute" },
      { id: 0, slug: "voter-fraud", name: "Voter Fraud" },
      { id: 0, slug: "lobbying", name: "Lobbying" },
      { id: 0, slug: "corruption", name: "Corruption" },
      { id: 0, slug: "election-interference", name: "Election Interference" },
      { id: 0, slug: "transparency", name: "Transparency" },
      { id: 0, slug: "mental-health", name: "Mental Health" },
      { id: 0, slug: "regulation", name: "Regulation" },
      { id: 0, slug: "coronoavirus", name: "Coronavirus" },
      { id: 0, slug: "agriculture", name: "Agriculture" },
      { id: 0, slug: "veterans", name: "Veteran's Affairs" },
      { id: 0, slug: "criminals", name: "Criminals" },
      { id: 0, slug: "military", name: "Military" },
      { id: 0, slug: "prison", name: "Prison" },
      { id: 0, slug: "police", name: "Police" },
      { id: 0, slug: "diversity", name: "Diversity" },
      { id: 0, slug: "space", name: "Space Exploration" },
      { id: 0, slug: "advancement", name: "Advancement" },
      { id: 0, slug: "united-nations", name: "United Nations" },
      { id: 0, slug: "terrorism", name: "Terrorism" },
      { id: 0, slug: "refugees", name: "Refugees" },
      { id: 0, slug: "nato", name: "NATO" },
      { id: 0, slug: "national-security", name: "National Security" },
      { id: 0, slug: "domestic", name: "Domestic" },
      { id: 0, slug: "transportation", name: "Public Transportation" },
      { id: 0, slug: "federal-election", name: "Federal Election" },
      { id: 0, slug: "state-election", name: "State Election" },
      { id: 0, slug: "local-election", name: "Local Election" },
      { id: 0, slug: "candidates", name: "Candidates" }
    ];

    jsonFile.forEach( x => {
      startingId += 1;
      x.id = startingId;
    })

    await jsonFile.forEach(async x => {
      await db.collection("tags").doc(x.slug).set(x);
    })

    res.status(200).send("ok");
});
*/


