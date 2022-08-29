const { getNamedAccounts, deployments, network } = require("hardhat")
const {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    // const chainId = network.config.chainId

    // if (chainId == 31337) {
    //     //
    //     vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
    //     vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address
    //     const transactionResponse = await vrfCoordinatorV2Mock.createSubscription()
    //     const transactionReceipt = await transactionResponse.wait()
    //     subscriptionId = transactionReceipt.events[0].args.subId
    //     // Fund the subscription
    //     // Our mock makes it so we don't actually have to worry about sending fund
    //     await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT)
    // } else {
    //     vrfCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"]
    //     subscriptionId = networkConfig[chainId]["subscriptionId"]
    // }

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS

    log("----------------------------------------------------")
    const arguments = []
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

module.exports.tags = ["all", "pool"]
