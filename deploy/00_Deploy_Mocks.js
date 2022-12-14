const { network } = require("hardhat")
const { VERIFICATION_BLOCK_CONFIRMATIONS } = require("../helper-hardhat-config")
const { verify } = require("../helper-functions")

const DECIMALS = "18"
const INITIAL_PRICE = "200000000000000000000"

/**
 * @dev Read more at https://docs.chain.link/docs/chainlink-vrf/
 */
const BASE_FEE = "100000000000000000"
const GAS_PRICE_LINK = "1000000000" // 0.000000001 LINK per gas
const INITIAL_SUPPLY = ethers.utils.parseEther("1000000000")

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const chainId = network.config.chainId

    // If we are on a local development network, we need to deploy mocks!
    if (chainId == 31337) {
        log("Local network detected! Deploying mocks...")

        await deploy("WethToken", { from: deployer, log: true, args: [INITIAL_SUPPLY] })

        await deploy("UsdcToken", { from: deployer, log: true, args: [INITIAL_SUPPLY] })

        await deploy("MockV3Aggregator", {
            // contract: "MockV3Aggregator",
            from: deployer,
            log: true,
            args: [DECIMALS, INITIAL_PRICE],
        })

        log("Mocks Deployed!")
        log("----------------------------------------------------")
        log("You are deploying to a local network, you'll need a local network running to interact")
        log("Please run `yarn hardhat console` to interact with the deployed smart contracts!")
        log("----------------------------------------------------")
    }

    // If we are on Goerli testnet, we need to deploy mocks!
    if (chainId == 5) {
        log("Goerli testnet detected! Deploying USDC mock...")
        const waitBlockConfirmations = VERIFICATION_BLOCK_CONFIRMATIONS || 6
        const arguments = [INITIAL_SUPPLY]
        const usdc = await deploy("UsdcToken", {
            from: deployer,
            log: true,
            args: arguments,
            waitConfirmations: waitBlockConfirmations,
        })

        log("Mocks Deployed!")
        log("----------------------------------------------------")

        if (process.env.ETHERSCAN_API_KEY) {
            log("Verifying USDC...")
            await verify(usdc.address, arguments)
        }
    }
}
module.exports.tags = ["all", "mocks", "main"]
