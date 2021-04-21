const thetajs = require("./thetajs.cjs.js");
const ELECTION_ABI = require("./contracts/GovernanceElection_ABI");

/**
 * Function to read getElectionCount of the election contract
 * @param contractAddress election contract address
 * @param chainId thetajs.networks.ChainIds.[networkname]
 * @returns getElectionCount
 */
async function getElectionCount(contractAddress: string, chainId: string) {
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
async function electionHasEnded(contractAddress: string, chainId: string, electId: number) {
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
async function elections(contractAddress: string, chainId: string, electId: number) {
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
async function getOptions(contractAddress: string, chainId: string, electId: number) {
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
async function getVotes(contractAddress: string, chainId: string, electId: number) {
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
async function getVotesToken(contractAddress: string, chainId: string, electId: number) {
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
async function getElection(contractAddress: string, chainId: string, electId: number) {
    const contract = makeReadContract(contractAddress, chainId);

    return await contract.getElection(electId);
};

/**
 * Function to make a read-only contract
 * @param contractAddress 
 * @param chainId 
 * @returns 
 */
function makeReadContract(contractAddress: string, chainId: string){
    // set up a provider for reading
    const provider = new thetajs.providers.HttpProvider(chainId);

    // set up the contract
    const contract = new thetajs.Contract(contractAddress, ELECTION_ABI, provider);

    return contract;
}

export {
    getElectionCount,
    electionHasEnded,
    elections,
    getElection,
    getOptions,
    getVotes,
    getVotesToken,
}