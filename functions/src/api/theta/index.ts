import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// Imports for theta
//require("isomorphic-fetch");
//const thetajs = require("@thetalabs/theta-js");
const thetajs = require("./thetajs.cjs.js");
import { BigNumber } from "bignumber.js";

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

            const p2pBalance = await getVaultWallet(uid);

            return {
                success: true,
                status: 200,

                p2pWallet: p2pWallet,
                p2pBalance: p2pBalance.body.balance,

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
 * Helper function to query theta for details of a p2p wallet
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
 * Write a cashout entry into the firestore if the user has enough tfuel
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
        return;
    }

    const balance = await getVaultWallet(uid);

    if ((new BigNumber(balance)).multipliedBy(ten18) >= new BigNumber(100)) {
        const previousReq = db.collection("cashout").doc(uid).get();
        if ((await previousReq).exists) {
            res.status(200).send({
                success: true,
                message: "Cashout request already fulfilled."
            });
            return;
        }

        db.collection("cashout").doc(uid).set({
            value: balance.body.balance,
            date: new Date()
        });

        res.status(200).send({
            success: true,
            message: "New cashout request made!"
        });
        return;
    } else {
        res.status(200).send({
            success: false,
            message: "Not enough tfuel to request cash out.",
        });
        return;
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
    // check id token
    /*try {
        await admin.auth().verifyIdToken(req.body.idToken);
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 401,
            message: "Invalid id token"
        });
        return;
    }

    

    // firebase auth token
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);

    // uid of the user that is donating
    const uid = decodedToken.uid;*/

    // firestore
    const db = admin.firestore();

    const uid = req.body.idToken; // FOR TESTING

    // uid of the streamer receiving the donation
    const streameruid = req.params.streameruid;

    // amount of tfuel to send
    const amount = req.body.amount;

    // the donor's wallet
    const vaultWallet = await getVaultWallet(uid);
    if (vaultWallet?.status != "success") {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Error retrieving vault wallet"
        });
        return;
    }

    // streamer's governance contract address
    const streamerDoc = await db.collection("users").doc(streameruid).get();
    const streamerData = await streamerDoc.data();
    const governanceAddress = streamerData?.governanceAddress;

    // general validation
    try {
        // leave if tfuel donation is too small (minimum 1 tfuel)
        if (amount < 1) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Tfuel amount must be greater than 1",
            });
            return;
        }

        // leave if user does not have enough tfuel
        if (vaultWallet.body.balance < amount) {
            res.status(200).send({
                success: false,
                status: 403,
                message: "invalid tfuel amount",
            });
            return;
        }

        // leave if no governance contract to donate to
        if (!governanceAddress) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "missing governance contract",
            });
            return;
        }

    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Validation error"
        });
        return;
    }

    // execute the donation
    try {
        // generate a vault access token
        let accessToken = generateAccessToken(uid);

        let transaction = await donateToGovernance(governanceAddress, uid, accessToken, vaultWallet.body.address, amount);

        // log transaction
        if (transaction.hash) {
            // broadcast the transaction to the blockchain
            //let broadcasted = await broadcastRawTransaction(uid, accessToken, transaction.tx_bytes);
            //console.log(broadcasted);
            
            /*
            // write down the blockchain transaction hash
            await db.collection("transactions").doc(uid).set({
                [streameruid]: {
                    timestamp: transaction.block.Timestamp,
                    hash: transaction.hash,
                    tfuelPaid: amount,
                    tokensBought: amount * 100,
                    recipient: streameruid,
                    sender: uid,
                }
            }, { merge: true });

            // get the name of the token
            const tokenName = streamerData?.tokenName;

            // write the amount of governance tokens the donor recieved
            await db.collection("tokens").doc(uid).set({
                [tokenName]: admin.firestore.FieldValue.increment(amount * 100)
            }, { merge: true });

            // then write the token count into the all section
            // TODO: this is rate limited by firebase to be once per second, so may not be sustainable in future
            await db.collection("tokens").doc("all").set({
                [tokenName]: {
                    uid: admin.firestore.FieldValue.increment(amount * 100)
                }
            }, { merge: true });
            */

            // now we're down with the donation
            res.status(200).send({
                success: true,
                status: 200,
                message: "Donation successful"
            });
            return;

        }
        else {
            // transaction failed
            res.status(200).send({
                success: false,
                status: 500,
                message: "Smart contract transaction failed"
            });
            return;
        }

    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;
    }

    /**
     * Function for a vault wallet to donate to a smart contract and receive governance tokens
     */
    async function donateToGovernance(contractAddress: string, donorUid: string, accessToken: string, donorAddress: string, amount: number) {
        // set up the provider
        let provider = new thetajs.providers.PartnerVaultHttpProvider("testnet", null, "https://beta-api-wallet-service.thetatoken.org/theta");
        provider.setPartnerId(functions.config().theta.partner_id);
        provider.setUserId(donorUid);
        provider.setAccessToken(accessToken);

        // We will broadcast the transaction afterwards
        //provider.setAsync(true);
        //provider.setDryrun(true);

        // Wait for transaction to finish
        provider.setAsync(false);
        provider.setDryrun(false);

        //console.log(provider);

        // set up the contract
        const governanceABI = require("./Hark_Governance_ABI.json");
        let wallet = new thetajs.signers.PartnerVaultSigner(provider, donorAddress);
        let contract = new thetajs.Contract(contractAddress, governanceABI, wallet);

        // create the data to send tfuel to the contract
        const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei    
        const amountWei = (new BigNumber(amount)).multipliedBy(ten18);
        const overrides = {
            gasLimit: 100000, //override the default gasLimit
            value: amountWei // tfuelWei to send
        };

        // execute the smart contract transaction using the donor's vault wallet
        let transaction = await contract.purchaseTokens(overrides);

        console.log(transaction);

        // return the transaction data
        return transaction.result;
    };
});



