const { assert, expect } = require("chai")
const { network, deployments, getNamedAccounts, ethers } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
// const IERC20 = "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20"

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, sender

          async function fundContract(wethAmount, usdcAmount) {
              // fund Pool contract with WETH
              await weth.transfer(pool.address, ethers.utils.parseEther(wethAmount))

              // fund Pool contract with USDC
              await usdc.transfer(pool.address, ethers.utils.parseEther(usdcAmount))
          }

          beforeEach(async function () {
              // deploy Pool
              deployer = (await getNamedAccounts()).deployer
              sender = (await getNamedAccounts()).sender
              await deployments.fixture(["all", "pool"])
              pool = await ethers.getContract("Pool", deployer)

              // deploy tokens
              weth = await ethers.getContract("WethToken", deployer)
              usdc = await ethers.getContract("UsdcToken", deployer)
          })

          describe("convertTokenAmount", function () {
              it("returns the correct amount of USDC", async function () {
                  await fundContract("10", "16000")
                  const wethAmount = ethers.utils.parseEther("2")
                  const expected = ethers.utils.parseEther("2666.666666666666666666")
                  const actual = await pool.convertTokenAmount(
                      wethAmount,
                      weth.address,
                      usdc.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of WETH", async function () {
                  await fundContract("10", "16000")
                  const usdcAmount = ethers.utils.parseEther("2000")
                  const expected = ethers.utils.parseEther("1.111111111111111111")
                  const actual = await pool.convertTokenAmount(
                      usdcAmount,
                      usdc.address,
                      weth.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the receive token balance if send token balance is zero", async function () {
                  await fundContract("0", "16000")
                  const wethAmount = ethers.utils.parseEther("2")
                  const expected = ethers.utils.parseEther("16000")
                  const actual = await pool.convertTokenAmount(
                      wethAmount,
                      weth.address,
                      usdc.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("reverts if receive balance is zero", async function () {
                  const wethAmount = ethers.utils.parseEther("2")
                  await expect(
                      pool.convertTokenAmount(wethAmount, weth.address, usdc.address)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
              })
          })

          /* Internal functions */

          // Internal function: to test, change to public and remove 'skip'
          describe("[Internal] calculateCurrentSwapPrice", function () {
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
                  assert.equal(actual.toString(), expected.toString())
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
          describe("[Internal] getContractBalance", function () {
              it("returns the correct amount of WETH", async function () {
                  await fundContract("10", "0")
                  const sendAddress = pool.getWethAddress()
                  const expected = ethers.utils.parseEther("10")
                  const actual = await pool.getContractBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of USDC", async function () {
                  await fundContract("0", "16000")
                  const sendAddress = pool.getUsdcAddress()
                  const expected = ethers.utils.parseEther("16000")
                  const actual = await pool.getContractBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          describe("[Internal] requestApprovalFromSender", function () {
              it("gets approval from sender", async function () {
                  const sendTokenAmount = ethers.utils.parseEther("2")
                  await pool.requestApprovalFromSender(weth.address, sendTokenAmount, sender)
                  const actualApprovedAmount = await weth.allowance(pool.address, sender)
                  assert.equal(actualApprovedAmount.toString(), sendTokenAmount.toString())
              })
          })
      })
