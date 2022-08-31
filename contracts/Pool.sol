// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

/**
 * @title Pool
 * @author Luciano Tavares
 */
contract Pool {
    /* Type Declarations */

    /* State Variables */
    address private immutable i_ethAddress;
    address private immutable i_usdcAddress;

    address payable[] private s_providers;
    uint256 private s_constant;

    /* Events */
    error Pool__ReceiveBalanceZero();
    error Pool__TokenNotFound();

    /* Modifiers */

    /* Constructor */
    constructor() {
        i_ethAddress = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        i_usdcAddress = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
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
    function swap(uint256 sendTokenAmount, string memory sendTokenTicker) public payable {
        address sendTokenAddress;
        address receiveTokenAddress;

        // validate the send token amount?

        // set the correct addresses for the send and receive tokens
        if (keccak256(abi.encodePacked(sendTokenTicker)) == keccak256(abi.encodePacked("ETH"))) {
            sendTokenAddress = i_ethAddress;
            receiveTokenAddress = i_usdcAddress;
        } else {
            sendTokenAddress = i_usdcAddress;
            receiveTokenAddress = i_ethAddress;
        }

        // calculate the equivalent amount of receive token
        uint256 receiveTokenAmount = convertTokenAmount(
            sendTokenAmount,
            sendTokenAddress,
            receiveTokenAddress
        );

        // check if there is enough liquidity in the pool
        // if not, return error

        // get authorization for send token
        // requestApprovalFromSender(sendTokenAmount, sendTokenAddress, senderAccount);

        // receive tokens from sender
        // receiveTokenFromSender(sendTokenAmount, sendTokenAddress, senderAccount);

        // send other token to depositor
        // sendTokenToSender(receiveTokenAmount, receiveTokenTicker, senderAccount);

        // return status?
    }

    // view your pool balance
    function getUserAccountData() public view returns (uint256) {
        return 0;
    }

    function getProvider(uint256 index) public view returns (address) {
        return s_providers[index];
    }

    /* Internal Functions */

    // calculate the equivalent amount of the token to be received
    // TODO: change to internal
    function convertTokenAmount(
        uint256 sendTokenAmount,
        address sendTokenAddress,
        address receiveTokenAddress
    ) public view returns (uint256) {
        // get current contract balance for each token
        uint256 sendTokenBalance = getTokenBalance(sendTokenAddress);
        uint256 receiveTokenBalance = getTokenBalance(receiveTokenAddress);

        // formula for converting tokens
        uint256 currentSwapPrice = calculateCurrentSwapPrice(
            sendTokenAmount,
            sendTokenBalance,
            receiveTokenBalance
        );

        // calculate the equivalent amount of the token to be received
        return (sendTokenAmount * 1e18) / currentSwapPrice;
    }

    // formula for converting tokens
    // TODO: change to internal function
    function calculateCurrentSwapPrice(
        uint256 sendTokenAmount,
        uint256 sendTokenBalance,
        uint256 receiveTokenBalance
    ) public view returns (uint256) {
        // revert if receive token balance is 0
        if (receiveTokenBalance == 0) {
            revert Pool__ReceiveBalanceZero();
        }

        uint256 currentSwapPrice = ((sendTokenBalance + sendTokenAmount) * 1e18) /
            receiveTokenBalance;
        return currentSwapPrice;
    }

    // get the token balance for the contract
    // TODO: fix this function to get the actual balance
    // TODO: change to internal function
    function getTokenBalance(address tokenAddress) public view returns (uint256) {
        uint256 ethBalance = 10 * 1e18;
        uint256 usdcBalance = 16000 * 1e18;
        uint256 tokenBalance;
        if (tokenAddress == i_ethAddress) {
            tokenBalance = ethBalance;
        } else {
            if (tokenAddress == i_usdcAddress) {
                tokenBalance = usdcBalance;
            } else {
                revert Pool__TokenNotFound();
            }
        }
        return tokenBalance;
    }
}

// contract lpToken {}
