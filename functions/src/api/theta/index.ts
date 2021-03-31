import axios from "axios";
const thetajs = require("./thetajs.cjs.js");
import * as express from "express";
import * as admin from "firebase-admin";
import { BigNumber } from "bignumber.js";
import * as functions from "firebase-functions";

export let thetaRouter = express.Router();

/**
 * Retrieves the wallet address and balances of a user.
 */
thetaRouter.get("/address/:uid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const userDoc = await db.collection("users").doc(uid).get();


    let getAddressData = async () => {
        if (userDoc.exists) {

            const userData = userDoc.data();

            const p2pWallet = userData?.p2pWallet;
            const tokenWallet = userData?.tokenWallet;

            const p2pBalance = await getP2PWalletBalance(uid);

            return {
                success: true,
                status: 200,

                p2pWallet: p2pWallet,
                p2pBalance: p2pBalance,

                tokenWallet: tokenWallet,
                // TODO: retrieve all of the custom TNT-20 tokens
                tokenBalance: "WIP",
            }

        }

        return {
            success: false,
            status: 500
        };
    }

    async function getP2PWalletBalance(uid: String) {

        // call theta's partner api to get a wallet
        let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
            headers: {
                "x-api-key": functions.config().theta.xapikey
            }
        });
        return req.data.body.balance;
    }

    let response = await getAddressData();
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
thetaRouter.post("/donate/:receiveruid", async function (req: express.Request, res: express.Response) {
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
            const contractABI = require("./contractOLD.json");
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

            // TODO: then write the amount of governance tokens gotten into the database if successful

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

/**
 * Deploys governance smart contracts (token contract and voting contract) for a streamer
 * Requires an admin key to run, as well as the streamer's request to be in the database
 * {
 *   auth: "myharkadminkey"
 * }
 */
thetaRouter.post("/deploy/:streameruid", async function (req: express.Request, res: express.Response) {
    const uid = req.params.streameruid;
    const db = admin.firestore();
    async function deployContracts() {
        // check auth token here
        if (req.body.auth != "myharkadminkey") {
            return {
                success: false,
                status: 401,
                message: "unauthorized",
            };
        }

        // check that db for the streamer doesn't already have a contractAddress
        let userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if(userData?.contractAddress != null){
                return {
                    success: false,
                    status: 400,
                    message: "contract already exists",
                };
            }
        }

        try {
            // create the streamer's wallet signer from private key
            const privateDoc = await db.collection("private").doc(uid).get();
            const privateData = await privateDoc.data();
            const wallet = new thetajs.Wallet(privateData?.tokenWallet.privateKey);

            // connect wallet to provider
            // CURRENTLY SCS
            const chainId = thetajs.networks.ChainIds.Privatenet;
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);

            // create ContractFactory for governance token
            const contractABI = require("./hark_governance_abi.json");
            const contractBytecode = require("./hark_governance_bytecode.json");
            const contractToDeploy = new thetajs.ContractFactory(contractABI, contractBytecode, connectedWallet);

            // Deploy contract for governance token
            //const result = await contractToDeploy.simulateDeploy("testoe", "TEST");
            const result = await contractToDeploy.deploy("testoe", "TEST");
            //console.log("i am the result", result);
            const address = result.contract_address;
            //console.log("i am the address", address);

            // write the contract address to streamer's userdoc
            await db.collection("users").doc(uid).set({
                contractAddress: address
            }, { merge: true });

            return {
                success: "true",
                status: 200,
                contractAddress: ""
            };
        }

        catch(err) {
            return {
                success: false,
                status: 500,
                message: "Something went wrong!",
                error: err
            };
        }
    }

    let response = await deployContracts();
    res.status(response.status).send(response);
});

/**
 * Writes an entry into the database when a streamer requests to have a custom token
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.put("/requesttoken", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();

    async function writeRequest() {
        try {
            // TODO: check for no auth token better than this funny try catch
            const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
            const uid = decodedToken.uid;

            // write their uid into the requests
            await db.collection("requests").doc(uid).set({
                message: "requested custom governance token"
            });

            // return success
            return {
                success: true,
                status: 200,
                message: "Token successfully requested",
            }
        }
        catch (err) {
            return {
                success: false,
                status: 500,
                message: "Something went wrong!",
            }
        }

    }


    let response = await writeRequest();
    res.status(response.status).send(response);

});