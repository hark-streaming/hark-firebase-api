import axios from "axios";
import * as express from "express";
import * as admin from "firebase-admin";
import * as functions from "firebase-functions";

// Imports for theta
//require("isomorphic-fetch");
//const thetajs = require("@thetalabs/theta-js");
const thetajs = require("./thetajs.cjs.js");
import { BigNumber } from "bignumber.js";

import { getElectionCount, electionHasEnded, deployElectionPoll, vote } from "./election";
import { generateAccessToken, getVaultWallet, forceUpdateGetVaultWallet } from "./vaultwallet"
import { editShares, shares, totalShares, release, totalSupply, totalReleased } from "./governance";

export let thetaRouter = express.Router();

// GLOBAL FOR SCS/TESTNET/MAINNET
//const chainId = thetajs.networks.ChainIds.Privatenet; // SCS
const chainId = thetajs.networks.ChainIds.Testnet; // TESTNET
//const chainId = thetajs.networks.ChainIds.Mainnet; //MAINNET

// Contract Bytecode/ABI Globals
const ELECTION_ABI = require("./contracts/GovernanceElection_ABI");
const ELECTION_BYTECODE = require("./contracts/GovernanceElection_Bytecode");
const GOVERNANCE_ABI = require("./contracts/Hark_Governance_Token_ABI");
const GOVERNANCE_BYTECODE = require("./contracts/Hark_Governance_Bytecode_5");
//const PLATFORM_ABI = require("./contracts/Hark_Platform_Bytecode");
//const PLATFORM_BYTECODE = require("./contracts/Hark_Platform_Token_ABI");

// Owned by a hark platform wallet
const PLATFORM_ADDRESS = "0xe69531fc1fd0f1e0197e88fa526d756ad2310f1c";

/**
 * Retrieves the governance token balances of a user
 */
thetaRouter.get("/tokens/:uid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const tokenDoc = await db.collection("tokens").doc(uid).get();

    if (tokenDoc.exists) {
        const tokenData = tokenDoc.data();
        res.status(200).send({
            success: true,
            status: 200,
            tokens: tokenData
        });
        return;
    }
    else {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Token data of user does not exist!"
        });
        return;
    }
});

/**
 * Retrieves a bunch of general governance contract data
 */
thetaRouter.get("/gov-contract/:uid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;

    // check if streamer has a gov contract
    const userDoc = await db.collection("users").doc(uid).get();
    if(!userDoc.exists){
        res.status(200).send({
            success: false,
            status: 400,
            message: "Streamer does not exist"
        });
        return;
    }
    const userData = await userDoc.data();
    const governanceAddress = userData?.governanceAddress;
    if(!governanceAddress){
        res.status(200).send({
            success: false,
            status: 400,
            message: "Streamer has no governance contract"
        });
        return;
    }

    // grab stats for gov contract
    const govTotalSupply = await totalSupply(governanceAddress, chainId);
    const owner = userData?.vaultWallet;
    const symbol = userData?.tokenName;

    const tokenDoc = await db.collection("tokens").doc("all").get();
    const tokenData = await tokenDoc.data();
    const holders = tokenData?.[symbol];

    const payees = userData?.governanceShares.payees;
    //payees.push(PLATFORM_ADDRESS);
    const shares = userData?.governanceShares.shares;
    //shares.push(100);

    let tfuelWeiReleased = await totalReleased(governanceAddress, chainId);
    tfuelWeiReleased = new BigNumber(tfuelWeiReleased._hex);
    const tfuelReleased = tfuelWeiReleased / 10**18;

    res.status(200).send({
        success: true,
        status: 200,
        data: {
            address: governanceAddress,
            owner: owner,
            symbol: symbol + "-HARK",
            holders: holders,
            totalSupply: govTotalSupply,
            payees: payees,
            shares: shares,
            tfuelReleased: tfuelReleased,
        }
    });
    return;
});

