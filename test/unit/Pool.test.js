const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
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
              }
          }

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
          })

          // Deposit
          describe("deposit", function () {
              describe("valid", function () {
                  let wethAmount, usdcAmount

                  beforeEach(async function () {
                      wethAmount = utils.parseEther("2") // 2 WETH
                      usdcAmount = utils.parseEther("4000") // 4_000 USDC
                      // deposit into Pool 10 WETH, 20_000 USDC
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      // fund sender with tokens
                      await setupDepositFrom(
                          sender,
                          utils.formatEther(wethAmount),
                          utils.formatEther(usdcAmount),
                          false
                      )
                  })

                  // WETH
                  it("transfers WETH from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseEther("12")
                      const actual = await weth.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseEther("24000")
                      const actual = await usdc.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("mints LP tokens to depositor", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseEther("8000")
                      const actual = await lpToken.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("updates the constant", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseEther("288000")
                      const actual = await pool.getPriceConstant()
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).deposit(wethAmount, "WETH")).to.emit(
                          pool,
                          "DepositCompleted"
                      )
                  })

                  // USDC
                  it("transfers WETH from depositor to pool", async function () {
                      await pool.connect(sender).deposit(usdcAmount, "USDC")
                      const expected = utils.parseEther("12")
                      const actual = await weth.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from depositor to pool", async function () {
                      await pool.connect(sender).deposit(usdcAmount, "USDC")
                      const expected = utils.parseEther("24000")
                      const actual = await usdc.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })
              })

              describe("invalid", function () {
                  let wethAmount, usdcAmount

                  beforeEach(async function () {
                      wethAmount = utils.parseEther("2") // 2 WETH
                      usdcAmount = utils.parseEther("4000") // 4_000 USDC
                      // fund pool with tokens
                      await setupTransferTo(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await setupTransferTo(
                          sender.address,
                          utils.formatEther(wethAmount),
                          utils.formatEther(usdcAmount)
                      )
                  })

                  it("reverts if pool does not have enough allowance for WETH", async function () {
                      // approve Pool contract to spend sender's USDC
                      await usdc.connect(sender).approve(pool.address, usdcAmount)
                      await expect(
                          pool.connect(sender).deposit(wethAmount, "WETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })

                  it("reverts if pool does not have enough allowance for USDC", async function () {
                      // approve Pool contract to spend sender's USDC
                      await weth.connect(sender).approve(pool.address, wethAmount)
                      await expect(
                          pool.connect(sender).deposit(wethAmount, "WETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })

                  it("reverts if token ticker is invalid", async function () {
                      // approve Pool contract to spend sender's USDC
                      await weth.connect(sender).approve(pool.address, wethAmount)
                      await expect(
                          pool.connect(sender).deposit(wethAmount, "XYZ")
                      ).to.be.revertedWith("Pool__InvalidTicker")
                  })
              })
          })

          // Withdraw
          describe("withdraw", function () {
              describe("valid", function () {
                  let percentOfDepositToWithdraw

                  beforeEach(async function () {
                      const usdcAmount = utils.parseEther("4000") // 4_000 USDC
                      // deposit into Pool 10 WETH, 20_000 USDC
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      // fund sender with tokens
                      await setupDepositFrom(sender, "2", "4000", true)
                      // Approve pool to burn lpTokens
                      percentOfDepositToWithdraw = utils.parseEther("0.6")
                  })

                  it("burns the depositor liquidity pool tokens", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseEther("3200")
                      const actual = await lpToken.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers WETH from pool to depositor", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseEther("1.2")
                      const actual = await weth.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from pool to depositor", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseEther("2400")
                      const actual = await usdc.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("updates the constant", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseEther("233280")
                      const actual = await pool.getPriceConstant()
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("emits event", async function () {
                      await expect(
                          pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      ).to.emit(pool, "WithdrawCompleted")
                  })
              })

              describe("invalid", function () {
                  it("reverts if withdrawal percentage is too big", async function () {
                      await expect(
                          pool.connect(sender).withdraw(utils.parseEther("100.0001"))
                      ).to.revertedWith("Pool__InvalidWithdrawPercentage")
                  })
              })
          })

          // Swap
          describe("swap", function () {
              const sendTokenAmount = utils.parseEther("2")

              describe("valid", function () {
                  beforeEach(async function () {
                      // deposit into Pool
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      // fund sender with WETH
                      await setupTransferTo(sender.address, utils.formatEther(sendTokenAmount), "0")
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                  })

                  it("transfers the correct amount of send tokens to pool", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "WETH")
                      const actualBalance = await weth.balanceOf(pool.address)
                      const expectedBalance = utils.parseEther("12")
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("transfers the correct amount of receive tokens to sender", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "WETH")
                      const actualBalance = await usdc.balanceOf(sender.getAddress())
                      const expectedBalance = utils.parseEther("3333.333333333333333334")
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).swap(sendTokenAmount, "WETH"))
                          .to.emit(pool, "SwapCompleted")
                          .withArgs(utils.parseEther("3333.333333333333333334"))
                  })
              })

              describe("invalid", function () {
                  it("reverts if sender does not have enough send tokens", async function () {
                      await setupTransferTo(pool.address, "0", "1")
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "WETH")
                      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
                  })

                  it("reverts if pool does not have enough receive tokens", async function () {
                      // fund sender with WETH
                      await setupTransferTo(
                          sender.getAddress(),
                          utils.formatEther(sendTokenAmount),
                          "0"
                      )
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "WETH")
                      ).to.be.revertedWith("Pool__ReceiveBalanceZero()")
                  })

                  it("reverts if pool does not have enough allowance", async function () {
                      // fund pool with tokens
                      await setupTransferTo(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await setupTransferTo(sender.address, utils.formatEther(sendTokenAmount), "0")
                      // do not approve Pool contract to spend sender's WETH
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "WETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })

                  it("reverts if token ticker is invalid", async function () {
                      // fund pool with tokens
                      await setupTransferTo(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await setupTransferTo(sender.address, utils.formatEther(sendTokenAmount), "0")
                      // do not approve Pool contract to spend sender's WETH
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "XYZ")
                      ).to.be.revertedWith("Pool__InvalidTicker")
                  })
              })
          })

          // GetSwapData
          describe("getSwapData", function () {
              describe("valid", function () {
                  beforeEach(async function () {
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  })

                  it("returns the correct amount of USDC", async function () {
                      const wethAmount = utils.parseEther("6")
                      const expected = utils.parseEther("7500")
                      const actual = await pool.getSwapData("WETH", wethAmount)
                      assert.equal(actual[0].toString(), expected.toString())
                  })

                  it("returns the correct price of USDC/ETH", async function () {
                      const wethAmount = utils.parseEther("6")
                      const expected = utils.parseEther("1250")
                      const actual = await pool.getSwapData("WETH", wethAmount)
                      assert.equal(actual[1].toString(), expected.toString())
                  })

                  it("returns the correct amount of ETH", async function () {
                      const wethAmount = utils.parseEther("5000")
                      const expected = utils.parseEther("2")
                      const actual = await pool.getSwapData("USDC", wethAmount)
                      assert.equal(actual[0].toString(), expected.toString())
                  })

                  it("returns the correct price of ETH/USDC", async function () {
                      const wethAmount = utils.parseEther("5000")
                      const expected = utils.parseEther("0.0004")
                      const actual = await pool.getSwapData("USDC", wethAmount)
                      assert.equal(actual[1].toString(), expected.toString())
                  })
              })

              describe("invalid", function () {
                  it("reverts if receive balance is zero", async function () {
                      const wethAmount = utils.parseEther("2")
                      await expect(pool.getSwapData("WETH", wethAmount)).to.be.revertedWith(
                          "Pool__ReceiveBalanceZero"
                      )
                  })
              })
          })

          // GetDepositAmounts
          describe("getDepositAmounts", function () {
              let wethDepositAmount

              beforeEach(async function () {
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  wethDepositAmount = utils.parseEther("2")
              })

              describe("valid", function () {
                  it("returns the correct amount of WETH", async function () {
                      const [wethAmount, _] = await pool.getDepositAmounts(
                          "WETH",
                          wethDepositAmount
                      )
                      assert.equal(wethAmount.toString(), wethDepositAmount.toString())
                  })

                  it("returns the correct amount of USDC", async function () {
                      const [_, usdcAmount] = await pool.getDepositAmounts(
                          "WETH",
                          wethDepositAmount
                      )
                      assert.equal(usdcAmount.toString(), utils.parseEther("4000").toString())
                  })
              })

              describe("invalid", function () {
                  it("reverts if ticker is invalid", async function () {
                      await expect(
                          pool.getDepositAmounts("XYZ", wethDepositAmount)
                      ).to.be.revertedWith("Pool__InvalidTicker")
                  })
              })
          })

          // GetUserAccountData
          describe("getUserAccountData", function () {
              describe("valid", function () {
                  beforeEach(async function () {
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      await setupDepositFrom(sender, "2.5", "5000", true)
                  })

                  it("returns the user's share of pool", async function () {
                      const expected = utils.parseEther("0.2")
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[0].toString(), expected.toString())
                  })
                  it("returns the user share of WETH", async function () {
                      const expected = utils.parseEther("2.5")
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[1].toString(), expected.toString())
                  })
                  it("returns the user share of USDC", async function () {
                      const expected = utils.parseEther("5000")
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[2].toString(), expected.toString())
                  })
              })

              it("returns zero when user has no deposit", async function () {
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  const expected = utils.parseEther("0")
                  const actual = await pool.getUserAccountData(sender.address)
                  assert.equal(actual[1].toString(), expected.toString())
              })

              it("returns zero when the pool is empty", async function () {
                  const expected = utils.parseEther("0")
                  const actual = await pool.getUserAccountData(sender.address)
                  assert.equal(actual[1].toString(), expected.toString())
              })
          })

          /* Internal functions */

          // Internal function: to test, change to public and remove 'skip'
          describe("_calculateSwapAmount", function () {
              it("returns the correct amount to swap", async function () {
                  const sendAmount = utils.parseEther("2")
                  const sendBalance = utils.parseEther("10")
                  const receiveBalance = utils.parseEther("16000")
                  const k = utils.parseEther("160000")
                  const expected = utils.parseEther("2666.666666666666666667")
                  const actual = await pool._calculateSwapAmount(
                      sendAmount,
                      sendBalance,
                      receiveBalance,
                      k
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount to swap", async function () {
                  const sendAmount = utils.parseEther("40")
                  const sendBalance = utils.parseEther("200")
                  const receiveBalance = utils.parseEther("200")
                  const k = utils.parseEther("40000")
                  const expected = utils.parseEther("33.333333333333333334")
                  const actual = await pool._calculateSwapAmount(
                      sendAmount,
                      sendBalance,
                      receiveBalance,
                      k
                  )
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_mintLiquidityPoolTokens", function () {
              it("mints the correct amount of liquidity pool tokens", async function () {
                  const usdcAmount = utils.parseEther("2000")
                  await pool.connect(sender)._mintLiquidityPoolTokens(usdcAmount)
                  const expected = usdcAmount.mul(2)
                  const actual = await lpToken.balanceOf(sender.getAddress())
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_burnLiquidityPoolTokens", function () {
              it("burns the correct amount of lpTokens from depositor", async function () {
                  // Setup Pool balances
                  const wethAmount = utils.parseEther("2") // 2 WETH
                  const usdcAmount = utils.parseEther("4000") // 4_000 USDC
                  // deposit into Pool 10 WETH, 20_000 USDC
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  // fund sender with tokens
                  await setupDepositFrom(
                      sender,
                      utils.formatEther(wethAmount),
                      utils.formatEther(usdcAmount),
                      true
                  )
                  // Approve pool to burn lpTokens
                  const lpTokenAmount = utils.parseEther("2000") // 2_000 lpTokens

                  await pool.connect(sender)._burnLiquidityPoolTokens(lpTokenAmount)
                  const expected = utils.parseEther("6000")
                  const actual = await lpToken.balanceOf(sender.getAddress())
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_getLatestPrice", function () {
              it("returns the current price of pair", async function () {
                  const actual = await pool._getLatestPrice()
                  assert.equal(actual.toString(), usdcEthLatestPrice.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_getTokens", function () {
              it("returns the correct contract interface", async function () {
                  const result = await pool._getTokens("WETH")
                  const { 0: sendToken, 1: receiveToken } = result
                  const expectedSendToken = await pool.getWethToken()
                  const expectedReceiveToken = await pool.getUsdcToken()
                  assert.equal(sendToken, expectedSendToken)
                  assert.equal(receiveToken, expectedReceiveToken)
              })

              it("returns the correct addresses", async function () {
                  const result = await pool._getTokens("USDC")
                  const { 0: sendToken, 1: receiveToken } = result
                  const expectedSendToken = await pool.getUsdcToken()
                  const expectedReceiveToken = await pool.getWethToken()
                  assert.equal(sendToken, expectedSendToken)
                  assert.equal(receiveToken, expectedReceiveToken)
              })

              it("reverts if ticker is invalid", async function () {
                  await expect(pool._getTokens("XYZ")).to.be.revertedWith("Pool__InvalidTicker")
              })
          })
      })