/**
 * Helper function to broadcast a raw smart contract transaction
 */
/*
async function broadcastRawTransaction(senderUid: String, senderAccessToken: String, txBytes: String) {
    let uri = "https://beta-api-wallet-service.thetatoken.org/theta";
    let params = {
        "partner_id": functions.config().theta.partner_id,
        "tx_bytes": txBytes
    };
    let headers = {
        "x-access-token": senderAccessToken
    };
    let body = {
        "jsonrpc": "2.0",
        "method": "theta.BroadcastRawTransactionAsync",
        "params": params,
        "id": senderUid // not sure what this does, but can be anything
    };

    let rp = require("request-promise");

    let response = await rp({
        method: 'POST',
        uri: uri,
        body: body,
        json: true,
        headers: headers,
        insecure: true,
        rejectUnauthorized: false // I recommend using these last 2 in case we don't update the SSL cert before it expires... it's happened :(
    });
    return response;

}*/

/**
 * Tested working 4/7/2021 3:37 PM
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
thetaRouter.post("/deploy-governance-contract/:streameruid", async function (req: express.Request, res: express.Response) {

    // streamer's uid
    const uid = req.params.streameruid;

    // get the firestore
    const db = admin.firestore();

    // general validation before deploying
    try {
        // check admin auth key
        const authkey = req.headers.auth;
        if (authkey != functions.config().hark_admin.key) {
            res.status(200).send({
                success: false,
                status: 401,
                message: "unauthorized",
            });
            return;
        }

        // check that streamer doesn't already have a governance contract
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (userData?.governanceAddress) {
            // address exists, we already deployed governance contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Governance contract already exists"
            });
            return;
        }

        // check that streamer requested a governance contract
        const reqDoc = await db.collection("requests").doc(uid).get();
        const reqData = reqDoc.data();
        if (!reqData?.governance) {
            // no election request, leave
            res.status(200).send({
                success: false,
                status: 403,
                message: "Governance contract not requested"
            });
            return;
        }

    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Validation error"
        });
        return;
    }

    // deploy the contract
    try {
        // get the streamer's data
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = await userDoc.data();
        const username = userData?.username;

        // just grab first 4 letters to make the token name
        const tokenName = username.slice(0, 4).toUpperCase();

        // this address will be the owner of the contract
        //const streamerAddress = userData?.tokenWallet;
        const streamerAddress = userData?.vaultWallet;

        // create a signer using our deployer wallet that has tfuel
        const wallet = new thetajs.Wallet(functions.config().deploy_wallet.private_key);

        // connect signer to correct network (specified as global)
        const provider = new thetajs.providers.HttpProvider(chainId);
        const connectedWallet = wallet.connect(provider);

        // deployer wallet information
        const account = await provider.getAccount(connectedWallet.address);
        const balance = parseInt(account.coins.tfuelwei);

        // create ContractFactory for governance smart contract
        const contractABI = require("./Hark_Governance_ABI.json");
        const contractBytecode = require("./Hark_Governance_Bytecode.json");
        const contractToDeploy = new thetajs.ContractFactory(contractABI, contractBytecode, connectedWallet);

        // Simulate a deploy to check tfuel price and general errors
        const simulatedResult = await contractToDeploy.simulateDeploy(username, tokenName, streamerAddress);
        if (simulatedResult.vm_error == '') {
            // no deployment error
            // check if we got enough tfuel in the wallet
            const gasReq = parseInt(simulatedResult.gas_used);
            if (gasReq > balance) {
                res.status(200).send({
                    success: false,
                    status: 500,
                    message: "not enough tfuel",
                });
                return;
            }
        } else {
            // some sort of deployment error
            res.status(200).send({
                success: false,
                status: 500,
                message: "deployment error",
            });
            return;
        }


        // Deploy election contract since it passed simulation and save address
        const result = await contractToDeploy.deploy(username, tokenName, streamerAddress);
        const address = result.contract_address;

        // write the contract address to streamer's userdoc + token name
        await db.collection("users").doc(uid).set({
            tokenName: tokenName,
            governanceAddress: address
        }, { merge: true });

        // Log the completion of the request with the current date
        await db.collection("requests").doc(uid).update({
            governance: Date.now()
        });

        // Send off our success
        res.status(200).send({
            success: true,
            status: 200,
            governanceAddress: address
        });
        return;
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!",
        });
        return;
    }
});

/**
 * Tested working 4/7/2021 3:44 PM
 * Deploys election smart contract (polls contract) for a streamer
 * Requires an admin key in the header
 * Requires an existing request for election contract, and an existing governance contract 
 * headers: {
 *   auth: "myharkadminkey"
 * }
 */