/**
 * Retrieves data of all tfuel donations of a user
 * TODO: make option for recent donations
 * (maybe add auth token here if donations should not be public info?)
 * (granted, it is literally written on the blockchain so...)
 */
thetaRouter.get("/recent-donations/:uid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const transactionsDoc = await db.collection("transactions").doc(uid).get();

    if (transactionsDoc.exists) {
        const transactionsData = transactionsDoc.data();

        // if (transactionsData) {
        //     console.log(transactionsData);
        //     const unixMillisMonth = 86400000 * 30;
        //     const dates:string[] = Object.keys(transactionsData);
        //     const recent:string[] = dates.filter( timestamp => parseInt(timestamp) > Date.now() - unixMillisMonth);
        //     let entries = [];
        //     recent.forEach
        // }

        res.status(200).send({
            success: true,
            status: 200,
            transactions: transactionsData
        });
        return;
    }
    else {
        res.status(200).send({
            success: false,
            status: 400,
            message: "Transaction data of user does not exist!"
        });
        return;
    }
});

/**
 * Retrieves the wallet address and balances of a user.
 * Add ?force_update=true to force an update
 */
thetaRouter.get("/address/:uid", async function (req: express.Request, res: express.Response) {
    const db = admin.firestore();
    const uid = req.params.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (userDoc.exists) {
        let vaultWallet;
        let vaultBalance;
        if (req.query.force_update) {
            vaultWallet = await forceUpdateGetVaultWallet(uid);
            vaultBalance = vaultWallet.body.balance;
        }
        else {
            vaultWallet = await getVaultWallet(uid);
            vaultBalance = vaultWallet.body.balance;
        }


        if (!vaultWallet.status) {
            res.status(200).send({
                success: false,
                status: 500,
                message: "Unable to retrieve vault wallet"
            });
            return;
        }

        res.status(200).send({
            success: true,
            status: 200,
            vaultWallet: vaultWallet.body.address,
            vaultBalance: vaultBalance,
        });
        return;
    }
    else {
        res.status(200).send({
            success: false,
            status: 400,
            message: "User does not exist!"
        });
        return;
    }
});

/**
 * Helper function to verify a firebase idtoken
 */
async function verifyIdToken(idToken: string) {
    try {
        await admin.auth().verifyIdToken(idToken);
        return {
            success: true,
            status: 200,
        };
    }
    catch (err) {
        return {
            success: false, // MAKE SURE ENABLED ON PROD
            //success: true, // DISABLE AUTH FOR TESTING
            status: 401,
            message: "Invalid id token"
        };
    }
}

/**
 * Write a cashout entry into the firestore if the user has enough tfuel
 * Requires a firebase jwt token to verify id user requesting cashout
 * {
 *   idToken: "firebase id token"
 * }
 */
