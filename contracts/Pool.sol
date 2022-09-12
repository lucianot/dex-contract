// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/IERC20.sol";
import "./LiquidityPoolToken.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error Pool__ReceiveBalanceZero();
error Pool__InvalidTicker();

/**
 * @title Pool
 * @author Luciano Tavares
 */
contract Pool is Ownable {
    /* Type Declarations */

    /* State Variables */
    address internal immutable i_wethAddress;
    address internal immutable i_usdcAddress;
    address internal immutable i_lpTokenAddress;
    AggregatorV3Interface internal immutable i_priceFeed;
    uint256 internal s_priceConstant;

    // address payable[] private s_providers;
    // uint256 private s_constant;

    /* Events */
    event SwapCompleted(uint256 indexed receivedTokenAmount);
    event DepositCompleted();

    /* Modifiers */

    /* Constructor */
    constructor(
        address _wethAddress,
        address _usdcAddress,
        address _lpTokenAddress,
        address _priceFeed
    ) {
        i_wethAddress = _wethAddress;
        i_usdcAddress = _usdcAddress;
        i_lpTokenAddress = _lpTokenAddress;
        i_priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /* Receive function (if exists) */
    /* Fallback function (if exists) */

    /* Functions */

    // deposit into liquidity pool
    function deposit(uint256 tokenAmount, string memory tokenTicker) public returns (bool) {
        uint256 usdcAmount = 0;
        uint256 wethAmount = 0;
        uint256 wethInitialBalance = _getContractBalance(i_wethAddress);
        uint256 usdcInitialBalance = _getContractBalance(i_usdcAddress);
        int256 usdcEthOraclePrice = _getLatestPrice();

        // set token amounts based on oracle price
        // TODO: extract to function
        if (keccak256(abi.encodePacked(tokenTicker)) == keccak256(abi.encodePacked("ETH"))) {
            wethAmount = tokenAmount;
            usdcAmount = (wethAmount * 1e18) / uint256(usdcEthOraclePrice);
        } else if (
            keccak256(abi.encodePacked(tokenTicker)) == keccak256(abi.encodePacked("USDC"))
        ) {
            usdcAmount = tokenAmount;
            wethAmount = (usdcAmount * uint256(usdcEthOraclePrice)) / 1e18;
        } else {
            revert Pool__InvalidTicker();
        }

        // receive tokens from depositor
        _receiveTokenFromSender(i_wethAddress, msg.sender, wethAmount);
        _receiveTokenFromSender(i_usdcAddress, msg.sender, usdcAmount);

        // mint liquidity tokens to depositor
        _mintLiquidityPoolTokens(usdcAmount);

        // update the constant
        s_priceConstant =
            ((wethInitialBalance + wethAmount) * (usdcInitialBalance + usdcAmount)) /
            1e18;

        // emit event
        emit DepositCompleted();
        return true;
    }

    // withdraw from liquidity pool
    function withdraw() public {}

    // swap tokens
    function swap(uint256 sendTokenAmount, string memory sendTokenTicker) public returns (bool) {
        address sendTokenAddress;
        address receiveTokenAddress;
        uint256 receiveTokenAmount;

        // set the correct addresses for tokens
        (sendTokenAddress, receiveTokenAddress) = _getTokenAddresses(sendTokenTicker);

        // calculate the equivalent amount of receive token
        receiveTokenAmount = convertTokenAmount(
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

        // revert if there are no tokens left to send
        if (receiveTokenBalance == 0) {
            revert Pool__ReceiveBalanceZero();
        }

        // calculate the equivalent amount of receive token
        return
            _calculateSwapAmount(
                sendTokenAmount,
                sendTokenBalance,
                receiveTokenBalance,
                s_priceConstant
            );
    }

    // view your pool balance
    function getUserAccountData() public pure returns (uint256) {
        return 0;
    }

    // function getProvider(uint256 index) public view returns (address) {
    //     return s_providers[index];
    // }

    function getWethAddress() public view returns (address) {
        return i_wethAddress;
    }

    function getUsdcAddress() public view returns (address) {
        return i_usdcAddress;
    }

    function getPriceConstant() public view returns (uint256) {
        return s_priceConstant;
    }

    /* Internal Functions */

    // Pricing formula for swapping tokens in pool
    function _calculateSwapAmount(
        uint256 sendTokenAmount,
        uint256 sendTokenBalance,
        uint256 receiveTokenBalance,
        uint256 k
    ) public pure returns (uint256) {
        int256 receiveTokenAmount = (int256(k * 1e18) /
            int256(sendTokenBalance + sendTokenAmount)) - int256(receiveTokenBalance);

        return uint256(receiveTokenAmount * -1);
    }

    // Returns how much the Pool contract owns of a given token
    function _getContractBalance(address tokenAddress) public view returns (uint256) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.balanceOf(address(this));
    }

    // Mint liquidity tokens to depositor
    // Ideal strategy would be to mint tokens whenever deposits are added to pool
    // For now, we will mint all tokens at once when the pool is created
    function _mintLiquidityPoolTokens(uint256 usdcAmount) public returns (bool) {
        uint256 liquidityTokenAmount = usdcAmount * 2;

        // TODO: should token be instantiated in constructor?
        LiquidityPoolToken lpToken = LiquidityPoolToken(i_lpTokenAddress);
        lpToken.transfer(msg.sender, liquidityTokenAmount);
        return true;
    }

    // Returns the latest price from oracle
    function _getLatestPrice() public view returns (int256) {
        (, int256 price, , , ) = i_priceFeed.latestRoundData();
        return price;
    }

    // Requests approval from sender
    function _requestApprovalFromSender(
        address tokenAddress,
        uint256 tokenAmount,
        address senderAccount
    ) public returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.approve(senderAccount, tokenAmount);
    }

    // Transfers tokens from sender to pool
    function _receiveTokenFromSender(
        address tokenAddress,
        address senderAddress,
        uint256 tokenAmount
    ) public returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.transferFrom(senderAddress, address(this), tokenAmount);
    }

    // Transfers token to sender
    function _sendTokenToSender(
        address tokenAddress,
        address senderAddress,
        uint256 tokenAmount
    ) public returns (bool) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.transfer(senderAddress, tokenAmount);
    }

    // Gets token addresses
    function _getTokenAddresses(string memory sendTicker) public view returns (address, address) {
        address sendTokenAddress;
        address receiveTokenAddress;

        if (keccak256(abi.encodePacked(sendTicker)) == keccak256(abi.encodePacked("ETH"))) {
            sendTokenAddress = i_wethAddress;
            receiveTokenAddress = i_usdcAddress;
        } else if (keccak256(abi.encodePacked(sendTicker)) == keccak256(abi.encodePacked("USDC"))) {
            sendTokenAddress = i_usdcAddress;
            receiveTokenAddress = i_wethAddress;
        } else {
            revert Pool__InvalidTicker();
        }

        return (sendTokenAddress, receiveTokenAddress);
    }

    // Sets constant for pricing formula
    // TODO: remove this function
    function _setPriceConstant(uint256 value) public onlyOwner {
        s_priceConstant = value;
    }
}
