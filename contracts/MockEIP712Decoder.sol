// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./EIP712Decoder.sol";

contract MockEIP712Decoder is EIP712Decoder {
    bytes32 domainHash;
    constructor(uint256 chainId) {
        domainHash = keccak256(abi.encode(
            EIP712DOMAIN_TYPEHASH,
            keccak256(bytes("MockEIP712Decoder")),
            keccak256(bytes("1")),
            chainId,
            address(this)
        ));
    }

    function getDomainHash () public view override returns (bytes32) {
        return domainHash;
    }
}