thetaRouter.put("/cashout", async function (req: express.Request, res: express.Response) {
    // check id token
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }

    // uid of the streamer
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    const uid = decodedToken.uid;

    const db = admin.firestore();

    const ten18 = (new BigNumber(10)).pow(18); // 10^18, 1 Theta = 10^18 ThetaWei, 1 TFUEL = 10^18 TFuelWei    

    // streamer data
    const userDoc = await db.collection("users").doc(uid).get();
    const userData = await userDoc.data();

    // checks to ensure that the user cashing out is a streamer
    try {
        const streamkey = userData?.streamkey;
        if (streamkey == null || streamkey == "") throw "Not a streamer!";
    } catch {
        res.status(200).send({
            success: false,
            message: "Not a streamer!"
        });
        return;
    }

    //const balance = await getVaultWallet(uid);
    const vaultWallet = await getVaultWallet(uid);
    const vaultBalance = vaultWallet.body.balance;

    if (!vaultWallet.success) {
        res.status(200).send({
            success: false,
            status: 500,
            message: "Unable to retrieve vault wallet"
        });
        return;
    }

    if ((new BigNumber(vaultBalance)).multipliedBy(ten18) >= new BigNumber(100)) {
        const previousReq = db.collection("cashout").doc(uid).get();
        if ((await previousReq).exists) {
            res.status(200).send({
                success: true,
                message: "Cashout request already fulfilled."
            });
            return;
        }

        db.collection("cashout").doc(uid).set({
            username: userData?.username,
            value: vaultBalance,
            timestamp: Date.now(),
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
 *   amount: "tfuel amount greater than 1"
 * }
 */
thetaRouter.post("/donate/:streameruid", async function (req: express.Request, res: express.Response) {
    // check id token
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }

    // firebase auth token
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);

    // uid of the user that is donating
    const uid = decodedToken.uid;

    // firestore
    const db = admin.firestore();

    //const uid = req.body.idToken; // FOR TESTING

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
        // if no governance contract, we just donate wallet-to-wallet
        if (!governanceAddress) {
            let transfer = await axios.post(`http://api-partner-testnet.thetatoken.org/xact/transfer`,
                {
                    "sender_id": uid,
                    "recipient_id": streameruid,
                    "external_type": "donation",
                    "amount": amount,
                    "metadata": {
                        "note": "Hark direct vault wallet donation"
                    }
                },
                {
                    headers: {
                        'content-type': 'application/json',
                        "x-api-key": functions.config().theta.xapikey
                    },
                }
            );

            // donate good
            if (transfer.data.status == "success") {
                // save our current time, that is when transaction was sent
                let sentTimestamp = Date.now();

                // write down the transaction
                await db.collection("transactions").doc(uid).set({
                    [sentTimestamp]: {
                        transactionSent: sentTimestamp,
                        hash: "",
                        tfuelPaid: amount,
                        tokenName: "",
                        tokensBought: 0,
                        recipient: streameruid,
                        sender: uid,
                    }
                }, { merge: true });

                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Donation to vault wallet successful"
                });
                return;
            }

            res.status(200).send({
                success: true,
                status: 500,
                message: "Vault wallet donate error"
            });
            return;
        }

        // generate a vault access token
        let accessToken = generateAccessToken(uid);

        let transaction = await donateToGovernance(governanceAddress, uid, accessToken, vaultWallet.body.address, amount);

        // log transaction
        if (transaction.hash) {
            // broadcast the transaction to the blockchain
            //await broadcastRawTransaction(uid, accessToken, transaction.tx_bytes);
            //console.log(broadcasted);

            // save our current time, that is when transaction was sent
            let sentTimestamp = Date.now();

            // get the name of the token
            const tokenName = streamerData?.tokenName;

            // write down the blockchain transaction hash
            await db.collection("transactions").doc(uid).set({
                [sentTimestamp]: {
                    transactionSent: sentTimestamp,
                    hash: transaction.hash,
                    tfuelPaid: amount,
                    tokenName: tokenName,
                    tokensBought: amount * 100,
                    recipient: streameruid,
                    sender: uid,
                }
            }, { merge: true });


            // write the amount of governance tokens the donor recieved
            await db.collection("tokens").doc(uid).set({
                [tokenName]: admin.firestore.FieldValue.increment(amount * 100)
            }, { merge: true });

            // then write the token count into the all section
            // TODO: this is rate limited by firebase to be once per second, so may not be sustainable in future
            await db.collection("tokens").doc("all").set({
                [tokenName]: {
                    [uid]: admin.firestore.FieldValue.increment(amount * 100)
                }
            }, { merge: true });


            // now we're down with the donation
            res.status(200).send({
                success: true,
                status: 200,
                message: "Donation to smart contract successful"
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
            message: "Something went wrong!",
            err: err
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
        //const governanceABI = require("./Hark_Governance_ABI.json");
        let wallet = new thetajs.signers.PartnerVaultSigner(provider, donorAddress);
        let contract = new thetajs.Contract(contractAddress, GOVERNANCE_ABI, wallet);

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
 * Helper function to broadcast a raw smart contract transaction to the blockchain
 */
// async function broadcastRawTransaction(senderUid: String, senderAccessToken: String, txBytes: String) {
//     let uri = "https://beta-api-wallet-service.thetatoken.org/theta";
//     let params = {
//         "partner_id": functions.config().theta.partner_id,
//         "tx_bytes": txBytes
//     };
//     let headers = {
//         "x-access-token": senderAccessToken
//     };
//     let body = {
//         "jsonrpc": "2.0",
//         "method": "theta.BroadcastRawTransactionAsync",
//         "params": params,
//         "id": senderUid // not sure what this does, but can be anything
//     };

//     let rp = require("request-promise");

//     let response = await rp({
//         method: 'POST',
//         uri: uri,
//         body: body,
//         json: true,
//         headers: headers,
//         insecure: true,
//         rejectUnauthorized: false // I recommend using these last 2 in case we don't update the SSL cert before it expires... it's happened :(
//     });
//     return response;
// }

/**
 * Deploys governance smart contract (token contract) for a streamer
 * Requires an admin key to run, as well as the streamer's request to be in the database
 * TEMPORARY: uses a firebase auth token
 * {
 *   OLD auth: "myharkadminkey"
 *   idToken: firebase auth token
 * }
 * 
 * Use this wallet privatekey for testing (has some scs tfuel)
 * 0x9719843d2b68609c3a271d8bf7b3bf7ee360290205b160b75618cb066c89b165
 * or this one (has some tfuel on scs)
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
        // const authkey = req.headers.auth;
        // if (authkey != functions.config().hark_admin.key) {
        //     res.status(200).send({
        //         success: false,
        //         status: 401,
        //         message: "unauthorized",
        //     });
        //     return;
        // }

        // check id token
        const result = await verifyIdToken(req.body.idToken);
        if (!result.success) {
            // failed, send em back
            res.status(200).send(result);
        }
        // get the uid from the id token
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        const uid = decodedToken.uid;

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
        let tokenName = username.slice(0, 4).toUpperCase();

        // check if a token with that name already exists
        // if it exists, we append a number

        const tokenDocAll = await db.collection("tokens").doc("all").get();
        if (!tokenDocAll.exists) {
            await db.collection("tokens").doc("all").set({

            });
        }

        const tokenData = await tokenDocAll.data();
        if (tokenData) {
            const names = Object.keys(tokenData);
            let sameNames = 0;

            // look for four letter name matches
            names.forEach((name, index) => {
                if (name.slice(0, 4) == tokenName) {
                    sameNames++;
                }
            });

            // append number of matches to the end of the name to produce a unique name
            if (sameNames > 0) {
                tokenName = tokenName + sameNames.toString();
            }
        }


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
        //const contractABI = require("./Hark_Governance_ABI.json");
        //const contractBytecode = require("./Hark_Governance_Bytecode.json");
        const contractToDeploy = new thetajs.ContractFactory(GOVERNANCE_ABI, GOVERNANCE_BYTECODE, connectedWallet);

        // Simulate a deploy to check tfuel price and general errors
        const simulatedResult = await contractToDeploy.simulateDeploy(username, tokenName, streamerAddress, PLATFORM_ADDRESS);
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
        const result = await contractToDeploy.deploy(username, tokenName, streamerAddress, PLATFORM_ADDRESS);
        const address = result.contract_address;

        if (address) {
            // write the contract address to streamer's userdoc + token name
            await db.collection("users").doc(uid).set({
                tokenName: tokenName,
                governanceAddress: address
            }, { merge: true });

            // write the default governance shares split
            const vaultWallet = userData?.vaultWallet;
            await db.collection("users").doc(uid).set({
                governanceShares: {
                    payees: [PLATFORM_ADDRESS, vaultWallet],
                    shares: [100, 9900]
                }
            }, { merge: true });

            // add to token doc
            await db.collection("tokens").doc("all").set({
                [tokenName]: {

                }
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
        else {
            res.status(200).send({
                success: false,
                status: 500,
                message: "Contract deployment failed"
            });
            return;
        }
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
 * Deploys election smart contract (polls contract) for a streamer
 * Requires an admin key in the header
 * Requires an existing request for election contract, and an existing governance contract 
 * headers: {
 *   auth: "myharkadminkey"
 *   TEMP - idToken
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
        // const authkey = req.headers.auth;
        // if (authkey != functions.config().hark_admin.key) {
        //     res.status(200).send({
        //         success: false,
        //         status: 401,
        //         message: "unauthorized",
        //     });
        //     return;
        // }

        // check id token
        const result = await verifyIdToken(req.body.idToken);
        if (!result.success) {
            // failed, send em back
            res.status(200).send(result);
        }
        // get the uid from the id token
        const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
        const uid = decodedToken.uid;


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
        const governanceAddress = userData?.governanceAddress;
        //console.log(governanceAddress);
        //console.log(typeof(governanceAddress));

        // create a signer using our deployer wallet that has tfuel
        const wallet = new thetajs.Wallet(functions.config().deploy_wallet.private_key);

        // connect signer to correct network (specified as global)
        const provider = new thetajs.providers.HttpProvider(chainId);
        const connectedWallet = wallet.connect(provider);

        // deployer wallet information
        const account = await provider.getAccount(connectedWallet.address);
        const balance = parseInt(account.coins.tfuelwei);
        console.log(balance);

        // create ContractFactory for election smart contract
        //const contractABI = require("./Hark_Election_ABI.json");
        //const contractBytecode = require("./Hark_Election_Bytecode.json");
        const contractToDeploy = new thetajs.ContractFactory(ELECTION_ABI, ELECTION_BYTECODE, connectedWallet);

        // Simulate a deploy to check tfuel price and general errors
        // Election contract requires governance addresss to deploy
        const simulatedResult = await contractToDeploy.simulateDeploy(governanceAddress);
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
            console.log(simulatedResult);
            // some sort of deployment error
            res.status(200).send({
                success: false,
                status: 500,
                message: "deployment error",
            });
            return;
        }

        // Deploy election contract since it passed simulation and save address
        const result = await contractToDeploy.deploy(governanceAddress);
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
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
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
        const govContract = userData?.governanceAddress;
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
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }
    // get the uid from the id token
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    const uid = decodedToken.uid;

    try {
        // get the firestore
        const db = admin.firestore();

        //const uid = req.body.idToken; //FOR TESTING

        // check firebase if request already exists
        const reqDoc = await db.collection("requests").doc(uid).get();
        const reqData = reqDoc.data();
        if (!reqData?.governanceAddress) {
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

/**
 * Create a poll/election using the election contract
 * Pulls from data that was in the firebase
 * An election(poll) consists of:
 * Name
 * Id
 * Number of choices
 * Requires firebase auth token of streamer
 * {
 *   idToken: "firebase id token"
 *   pollId: id of the poll of the streamer (1,2,...)
 * }
 * TODO: CHANGE THE FIREBASE POLL DATA TO BE BETTER
 */
thetaRouter.post("/deploy-election-poll", async function (req: express.Request, res: express.Response) {
    // check id token
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    const uid = decodedToken.uid;

    try {
        // get the firestore
        const db = admin.firestore();

        // get the uid from the id token

        //const uid = req.body.idToken; //FOR TESTING

        // check if we have an election contract deployed
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (!userData?.electionAddress) {
            // no address, no election contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Missing election smart contract"
            });
            return;
        }

        // check if we have poll data
        const pollId = req.body.pollId;
        const pollDoc = await db.collection("polls").doc(uid).get();
        const pollData = pollDoc.data();
        if (!pollData?.polls[pollId]) {
            // poll with that id doesn't exist
            res.status(200).send({
                success: false,
                status: 500,
                message: "That poll does not exist"
            });
            return;
        }
        if (!pollData?.polls[pollId].deadline || pollData?.polls[pollId].deadline < Date.now()) {
            // poll has no deadline or is expired
            res.status(200).send({
                success: false,
                status: 500,
                message: "Invalid deadline"
            });
            return;
        }

        // get streamer's vault wallet
        const vaultWallet = await forceUpdateGetVaultWallet(uid);
        if (vaultWallet?.status != "success") {
            res.status(200).send({
                success: false,
                status: 500,
                message: "Error retrieving vault wallet"
            });
            return;
        }

        // if streamer has < 10 tfuel, no polls
        // subject to change in future
        if (parseInt(vaultWallet.body.balance) < 10) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Streamer must have more than 10 tfuel to make polls"
            });
            return;
        }

        // data for election contract write
        const electionAddress = userData?.electionAddress;
        const pollOptionCount: number = parseInt(pollData?.polls[pollId].answers.length);
        const pollDeadline: number = parseInt(pollData?.polls[pollId].deadline);
        // generate a vault access token
        let accessToken = generateAccessToken(uid);

        console.log(electionAddress, uid, pollOptionCount, pollDeadline);

        // call the contract to make the poll...
        try {
            let transaction = await deployElectionPoll(electionAddress, uid, accessToken, pollOptionCount, pollDeadline);
            // log transaction
            if (transaction.hash) {
                // broadcast the transaction to the blockchain
                //await broadcastRawTransaction(uid, accessToken, transaction.tx_bytes);

                // now we read the contract to get the corresponding id
                const electionId: number = await getElectionCount(electionAddress, chainId);

                // write down data
                // please change the poll data structure later
                const localpolls = pollData?.polls;
                let polls: any = [];
                localpolls.forEach((x: any) => polls.push(x));
                const blockData = {
                    timestamp: transaction.block.Timestamp,
                    hash: transaction.hash,
                    electionId: electionId - 1
                };
                polls[pollId] = {
                    ...polls[pollId],
                    ...blockData
                };

                await db.collection("polls").doc(uid).set({
                    polls
                });

                // now we're done with the poll deployment
                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Poll deployed"
                });
                return;

            }
        }
        catch (err) {
            console.log(err)
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

});


