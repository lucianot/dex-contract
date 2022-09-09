const { getNamedAccounts, deployments, network, run } = require("hardhat")
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

    let UsdcEthPriceFeedAddress
    if (chainId == 31337) {
        const UsdcEthAggregator = await deployments.get("MockV3Aggregator")
        UsdcEthPriceFeedAddress = UsdcEthAggregator.address
    } else {
        UsdcEthPriceFeedAddress = networkConfig[chainId]["UsdcEthPriceFeed"]
    }
    // Price Feed Address, values can be obtained at https://docs.chain.link/docs/reference-contracts
    // Default one below is ETH/USD contract on Kovan
    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS
    log("----------------------------------------------------")
    const priceConsumerV3 = await deploy("PriceConsumerV3", {
        from: deployer,
        args: [UsdcEthPriceFeedAddress],
        log: true,
        waitConfirmations: waitBlockConfirmations,
    })

    // Verify the deployment
    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(priceConsumerV3.address, [UsdcEthPriceFeedAddress])
    }

    log("Run Price Feed contract with command:")
    const networkName = network.name == "hardhat" ? "localhost" : network.name
    log(
        `yarn hardhat read-price-feed --contract ${priceConsumerV3.address} --network ${networkName}`
    )
    log("----------------------------------------------------")
}

module.exports.tags = ["all", "feed", "main"]
