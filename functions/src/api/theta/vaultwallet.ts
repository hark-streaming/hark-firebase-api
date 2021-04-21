import * as functions from "firebase-functions";
import axios from "axios";

/**
 * Helper function to generate a vault access token
 */
 function generateAccessToken(uid: string) {
    // taken from theta email
    const jwt = require('jsonwebtoken');
    const algorithm = { algorithm: "HS256" };
    let apiKey = functions.config().theta.api_key;
    let apiSecret = functions.config().theta.api_secret;
    let userId = uid;

    function genAccessToken(apiKey: string, apiSecret: string, userId: string) {
        let expiration = new Date().getTime() / 1000;
        expiration += 120; // 2 minutes is what we use
        let payload = {
            api_key: apiKey,
            user_id: userId,
            iss: "auth0",
            exp: expiration
        };
        return jwt.sign(payload, apiSecret, algorithm);
    }
    let accessToken = genAccessToken(apiKey, apiSecret, userId);

    return accessToken;
}

/**
 * Helper function to query theta for details of a vault wallet
 */
 async function getVaultWallet(uid: string) {

    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data;
}

/**
 * Helper function to query theta and force refresh the wallet balance
 * Use this after making a donation to reflect the changes
 */
async function forceUpdateGetVaultWallet(uid: string) {
    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet?force_update=true`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data;
}

export {
    generateAccessToken,
    getVaultWallet,
    forceUpdateGetVaultWallet
}