import * as express from "express";

import {checkUsernameExists, verifyCaptcha} from "../utils/registration";

/* ----- MIDDLEWARES -----*/

/**
 * Check hcaptcha token for /user/register endpoint
 * @param req 
 * @param res 
 * @param next 
 */
export async function validateCaptcha(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.body.captcha) {
        const hcaptchaSuccess = await verifyCaptcha(req.body.captcha);
        if (hcaptchaSuccess) {
            next();
        }
        else {
            res.status(400).send({
                success: "false",
                message: "invalid captcha"
            });
            return;
        }

    } else {
        next();
    }

}

/**
 * Check username to see if it exists already
 * @param req 
 * @param res 
 * @param next 
 */
export async function validateUsername(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.body.username) {
        const exists = await checkUsernameExists(req.body.username);
        if (exists) {
            res.status(400).send({
                success: false,
                message: "Username already exists"
            });
            return;
        }
        next();
    }
    else {
        next();
    }
}
