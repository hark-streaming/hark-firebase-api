// TODO: move governance contract into here
const thetajs = require("./thetajs.cjs.js");
const GOVERNANCE_ABI = require("./contracts/Hark_Governance_Token_ABI");
import * as functions from "firebase-functions";

/* --- READ METHODS ---- */

/**
 * Gets token balance of an address
 * @param contractAddress 
 * @param chainId 
 * @param address 
 * @returns 
 */
export async function balanceOf(contractAddress: string, chainId: string, address: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.balanceOf(address);
}

/**
 * Gets full token name of the contract
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
export async function tokenName(contractAddress: string, chainId: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.name();
}

/**
 * Get token symbol of the contract
 * @param contractAddress 
 * @param chainId 
 */
export async function symbol(contractAddress: string, chainId: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.symbol();
}

/**
 * Get total shares of the contract
 * @param contractAddress 
 * @param chainId 
 */
export async function totalShares(contractAddress: string, chainId: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.totalShares();
}

/**
 * Get total amount of tfuel released to payees
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
export async function totalReleased(contractAddress: string, chainId: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.totalReleased();
}

/**
 * Get total supply of tokens minted
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
export async function totalSupply(contractAddress: string, chainId: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.totalSupply();
}

/**
 * Returns all info of the payee (shareholder) at index
 * @param contractAddress 
 * @param chainId 
 * @param index 
 */
export async function payee(contractAddress: string, chainId: string, index: number) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.payee(index);
}

/**
 * Get number of shares of an address 
 * @param contractAddress 
 * @param chainId 
 * @param address 
 */
export async function shares(contractAddress: string, chainId: string, address: string) {
    const contract = makeGovReadContract(contractAddress, chainId);

    return await contract.shares(address);
}

/* --- WRITE METHODS ---- */

/**
 * Edit the share distribution of the contract
 * NEEDS 10 TFUEL MINIMUM IN WALLET
 * @param contractAddress 
 * @param uid 
 * @param accessToken 
 * @param payees 
 * @param shares 
 */
export async function editShares(contractAddress: string, uid: string, accessToken: string, payees: string[], shares: number[]) {
    const contract = makeGovWriteContract(contractAddress, uid, accessToken);

    //let estimatedGas = await contract.estimateGas.editShares(payees, shares);
    //console.log(estimatedGas);
    // const overrides = {
    //     gasLimit: 10000000, //override the default gasLimit
    // };

    let transaction = await contract.editShares(payees, shares);

    console.log(transaction);

    // return the transaction data
    return transaction.result;
}

/**
 * Send the appropriate share total tfuel to a payee
 * @param contractAddress 
 * @param uid 
 * @param accessToken 
 * @param payees 
 * @param shares 
 */
export async function release(contractAddress: string, uid: string, accessToken: string, payeeAddress: string) {
    const contract = makeGovWriteContract(contractAddress, uid, accessToken);

    //let estimatedGas = await contract.estimateGas.release(payeeAddress);
    //console.log(estimatedGas);

    let transaction = await contract.release(payeeAddress);

    //console.log(transaction);

    // return the transaction data
    return transaction.result;
}

/**
 * Set up a writable contract with a vault provider
 * @param contractAddress 
 * @param uid 
 * @param accessToken 
 * @returns 
 */
function makeGovWriteContract(contractAddress: string, uid: string, accessToken: string) {
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
    let contract = new thetajs.Contract(contractAddress, GOVERNANCE_ABI, wallet);

    return contract;
}

/**
 * Function to make a read-only contract
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
function makeGovReadContract(contractAddress: string, chainId: string) {
    // set up a provider for reading
    const provider = new thetajs.providers.HttpProvider(chainId);

    // set up the contract
    const contract = new thetajs.Contract(contractAddress, GOVERNANCE_ABI, provider);

    return contract;
}