/**
 * Cast a vote to a specific streamer's poll
 * {
 *   idToken: firebase id token of the voter
 *   streamerUid: streamer
 *   pollId: FIREBASE id of the election
 *   choice: choice, starting from 1
 * }
 */
thetaRouter.post("/cast-vote", async function (req: express.Request, res: express.Response) {
    // check id token
    // const result = await verifyIdToken(req.body.idToken);
    // if (!result.success) {
    //     // failed, send em back
    //     res.status(200).send(result);
    // }
    // // get the uid from the id token
    // const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    // const voterUid = decodedToken.uid;

    try {
        // get the firestore
        const db = admin.firestore();

        const voterUid = req.body.idToken; //FOR TESTING

        // data for the poll
        const streamerUid = req.body.streamerUid;
        const pollId = req.body.pollId;
        const choice = req.body.choice;

        // if voter has < 10 tfuel, vote
        // subject to change in future
        const vaultWallet = await forceUpdateGetVaultWallet(voterUid);
        if (vaultWallet?.status != "success") {
            res.status(200).send({
                success: false,
                status: 500,
                message: "Error retrieving vault wallet"
            });
            return;
        }
        if (parseInt(vaultWallet.body.balance) < 10) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Must have more than 10 tfuel to vote"
            });
            return;
        }


        // check if streamer exists
        const streamerRef = await db.collection("users").doc(streamerUid);
        if (!streamerRef) {
            // streamer does no exist
            res.status(200).send({
                success: false,
                status: 500,
                message: "Streamer does not exist"
            });
            return;
        }

        // check if election contract exists
        const userDoc = await db.collection("users").doc(streamerUid).get();
        const userData = userDoc.data();
        if (!userData?.electionAddress) {
            // no address, no election contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Missing election smart contract"
            });
            return;
        }

        // check if we have poll data
        const pollDoc = await db.collection("polls").doc(streamerUid).get();
        const pollData = pollDoc.data();
        if (!pollData?.polls?.[pollId]) {
            // poll with that id doesn't exist
            res.status(200).send({
                success: false,
                status: 500,
                message: "That poll does not exist"
            });
            return;
        }
        // check if the choice exists in the poll
        else if (!pollData?.polls[pollId]?.answers?.[choice]) {
            res.status(200).send({
                success: false,
                status: 500,
                message: "That choice does not exist in the poll"
            });
            return;
        }

        // check contract to see if poll is expired
        const electionAddress = userData?.electionAddress;
        const electionId = pollData?.polls[pollId]?.electionId;
        const hasEnded = await electionHasEnded(electionAddress, chainId, electionId);
        if (hasEnded) {
            res.status(200).send({
                success: false,
                status: 500,
                message: "The poll has ended"
            });
            return;
        }

        // check here if user already voted

        // finally, vote
        try {
            const accessToken = generateAccessToken(voterUid);
            const result = await vote(electionAddress, voterUid, accessToken, choice, electionId);

            if (result.hash) {
                // increment locally
                // please change the poll data structure later
                const localpolls = pollData?.polls;
                let polls: any = [];
                localpolls.forEach((x: any) => polls.push(x));
                localpolls[pollId].answers[choice - 1].votes += 1;

                // write our voting data into poll
                await db.collection("polls").doc(streamerUid).set({
                    polls
                });

                // write voting data into user
                await db.collection("votes").doc(voterUid).set({
                    [result.block.Timestamp]: {
                        hash: result.hash,
                        streamerUid: streamerUid,
                        pollId: pollId,
                        choice: choice
                    }
                }, { merge: true });

                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Vote successful"
                });
                return;
            }
        }
        catch (err) {
            console.log(err);
            res.status(200).send({
                success: false,
                status: 500,
                message: "Smart contract voting error"
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
 * Edit the share distribution of the governance contract
 * The default payees are the platform contract and the streamer's vault wallet
 * {
 *   idToken: firebase id token of the streamer
 *   payees: [ uid1, uid2, uid3 ] // array of uids
 *   percentShares: [ 0.1, 0.5, 0.4 ] // array of float percentage shares corresponding with address
 * }
 */
thetaRouter.post("/edit-gov-shares", async function (req: express.Request, res: express.Response) {
    // check id token
    const result = await verifyIdToken(req.body.idToken);
    if (!result.success) {
        // failed, send em back
        res.status(200).send(result);
    }
    const decodedToken = await admin.auth().verifyIdToken(req.body.idToken);
    const uid = decodedToken.uid;

    //const uid = req.body.testToken; // FOR TESTING W/O AUTH

    try {
        const db = admin.firestore();

        // make sure streamer has a governance contract
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        if (!userData?.governanceAddress) {
            // no address, no election contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Missing election smart contract"
            });
            return;
        }

        // check if payee and share data okay
        const newPayees = req.body.payees;
        const percentShares = req.body.percentShares;
        if (newPayees.length < 1 || newPayees.length > 5 ||
            percentShares.length < 1 || percentShares.length > 5) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Invalid payee/share amount"
            });
            return;
        }
        if (newPayees.length != percentShares.length) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Payees must match shares"
            });
            return;
        }
        if (percentShares.reduce((a: number, b: number) => a + b) != 1.0) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Percents must sum to 1.0"
            });
            return;
        }

        // check if payee uids are valid, while getting vault addresses
        // TODO: it should just break out of the loop 
        //       as soon as it encounters an error, 
        //       but i cant get it to work right now
        let payeeAddresses: string[] = []
        for (let i = 0; i < newPayees.length; i++) {
            const uid = newPayees[i];
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                const userData = await userDoc.data();
                if (userData?.vaultWallet) {
                    // payee data shouldn't misalign with percents
                    payeeAddresses.push(userData?.vaultWallet);
                }
            }
        }
        // one of the payees was invalid
        if (payeeAddresses.length < newPayees.length) {
            console.log(payeeAddresses, newPayees)
            res.status(200).send({
                success: false,
                status: 400,
                message: "Payees contains invalid entry"
            });
            return;
        }

        // get share data
        const governanceAddress = userData?.governanceAddress
        const platformShares = await shares(governanceAddress, chainId, PLATFORM_ADDRESS);
        const total = await totalShares(governanceAddress, chainId);
        const workableShares = total - platformShares;

        // calculate new share amounts
        const newShares = percentShares.map((percent: number) => {
            return Math.floor(percent * workableShares);
        });

        const sum = newShares.reduce((a: number, b: number) => a + b);

        // Math.floor() should prevent sum > workableShares, but just in case...
        if (sum > workableShares) {
            res.status(200).send({
                success: false,
                status: 400,
                message: "Calculation error!"
            });
            return;
        }

        // if sum is less than workableShares, allocate extra to first address
        if (sum < workableShares) {
            const diff = workableShares - sum;
            newShares[0] += diff;
        }
        console.log(governanceAddress, uid, payeeAddresses, newShares);
        // now send to contract
        try {
            console.log(governanceAddress, payeeAddresses, newShares);
            const accessToken = generateAccessToken(uid);
            const result = await editShares(governanceAddress, uid, accessToken, payeeAddresses, newShares);

            if (result.hash) {
                // add the platform into the share data
                newPayees.push(PLATFORM_ADDRESS);
                newShares.push(100);

                // write new share data into user
                await db.collection("users").doc(uid).set({
                    governanceShares: {
                        payeeUids: newPayees,
                        payees: payeeAddresses,
                        shares: newShares
                    }
                }, { merge: true });

                res.status(200).send({
                    success: true,
                    status: 200,
                    message: "Governance contract shares edited"
                });
                return;
            }
        }
        catch {
            res.status(200).send({
                success: false,
                status: 200,
                message: "Governance contract failed"
            });
            return;
        }



    }
    catch (err) {
        console.log(err)
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;
    }

});

