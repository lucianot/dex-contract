const { getNamedAccounts, deployments, network, ethers } = require("hardhat")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

const INITIAL_SUPPLY = ethers.utils.parseEther("1000000000")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    let UsdcEthPriceFeedAddress, wethAddress, usdcAddress, lpTokenAddress, waitBlockConfirmations

    if (chainId == 31337) {
        const UsdcEthAggregator = await deployments.get("MockV3Aggregator")
        UsdcEthPriceFeedAddress = UsdcEthAggregator.address
    } else {
        UsdcEthPriceFeedAddress = networkConfig[chainId]["usdcEthPriceFeed"]
    }

    if (developmentChains.includes(network.name)) {
        wethAddress = (await deployments.get("WethToken")).address
        usdcAddress = (await deployments.get("UsdcToken")).address
        lpTokenAddress = (await deployments.get("LiquidityPoolToken")).address
        waitBlockConfirmations = 1
    } else {
        wethAddress = networkConfig[chainId]["wethToken"]
        usdcAddress =
            chainId == 5
                ? (await deployments.get("UsdcToken")).address
                : networkConfig[chainId]["usdcToken"]
        lpTokenAddress = (await deployments.get("LiquidityPoolToken")).address
        waitBlockConfirmations = VERIFICATION_BLOCK_CONFIRMATIONS
    }

    log("----------------------------------------------------")
    const arguments = [wethAddress, usdcAddress, lpTokenAddress, UsdcEthPriceFeedAddress]
    const pool = await deploy("Pool", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying Pool...")
        await verify(pool.address, arguments)
    }

    // Grant minter and burner role to the pool
    const LpToken = await deployments.get("LiquidityPoolToken")
    const lpToken = await ethers.getContractAt("LiquidityPoolToken", LpToken.address)
    const minterRole = await lpToken.MINTER_ROLE()
    const burnerRole = await lpToken.BURNER_ROLE()
    const tx1 = await lpToken.grantRole(minterRole, pool.address)
    tx1.wait(6)
    const tx2 = await lpToken.grantRole(burnerRole, pool.address)
    tx2.wait(6)
}

module.exports.tags = ["all", "pool", "main"]
