import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

export let userRouter = express.Router();

userRouter.post("/register", async (req: express.Request, res: express.Response) => {
    
});