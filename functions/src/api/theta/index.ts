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
                    wallet: userData.wallet
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
 */
thetaRouter.post("/donate/:receiveruid", async function getUser(req: express.Request, res: express.Response) {
    const db = admin.firestore();
    async function donate() {

        try {
            //UNCOMMENT THIS
            //const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
            //const uid = decodedToken.uid;

            const uid = req.params.receiveruid; //FOR TESTING ONLY

            // amount of tfuel to send
            const amount = req.body.amount;

            // create a wallet signer of the user
            const privateDoc = await db.collection("private").doc(uid).get();
            const privateData = await privateDoc.data();
            const wallet = new thetajs.Wallet(privateData?.tokenWallet.privateKey);

            // connect scs provider to the wallet
            const chainId = thetajs.networks.ChainIds.Privatenet;
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);

            // set up contract
            const contractAddress = "0x1f388c71f4b102ef4d1a794d70a93e08ac9daffa";
            const contractABI = require("./contract.json");
            const contract = new thetajs.Contract(contractAddress, contractABI, wallet);

            // send tfuel to the contract
            const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei
            const thetaWeiToSend = (new BigNumber(0));
            const tfuelWeiToSend = (new BigNumber(amount)).multipliedBy(ten18);
            const from = connectedWallet.address;
            const to = contractAddress;
            //const to = "0x657C0acf8966E033f290cD710Ee03e163FCc8AFe";
            const txData = {
                from: from,
                outputs: [
                    {
                        address: to,
                        thetaWei: thetaWeiToSend,
                        tfuelWei: tfuelWeiToSend,
                    }
                ]
            }

            const transaction = new thetajs.transactions.SendTransaction(txData);
            /*const result = */await connectedWallet.sendTransaction(transaction);
            
            // then purchase tokens from the contract
            contract.purchaseTokens();
        }
        catch (err) {
            return {
                success: false,
                status: 500,
                message: err,
            }
        }

        return {
            success: true,
            status: 200,
            message: "donation success",
        }
    }


    let response = await donate();
    res.status(response.status).send(response);
});
