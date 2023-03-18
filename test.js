const { expect } = require('chai');
const ganache = require('ganache-cli');
const ethers = require('ethers');
const testEnv = require('@openzeppelin/test-environment');
const testContract = testEnv.contract;
const { deploy } = testEnv;
const sigUtil = require('@metamask/eth-sig-util');
const {
  TypedDataUtils,
} = sigUtil;
const hre = require('hardhat');

// Import the generateSolidity function from the module
const { generateSolidity } = require('./index.js');

// Define your types and messages for testing
const MessageTypes = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
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
    name: 'MockEIP712Decoder',
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
fs.writeFileSync('./contracts/EIP712Decoder.sol', solidityCode);

// Run the tests
describe('EIP712Decoder', function () {
  let contract, accounts, signer, typedData, eip712Decoder, privateKey, wallet;

  before(async function () {
    // Compile the contract using Hardhat
    await hre.run('compile');

    // Set up a ganache provider with the generated Solidity code
    const ganacheProvider = ganache.provider({})
    const provider = new ethers.providers.Web3Provider(ganacheProvider);
    const mnemonic = ganacheProvider.options.mnemonic;
    wallet = ethers.Wallet.fromMnemonic(mnemonic);
    privateKey = wallet.privateKey;
    accounts = await provider.listAccounts();
    signer = provider.getSigner(accounts[0]);

    // Load up the compiled contract artifact
    const EIP712Decoder = await hre.artifacts.readArtifact('MockEIP712Decoder');

    // Deploy the contract
    const EIP712DecoderFactory = new ethers.ContractFactory(EIP712Decoder.abi, EIP712Decoder.bytecode, signer);
    contract = await EIP712DecoderFactory.deploy([1]);
    message.domain.verifyingContract = contract.address;
    await contract.deployed();

    // Create the typed data for testing
    typedData = JSON.parse(JSON.stringify(message));
    typedData.domain.verifyingContract = contract.address;
  });

  it('should generate the correct person type hash', async function () {
    const solidityPersonPackethash = await contract.personTypehash();
    const personTypestring = TypedDataUtils.encodeType('Person', typedData.types).toString('hex');
    const jsPersonPackethash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(personTypestring));
    expect(solidityPersonPackethash).to.equal(jsPersonPackethash);
  });

  it('should generate the correct person packet', async function () {
    const person = {
      name: 'Alice',
      age: 30,
    };

    const encoded = TypedDataUtils.encodeData(
      'Person',
      person,
      typedData.types,
      'V4'
    );
    const solEncoded = await contract.getPersonPacket(person);
    expect(solEncoded).to.equal('0x' + encoded.toString('hex'));
  });

  it('should generate the correct person packet hash', async function () {
    const person = {
      name: 'Alice',
      age: 30,
    };

    const domainHash = await contract.getPersonPacketHash(person);

    // Check if the domain hash is correct
    expect(domainHash).to.equal('0x' + TypedDataUtils.hashStruct(
      'Person',
      person,
      typedData.types,
      'V4'
     ).toString('hex'));
  });

  it('should recover the correct signer', async function () {
    const signedStruct = signStruct(privateKey);

    // Call the verifySignedPerson function
    const isValid = await contract.verifySignedPerson(signedStruct);

    // Check if the signer is valid
    expect(isValid).to.equal(wallet.address);
  });
});

describe('EIP-1271', () => {
  let contract, eip1271, owner, other, accounts, signer, typedData, eip712Decoder, privateKey, wallet;

  beforeEach(async () => {
    // Compile the contract using Hardhat
    await hre.run('compile');

    // Set up a ganache provider with the generated Solidity code
    const ganacheProvider = ganache.provider({})
    const provider = new ethers.providers.Web3Provider(ganacheProvider);
    const mnemonic = ganacheProvider.options.mnemonic;
    wallet = ethers.Wallet.fromMnemonic(mnemonic);
    privateKey = wallet.privateKey;
    accounts = await provider.listAccounts();
    signer = provider.getSigner(accounts[0]);

    // Load up the compiled contract artifact
    const EIP712Decoder = await hre.artifacts.readArtifact('MockEIP712Decoder');

    // Deploy the contract
    const EIP712DecoderFactory = new ethers.ContractFactory(EIP712Decoder.abi, EIP712Decoder.bytecode, signer);
    contract = await EIP712DecoderFactory.deploy([1]);
    message.domain.verifyingContract = contract.address;
    await contract.deployed();

    // Create the typed data for testing
    typedData = JSON.parse(JSON.stringify(message));
    typedData.domain.verifyingContract = contract.address;

    // Deploy the EIP-1271 contract
    const EIP1271 = await hre.artifacts.readArtifact('EIP1271');
    const EIP1271ContractFactory = new ethers.ContractFactory(EIP1271.abi, EIP1271.bytecode, signer);
    const EIP1271Contract = await EIP1271ContractFactory.deploy([]);
    eip1271 = await EIP1271Contract.deployed();
    await eip1271.deployed();

    await eip1271.addOwner(wallet.address);
  });

  describe('contract account signature recovery', () => {
    it('should recover the correct signer', async () => {
      // Sign the typed data using eth-sig-util
      const signedPerson = signStruct(privateKey);
      signedPerson.signer = eip1271.address;

      // Call the verifySigned method with the EIP-1271 contract address as the signer
      const result = await contract.verifySignedPerson(signedPerson);

      // Verify that the returned address is equal to the EIP-1271 contract address
      expect(result).to.equal(eip1271.address);
    });
  });
});

function signStruct (privateKey) {
  const signature = sigUtil.signTypedData({
    privateKey: fromHexString(privateKey.indexOf('0x') === 0 ? privateKey.substring(2) : privateKey),
    data: message,
    version: 'V4',
  });

  const signedStruct = {
    signature,
    signer: '0x0000000000000000000000000000000000000000',
    message: message.message,
  }

  return signedStruct;
}

function fromHexString (_hexString) {
  const hexString = _hexString.toLowerCase();
  if (!hexString || typeof hexString !== 'string') {
    throw new Error('Expected a hex string.');
  }
  const matched = hexString.match(/.{1,2}/g)
  if (!matched) {
    throw new Error('Expected a hex string.');
  }
  const mapped = matched.map(byte => parseInt(byte, 16));
  if (!mapped || mapped.length !== 32) {
    throw new Error('Expected a hex string.');
  }
  return new Uint8Array(mapped);
}