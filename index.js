const fs = require('fs');
const path = require('path');
const {
  signTypedData,
  TypedDataUtils,
  typedSignatureHash,
  SignTypedDataVersion,
  encodeData,
  encodeType,
} = require('signtypeddata-v5').TypedDataUtils;

const generateFile = (types, methods, log = false) => `pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT
${log ? 'import "hardhat/console.log";' : ''}

${types}

contract EIP712Decoder {

  /**
  * @dev Recover signer address from a message by using their signature
  * @param hash bytes32 message, the hash is the signed message. What is recovered is the signer address.
  * @param sig bytes signature, the signature is generated using web3.eth.sign()
  */
  function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
    bytes32 r;
    bytes32 s;
    uint8 v;

    //Check the signature length
    if (sig.length != 65) {
      return (address(0));
    }

    // Divide the signature in r, s and v variables
    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := byte(0, mload(add(sig, 96)))
    }
// Version of signature should be 27 or 28, but 0 and 1 are also possible versions
    if (v < 27) {
      v += 27;
    }

    // If the version is correct return the signer address
    if (v != 27 && v != 28) {
      return (address(0));
    } else {
      return ecrecover(hash, v, r, s);
    }
  }
${methods}

}

`


let LOGGING_ENABLED = false;

function generateCodeFrom (types) {
  let results = [];

  const packetHashGetters = [];
  Object.keys(types.types).forEach((typeName) => {
    const fields = types.types[typeName];
    const typeHash = `bytes32 constant ${typeName.toUpperCase()}_TYPEHASH = keccak256("${encodeType(typeName, types.types)}");\n`;
    const struct = `struct ${typeName} {\n${fields.map((field) => { return `  ${field.type} ${field.name};\n`}).join('')}}\n`
    generatePacketHashGetters(types, typeName, fields, packetHashGetters);
    results.push({ struct, typeHash });
  });

  const uniqueGetters = [...new Set(packetHashGetters)];

  return { setup: results, packetHashGetters: [...new Set(packetHashGetters)] };
}

function generatePacketHashGetters (types, typeName, fields, packetHashGetters = []) {
  if (typeName.includes('[]')) {
    generateArrayPacketHashGetter(typeName, packetHashGetters);
  } else {
    packetHashGetters.push(`
  function ${packetHashGetterName(typeName)} (${typeName} memory _input) public pure returns (bytes32) {
    ${ LOGGING_ENABLED ? `console.log("${typeName} typehash: ");
    console.logBytes32(${typeName.toUpperCase()}_TYPEHASH);` : ''}
    bytes memory encoded = abi.encode(
      ${ typeName.toUpperCase() }_TYPEHASH,
      ${ fields.map(getEncodedValueFor).join(',\n      ') }
    );
    ${LOGGING_ENABLED ? `console.log("Encoded ${typeName}: ");
    console.logBytes(encoded);` : ''}
    return keccak256(encoded);
  }`);
  }

  fields.forEach((field) => {
    if (field.type.includes('[]')) {
      generateArrayPacketHashGetter(field.type, packetHashGetters);
    }
  });

  return packetHashGetters;
}

function getEncodedValueFor (field) {
  const basicEncodableTypes = ['address', 'bool', 'bytes32', 'int', 'uint', 'uint256', 'string'];
  const hashedTypes = ['bytes'];
  if (basicEncodableTypes.includes(field.type)) {
    return `_input.${field.name}`;
  }

  if (hashedTypes.includes(field.type)) {
    return `keccak256(_input.${field.name})`;
  }

  return `${packetHashGetterName(field.type)}(_input.${field.name})`;
}

function packetHashGetterName (typeName) {
  if (typeName.includes('[]')) {
    return `GET_${typeName.substr(0, typeName.length - 2).toUpperCase()}_ARRAY_PACKETHASH`;
  }
  return `GET_${typeName.toUpperCase()}_PACKETHASH`;
}

function generateArrayPacketHashGetter (typeName, packetHashGetters) {
  packetHashGetters.push(`
  function ${packetHashGetterName(typeName)} (${typeName} memory _input) public pure returns (bytes32) {
    bytes memory encoded;
    for (uint i = 0; i < _input.length; i++) {
      encoded = bytes.concat(
        encoded,
        ${packetHashGetterName(typeName.substr(0, typeName.length - 2))}(_input[i])
      );
    }
    ${LOGGING_ENABLED ? `console.log("Encoded ${typeName}: ");
    console.logBytes(encoded);` : ''}
    bytes32 hash = keccak256(encoded);
    return hash;
  }`);
}

function generateSolidity (typeDef, shouldLog) {
  LOGGING_ENABLED = shouldLog;
  const { setup, packetHashGetters } = generateCodeFrom(typeDef);
  const filePath = path.join(__dirname, '../contracts/EIP712Decoder.sol');
  const types = [];
  const methods = [];

  let typeDefRange = false;
  let contractBodyRange = false;
  setup.forEach((type) => {
    types.push(type.struct);
    types.push(type.typeHash);
  });

  packetHashGetters.forEach((getterLine) => {
    methods.push(getterLine);
  });

  const newFileString = generateFile(types.join('\n'), methods.join('\n'), shouldLog);
  return newFileString;
}

module.exports = {
  generateCodeFrom,
  generateSolidity,
}

