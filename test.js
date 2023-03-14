const { expect } = require('chai');
const ganache = require('ganache-cli');
const ethers = require('ethers');
const testEnv = require('@openzeppelin/test-environment');
const testContract = testEnv.contract;
const { deploy } = testEnv;
const hre = require('hardhat');

// Import the generateSolidity function from the module
const { generateSolidity } = require('./index.js');

// Define your types and messages for testing
const MessageTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
  ],
  Person: [
    { name: 'name', type: 'string' },
    { name: 'age', type: 'uint256' },
  ],
};

const message = {
  types: MessageTypes,
  primaryType: 'Person',
  domain: {
    name: 'Test Domain',
    version: '1',
    chainId: 1,
  },
  message: {
    name: 'Alice',
    age: 30,
  },
};

// Generate the Solidity code
const entryTypes = ['Person'];
const solidityCode = generateSolidity(message, false, entryTypes);

// Write the Solidity code to a file (for testing purposes)
const fs = require('fs');
fs.writeFileSync('contracts/EIP712Decoder.sol', solidityCode);

// Run the tests
describe('EIP712Decoder', function () {
  let contract, accounts, signer, typedData;

  before(async function () {
    // Compile the contract using Hardhat
    await hre.run('compile');

    // Set up a ganache provider with the generated Solidity code
    const provider = new ethers.providers.Web3Provider(ganache.provider({}));
    accounts = await provider.listAccounts();
    signer = provider.getSigner(accounts[0]);

    // Load the compiled contract artifact
    const EIP712Decoder = await hre.artifacts.readArtifact('EIP712Decoder');

    // Deploy the contract
    const EIP712DecoderFactory = new ethers.ContractFactory(EIP712Decoder.abi, EIP712Decoder.bytecode, signer);
    contract = await EIP712DecoderFactory.deploy();
    await contract.deployed();

    // Create the typed data for testing
    typedData = JSON.parse(JSON.stringify(message));
    typedData.domain.verifyingContract = contract.address;
  });

  it('should recover the correct signer', async function () {
    // Sign the typed data
    const signature = await signer._signTypedData(typedData.domain, typedData.types, typedData.message);
    const sigBytes = ethers.utils.arrayify(signature);

    // Call the verifySignedPerson function
    const isValid = await contract.verifySignedPerson({
      signature: sigBytes,
      signer: accounts[0],
      message: typedData.message,
    });

    // Check if the signer is valid
    expect(isValid).to.be.true;
  });
});
