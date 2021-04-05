import axios from "axios";
const thetajs = require("./thetajs.cjs.js");
import * as express from "express";
import * as admin from "firebase-admin";
import { BigNumber } from "bignumber.js";
import * as functions from "firebase-functions";
export let thetaRouter = express.Router();

// GLOBAL FOR SCS/TESTNET/MAINNET
//const chainId = thetajs.networks.ChainIds.Privatenet;
const chainId = thetajs.networks.ChainIds.Testnet;
//const chainId = thetajs.networks.ChainIds.Mainnet;


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



    let response = await getAddressData();
    res.status(response.status).send(response);
});

/**
 * Helper function to query theta for the balance of a p2p wallet
 */
async function getP2PWalletBalance(uid: String) {

    // call theta's partner api to get a wallet
    let req = await axios.get(`https://api-partner-testnet.thetatoken.org/user/${uid}/wallet`, {
        headers: {
            "x-api-key": functions.config().theta.xapikey
        }
    });
    return req.data.body.balance;
}

/**
 * Write a cahshout entry into the firestore if the user has enough tfuel
 * Requires a firebase jwt token to verify id user requesting cashout
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.put("/cashout", async function (req: express.Request, res: express.Response) {

    // use an auth token
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);

    // uid of the user that is donating
    const uid = decodedToken.uid;

    const db = admin.firestore();

    const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei    

    // checks to ensure that the user cashing out is a streamer
    try {
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = await userDoc.data();
        const streamkey = userData?.streamkey;
        if (streamkey == null || streamkey == "") throw "Not a streamer!";
    } catch {
        res.status(200).send({
            success: false,
            message: "Not a streamer!"
        });
    }

    const balance = await getP2PWalletBalance(uid);

    if ((new BigNumber(balance)).multipliedBy(ten18) >= new BigNumber(100)) {
        const previousReq = db.collection("cashout").doc(uid).get();
        if ((await previousReq).exists) {
            res.status(200).send({
                success: true,
                message: "Cashout request already fulfilled."
            });
        }

        db.collection("cashout").doc(uid).set({
            value: balance,
            date: new Date()
        });

        res.status(200).send({
            success: true,
            message: "New cashout request made!"
        });
    } else {
        res.status(200).send({
            success: false,
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
thetaRouter.post("/donate/:streameruid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();

    async function donate() {
        try {
            const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);

            // uid of the user that is donating
            const uid = decodedToken.uid;

            // uid of the streamer receiving the donation
            const streameruid = req.params.streameruid;

            //const uid = req.params.streameruid; //FOR TESTING ONLY

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

            // connect provider to the wallet
            //const chainId = thetajs.networks.ChainIds.Privatenet;
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);

            // set up contract (contract is the streamer's)
            const streamerDoc = await db.collection("users").doc(streameruid).get();
            const streamerData = await streamerDoc.data();
            const contractAddress = streamerData?.contractAddress;
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
            let res = await contract.purchaseTokens(overrides);
            console.log(res);

            // if we successful write down the awesome 
            if (res.hash) {
                // write down the blockchain transaction hash
                await db.collection("transactions").doc(uid).set({
                    [res.block.Timestamp]: {
                        hash: res.hash,
                        tfuelPaid: amount,
                        tokensBought: amount * 100,
                        recipient: streameruid,
                        sender: uid,
                    }
                }, { merge: true });

                // get the name of the token
                const tokenName = streamerData?.tokenName;

                // then write the amount of governance tokens gotten into the database
                await db.collection("tokens").doc(uid).set({
                    [tokenName]: admin.firestore.FieldValue.increment(amount * 100)
                }, { merge: true });

                // then write the token count into the all section
                // TODO: this is rate limited by firebase to be once per section, so may not be sustainable in future
                await db.collection("tokens").doc("all").set({
                    [tokenName]: {
                        uid: admin.firestore.FieldValue.increment(amount * 100)
                    }
                }, { merge: true });

                // return success
                return {
                    success: true,
                    status: 200,
                    message: "donation success",
                }

            } else {
                throw "transaction failed";
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
 * Deploys governance smart contract (token contract) for a streamer
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
thetaRouter.post("/deploy-governance/:streameruid", async function (req: express.Request, res: express.Response) {
    const uid = req.params.streameruid;
    const db = admin.firestore();
    async function deployContracts() {
        // check admin auth token here
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
            /* DONT USE THE STREAMER'S WALLET SINCE IT HAS NO TFUEL
            // create the streamer's wallet signer from private key
            const privateDoc = await db.collection("private").doc(uid).get();
            const privateData = await privateDoc.data();
            const wallet = new thetajs.Wallet(privateData?.tokenWallet.privateKey);

            // connect wallet to provider
            //const chainId = thetajs.networks.ChainIds.Privatenet;
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);
            // the wallet must be verified in order for this to work (has to have had any tfuel transaction)
            const account = await provider.getAccount(connectedWallet.address);
            const balance = account.coins.tfuelwei;
            */

            // get the streamer's data
            // Get the user's username so we can generate a token name
            const userDoc = await db.collection("users").doc(uid).get();
            const userData = await userDoc.data();
            const username = userData?.username;
            const tokenName = username.slice(0, 4).toUpperCase(); // just grab first 4 letters
            // this address will be the owner of the contract
            const streamerAddress = userData?.tokenWallet;

            // create a signer using our deployer wallet that has tfuel
            const wallet = new thetajs.Wallet(functions.config().deploy_wallet.private_key);
            const provider = new thetajs.providers.HttpProvider(chainId);
            const connectedWallet = wallet.connect(provider);
            const account = await provider.getAccount(connectedWallet.address);
            const balance = account.coins.tfuelwei;
            
            // create ContractFactory for governance token
            const contractABI = require("./hark_governance_abi.json");
            const contractBytecode = require("./hark_governance_bytecode.json");
            const contractToDeploy = new thetajs.ContractFactory(contractABI, contractBytecode, connectedWallet);

            // Simulate a deploy to see how much tfuel we need and if it's all good
            /*const simulatedResult = await contractToDeploy.simulateDeploy(username, tokenName);*/
            const simulatedResult = await contractToDeploy.simulateDeploy(username, tokenName, streamerAddress);
            if (simulatedResult.vm_error == '') {
                // check if we got enough tfuel in the wallet
                const gasReq = simulatedResult.gas_used;
                console.log(gasReq);
                if (gasReq > balance) {
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
            /*const result = await contractToDeploy.deploy(username, tokenName);*/
            const result = await contractToDeploy.deploy(username, tokenName, streamerAddress);
            const address = result.contract_address;

            // write the contract address to streamer's userdoc, as well as the token name
            await db.collection("users").doc(uid).set({
                tokenName: tokenName,
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
 * Deploys election smart contract (polls contract) for a streamer
 * Requires an admin key, a request for polls, and the governance contract 
 * {
 *   auth: "myharkadminkey"
 * }
 */
 thetaRouter.post("/deploy-election/:streameruid", async function (req: express.Request, res: express.Response) {
    res.status(200).send({
        success: false,
        message: "Election contract not deployed"
    });
});

/**
 * Writes an entry into the database when a streamer requests to have the polls feature
 * Requires governance contract to have been already deployed
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.post("/request-poll", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();

    // get the uid from the id token
    let uid;
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        uid = decodedToken.uid;
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Invalid id token"
        });
    }

    // check firebase for the governance contract address
    try{

    }
    catch(err){

    }
    
    // add the request into 


    res.status(200).send({
        success: false,
        message: "Request failed"
    });
});

/**
 * Writes an entry into the database when a streamer requests to have a custom token
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.post("/request-token", async function (req: express.Request, res: express.Response) {
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