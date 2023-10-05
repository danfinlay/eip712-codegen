"use strict";
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
var path = require('path');
var encodeType = require('signtypeddata-v5').TypedDataUtils.encodeType;
var change_case_all_1 = require("change-case-all");
var basicEncodableTypes = [
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
var generateFile = function (types, methods, log) {
    if (log === void 0) { log = false; }
    return "pragma solidity ^0.8.13;\n// SPDX-License-Identifier: MIT\n".concat(log ? 'import "hardhat/console.log";' : '', "\n\n").concat(types, "\n\nabstract contract ERC1271Contract {\n  /**\n   * @dev Should return whether the signature provided is valid for the provided hash\n   * @param _hash      Hash of the data to be signed\n   * @param _signature Signature byte array associated with _hash\n   *\n   * MUST return the bytes4 magic value 0x1626ba7e when function passes.\n   * MUST NOT modify state (using STATICCALL for solc < 0.5, view modifier for solc > 0.5)\n   * MUST allow external calls\n   */ \n  function isValidSignature(\n    bytes32 _hash, \n    bytes memory _signature)\n    public\n    view \n    virtual\n    returns (bytes4 magicValue);\n}\n\nabstract contract EIP712Decoder {\n  function getDomainHash () public view virtual returns (bytes32);\n\n\n  /**\n  * @dev Recover signer address from a message by using their signature\n  * @param hash bytes32 message, the hash is the signed message. What is recovered is the signer address.\n  * @param sig bytes signature, the signature is generated using web3.eth.sign()\n  */\n  function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {\n    bytes32 r;\n    bytes32 s;\n    uint8 v;\n\n    // Check the signature length\n    if (sig.length != 65) {\n      return (address(0));\n    }\n\n    // Divide the signature in r, s and v variables\n    assembly {\n      r := mload(add(sig, 32))\n      s := mload(add(sig, 64))\n      v := byte(0, mload(add(sig, 96)))\n    }\n    // Version of signature should be 27 or 28, but 0 and 1 are also possible versions\n    if (v < 27) {\n      v += 27;\n    }\n\n    // If the version is correct return the signer address\n    if (v != 27 && v != 28) {\n      return (address(0));\n    } else {\n      return ecrecover(hash, v, r, s);\n    }\n  }\n").concat(methods, "\n\n}\n\n");
};
var LOGGING_ENABLED = false;
function generateCodeFrom(types, entryTypes) {
    var results = [];
    var packetHashGetters = [];
    /**
     * We order the types so the signed types can be generated before any types that may need to depend on them.
     */
    var orderedTypes = entryTypes.map(function (typeName) {
        types.types["Signed".concat(typeName)] = [
            { name: "message", type: typeName },
            { name: "signature", type: "bytes" },
            { name: "signer", type: "address" },
        ];
        return {
            name: "Signed".concat(typeName),
            fields: [
                { name: "message", type: typeName },
                { name: "signature", type: "bytes" },
                { name: "signer", type: "address" },
            ]
        };
    });
    Object.keys(types.types).forEach(function (typeName) {
        // Skip it if it starts with "Signed":
        if (typeName.startsWith("Signed")) {
            return;
        }
        orderedTypes.push({
            name: typeName,
            fields: types.types[typeName]
        });
    });
    orderedTypes.forEach(function (type) {
        var typeName = type.name;
        var fields = type.fields;
        var typeHash = "bytes32 constant ".concat((0, change_case_all_1.camelCase)((0, change_case_all_1.snakeCase)(typeName).toUpperCase() + '_TYPEHASH'), " = keccak256(\"").concat(encodeType(typeName, types.types), "\");\n");
        var struct = "struct ".concat(typeName, " {\n").concat(fields.map(function (field) { return "  ".concat(field.type, " ").concat(field.name, ";\n"); }).join(''), "}\n");
        generatePacketHashGetters(types, typeName, fields, packetHashGetters);
        results.push({ struct: struct, typeHash: typeHash });
    });
    return { setup: results, packetHashGetters: __spreadArray([], __read(new Set(packetHashGetters)), false) };
}
function generatePacketHashGetters(types, typeName, fields, packetHashGetters) {
    if (packetHashGetters === void 0) { packetHashGetters = []; }
    fields.forEach(function (field) {
        var arrayMatch = field.type.match(/(.+)\[\]/);
        if (arrayMatch) {
            var basicType = arrayMatch[1];
            if (types.types[basicType]) {
                packetHashGetters.push("\nfunction ".concat(packetHashGetterName(field.type), " (").concat(field.type, " memory _input) public pure returns (bytes32) {\n  bytes memory encoded;\n  // HELLO\n  for (uint i = 0; i < _input.length; i++) {\n    encoded = abi.encodePacked(encoded, ").concat(packetHashGetterName(basicType), "(_input[i]));\n  }\n  return keccak256(encoded);\n}\n"));
            }
            else {
                packetHashGetters.push("\nfunction ".concat(packetHashGetterName(field.type), " (").concat(field.type, " memory _input) public pure returns (bytes32) {\n  return keccak256(abi.encodePacked(_input));\n}\n"));
            }
        }
        else {
            packetHashGetters.push("\nfunction ".concat(packetHashGetterName(typeName), " (").concat(typeName, " memory _input) public pure returns (bytes32) {\n  bytes memory encoded = abi.encode(\n    ").concat((0, change_case_all_1.camelCase)((0, change_case_all_1.snakeCase)(typeName).toUpperCase() + '_TYPEHASH'), ",\n    ").concat(fields.map(getEncodedValueFor).join(',\n      '), "\n  );\n  return keccak256(encoded);\n}\n"));
        }
    });
    return packetHashGetters;
}
function getEncodedValueFor(field) {
    var hashedTypes = ['bytes', 'string'];
    if (basicEncodableTypes.includes(field.type)) {
        return "_input.".concat(field.name);
    }
    if (hashedTypes.includes(field.type)) {
        if (field.type === 'bytes') {
            return "keccak256(_input.".concat(field.name, ")");
        }
        if (field.type === 'string') {
            return "keccak256(bytes(_input.".concat(field.name, "))");
        }
    }
    return "".concat(packetHashGetterName(field.type), "(_input.").concat(field.name, ")");
}
function packetHashGetterName(typeName) {
    if (typeName === 'EIP712Domain') {
        return (0, change_case_all_1.camelCase)('GET_EIP_712_DOMAIN_PACKET_HASH');
    }
    if (typeName.includes('[]')) {
        return (0, change_case_all_1.camelCase)("GET_".concat((0, change_case_all_1.snakeCase)(typeName.substr(0, typeName.length - 2)).toUpperCase(), "_ARRAY_PACKET_HASH"));
    }
    return (0, change_case_all_1.camelCase)("GET_".concat((0, change_case_all_1.snakeCase)(typeName).toUpperCase(), "_PACKET_HASH"));
}
/**
 * For encoding arrays of structs.
 * @param typeName
 * @param packetHashGetters
 */
function generateArrayPacketHashGetter(typeName, packetHashGetters) {
    packetHashGetters.push("\n  function ".concat(packetHashGetterName(typeName), " (").concat(typeName, " memory _input) public pure returns (bytes32) {\n    bytes memory encoded;\n    for (uint i = 0; i < _input.length; i++) {\n      encoded = bytes.concat(\n        encoded,\n        ").concat(packetHashGetterName(typeName.substr(0, typeName.length - 2)), "(_input[i])\n      );\n    }\n    ").concat(LOGGING_ENABLED ? "console.log(\"Encoded ".concat(typeName, ": \");\n    console.logBytes(encoded);") : '', "\n    bytes32 hash = keccak256(encoded);\n    return hash;\n  }"));
}
function generateSolidity(typeDef, shouldLog, entryTypes) {
    LOGGING_ENABLED = shouldLog;
    var _a = generateCodeFrom(typeDef, entryTypes), setup = _a.setup, packetHashGetters = _a.packetHashGetters;
    var types = [];
    var methods = [];
    setup.forEach(function (type) {
        types.push(type.struct);
        types.push(type.typeHash);
    });
    packetHashGetters.forEach(function (getterLine) {
        methods.push(getterLine);
    });
    // Generate entrypoint methods
    var entrypointMethods = generateEntrypointMethods(entryTypes);
    methods.push(entrypointMethods);
    var newFileString = generateFile(types.join('\n'), methods.join('\n'), shouldLog);
    return newFileString;
}
function generateEntrypointMethods(entryTypes) {
    return entryTypes.map(function (entryType) { return "\n  function verifySigned".concat(entryType, "(Signed").concat(entryType, " memory _input) public view returns (address) {\n    bytes32 packetHash = ").concat(packetHashGetterName(entryType), "(_input.message);\n    bytes32 digest = keccak256(\n      abi.encodePacked(\n        \"\\x19\\x01\",\n        getDomainHash(),\n        packetHash\n      )\n    );\n\n    if (_input.signer == 0x0000000000000000000000000000000000000000) {\n      address recoveredSigner = recover(\n        digest,\n        _input.signature\n      );\n      return recoveredSigner;\n    } else {\n      // EIP-1271 signature verification\n      bytes4 result = ERC1271Contract(_input.signer).isValidSignature(digest, _input.signature);\n      require(result == 0x1626ba7e, \"INVALID_SIGNATURE\");\n      return _input.signer;\n    }\n  }\n  "); }).join('\n');
}
module.exports = {
    generateCodeFrom: generateCodeFrom,
    generateSolidity: generateSolidity
};
