const path = require('path');
const {
  encodeType,
} = require('signtypeddata-v5').TypedDataUtils;
function camelCase (str) {
  return str.toLowerCase().replace(/_(.)/g, function(match, group1) {
    return group1.toUpperCase();
  });
}

export interface MessageTypeProperty {
  name: string;
  type: string;
}

export interface MessageTypes {
  EIP712Domain: MessageTypeProperty[];
  [additionalProperties: string]: MessageTypeProperty[];
}

/**
 * This is the message format used for `signTypeData`, for all versions
 * except `V1`.
 *
 * @template T - The custom types used by this message.
 * @property types - The custom types used by this message.
 * @property primaryType - The type of the message.
 * @property domain - Signing domain metadata. The signing domain is the intended context for the
 * signature (e.g. the dapp, protocol, etc. that it's intended for). This data is used to
 * construct the domain seperator of the message.
 * @property domain.name - The name of the signing domain.
 * @property domain.version - The current major version of the signing domain.
 * @property domain.chainId - The chain ID of the signing domain.
 * @property domain.verifyingContract - The address of the contract that can verify the signature.
 * @property domain.salt - A disambiguating salt for the protocol.
 * @property message - The message to be signed.
 */
export interface TypedMessage<T extends MessageTypes> {
  types: T;
  primaryType: keyof T;
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: ArrayBuffer;
  };
  message: Record<string, unknown>;
}

const generateFile = (types, methods, log = false) => `pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT
${log ? 'import "hardhat/console.log";' : ''}

abstract contract ERC1271Contract {
  /**
   * @dev Should return whether the signature provided is valid for the provided hash
   * @param _hash      Hash of the data to be signed
   * @param _signature Signature byte array associated with _hash
   *
   * MUST return the bytes4 magic value 0x1626ba7e when function passes.
   * MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)
   * MUST allow external calls
   */ 
  function isValidSignature(
    bytes32 _hash, 
    bytes memory _signature)
    public
    view 
    virtual
    returns (bytes4 magicValue);
}

abstract contract EIP712Decoder {
  function getDomainHash () public view virtual returns (bytes32);

${types}

  /**
  * @dev Recover signer address from a message by using their signature
  * @param hash bytes32 message, the hash is the signed message. What is recovered is the signer address.
  * @param sig bytes signature, the signature is generated using web3.eth.sign()
  */
  function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
    bytes32 r;
    bytes32 s;
    uint8 v;

    // Check the signature length
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
type Result = {
  struct: string;
  typeHash: string;
}

function generateCodeFrom(types, entryTypes) {
  let results: Result[] = [];

  const packetHashGetters: Array<string> = [];
  Object.keys(types.types).forEach((typeName) => {
    const fields = types.types[typeName];
    const typeHash = `bytes32 constant public ${camelCase(typeName.toUpperCase()+'_TYPEHASH')} = keccak256("${encodeType(typeName, types.types)}");\n`;
    const struct = `struct ${typeName} {\n${fields.map((field) => { return `  ${field.type} ${field.name};\n`}).join('')}}\n`;

    // Generate signed${TYPE} struct for entryTypes
    if (entryTypes.includes(typeName)) {
      const signedStruct = `
