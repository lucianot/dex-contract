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
        usdcEthPriceFeed: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    5: {
        name: "goerli",
        wethToken: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
        usdcToken: "0xde637d4c445ca2aae8f782ffac8d2971b93a4998",
        usdcEthPriceFeed: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e",
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
