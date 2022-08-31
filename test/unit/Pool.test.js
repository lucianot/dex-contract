const { assert, expect } = require("chai")
const { network, deployments, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool

          beforeEach(async function () {
              const deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all", "pool"])
              pool = await ethers.getContract("Pool", deployer)
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("calculateCurrentSwapPrice", function () {
              it("returns the correct amount", async function () {
                  const sendAmount = ethers.utils.parseEther("2")
                  const sendBalance = ethers.utils.parseEther("10")
                  const receiveBalance = ethers.utils.parseEther("16000")
                  const expected = ethers.utils.parseEther("0.00075")
                  const actual = await pool.calculateCurrentSwapPrice(
                      sendAmount,
                      sendBalance,
                      receiveBalance
                  )
              })

              it("reverts if receive balance is zero", async function () {
                  const sendAmount = ethers.utils.parseEther("2")
                  const sendBalance = ethers.utils.parseEther("10")
                  const receiveBalance = ethers.utils.parseEther("0")
                  await expect(
                      pool.calculateCurrentSwapPrice(sendAmount, sendBalance, receiveBalance)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("convertTokenAmount", function () {
              let ethAddress, usdcAddress
              beforeEach(async function () {
                  ethAddress = ethers.utils.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2")
                  usdcAddress = ethers.utils.getAddress(
                      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
                  )
              })

              it("returns the correct amount of USDC", async function () {
                  // fund the pool with 10 ETH and 16_0000 USDC
                  const ethAmount = ethers.utils.parseEther("2")
                  const expected = ethers.utils.parseEther("2666.666666666666666666")
                  const actual = await pool.convertTokenAmount(ethAmount, ethAddress, usdcAddress)
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of ETH", async function () {
                  // fund the pool with 10 ETH and 16_0000 USDC
                  const usdcAmount = ethers.utils.parseEther("2000")
                  const expected = ethers.utils.parseEther("1.111111111111111111")
                  const actual = await pool.convertTokenAmount(usdcAmount, usdcAddress, ethAddress)
                  assert.equal(actual.toString(), expected.toString())
              })

              it.skip("reverts if receive balance is zero", async function () {
                  // fund the pool with 10 ETH and 0 USDC
                  const ethAmount = ethers.utils.parseEther("2")
                  await expect(
                      pool.convertTokenAmount(ethAmount, ethAddress, usdcAddress)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("getTokenBalance", function () {
              it("returns the correct amount of ETH", async function () {
                  const sendAddress = ethers.utils.getAddress(
                      "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
                  ) // ETH
                  const expected = ethers.utils.parseEther("10")
                  const actual = await pool.getTokenBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of USDC", async function () {
                  const sendAddress = ethers.utils.getAddress(
                      "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
                  ) // ETH
                  const expected = ethers.utils.parseEther("16000")
                  const actual = await pool.getTokenBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })
          })
      })
