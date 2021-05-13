import * as express from "express";

// Export all our schemas
export const reg_schema = require("../schemas/register_schema.json");

const { Validator, ValidationError } = require("express-json-validator-middleware");
export const { validate } = new Validator({ allErrors: true });

// validation middleware
export function validationErrorMiddleware(error: any, req: express.Request, res: express.Response, next: express.NextFunction) {
    if (error instanceof ValidationError) {
        // Handle the error
        res.status(400).send(error.validationErrors);
        next();
    } else {
        // Pass error on if not a validation error
        next(error);
    }
}
