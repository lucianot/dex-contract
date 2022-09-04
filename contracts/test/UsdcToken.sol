// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract UsdcToken is ERC20 {
    constructor(uint256 initialSupply) ERC20("UsdcToken", "USDC") {
        _mint(msg.sender, initialSupply);
    }
}