thetaRouter.post("/deploy-election-contract/:streameruid", async function (req: express.Request, res: express.Response) {
    // streamer's uid
    const uid = req.params.streameruid;

    // get the firestore
    const db = admin.firestore();

    // general validation before deploying
    try {
        // check admin auth key
        const authkey = req.headers.auth;
        if (authkey != functions.config().hark_admin.key) {
            res.status(200).send({
                success: false,
                status: 401,
                message: "unauthorized",
            });
            return;
        }

        // check that streamer doesn't already have an election contract
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (userData?.electionAddress) {
            // address exists, we already deployed election contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Election contract already exists"
            });
            return;
        }

        // check that streamer owns a governance contract
        if (!userData?.governanceAddress) {
            // address is null, no gov contract deployed
            res.status(200).send({
                success: false,
                status: 403,
                message: "Governance contract does not exist"
            });
            return;
        }

        // check that streamer requested an election contract
        const reqDoc = await db.collection("requests").doc(uid).get();
        const reqData = reqDoc.data();
        if (!reqData?.election) {
            // no election request, leave
            res.status(200).send({
                success: false,
                status: 403,
                message: "Election contract not requested"
            });
            return;
        }

    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Validation error"
        });
        return;
    }

    // deploy the contract
    try {
        // get the streamer's address of their gov contract
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = await userDoc.data();
        const governanceContract = userData?.governanceAddress;

        // create a signer using our deployer wallet that has tfuel
        const wallet = new thetajs.Wallet(functions.config().deploy_wallet.private_key);

        // connect signer to correct network (specified as global)
        const provider = new thetajs.providers.HttpProvider(chainId);
        const connectedWallet = wallet.connect(provider);

        // deployer wallet information
        const account = await provider.getAccount(connectedWallet.address);
        const balance = parseInt(account.coins.tfuelwei);

        // create ContractFactory for election smart contract
        const contractABI = require("./Hark_Election_ABI.json");
        const contractBytecode = require("./Hark_Election_Bytecode.json");
        const contractToDeploy = new thetajs.ContractFactory(contractABI, contractBytecode, connectedWallet);

        // Simulate a deploy to check tfuel price and general erros
        const simulatedResult = await contractToDeploy.simulateDeploy(governanceContract);
        if (simulatedResult.vm_error == '') {
            // no deployment error
            // check if we got enough tfuel in the wallet
            const gasReq = parseInt(simulatedResult.gas_used);
            console.log(gasReq);
            if (gasReq > balance) {
                res.status(200).send({
                    success: false,
                    status: 500,
                    message: "not enough tfuel",
                });
                return;
            }
        } else {
            // some sort of deployment error
            res.status(200).send({
                success: false,
                status: 500,
                message: "deployment error",
            });
            return;
        }

        // Deploy election contract since it passed simulation and save address
        const result = await contractToDeploy.deploy(governanceContract);
        const address = result.contract_address;

        // write the contract address to streamer's userdoc
        await db.collection("users").doc(uid).set({
            electionAddress: address
        }, { merge: true });

        // Log the completion of the request with the current date
        await db.collection("requests").doc(uid).update({
            election: Date.now()
        });

        // Send off our success
        res.status(200).send({
            success: true,
            status: 200,
            electionAddress: address
        });
        return;
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;
    }

});


