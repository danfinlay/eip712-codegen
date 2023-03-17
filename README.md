# EIP 712 Codegen
This module aims to automate the hard parts of using EIP-712


[EIP 712: Sign Typed Data](https://eips.ethereum.org/EIPS/eip-712) as of 2023 is the most human-readable way of getting signatures from user that are easily parsed into solidity structs.

[The documentation](https://docs.metamask.io/guide/signing-data.html#sign-typed-data-v4) is quite dense, and can be hard to get started with.


Well, no more. This module will generate basically all the solidity you need to let users basically sign structs and then mostly just think about the structs you have signed in your code. This should really level up your ability to keep more user actions off-chain and gas-free.

## Usage

Add this module to your project: `npm i eip712-codegen -D` or `yarn add eip712-codegen -D`.

### As a module:
```js
const codeGen = require('eip712-codegen');
const yourTypes = { primaryMessage, domain, entries, types };
const solidityFile = codeGen(yourTypes);
```
As a module, we are exporting typescript definition files, which can help you get your types right in case [the example type file](./sampleTypes.js) isn't enough.

### As a CLI tool:

`npm i -g eip712-codegen` or `yarn add -g eip712-codegen` to globally install, and then you can run the command line and pipe the output into a solidity file like so:

`eip712-codegen -i ./yourTypes.js >> TypesFile.sol`

These are the command line options:

```
Options:
      --version      Show version number                               [boolean]
  -i, --input        Input file path                         [string] [required]
  -e, --entryPoints  Type names to be used as entry points    [array] [required]
  -l, --log          Enable logging                                    [boolean]
  -h, --help         Show help                                         [boolean]
```

The `input` file is a typeDef file (defined as a CommonJS module, [as seen in sampleTypes.js](./sampleTypes.js)), and it then prints out some solidity to the console. You can then pipe it into a file. The same typedef format is used by signing code for EIP-712, like when suggesting a signature to MetaMask, so this allows you to define these types once and reuse them on the front and backend.

More examples:

input:
```sh
eip712-codegen --input <input-file-path> --entryPoints <entry-point-1> <entry-point-2> ... --log
```

Example:
```sh
eip712-codegen --input sampleTypes.js --entryPoints Type1 Type2 > YourTypesFile.sol
```

If you're using [hardhat](hardhat.org/) and their [console.log](https://hardhat.org/hardhat-network/#console-log) feature, you can generate a logged version by adding `--log`:

```sh
eip712-codegen --input sampleTypes.js --entryPoints Type1 Type2 --log > YourTypesFile.sol
```

You'll then need to import this typefile into your contract, and inherit from `EIP712Decoder`.

```solidity

pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT

import "./YourTypesFile.sol";
import "./caveat-enforcers/CaveatEnforcer.sol";

abstract contract Delegatable is EIP712Decoder {
```

You'll also need to include this one method that defines your DomainHash, which I'm leaving to you because it's pretty straightforward, you can copy paste this and change it:

```solidity
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

### Entrypoints 

The `--entryPoints` flag generates signature verification code for the specified types (which must also be included in the input file). These verification methods will be of the form `verifySigned${YourType}(Signed${YourType} input) returns (address);`. So if you are signing a struct called `Bid` it will generate a method called `verifySignedBid(SignedBid input) returns (address);`

Returns an `address` of the account that signed this struct.

The `Signed{Type}` struct format looks like this:
```solidity
{
  bytes signature;
  address signer;
  YourType message;
}
```
For regular EOA signatures, the signer should be set to the zero address (`0x0000000000000000000000000000000000000000`).
If the `signer` value is set to anything other than the zero address, rather than recover a signature normally, the contract will execute [EIP-1271 style signature recovery](https://eips.ethereum.org/EIPS/eip-1271) which allows contract accounts to perform custom verification logic allowing them to effectively "sign" messages like an EOA does.
