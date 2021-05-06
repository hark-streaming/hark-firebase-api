const thetajs = require("./thetajs.cjs.js");
const ELECTION_ABI = require("./contracts/GovernanceElection_ABI");
import * as functions from "firebase-functions";

/**
 * Function to read getElectionCount of the election contract
 * @param contractAddress election contract address
 * @param chainId thetajs.networks.ChainIds.[networkname]
 * @returns getElectionCount
 */
export async function getElectionCount(contractAddress: string, chainId: string) {
    // set up a provider for reading
    const provider = new thetajs.providers.HttpProvider(chainId);

    // set up the contract
    const contract = new thetajs.Contract(contractAddress, ELECTION_ABI, provider);

    // read the contract
    let result = await contract.getElectionCount();

    // return the transaction data
    return result;
};

/**
 * Check if eleciton has ended
 * @param contractAddress 
 * @param chainId 
 * @param electId 
 * @returns true or false
 */
export async function electionHasEnded(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.electionHasEnded(electId);
};

/**
 * Get the options and deadline of an election
 * @param contractAddress 
 * @param chainId
 * @param electId  
 * @returns 
 */
export async function elections(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.elections(electId);
};

/**
 * Get number of options of an election
 * @param contractAddress 
 * @param chainId 
 * @param electId 
 * @returns 
 */
export async function getOptions(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.getOptions(electId);
};

/**
 * Get number of raw votes in an election
 * @param contractAddress 
 * @param chainId 
 * @param electId 
 * @returns 
 */
export async function getVotes(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.getVotes(electId);
};

/**
 * Get number of governance tokens voted for each option
 * @param contractAddress 
 * @param chainId 
 * @param electId 
 * @returns 
 */
export async function getVotesToken(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.getVotesToken(electId);
};

/**
 * Gets all the data of an eleciton
 * @param contractAddress 
 * @param chainId 
 * @param electId 
 * @returns 
 */
export async function getElection(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.getElection(electId);
};

/**
 * Function to make a read-only contract
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
function makeReadContract(contractAddress: string, chainId: string) {
    // set up a provider for reading
    const provider = new thetajs.providers.HttpProvider(chainId);

    // set up the contract
    const contract = new thetajs.Contract(contractAddress, ELECTION_ABI, provider);

    return contract;
}

/**
   * Function for a vault wallet to donate to a smart contract and receive governance tokens
   * This one is not async since we need to get the blockchain id of the poll after transaction
   * NEEDS 10 TFUEL IN WALLET
   */
export async function deployElectionPoll(contractAddress: string, uid: string, accessToken: string, pollOptionCount: number, pollDeadline: number) {
    // set up the provider (our partner key is on testnet)
    let provider = new thetajs.providers.PartnerVaultHttpProvider("testnet", null, "https://beta-api-wallet-service.thetatoken.org/theta");
    provider.setPartnerId(functions.config().theta.partner_id);
    provider.setUserId(uid);
    provider.setAccessToken(accessToken);

    // We will broadcast the transaction afterwards
    //provider.setAsync(true);
    //provider.setDryrun(true);

    provider.setAsync(false);
    provider.setDryrun(false);

    // set up the contract
    let wallet = new thetajs.signers.PartnerVaultSigner(provider, uid);
    let contract = new thetajs.Contract(contractAddress, ELECTION_ABI, wallet);

    // execute the smart contract transaction using the donor's vault wallet
    //let estimatedGas = await contract.estimateGas.createElection(pollOptionCount, pollDeadline);
    //console.log(estimatedGas);

    let transaction = await contract.createElection(pollOptionCount, pollDeadline);

    // return the transaction data
    return transaction.result;
};

/**
 * Vote in an election poll
 * NEEDS 10 TFUEL MINIMUM
 * @param contractAddress 
 * @param uid 
 * @param accessToken 
 * @param option 
 * @param electId 
 * @returns 
 */
export async function vote(contractAddress: string, uid: string, accessToken: string, option: number, electId: number) {
    // set up the provider (our partner key is on testnet)
    let provider = new thetajs.providers.PartnerVaultHttpProvider("testnet", null, "https://beta-api-wallet-service.thetatoken.org/theta");
    provider.setPartnerId(functions.config().theta.partner_id);
    provider.setUserId(uid);
    provider.setAccessToken(accessToken);

    // We will broadcast the transaction afterwards
    //provider.setAsync(true);
    //provider.setDryrun(true);

    // wait for it to finish
    provider.setAsync(false);
    provider.setDryrun(false);

    // set up the contract
    let wallet = new thetajs.signers.PartnerVaultSigner(provider, uid);
    let contract = new thetajs.Contract(contractAddress, ELECTION_ABI, wallet);

    // execute the smart contract transaction using the donor's vault wallet
    //let estimatedGas = await contract.estimateGas.vote(option, electId);
    //console.log(estimatedGas);

    let transaction = await contract.vote(option, electId);

    console.log(transaction);

    // return the transaction data
    return transaction.result;
};

// export {
//     getElectionCount,
//     electionHasEnded,
//     elections,
//     getElection,
//     getOptions,
//     getVotes,
//     getVotesToken,
//     deployElectionPoll,
//     vote,
// }