/**
 * Release tfuel to a payee that holds shares in the streamer's contract
 * Uses the deployer wallet to call
 * {
 *   streamerUid: uid of the streamer with gov contract
 *   payeeUid: uid of the payee with a valid vault wallet
 * }
 */
thetaRouter.post("/gov-release", async function (req: express.Request, res: express.Response) {
    const streamerUid = req.body.streamerUid;
    const payeeUid = req.body.payeeUid;
    try {
        const db = admin.firestore();

        // make sure streamer has a governance contract
        const streamerDoc = await db.collection("users").doc(streamerUid).get();
        const streamerData = streamerDoc.data(); // todo: might throw errors here if streamer no exist
        if (!streamerDoc.exists || !streamerData?.governanceAddress) {
            // no address, no election contract
            res.status(200).send({
                success: false,
                status: 403,
                message: "Missing election smart contract"
            });
            return;
        }

        // get payee's address
        const payeeDoc = await db.collection("users").doc(payeeUid).get();
        if (!payeeDoc.exists) {
            res.status(200).send({
                success: false,
                status: 403,
                message: "Invalid payee"
            });
            return;
        }
        const payeeData = await payeeDoc.data();
        const payeeAddress = payeeData?.vaultWallet;


        // now send to contract
        const governanceAddress = streamerData?.governanceAddress
        try {
            const result = await release(governanceAddress, payeeAddress);

            if (result.hash) {
                res.status(200).send({
                    success: true,
                    status: 200,
                    message: `Succesfully released share to ${governanceAddress}`
                });
                return;
            }
        }
        catch {
            res.status(200).send({
                success: false,
                status: 200,
                message: "Governance contract failed"
            });
            return;
        }

    }
    catch (err) {
        console.log(err)
        res.status(200).send({
            success: false,
            status: 500,
            message: "Something went wrong!"
        });
        return;
    }

});


