// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/IERC20.sol";

error Pool__ReceiveBalanceZero();
error Pool__TokenNotFound();

/**
 * @title Pool
 * @author Luciano Tavares
 */
contract Pool {
    /* Type Declarations */

    /* State Variables */
    address private immutable i_wethAddress;
    address private immutable i_usdcAddress;

    address payable[] private s_providers;
    uint256 private s_constant;

    /* Events */
    event SwapCompleted(uint256 indexed receivedTokenAmount);

    /* Modifiers */

    /* Constructor */
    constructor(address wethAddress, address usdcAddress) {
        i_wethAddress = wethAddress;
        i_usdcAddress = usdcAddress;
    }

    /* Receive function (if exists) */
    /* Fallback function (if exists) */

    /* Functions */

    // deposit into liquidity pool
    function deposit(uint256 referenceTokenAmount, string memory referenceTokenTicker)
        public
        payable
    {
        // validate the reference token amount?
        // calculate the equivalent amount of other token
        // get authorization for ETH
        // get authorization for USDC
        // request tokens from depositor
        // send liquidity tokens to depositor
        // return status?
    }

    // withdraw from liquidity pool
    function withdraw() public payable {}

    // swap tokens
    function swap(uint256 sendTokenAmount, string memory sendTokenTicker)
        public
        payable
        returns (bool)
    {
        address sendTokenAddress;
        address receiveTokenAddress;

        // validate the send token amount?

        // set the correct addresses for the send and receive tokens
        if (keccak256(abi.encodePacked(sendTokenTicker)) == keccak256(abi.encodePacked("ETH"))) {
            sendTokenAddress = i_wethAddress;
            receiveTokenAddress = i_usdcAddress;
        } else {
            sendTokenAddress = i_usdcAddress;
            receiveTokenAddress = i_wethAddress;
        }

        // calculate the equivalent amount of receive token
        uint256 receiveTokenAmount = convertTokenAmount(
            sendTokenAmount,
            sendTokenAddress,
            receiveTokenAddress
        );

        // receive tokens from sender
        _receiveTokenFromSender(sendTokenAddress, msg.sender, sendTokenAmount);

        // send other token to sender
        _sendTokenToSender(receiveTokenAddress, msg.sender, receiveTokenAmount);

        emit SwapCompleted(receiveTokenAmount);
        return true;
    }

    // calculate the equivalent amount of the token to be received
    function convertTokenAmount(
        uint256 sendTokenAmount,
        address sendTokenAddress,
        address receiveTokenAddress
    ) public view returns (uint256) {
        // get current contract balance for each token
        uint256 sendTokenBalance = _getContractBalance(sendTokenAddress);
        uint256 receiveTokenBalance = _getContractBalance(receiveTokenAddress);

        // formula for converting tokens
        uint256 currentSwapPrice = _calculateCurrentSwapPrice(
            sendTokenAmount,
            sendTokenBalance,
            receiveTokenBalance
        );

        // calculate the equivalent amount of the token to be received
        return (sendTokenAmount * 1e18) / currentSwapPrice;
    }

    // view your pool balance
    function getUserAccountData() public pure returns (uint256) {
        return 0;
    }

    function getProvider(uint256 index) public view returns (address) {
        return s_providers[index];
    }

    function getWethAddress() public view returns (address) {
        return i_wethAddress;
    }

    function getUsdcAddress() public view returns (address) {
        return i_usdcAddress;
    }

    /* Internal Functions */

    // formula for converting tokens
    function _calculateCurrentSwapPrice(
        uint256 sendTokenAmount,
        uint256 sendTokenBalance,
        uint256 receiveTokenBalance
    ) internal pure returns (uint256) {
        // revert if receive token balance is 0
        if (receiveTokenBalance == 0) {
            revert Pool__ReceiveBalanceZero();
        }

        return ((sendTokenBalance + sendTokenAmount) * 1e18) / receiveTokenBalance;
    }

    // get the token balance for the contract
    function _getContractBalance(address tokenAddress) internal view returns (uint256) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.balanceOf(address(this));
    }

    // request approval from sender
    function requestApprovalFromSender(
        address tokenAddress,
        uint256 tokenAmount,
        address senderAccount
    ) internal returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.approve(senderAccount, tokenAmount);
    }

    // transfer token from sender
    function _receiveTokenFromSender(
        address tokenAddress,
        address senderAddress,
        uint256 tokenAmount
    ) internal returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.transferFrom(senderAddress, address(this), tokenAmount);
    }

    // transfer token to sender
    function _sendTokenToSender(
        address tokenAddress,
        address senderAddress,
        uint256 tokenAmount
    ) internal returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.transfer(senderAddress, tokenAmount);
    }
}
