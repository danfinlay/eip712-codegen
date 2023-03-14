pragma solidity ^0.8.13;
// SPDX-License-Identifier: MIT


struct EIP712Domain {
  string name;
  string version;
  uint256 chainId;
}

bytes32 constant EIP712DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId)");


struct signedPerson {
  bytes signature;
  address signer;
  Person message;
}


struct Person {
  string name;
  uint256 age;
}

bytes32 constant PERSON_TYPEHASH = keccak256("Person(string name,uint256 age)");


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

  function GET_EIP712DOMAIN_PACKETHASH (EIP712Domain memory _input) public pure returns (bytes32) {
    
    bytes memory encoded = abi.encode(
      EIP712DOMAIN_TYPEHASH,
      _input.name,
      _input.version,
      _input.chainId
    );
    
    return keccak256(encoded);
  }

  function GET_PERSON_PACKETHASH (Person memory _input) public pure returns (bytes32) {
    
    bytes memory encoded = abi.encode(
      PERSON_TYPEHASH,
      _input.name,
      _input.age
    );
    
    return keccak256(encoded);
  }

    function verifySignedPerson(signedPerson memory _input) public pure returns (bool) {
      bytes32 packetHash = GET_PERSON_PACKETHASH(_input.message);
      bytes32 ethSignedMessageHash = getEthSignedMessageHash(packetHash);
      address recoveredSigner = recover(ethSignedMessageHash, _input.signature);
      return recoveredSigner == _input.signer;
    }
  

}

