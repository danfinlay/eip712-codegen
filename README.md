# EIP 712 Codegen

[EIP 712: Sign Typed Data](https://eips.ethereum.org/EIPS/eip-712) as of 2022 is the most human-readable way of getting signatures from user that are easily parsed into solidity structs.

[The documentation](https://docs.metamask.io/guide/signing-data.html#sign-typed-data-v4) has not always been the greatest, and in particular I think this method has failed to catch on because writing the verification code is a huge pain.

Well, no more. This module will generate basically all the solidity you need to let users basicallys ign structs and then mostly just think about the structs you have signed in your code. This should really level up your ability to keep more user actions off-chain and gas-free.

## Usage

Add this module to your project: `npm i 712-codegen -D` or `yarn add 712-codegen -D`.

As a module:
```
const codeGen = require('eip712-codegen');
const yourTypes = { primaryMessage, domain, entries, types };
const solidityFile = codGen(yourTypes);
```
As a module, we are exporting typescript definition files, which can help you get your types right in case [the example type file](./sampleTypes.js) isn't enough.

This module is very simple, it's a CLI tool, and you point it at a typeDef file (defined as a CommonJS module, [as seen in sampleTypes.js](./sampleTypes.js)), and it then prints out some solidity to the console. You can then pipe it into a file.

Examples:

```
712gen ./sampleTypes.js >> YourTypesFile.sol
```

If you're using [hardhat](hardhat.org/) and their [console.log](https://hardhat.org/hardhat-network/#console-log) feature, you can generate a logged version by adding `log`:

```
712gen ./sampleTypes.js log >> YourTypesFile.sol
```

You'll then need to import this typefile into your contract, and inherit from it.

```

pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT

import "./TypesAndDecoders.sol";
import "./caveat-enforcers/CaveatEnforcer.sol";

abstract contract Delegatable is EIP712Decoder {
```

You'll also need to include this one method that defines your DomainHash, which I'm leaving to you because it's pretty straightforward, you can copy paste this and change it:

```
  bytes32 public immutable domainHash;
  constructor (string memory contractName, string memory version) {
    domainHash = getEIP712DomainHash(contractName,version,block.chainid,address(this));
  }

  function getEIP712DomainHash(string memory contractName, string memory version, uint256 chainId, address verifyingContract) public pure returns (bytes32) {
    bytes memory encoded = abi.encode(
      EIP712DOMAIN_TYPEHASH,
      keccak256(bytes(contractName)),
      keccak256(bytes(version)),
      chainId,
      verifyingContract
    );
    return keccak256(encoded);
  }
}
```

There's one more thing you have to do, this part will require the most thinking. You'll have to write the method that verifies the top-level signatures. I have not written codegen for this yet, because I don't know which types you want to use as your entry points, and there are some design decisions that are up to you here, but here is a sample method for verifying a `SignedDelegation` as defined in our [sampleTypes.js](./sampleTypes) file:

```
  function verifyDelegationSignature (SignedDelegation memory signedDelegation) public view returns (address) {

    // Break out the struct that was signed:
    Delegation memory delegation = signedDelegation.delegation;

    // Get the top-level hash of that struct, as defined just below:
    bytes32 sigHash = getDelegationTypedDataHash(delegation);

    // The `recover` method comes from the codegen, and will be able to recover from this:
    address recoveredSignatureSigner = recover(sigHash, signedDelegation.signature);
    return recoveredSignatureSigner;
  }

  function getDelegationTypedDataHash(Delegation memory delegation) public view returns (bytes32) {
    bytes32 digest = keccak256(abi.encodePacked(
      "\x19\x01",

      // The domainHash is derived from your contract name and address above:
      domainHash,

      // This last part is calling one of the generated methods.
      // It must match the name of the struct that is the `primaryType` of this signature.
      GET_DELEGATION_PACKETHASH(delegation)
    ));
    return digest;
  }
```

From there, you should be good! This library is tested to work with `eth_signTypedData_v4` as implemented in MetaMask. I have not yet tested it with ethers.js or other wallets, but there's a good chance it works for simple types, and a chance it works for arrays and structs as well.

