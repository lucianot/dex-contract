const networkConfig = {
    default: {
        name: "hardhat",
    },
    31337: {
        name: "localhost",
        UsdcEthPriceFeed: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    42: {
        name: "kovan",
    },
    4: {
        name: "rinkeby",
    },
    1: {
        name: "mainnet",
        wethToken: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        usdcToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        linkToken: "0x514910771af9ca656af840dff83e8264ecf986ca",
        UsdcEthPriceFeed: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    5: {
        name: "goerli",
    },
    137: {
        name: "polygon",
    },
}

const developmentChains = ["hardhat", "localhost"]
const VERIFICATION_BLOCK_CONFIRMATIONS = 6

module.exports = {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
}