struct Signed${typeName} {
  bytes signature;
  address signer;
  ${typeName} message;
}
`;
      results.push({ struct: signedStruct, typeHash: '' });
    }

    generatePacketHashGetters(types, typeName, fields, packetHashGetters);
    results.push({ struct, typeHash });
  });

  return { setup: results, packetHashGetters: [...new Set(packetHashGetters)] };
}

function generatePacketHashGetters (types, typeName, fields, packetHashGetters: Array<string> = []) {
  if (typeName.includes('[]')) {
    generateArrayPacketHashGetter(typeName, packetHashGetters);
  } else {
    packetHashGetters.push(`
  function ${packetHashGetterName(typeName)} (${typeName} memory _input) public pure returns (bytes32) {
    bytes memory encoded = abi.encode(
      ${ camelCase(typeName.toUpperCase() + '_TYPEHASH') },
      ${ fields.map(getEncodedValueFor).join(',\n      ') }
    );
    return keccak256(encoded);
  }
  `);
  }

  fields.forEach((field) => {
    if (field.type.includes('[]')) {
      generateArrayPacketHashGetter(field.type, packetHashGetters);
    }
  });

  return packetHashGetters;
}

function getEncodedValueFor (field) {
  const basicEncodableTypes = [
    'address',
    'bool',
    'int',
    'uint',
    'int8',
    'uint8',
    'int16',
    'uint16',
    'int256',
    'uint256',
    'bytes32',
    'bytes16',
    'bytes8',
    'bytes4',
    'bytes2',
    'bytes1',
  ];
  const hashedTypes = ['bytes', 'string'];
  if (basicEncodableTypes.includes(field.type)) {
    return `_input.${field.name}`;
  }

  if (hashedTypes.includes(field.type)) {
    if (field.type === 'bytes') {
      return `keccak256(_input.${field.name})`;
    }
    if (field.type === 'string') {
      return `keccak256(bytes(_input.${field.name}))`;
    }
  }

  return `${packetHashGetterName(field.type)}(_input.${field.name})`;
}

function packetHashGetterName (typeName) {
  if (typeName === 'EIP712Domain') {
    return camelCase('GET_EIP_712_DOMAIN_PACKET_HASH');
  }
  if (typeName.includes('[]')) {
    return camelCase(`GET_${typeName.substr(0, typeName.length - 2).toUpperCase()}_ARRAY_PACKET_HASH`);
  }
  return camelCase(`GET_${typeName.toUpperCase()}_PACKET_HASH`);
}

function encodedTypeGetterName(typeName) {
  if (typeName === 'EIP712Domain') {
    return camelCase('GET_EIP_712_DOMAIN_PACKET');
  }
  if (typeName.includes('[]')) {
    return camelCase(`GET_${typeName.substr(0, typeName.length - 2).toUpperCase()}_ARRAY_PACKET`);
  }
  return camelCase(`GET_${typeName.toUpperCase()}_PACKET`);
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

function generateSolidity <
  T extends MessageTypes,
> (typeDef: TypedMessage<T>, shouldLog, entryTypes: string[]) {
  LOGGING_ENABLED = shouldLog;
  const { setup, packetHashGetters } = generateCodeFrom(typeDef, entryTypes);

  const types: string[] = [];
  const methods: string[] = [];

  setup.forEach((type) => {
    types.push(type.struct);
    types.push(type.typeHash);
  });

  packetHashGetters.forEach((getterLine) => {
    methods.push(getterLine);
  });

  // Generate entrypoint methods
  const entrypointMethods = generateEntrypointMethods(entryTypes);
  methods.push(entrypointMethods);

  const newFileString = generateFile(types.join('\n'), methods.join('\n'), shouldLog);
  return newFileString;
}

function generateEntrypointMethods(entryTypes) {
  return entryTypes.map((entryType) => `
  function verifySigned${entryType}(Signed${entryType} memory _input) public view returns (address) {
    bytes32 packetHash = ${packetHashGetterName(entryType)}(_input.message);
    bytes32 digest = keccak256(
      abi.encodePacked(
        "\\x19\\x01",
        getDomainHash(),
        packetHash
      )
    );

    if (_input.signer == 0x0000000000000000000000000000000000000000) {
      address recoveredSigner = recover(
        digest,
        _input.signature
      );
      return recoveredSigner;
    } else {
      // EIP-1271 signature verification
      bytes4 result = ERC1271Contract(_input.signer).isValidSignature(digest, _input.signature);
      require(result == 0x1626ba7e, "INVALID_SIGNATURE");
      return _input.signer;
    }
  }
  `).join('\n');
}

module.exports = {
  generateCodeFrom,
  generateSolidity,
}
