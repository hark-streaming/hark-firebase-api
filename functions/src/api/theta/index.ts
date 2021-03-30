//import axios from "axios";
const thetajs = require("./thetajs.cjs.js");
import * as express from "express";
import * as admin from "firebase-admin";
import { BigNumber } from "bignumber.js";
//import * as functions from "firebase-functions";

export let thetaRouter = express.Router();

/**
 * Retrieves the wallet address of a user.
 */
thetaRouter.get("/address/:uid", async function getUser(req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    let getAddressData = () => {
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData != null && userData.wallet != null) {
                return {
                    success: true,
                    status: 200,
                    //wallet: userData.wallet
                    p2pWallet: userData.p2pWallet,
                    tokenWallet: userData.tokenWallet
                }
            }
        }

        return {
            success: false,
            status: 500
        };
    }

    let response = getAddressData();
    res.status(response.status).send(response);
});

/**
 * Donates a specified amount of tfuel to a user.
 * The receipient uid must be provided
 * Requires a firebase jwt token to verify id of the tfuel donor
 * {
 *   idToken: "firebase id token"
 *   amount: "tfuel amount greater than 0.1"
 * }
 */
thetaRouter.post("/donate/:receiveruid", async function getUser(req: express.Request, res: express.Response) {
    const db = admin.firestore();

    async function donate() {
        try {
            const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
            const uid = decodedToken.uid;

            //const uid = req.params.receiveruid; //FOR TESTING ONLY

            // amount of tfuel to send
            const amount = req.body.amount;
            if (amount < 0.1) return {
                success: false,
                status: 400,
                message: "invalid tfuel amount",
            }

            // create a wallet signer of the user
            const privateDoc = await db.collection("private").doc(uid).get();
            const privateData = await privateDoc.data();
            const wallet = new thetajs.Wallet(privateData?.tokenWallet.privateKey);

            // connect scs provider to the wallet
            const chainId = thetajs.networks.ChainIds.Privatenet;
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);

            // set up contract
            // TODO: this should be the streamer's contract address, retrieved from db using their uid
            const contractAddress = "0x1f388c71f4b102ef4d1a794d70a93e08ac9daffa";
            const contractABI = require("./contract.json");
            const contract = new thetajs.Contract(contractAddress, contractABI, connectedWallet);
            console.log(contract);

            // TODO: check gas price of transaction before doing it
            // if they do not have enough tfuel for gas, we send some

            
            // create the data to send tfuel to the contract
            const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei    
            const overrides = {
                gasLimit: 100000, //override the default gasLimit
                value: (new BigNumber(amount)).multipliedBy(ten18) // tfuelWei to send
           };
        
           // then purchase tokens from the contract
           contract.purchaseTokens(overrides);

            // return success
            return {
                success: true,
                status: 200,
                message: "donation success",
            }
        }
        catch (err) {
            return {
                success: false,
                status: 500,
                message: err,
            }
        }
    }

    let response = await donate();
    res.status(response.status).send(response);
});
