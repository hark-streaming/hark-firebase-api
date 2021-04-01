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

thetaRouter.post("/cashout/:uid", async function (req: express.Request, res: express.Response) {
    
    const db = admin.firestore();
    const uid = req.params.uid;
    var balance = 0;

    const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei    

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
        const account = await provider.getAccount(connectedWallet.address);
        balance = account.coins.tfuelwei;
    } catch {
        res.status(400).send({
            success: false,
            status: 400,
            message: "Unverified TFuel wallet.",
        });
    }


    if ((new BigNumber(balance)).multipliedBy(ten18) >= new BigNumber(100)) {
        const previousReq = db.collection("cashout").doc(uid).get();
        if((await previousReq).exists) {
            res.status(200).send({
                success: true,
                status: 200,
                message: "Cashout request already fulfilled."
            });
        }

        db.collection("cashout").doc(uid).set({
            value: balance,
            date: new Date()
        });

        res.status(200).send({
            success: true,
            status: 200,
            message: "New cashout request made!"
        });
    } else {
        res.status(400).send({
            success: false,
            status: 400,
            message: "Not enough tfuel to request cash out.",
        });
    }
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
            const userDoc = await db.collection("users").doc(uid).get();
            const userData = await userDoc.data();
            const contractAddress = userData?.contractAddress;
            const contractABI = require("./hark_governance_abi.json");
            const contract = new thetajs.Contract(contractAddress, contractABI, connectedWallet);

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

            // TODO: ALSO write down the blockchain transaction hash

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
 * 
 * {
 *   auth: "myharkadminkey"
 * }
 * 
 * Use this wallet privatekey for testing (has some scs tfuel)
 * 0x9719843d2b68609c3a271d8bf7b3bf7ee360290205b160b75618cb066c89b165
 * or this one (has 1 tfuel on scs)
 * 0x97b6ca08269a53a53c46dbf90634464fb93e7f5de63451d8f4e57f0bd90dc0bc
 */
thetaRouter.post("/deploy/:streameruid", async function (req: express.Request, res: express.Response) {
    const uid = req.params.streameruid;
    const db = admin.firestore();
    async function deployContracts() {
        // check auth token here
        if (req.body.auth != functions.config().hark_admin.key) {
            return {
                success: false,
                status: 401,
                message: "unauthorized",
            };
        }

        // check the db that the streamer did indeed request a token
        let requestDoc = await db.collection("requests").doc(uid).get();
        if (!requestDoc.exists) {
            return {
                success: false,
                status: 400,
                message: "user did not request gov token",
            };
        }

        // check that db for the streamer doesn't already have a contractAddress
        let userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData?.contractAddress != null) {
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
            // the wallet must be verified in order for this to work (has to have had any tfuel transaction)
            const account = await provider.getAccount(connectedWallet.address);
            const balance = account.coins.tfuelwei;

            // create ContractFactory for governance token
            const contractABI = require("./hark_governance_abi.json");
            const contractBytecode = require("./hark_governance_bytecode.json");
            const contractToDeploy = new thetajs.ContractFactory(contractABI, contractBytecode, connectedWallet);

            // Get the user's username so we can generate a token name
            const userDoc = await db.collection("users").doc(uid).get();
            const userData = await userDoc.data();
            const username = userData?.username;
            const tokenName = username.slice(0,4); // temporary we just grab first 4 letters

            // Simulate a deploy to see how much tfuel we need and if it's all good
            const simulatedResult = await contractToDeploy.simulateDeploy(username, tokenName);
            if(simulatedResult.vm_error == ''){
                // check if we got enough tfuel in the wallet
                const gasReq = simulatedResult.gas_used;
                console.log(gasReq);
                if(gasReq > balance) {
                    return {
                        success: false,
                        status: 500,
                        message: "not enough tfuel",
                    };
                }           
            } else {     
                return {
                    success: false,
                    status: 500,
                    message: "deployment error",
                };
            }

            // Deploy contract for governance token since it passed simulation
            const result = await contractToDeploy.deploy(username, tokenName);
            const address = result.contract_address;

            // write the contract address to streamer's userdoc
            await db.collection("users").doc(uid).set({
                contractAddress: address
            }, { merge: true });
            

            // Unwrite their db request for a token since we fulfilled it
            await db.collection("requests").doc(uid).delete();

            return {
                success: "true",
                status: 200,
                contractAddress: ""
            };
        }

        catch (err) {
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