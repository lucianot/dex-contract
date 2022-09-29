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
    IERC20 internal immutable i_wethToken;
    IERC20 internal immutable i_usdcToken;
    LiquidityPoolToken internal immutable i_lpToken;
    AggregatorV3Interface internal immutable i_priceFeed;
    uint256 internal s_priceConstant;

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
        i_wethToken = IERC20(_wethAddress);
        i_usdcToken = IERC20(_usdcAddress);
        i_lpToken = LiquidityPoolToken(_lpTokenAddress);
        i_priceFeed = AggregatorV3Interface(_priceFeed);
    }

    /* Receive function (if exists) */
    /* Fallback function (if exists) */

    /* Functions */

    /*
     * @notice Deposit into liquidity pool
     * @param tokenAmount The amount of tokens to deposit
     * @param tokenTicker The ticker of the token to deposit
     * @return bool Whether the deposit was successful
     */
    function deposit(uint256 tokenAmount, string memory tokenTicker) public returns (bool) {
        uint256 usdcAmount;
        uint256 wethAmount;
        uint256 wethInitialBalance = i_wethToken.balanceOf(address(this));
        uint256 usdcInitialBalance = i_usdcToken.balanceOf(address(this));

        // set token amounts based on oracle price
        (wethAmount, usdcAmount) = getDepositAmounts(tokenTicker, tokenAmount);

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

    /*
     * @notice Withdraw from liquidity pool
     * @param percentOfDepositToWithdraw Percentage of stake to withdraw from pool
     * @return bool Whether the withdrawal was successful
     * @dev percentOfDepositToWithdraw must be between 0 and 100
     */
    function withdraw(uint256 percentOfDepositToWithdraw) public returns (bool) {
        // revert if percent is greater than 100
        if (percentOfDepositToWithdraw > (1 * 1e18)) {
            revert Pool__InvalidWithdrawPercentage();
        }

        // get depositor's lpToken balance
        uint256 depositorLpTokenBalance = i_lpToken.balanceOf(msg.sender);
        uint256 lpTokenAmountToBurn = (depositorLpTokenBalance * percentOfDepositToWithdraw) / 1e18;

        // calculate depositor's withdrawal as percentage of total pool
        uint256 percentOfPoolToWithdraw = (lpTokenAmountToBurn * 1e18) / i_lpToken.totalSupply();

        // calculate amount of tokens to withdraw
        uint256 wethInitialBalance = i_wethToken.balanceOf(address(this));
        uint256 usdcInitialBalance = i_usdcToken.balanceOf(address(this));
        uint256 wethAmount = (wethInitialBalance * percentOfPoolToWithdraw) / 1e18;
        uint256 usdcAmount = (usdcInitialBalance * percentOfPoolToWithdraw) / 1e18;

        // burn liquidity tokens from depositor
        _burnLiquidityPoolTokens(lpTokenAmountToBurn);

        // send tokens to depositor
        i_wethToken.transfer(msg.sender, wethAmount);
        i_usdcToken.transfer(msg.sender, usdcAmount);

        // update the constant
        s_priceConstant =
            ((wethInitialBalance - wethAmount) * (usdcInitialBalance - usdcAmount)) /
            1e18;

        // emit event
        emit WithdrawCompleted();
        return true;
    }

    /*
     * @notice Swap tokens
     * @param sendTokenAmount The amount of tokens to send to Pool
     * @param sendTokenTicker The ticker of the token to send
     * @return bool Whether the swap was successful
     */
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

    /*
     * @notice Calculates the amount of tokens to deposit based on oracle price
     * @param tokenTicker The ticker of the token to send
     * @param tokenAmount The amount of tokens to send to Pool
     * @return wethAmount Amount of WETH to deposit
     * @return usdcAmount Amount of USDC to deposit
     */
    function getDepositAmounts(string memory tokenTicker, uint256 tokenAmount)
        public
        view
        returns (uint256, uint256)
    {
        uint256 wethAmount;
        uint256 usdcAmount;
        int256 usdcEthOraclePrice = _getLatestPrice();

        if (keccak256(abi.encodePacked(tokenTicker)) == keccak256(abi.encodePacked("WETH"))) {
            wethAmount = tokenAmount;
            usdcAmount = (wethAmount * uint256(usdcEthOraclePrice)) / 1e8;
        } else if (
            keccak256(abi.encodePacked(tokenTicker)) == keccak256(abi.encodePacked("USDC"))
        ) {
            usdcAmount = tokenAmount;
            wethAmount = (usdcAmount * 1e8) / uint256(usdcEthOraclePrice);
        } else {
            revert Pool__InvalidTicker();
        }

        return (wethAmount, usdcAmount);
    }

    /*
     * @notice Calculates the amount of receive tokens and intrinsic swap price
     * @param sendTokenTicker The ticker of the token to send to Pool
     * @param sendTokenAmount The amount of tokens to send to Pool
     * @return receiveTokenAmount Amount of tokens to receive from Pool
     * @return swapPrice Implied swap price based on pricing curve
     * @dev Calculation is based on: x * y = k
     */
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

    /*
     * @notice Get user's current balances
     * @param user User address
     * @return shareOfPool Percentage of pool liquidity owned by user
     * @return wethShare Amount of WETH in Pool owned by user
     * @return usdcShare Amount of USDC in Pool owned by user
     */
    function getUserAccountData(address user)
        public
        view
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 lpTokenSupply = i_lpToken.totalSupply();

        if (lpTokenSupply == 0) {
            return (0, 0, 0);
        }

        uint256 lpTokenBalance = i_lpToken.balanceOf(user);
        uint256 shareOfPool = (lpTokenBalance * 1e18) / lpTokenSupply;
        uint256 wethShare = (shareOfPool * i_wethToken.balanceOf(address(this))) / 1e18;
        uint256 usdcShare = (shareOfPool * i_usdcToken.balanceOf(address(this))) / 1e18;
        return (shareOfPool, wethShare, usdcShare);
    }

    // FOR TESTING ONLY
    // Send all coins to owner and burn all liquidity tokens
    function resetPool() public onlyOwner returns (bool) {
        uint256 wethBalance = i_wethToken.balanceOf(address(this));
        uint256 usdcBalance = i_usdcToken.balanceOf(address(this));
        uint256 lpTokenBalance = i_lpToken.balanceOf(msg.sender);
        i_wethToken.transfer(msg.sender, wethBalance);
        i_usdcToken.transfer(msg.sender, usdcBalance);
        i_lpToken.burn(msg.sender, lpTokenBalance);

        uint256 poolLpTokenBalance = i_lpToken.balanceOf(address(this));
        i_lpToken.burn(address(this), poolLpTokenBalance);
        return true;
    }

    /*
     * @notice Get current price constant
     * @return Constant
     */
    function getPriceConstant() public view returns (uint256) {
        return s_priceConstant;
    }

    /*
     * @notice Get instance of WETH token
     * @return Instance of WETH token
     */
    function getWethToken() public view returns (IERC20) {
        return i_wethToken;
    }

    /*
     * @notice Get instance of USDC token
     * @return Instance of USDC token
     */
    function getUsdcToken() public view returns (IERC20) {
        return i_usdcToken;
    }

    /*
     * @notice Get latest price from oracle
     * @return Latest price from oracle
     */
    function getLatestOraclePrice() public view returns (int256) {
        return _getLatestPrice();
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

    // Mint liquidity tokens to depositor
    function _mintLiquidityPoolTokens(uint256 usdcAmount) public returns (bool) {
        uint256 lpTokenAmount = usdcAmount * 2;
        i_lpToken.mint(msg.sender, lpTokenAmount);
        return true;
    }

    // Burn liquidity tokens from depositor
    function _burnLiquidityPoolTokens(uint256 lpTokenAmount) public returns (bool) {
        i_lpToken.burn(msg.sender, lpTokenAmount);
        return true;
    }

    // Returns the latest price from oracle
    function _getLatestPrice() public view returns (int256) {
        (, int256 price, , , ) = i_priceFeed.latestRoundData();
        return price;
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
