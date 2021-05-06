//import axios from "axios";
import * as express from "express";

import { validate, reg_schema } from "../../validation";

export let userRouter = express.Router();

//const validate = ajv.getSchema("register");
userRouter.post("/register",
    validate({ body: reg_schema }),
    async (req: express.Request, res: express.Response) => {
        res.status(200).send({
            hello: "valid"
        });
    }
);
