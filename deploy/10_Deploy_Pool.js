const { getNamedAccounts, deployments, network, ethers } = require("hardhat")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    const wethAddress = developmentChains.includes(network.name)
        ? (await deployments.get("WethToken")).address
        : networkConfig[chainId]["wethToken"]

    const usdcAddress = developmentChains.includes(network.name)
        ? (await deployments.get("UsdcToken")).address
        : networkConfig[chainId]["usdcToken"]

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    log("----------------------------------------------------")
    const arguments = [wethAddress, usdcAddress]
    const pool = await deploy("Pool", {
        from: deployer,
        args: arguments,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // // Programmatically adding a consumer for the vrfCoordinatorV2Mock
    // if (developmentChains.includes(network.name)) {
    //     await vrfCoordinatorV2Mock.addConsumer(subscriptionId.toNumber(), raffle.address)
    // }

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(pool.address, arguments)
    }
}

module.exports.tags = ["all", "pool", "main"]
