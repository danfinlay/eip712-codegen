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
var generateFile = function (types, methods, log) {
    if (log === void 0) { log = false; }
    return "pragma solidity ^0.8.13;\n// SPDX-License-Identifier: MIT\n".concat(log ? 'import "hardhat/console.log";' : '', "\n\n").concat(types, "\n\ncontract EIP712Decoder {\n\n  /**\n  * @dev Recover signer address from a message by using their signature\n  * @param hash bytes32 message, the hash is the signed message. What is recovered is the signer address.\n  * @param sig bytes signature, the signature is generated using web3.eth.sign()\n  */\n  function recover(bytes32 hash, bytes memory sig) internal pure returns (address) {\n    bytes32 r;\n    bytes32 s;\n    uint8 v;\n\n    // Check the signature length\n    if (sig.length != 65) {\n      return (address(0));\n    }\n\n    // Divide the signature in r, s and v variables\n    assembly {\n      r := mload(add(sig, 32))\n      s := mload(add(sig, 64))\n      v := byte(0, mload(add(sig, 96)))\n    }\n    // Version of signature should be 27 or 28, but 0 and 1 are also possible versions\n    if (v < 27) {\n      v += 27;\n    }\n\n    // If the version is correct return the signer address\n    if (v != 27 && v != 28) {\n      return (address(0));\n    } else {\n      return ecrecover(hash, v, r, s);\n    }\n  }\n").concat(methods, "\n\n}\n\n");
};
var LOGGING_ENABLED = false;
function generateCodeFrom(types, entryTypes) {
    var results = [];
    var packetHashGetters = [];
    Object.keys(types.types).forEach(function (typeName) {
        var fields = types.types[typeName];
        var typeHash = "bytes32 constant ".concat(typeName.toUpperCase(), "_TYPEHASH = keccak256(\"").concat(encodeType(typeName, types.types), "\");\n");
        var struct = "struct ".concat(typeName, " {\n").concat(fields.map(function (field) { return "  ".concat(field.type, " ").concat(field.name, ";\n"); }).join(''), "}\n");
        // Generate signed${TYPE} struct for entryTypes
        if (entryTypes.includes(typeName)) {
            var signedStruct = "\nstruct signed".concat(typeName, " {\n  bytes signature;\n  address signer;\n  ").concat(typeName, " message;\n}\n");
            results.push({ struct: signedStruct, typeHash: '' });
        }
        generatePacketHashGetters(types, typeName, fields, packetHashGetters);
        results.push({ struct: struct, typeHash: typeHash });
    });
    return { setup: results, packetHashGetters: __spreadArray([], __read(new Set(packetHashGetters)), false) };
}
function generatePacketHashGetters(types, typeName, fields, packetHashGetters) {
    if (packetHashGetters === void 0) { packetHashGetters = []; }
    if (typeName.includes('[]')) {
        generateArrayPacketHashGetter(typeName, packetHashGetters);
    }
    else {
        packetHashGetters.push("\n  function ".concat(packetHashGetterName(typeName), " (").concat(typeName, " memory _input) public pure returns (bytes32) {\n    ").concat(LOGGING_ENABLED ? "console.log(\"".concat(typeName, " typehash: \");\n    console.logBytes32(").concat(typeName.toUpperCase(), "_TYPEHASH);") : '', "\n    bytes memory encoded = abi.encode(\n      ").concat(typeName.toUpperCase(), "_TYPEHASH,\n      ").concat(fields.map(getEncodedValueFor).join(',\n      '), "\n    );\n    ").concat(LOGGING_ENABLED ? "console.log(\"Encoded ".concat(typeName, ": \");\n    console.logBytes(encoded);") : '', "\n    return keccak256(encoded);\n  }"));
    }
    fields.forEach(function (field) {
        if (field.type.includes('[]')) {
            generateArrayPacketHashGetter(field.type, packetHashGetters);
        }
    });
    return packetHashGetters;
}
function getEncodedValueFor(field) {
    var basicEncodableTypes = ['address', 'bool', 'bytes32', 'int', 'uint', 'uint256', 'string'];
    var hashedTypes = ['bytes'];
    if (basicEncodableTypes.includes(field.type)) {
        return "_input.".concat(field.name);
    }
    if (hashedTypes.includes(field.type)) {
        return "keccak256(_input.".concat(field.name, ")");
    }
    return "".concat(packetHashGetterName(field.type), "(_input.").concat(field.name, ")");
}
function packetHashGetterName(typeName) {
    if (typeName.includes('[]')) {
        return "GET_".concat(typeName.substr(0, typeName.length - 2).toUpperCase(), "_ARRAY_PACKETHASH");
    }
    return "GET_".concat(typeName.toUpperCase(), "_PACKETHASH");
}
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
    return entryTypes.map(function (entryType) { return "\n    function verifySigned".concat(entryType, "(signed").concat(entryType, " memory _input) public pure returns (bool) {\n      bytes32 packetHash = ").concat(packetHashGetterName(entryType), "(_input.message);\n      bytes32 ethSignedMessageHash = getEthSignedMessageHash(packetHash);\n      address recoveredSigner = recover(ethSignedMessageHash, _input.signature);\n      return recoveredSigner == _input.signer;\n    }\n  "); }).join('\n');
}
module.exports = {
    generateCodeFrom: generateCodeFrom,
    generateSolidity: generateSolidity
};