/**
 * Writes an entry into the database when a streamer requests to have the polls feature
 * Requires governance contract to have been already deployed
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.post("/request-election-contract", async function (req: express.Request, res: express.Response) {
    // check id token
    try {
        await admin.auth().verifyIdToken(req.body.idToken);
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 401,
            message: "Invalid id token"
        });
        return;
    }

    try {
        // get the firestore
        const db = admin.firestore();

        // get the uid from the id token
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        const uid = decodedToken.uid;

        //const uid = req.body.idToken; //FOR TESTING

        // check there isn't already an election contract request
        const reqDoc = await db.collection("requests").doc(uid).get();
        const reqData = reqDoc.data();
        if (reqData?.election) {
            res.status(200).send({
                success: false,
                status: 403,
                message: "Election contract already requested"
            });
            return;
        }

        // check firebase for the governance contract address
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        const govContract = userData?.governanceContract;
        if (govContract) {
            // add the election request into a firebase doc if a gov contract exists
            try {
                await db.collection("requests").doc(uid).set({
                    election: "requested"
                });

                // Success!
                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Election contract requested!"
                });
                return;
            }
            catch (err) {
                res.status(200).send({
                    success: false,
                    status: 500,
                    message: "Unable to write to database"
                });
                return;
            }

        }
        // no contract, get out
        else {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Missing governance contract"
            });
            return;
        }
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;
    }

});

/**
 * Writes an entry into the database when a streamer requests to have a custom token
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.post("/request-governance-contract", async function (req: express.Request, res: express.Response) {
    // check id token
    try {
        await admin.auth().verifyIdToken(req.body.idToken);
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 401,
            message: "Invalid id token"
        });
        return;
    }

    try {
        // get the firestore
        const db = admin.firestore();

        // get the uid from the id token
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        const uid = decodedToken.uid;

        //const uid = req.body.idToken; //FOR TESTING

        // check firebase if request already exists
        const reqDoc = await db.collection("requests").doc(uid).get();
        const reqData = reqDoc.data();
        if (!reqData?.governance) {
            // add the request into a firebase doc if request isn't there
            try {
                await db.collection("requests").doc(uid).set({
                    governance: "requested"
                });

                // Success!
                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Governance contract requested!"
                });
                return;
            }
            catch (err) {
                res.status(200).send({
                    success: false,
                    status: 500,
                    message: "Unable to write to database"
                });
                return;
            }

        }
        // already requested
        else {
            res.status(200).send({
                success: false,
                status: 403,
                message: "Governance contract already requested"
            });
            return;
        }
    }
    catch (err) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;

    }



});