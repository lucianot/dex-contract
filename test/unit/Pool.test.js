const { assert, expect } = require("chai")
const { network, deployments, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", async function () {
          let pool

          beforeEach(async function () {
              const deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all", "pool"])
              pool = await ethers.getContract("Pool", deployer)
          })

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

              it("throws error if receive balance is zero", async function () {
                  const sendAmount = ethers.utils.parseEther("2")
                  const sendBalance = ethers.utils.parseEther("10")
                  const receiveBalance = ethers.utils.parseEther("0")
                  await expect(
                      pool.calculateCurrentSwapPrice(sendAmount, sendBalance, receiveBalance)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
              })
          })
      })
