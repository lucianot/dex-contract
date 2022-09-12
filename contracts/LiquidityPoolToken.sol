// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LiquidityPoolToken is ERC20, ERC20Burnable, Ownable {
    constructor(uint256 initialSupply) ERC20("LiquidityPoolToken", "LP") {
        _mint(msg.sender, initialSupply);
    }

    /*
    options:
    - mint supply to deployer then transfer to pool contract
        easiest to implement
    - mint innitial supply to pool contract
        requires pool contract to be deployed first
        how to pass token address to pool contract?
    - mint as needed
        how to give pool contract authorization to mint?
            - transfer ownership to pool contract?

     */
    function mint(address to, uint256 amount) public onlyOwner returns (bool) {
        _mint(to, amount);
        return true;
    }
}
