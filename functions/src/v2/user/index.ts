import * as express from "express";
//import * as functions from "firebase-functions";

import { validate, reg_schema } from "../../middleware/schemaValidation";
import { validateCaptcha, validateUsername } from "../../middleware/register";
import { registerUser } from "../../utils/registration"

export let userRouter = express.Router();


/**
 * Registers a user to the firebase
 */
//userRouter.use('/register', validateCaptcha); // Check hcaptcha token middleware
userRouter.use('/register', validateUsername); // Check username uniqueness middleware
userRouter.post("/register",
    validate({ body: reg_schema }),
    async (req: express.Request, res: express.Response) => {
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;
        const role = req.body.role;
        const ein = req.body.ein;
        const name = req.body.name;
        const phone = req.body.phone;
        // // const tags = req.body.tags; 
        // TODO: The tags still need to be validated against a list of valid tags
        let tags: string[] = [];
        if (req.body.tags) {
            req.body.tags.forEach((element: { name: string; }) => {
                tags.push(element.name);
            });
        }

        const result = await registerUser(username, email, password, role, ein, name, phone, tags);
        if (result.success) {
            res.status(200).send({
                success: true,
                message: "User registered"
            });
            return;
        }

        res.status(200).send({
            hello: "valid"
        });
        return;
    }
);
