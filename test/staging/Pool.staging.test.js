const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, sender, mockV3Aggregator, usdcEthLatestPrice

          async function setupTransferTo(toAddress, wethAmount, usdcAmount) {
              // fund account with WETH
              await weth.transfer(toAddress, utils.parseEther(wethAmount))
              // fund account with USDC
              await usdc.transfer(toAddress, utils.parseEther(usdcAmount))
          }

          async function setupDepositFrom(depositor, wethAmount, usdcAmount, isDeposit) {
              const wethAmountInWei = utils.parseEther(wethAmount)
              const usdcAmountInWei = utils.parseEther(usdcAmount)
              // fund farmer with tokens
              await setupTransferTo(depositor.address, wethAmount, usdcAmount)
              // approve Pool contract to spend sender's WETH
              await weth.connect(depositor).approve(pool.address, wethAmountInWei)
              // approve Pool contract to spend sender's USDC
              await usdc.connect(depositor).approve(pool.address, usdcAmountInWei)
              // deposit if requested
              if (isDeposit) {
                  await pool.connect(depositor).deposit(wethAmountInWei, "WETH")
                  // approve lpTokens?
              }
          }

          async function getBalances(signer) {
              const wethBalance = await weth.balanceOf(signer.address)
              const usdcBalance = await usdc.balanceOf(signer.address)
              const lpTokenBalance = await lpToken.balanceOf(signer.address)
              return [wethBalance, usdcBalance, lpTokenBalance]
          }

          describe("Pool Integration Tests", function () {
              beforeEach(async function () {
                  // connect to Pool
                  ;[deployer, sender, yieldFarmer] = await ethers.getSigners()
                  await deployments.fixture(["all", "pool"])
                  pool = await ethers.getContract("Pool", deployer)

                  // connect to tokens
                  weth = await ethers.getContract("WethToken", deployer)
                  usdc = await ethers.getContract("UsdcToken", deployer)
                  lpToken = await ethers.getContract("LiquidityPoolToken", deployer)

                  // connect to mock oracle and update price
                  mockV3Aggregator = await ethers.getContract("MockV3Aggregator", deployer)
                  usdcEthLatestPrice = utils.parseEther("0.0005") // ETH = 2_000 USDC
                  await mockV3Aggregator.updateAnswer(usdcEthLatestPrice)

                  // initial deposit in Pool from yieldFarmer
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
              })

              it("user successfully deposits token, completes swap, then withdraws funds", async function () {
                  // get deposit amounts
                  console.log("Checking amounts to deposit...")
                  const wethDepositAmount = utils.parseEther("10")
                  const [wethAmount, usdcAmount] = await pool.getDepositAmounts(
                      "WETH",
                      wethDepositAmount
                  )
                  assert.equal(wethAmount.toString(), wethDepositAmount.toString())
                  assert.equal(usdcAmount.toString(), utils.parseEther("20000").toString())

                  // deposit into Pool
                  console.log("Sender depositing...")
                  await setupDepositFrom(sender, "10", "20000", false)
                  await pool.connect(sender).deposit(utils.parseEther("5"), "WETH")

                  // assert that sender balances are correct
                  console.log("Checking sender balances after deposit...")
                  let senderBalances = await getBalances(sender)
                  assert.equal(senderBalances[0].toString(), utils.parseEther("5").toString())
                  assert.equal(senderBalances[1].toString(), utils.parseEther("10000").toString())
                  assert.equal(senderBalances[2].toString(), utils.parseEther("20000").toString())

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after deposit...")
                  let poolBalances = await getBalances(pool)
                  assert.equal(poolBalances[0].toString(), utils.parseEther("15").toString())
                  assert.equal(poolBalances[1].toString(), utils.parseEther("30000").toString())
                  assert.equal(
                      (await lpToken.totalSupply()).toString(),
                      utils.parseEther("60000").toString()
                  )

                  // check swap amount
                  console.log("Checking swap prices...")
                  const swapAmount = utils.parseEther("1")
                  const expectedPrice = utils.parseEther("1875")
                  const [receiveTokenAmount, swapPrice] = await pool.getSwapData("WETH", swapAmount)
                  assert.equal(receiveTokenAmount.toString(), expectedPrice.toString())
                  assert.equal(swapPrice.toString(), expectedPrice.toString())

                  // sender swaps USDC for WETH
                  console.log("Sender swapping tokens...")
                  await pool.connect(sender).swap(swapAmount, "WETH")

                  // assert that sender balances are correct
                  console.log("Checking sender balances after swap...")
                  senderBalances = await getBalances(sender)
                  assert.equal(senderBalances[0].toString(), utils.parseEther("4").toString())
                  assert.equal(senderBalances[1].toString(), utils.parseEther("11875").toString())
                  assert.equal(senderBalances[2].toString(), utils.parseEther("20000").toString())

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after swap...")
                  poolBalances = await getBalances(pool)
                  assert.equal(poolBalances[0].toString(), utils.parseEther("16").toString())
                  assert.equal(poolBalances[1].toString(), utils.parseEther("28125").toString())
                  assert.equal(
                      (await lpToken.totalSupply()).toString(),
                      utils.parseEther("60000").toString()
                  )

                  // sender withdraws from Pool
                  console.log("Sender withdrawing liquidity...")
                  await pool.connect(sender).withdraw(utils.parseEther("0.12"))

                  // assert that sender balances are correct
                  console.log("Checking sender balances after withdraw...")
                  senderBalances = await getBalances(sender)
                  assert.equal(senderBalances[0].toString(), utils.parseEther("4.64").toString())
                  assert.equal(senderBalances[1].toString(), utils.parseEther("13000").toString())
                  assert.equal(senderBalances[2].toString(), utils.parseEther("17600").toString())

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after withdraw...")
                  poolBalances = await getBalances(pool)
                  assert.equal(poolBalances[0].toString(), utils.parseEther("15.36").toString())
                  assert.equal(poolBalances[1].toString(), utils.parseEther("27000").toString())
                  assert.equal(
                      (await lpToken.totalSupply()).toString(),
                      utils.parseEther("57600").toString()
                  )

                  // check sender's balances
                  console.log("Getting user account data...")
                  const accountData = await pool.getUserAccountData(sender.address)
                  assert.equal(
                      accountData[0].toString(),
                      utils.parseEther("0.305555555555555555").toString()
                  )
                  assert.equal(
                      accountData[1].toString(),
                      utils.parseEther("4.693333333333333324").toString()
                  )
                  assert.equal(
                      accountData[2].toString(),
                      utils.parseEther("8249.999999999999985").toString()
                  )
              })
          })
      })
