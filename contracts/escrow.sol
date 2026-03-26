// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IDirectSender} from "./interfaces/IDirectSender.sol";
import {IGenLayerBridgeReceiver} from "./interfaces/IGenLayerBridgeReceiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Escrow
/// @notice EVM part of Questera.
contract Escrow is ReentrancyGuard {
    IERC20 public token;
    IDirectSender public bridgeSender;
    address public owner;
    address public creator;
    address public icContract;

    uint256 public poolAmount;
    uint256 public poolAmountActual;
    uint256 public messageNonce;
    uint256 public endDate;
    uint256 public winnersCount;
    uint256 public claimedWinnersCount;
    bool public funded;
    bool public refunded;

    uint256 public constant GRACE_PERIOD = 1 hours;

    mapping(address => bool) public winners;
    mapping(address => bool) public authorizedBridgeReceivers; 

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyBridgeReceiver() {
        require(authorizedBridgeReceivers[msg.sender], "Only authorized bridge receivers");
        _;
    }

    modifier beforeEndDate() {
        require(block.timestamp < endDate, "Deadline passed");
        _;
    }

    modifier afterEndDate() {
        require(block.timestamp >= endDate, "Deadline not reached");
        _;
    }

    modifier beforeGracePeriodEnd() {
        require(block.timestamp <= endDate + GRACE_PERIOD, "Grace period ended");
        _;
    }

    modifier afterGracePeriod() {
        require(block.timestamp > endDate + GRACE_PERIOD, "Grace period not ended");
        _;
    }

    constructor(address _creator, address _token, address _bridgeIn, address _bridgeOut, uint256 _poolAmount, uint256 _timestamp) {
        require(_token != address(0), "Invalid token");
        require(_bridgeIn != address(0), "Invalid bridgeIn");
        require(_bridgeOut != address(0), "Invalid bridgeOut");
        require(_creator != address(0), "Invalid creator");

        token = IERC20(_token);
        owner = msg.sender;
        creator = _creator;
        authorizedBridgeReceivers[_bridgeIn] = true;
        bridgeSender = IDirectSender(_bridgeOut);
        poolAmount = _poolAmount * 1_000_000;
        endDate = _timestamp;
    }

    // ================== Admin ==================

    function setIcContract(address _icContract) external onlyOwner {
        require(_icContract != address(0), "Invalid IC Contract");
        icContract = _icContract;
    }

    function setBridgeSender(address _bridgeSender) external onlyOwner {
        require(_bridgeSender != address(0), "Invalid bridge sender");
        bridgeSender = IDirectSender(_bridgeSender);
    }

    function addAuthorizedSender(address _bridgeReceiver) external onlyOwner {
        authorizedBridgeReceivers[_bridgeReceiver] = true;
    }

    function removeAuthorizedSender(address _bridgeReceiver) external onlyOwner {
        authorizedBridgeReceivers[_bridgeReceiver] = false;
    }

    // ================== Game logic ==================

    function fund() external beforeEndDate returns (bytes32 messageId) {
        require(address(bridgeSender) != address(0), "Bridge sender not set");
        require(icContract != address(0), "IC contract not set");
        require(!funded, "Pool has been already paid");
        require(creator == msg.sender, "Only quest creator can fund");

        bool success = token.transferFrom(msg.sender, address(this), poolAmount);
        require(success, "Transfer failed");
        poolAmountActual = token.balanceOf(address(this));
        funded = true;
        string memory creatorStr = _addressToString(msg.sender);
        string memory message = string(
            abi.encodePacked(
                '{"quest_payer":"',
                creatorStr,
                '"}'
            )
        );
        bytes memory encodedMessage = abi.encode(message);
        uint256 nonce = ++messageNonce;
        messageId = keccak256(abi.encodePacked(block.chainid, address(this), msg.sender, icContract, encodedMessage, nonce));
        bytes memory data = abi.encode(uint32(block.chainid), msg.sender, icContract, encodedMessage, messageId);
        bridgeSender.directSendToGenLayer(data);
        
        return messageId;
    }

    function claimWinner() external nonReentrant afterGracePeriod {
        require(funded, "Pool hasn't been funded yet");
        require(winners[msg.sender], "Not a winner or already claimed");

        uint256 amount = _calculateReward();

        uint256 balanceBefore = token.balanceOf(address(this));
        require(balanceBefore >= amount, "Not enough rewards balance");

        winners[msg.sender] = false;
        claimedWinnersCount++;

        bool success = token.transfer(msg.sender, amount);
        require(success, "Transfer failed");

        if (claimedWinnersCount == winnersCount) {
            uint256 left = token.balanceOf(address(this));
            if (left > 0) {
                bool dustTransfer = token.transfer(creator, left);
                require(dustTransfer, "Dust transfer failed");
            }
        }
    }

    function claimRefund() external nonReentrant afterGracePeriod {
        require(creator == msg.sender, "Only quest creator can refund");
        require(winnersCount == 0, "There are winners");
        require(!refunded, "Pool has been already refunded");

        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens");
        refunded = true;
        bool success = token.transfer(creator, balance);
        require(success, "Transfer failed");
    }

    function claimableAmount(address user) external view returns (uint256) {
        if (!winners[user]) return 0;
        return _calculateReward();
    }

    function processBridgeMessage(uint32 _sourceChainId, address _sourceContract, bytes calldata _message) external onlyBridgeReceiver beforeGracePeriodEnd {
        require(_sourceContract == icContract, "Wrong sender");
        require(funded, "Pool hasn't been funded yet");
        string memory message = abi.decode(_message, (string));
        (address player, string memory action) = _parseBridgeJson(message);

        if (_equals(action, "completed")) {
            if (!winners[player]) {
                winners[player] = true;
                winnersCount++;
            }
        } else {
            revert("Unknown action");
        }
    }

    // ================== Utils ==================

    function _calculateReward() internal view returns (uint256) {
        require(winnersCount > 0, "No winners");
        return poolAmountActual / winnersCount;
    }

    function _addressToString(address _addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(_addr)));
        bytes16 hexSymbols = "0123456789abcdef";
        bytes memory str = new bytes(42);

        str[0] = "0";
        str[1] = "x";

        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = hexSymbols[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = hexSymbols[uint8(value[i + 12] & 0x0f)];
        }

        return string(str);
    }

    function _parseBridgeJson(string memory json) internal pure returns (address addr, string memory action) {
        bytes memory data = bytes(json);
        string memory addrStr = _extractValue(data, '"address"');
        addr = _parseAddress(addrStr);
        action = _extractValue(data, '"action"');
    }

    function _extractValue(bytes memory data, string memory key) internal pure returns (string memory) {
        bytes memory keyBytes = bytes(key);
        uint256 keyPos = _indexOf(data, keyBytes);
        require(keyPos != type(uint256).max, "Key not found");

        uint256 i = keyPos + keyBytes.length;
        while (i < data.length && data[i] != ":") {
            i++;
        }
        require(i < data.length, "Invalid json: no colon");
        i++; 

        while (i < data.length && (data[i] == " " || data[i] == "\t" || data[i] == "\n" || data[i] == "\r")) {
            i++;
        }

        require(i < data.length && data[i] == '"', "Expected opening quote");
        i++; 

        uint256 start = i;
        while (i < data.length && data[i] != '"') {
            i++;
        }
        require(i < data.length, "Unterminated string");

        uint256 len = i - start;
        bytes memory value = new bytes(len);
        for (uint256 j = 0; j < len; j++) {
            value[j] = data[start + j];
        }

        return string(value);
    }

    function _indexOf(bytes memory data, bytes memory needle) internal pure returns (uint256) {
        if (needle.length == 0 || needle.length > data.length) {
            return type(uint256).max;
        }

        for (uint256 i = 0; i <= data.length - needle.length; i++) {
            bool match_ = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (data[i + j] != needle[j]) {
                    match_ = false;
                    break;
                }
            }
            if (match_) {
                return i;
            }
        }

        return type(uint256).max; // not found
    }

    function _parseAddress(string memory s) internal pure returns (address) {
        bytes memory strBytes = bytes(s);
        require(strBytes.length == 42, "Address length invalid"); // "0x" + 40 hex

        uint160 result = 0;
        for (uint256 i = 2; i < 42; i++) {
            uint8 c = uint8(strBytes[i]);
            uint8 value;
            if (c >= 48 && c <= 57) {
                value = c - 48; // '0'..'9'
            } else if (c >= 97 && c <= 102) {
                value = 10 + (c - 97); // 'a'..'f'
            } else if (c >= 65 && c <= 70) {
                value = 10 + (c - 65); // 'A'..'F'
            } else {
                revert("Invalid hex char");
            }
            result = (result << 4) | uint160(value);
        }
        return address(result);
    }

    function _equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

}
