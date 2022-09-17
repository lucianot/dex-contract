// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "./interfaces/IERC20.sol";
import "./LiquidityPoolToken.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

error Pool__ReceiveBalanceZero();
error Pool__InvalidTicker();
error Pool__InsufficientAllowance();
error Pool__InvalidWithdrawPercentage();

/**
 * @title Pool
 * @author Luciano Tavares
 */
contract Pool is Ownable {
    /* Type Declarations */

    /* State Variables */
    address internal immutable i_wethAddress;
    address internal immutable i_usdcAddress;
    IERC20 internal immutable i_wethToken;
    IERC20 internal immutable i_usdcToken;
    LiquidityPoolToken internal immutable i_lpToken;
    AggregatorV3Interface internal immutable i_priceFeed;
    uint256 internal s_priceConstant;
    uint256 internal s_lpTokenSupply;

    // address payable[] private s_providers;
    // uint256 private s_constant;

    /* Events */
    event SwapCompleted(uint256 indexed receivedTokenAmount);
    event DepositCompleted();
    event WithdrawCompleted();

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
        i_wethToken = IERC20(_wethAddress);
        i_usdcToken = IERC20(_usdcAddress);
        i_lpToken = LiquidityPoolToken(_lpTokenAddress);
        i_priceFeed = AggregatorV3Interface(_priceFeed);
        s_lpTokenSupply = 0;
    }

    /* Receive function (if exists) */
    /* Fallback function (if exists) */

    /* Functions */

    // deposit into liquidity pool
    function deposit(uint256 tokenAmount, string memory tokenTicker) public returns (bool) {
        uint256 usdcAmount;
        uint256 wethAmount;
        uint256 wethInitialBalance = _getPoolBalance(i_wethAddress);
        uint256 usdcInitialBalance = _getPoolBalance(i_usdcAddress);

        // set token amounts based on oracle price
        (wethAmount, usdcAmount) = _getDepositAmounts(tokenTicker, tokenAmount);

        // receive tokens from depositor
        i_wethToken.transferFrom(msg.sender, address(this), wethAmount);
        i_usdcToken.transferFrom(msg.sender, address(this), usdcAmount);

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
    function withdraw(uint256 percentOfDepositToWithdraw) public returns (bool) {
        // revert if percent is greater than 100
        if (percentOfDepositToWithdraw > (100 * 1e18)) {
            revert Pool__InvalidWithdrawPercentage();
        }

        // get depositor's lpToken balance
        uint256 depositorLpTokenBalance = i_lpToken.balanceOf(msg.sender);
        uint256 lpTokenAmountToBurn = (depositorLpTokenBalance * percentOfDepositToWithdraw) / 1e18;

        // calculate depositor's withdrawal as percentage of total pool
        uint256 percentOfPoolToWithdraw = (lpTokenAmountToBurn * 1e18) / s_lpTokenSupply;

        // calculate amount of tokens to withdraw
        uint256 wethInitialBalance = _getPoolBalance(i_wethAddress);
        uint256 usdcInitialBalance = _getPoolBalance(i_usdcAddress);
        uint256 wethAmount = (wethInitialBalance * percentOfPoolToWithdraw) / 1e18;
        uint256 usdcAmount = (usdcInitialBalance * percentOfPoolToWithdraw) / 1e18;

        // burn liquidity tokens from depositor
        // TODO: find a better way to give pool permission to burn tokens
        _burnLiquidityPoolTokens(lpTokenAmountToBurn);

        // send tokens to depositor
        _sendTokenToSender(i_wethAddress, msg.sender, wethAmount);
        _sendTokenToSender(i_usdcAddress, msg.sender, usdcAmount);

        // update the constant
        s_priceConstant =
            ((wethInitialBalance - wethAmount) * (usdcInitialBalance - usdcAmount)) /
            1e18;

        // emit event
        emit WithdrawCompleted();
        return true;
    }

    // swap tokens
    function swap(uint256 sendTokenAmount, string memory sendTokenTicker) public returns (bool) {
        IERC20 sendToken;
        IERC20 receiveToken;
        uint256 receiveTokenAmount;

        // set the correct addresses for tokens
        (sendToken, receiveToken) = _getTokens(sendTokenTicker);

        // calculate the equivalent amount of receive token
        (receiveTokenAmount, ) = getSwapData(sendTokenTicker, sendTokenAmount);

        // receive tokens from sender
        sendToken.transferFrom(msg.sender, address(this), sendTokenAmount);

        // send other token to sender
        receiveToken.transfer(msg.sender, receiveTokenAmount);

        emit SwapCompleted(receiveTokenAmount);
        return true;
    }

    // Calculates the amount of receive tokens and intrinsic swap price
    function getSwapData(string memory sendTokenTicker, uint256 sendTokenAmount)
        public
        view
        returns (uint256, uint256)
    {
        IERC20 sendToken;
        IERC20 receiveToken;
        uint256 receiveTokenAmount;
        uint256 swapPrice;

        // select the correct send and receive tokens
        (sendToken, receiveToken) = _getTokens(sendTokenTicker);

        // get current contract balance for each token
        uint256 sendTokenBalance = sendToken.balanceOf(address(this));
        uint256 receiveTokenBalance = receiveToken.balanceOf(address(this));

        // revert if there are no tokens left to send
        if (receiveTokenBalance == 0) {
            revert Pool__ReceiveBalanceZero();
        }

        // calculate the equivalent amount of receive token
        receiveTokenAmount = _calculateSwapAmount(
            sendTokenAmount,
            sendTokenBalance,
            receiveTokenBalance,
            s_priceConstant
        );

        // calculate the swap price
        swapPrice = (receiveTokenAmount * 1e18) / sendTokenAmount;

        return (receiveTokenAmount, swapPrice);
    }

    // calculate the equivalent amount of the token to be received
    function convertTokenAmount(
        uint256 sendTokenAmount,
        address sendTokenAddress,
        address receiveTokenAddress
    ) public view returns (uint256) {
        // get current contract balance for each token
        uint256 sendTokenBalance = _getPoolBalance(sendTokenAddress);
        uint256 receiveTokenBalance = _getPoolBalance(receiveTokenAddress);

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

    // get sender's balances
    function getUserAccountData(address user)
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        if (s_lpTokenSupply == 0) {
            return (0, 0, 0);
        }

        uint256 lpTokenBalance = i_lpToken.balanceOf(user);
        uint256 shareOfPool = (lpTokenBalance * 1e18) / s_lpTokenSupply;
        uint256 wethShare = (shareOfPool * _getPoolBalance(i_wethAddress)) / 1e18;
        uint256 usdcShare = (shareOfPool * _getPoolBalance(i_usdcAddress)) / 1e18;
        return (shareOfPool, wethShare, usdcShare);
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

    function getLpTokenSupply() public view returns (uint256) {
        return s_lpTokenSupply;
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

    function _getDepositAmounts(string memory tokenTicker, uint256 tokenAmount)
        internal
        view
        returns (uint256, uint256)
    {
        uint256 wethAmount;
        uint256 usdcAmount;
        int256 usdcEthOraclePrice = _getLatestPrice();

        if (keccak256(abi.encodePacked(tokenTicker)) == keccak256(abi.encodePacked("WETH"))) {
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

        return (wethAmount, usdcAmount);
    }

    // Returns how much the Pool contract owns of a given token
    function _getPoolBalance(address tokenAddress) public view returns (uint256) {
        IERC20 ERC20Contract = IERC20(tokenAddress);
        return ERC20Contract.balanceOf(address(this));
    }

    // Mint liquidity tokens to depositor
    // Ideal strategy would be to mint tokens whenever deposits are added to pool
    // For now, we will mint all tokens at once when the pool is created
    function _mintLiquidityPoolTokens(uint256 usdcAmount) public returns (bool) {
        uint256 lpTokenAmount = usdcAmount * 2;
        i_lpToken.transfer(msg.sender, lpTokenAmount);
        s_lpTokenSupply += lpTokenAmount;
        return true;
    }

    // Burn liquidity tokens from depositor
    function _burnLiquidityPoolTokens(uint256 lpTokenAmount) public returns (bool) {
        if (lpTokenAmount > i_lpToken.allowance(msg.sender, address(this))) {
            revert Pool__InsufficientAllowance();
        }
        i_lpToken.transferFrom(msg.sender, address(this), lpTokenAmount);
        s_lpTokenSupply -= lpTokenAmount;
        return true;
    }

    // Returns the latest price from oracle
    function _getLatestPrice() public view returns (int256) {
        (, int256 price, , , ) = i_priceFeed.latestRoundData();
        return price;
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

    // Gets token addresses
    function _getTokens(string memory sendTicker) public view returns (IERC20, IERC20) {
        IERC20 sendToken;
        IERC20 receiveToken;

        if (keccak256(abi.encodePacked(sendTicker)) == keccak256(abi.encodePacked("WETH"))) {
            sendToken = i_wethToken;
            receiveToken = i_usdcToken;
        } else if (keccak256(abi.encodePacked(sendTicker)) == keccak256(abi.encodePacked("USDC"))) {
            sendToken = i_usdcToken;
            receiveToken = i_wethToken;
        } else {
            revert Pool__InvalidTicker();
        }

        return (sendToken, receiveToken);
    }
}
