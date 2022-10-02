const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils, BigNumber } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool,
              weth,
              usdc,
              deployer,
              sender,
              mockV3Aggregator,
              usdcEthLatestPrice,
              wethDecimals,
              usdcDecimals

          async function setupTransferTo(toAddress, wethAmount, usdcAmount) {
              // fund account with WETH
              await weth.transfer(toAddress, utils.parseUnits(wethAmount, wethDecimals))
              // fund account with USDC
              await usdc.transfer(toAddress, utils.parseUnits(usdcAmount, usdcDecimals))
          }

          async function setupDepositFrom(depositor, wethAmount, usdcAmount, isDeposit) {
              const wethAmountInUnits = utils.parseUnits(wethAmount, wethDecimals)
              const usdcAmountInUnits = utils.parseUnits(usdcAmount, usdcDecimals)
              // fund farmer with tokens
              await setupTransferTo(depositor.address, wethAmount, usdcAmount)
              // approve Pool contract to spend sender's WETH
              await weth.connect(depositor).approve(pool.address, wethAmountInUnits)
              // approve Pool contract to spend sender's USDC
              await usdc.connect(depositor).approve(pool.address, usdcAmountInUnits)
              // deposit if requested
              if (isDeposit) {
                  await pool.connect(depositor).deposit(wethAmountInUnits, "WETH")
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
              usdcEthLatestPrice = utils.parseUnits("2000", 8) // 2 * 1e8
              await mockV3Aggregator.updateAnswer(usdcEthLatestPrice)

              // get decimals
              wethDecimals = await pool.getWethDecimals()
              usdcDecimals = await pool.getUsdcDecimals()
          })

          // Deposit
          describe("deposit", function () {
              describe("valid", function () {
                  let wethAmount, usdcAmount

                  beforeEach(async function () {
                      wethAmount = utils.parseUnits("2", wethDecimals) // 2 WETH
                      usdcAmount = utils.parseUnits("4000", usdcDecimals) // 4_000 USDC
                      // deposit into Pool 10 WETH, 20_000 USDC
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      // fund sender with tokens
                      await setupDepositFrom(
                          sender,
                          utils.formatUnits(wethAmount, wethDecimals),
                          utils.formatUnits(usdcAmount, usdcDecimals),
                          false
                      )
                  })

                  // WETH
                  it("transfers WETH from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseUnits("12", wethDecimals)
                      const actual = await weth.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseUnits("24000", usdcDecimals)
                      const actual = await usdc.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("mints LP tokens to depositor", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseUnits("8000", 18)
                      const actual = await lpToken.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("updates the constant", async function () {
                      await pool.connect(sender).deposit(wethAmount, "WETH")
                      const expected = utils.parseUnits("288000", 36)
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
                      const expected = utils.parseUnits("12", wethDecimals)
                      const actual = await weth.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from depositor to pool", async function () {
                      await pool.connect(sender).deposit(usdcAmount, "USDC")
                      const expected = utils.parseUnits("24000", usdcDecimals)
                      const actual = await usdc.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })
              })

              describe("invalid", function () {
                  let wethAmount, usdcAmount

                  beforeEach(async function () {
                      wethAmount = utils.parseUnits("2", wethDecimals) // 2 WETH
                      usdcAmount = utils.parseUnits("4000", usdcDecimals) // 4_000 USDC
                      // fund pool with tokens
                      await setupTransferTo(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await setupTransferTo(
                          sender.address,
                          utils.formatUnits(wethAmount, wethDecimals),
                          utils.formatUnits(usdcAmount, usdcDecimals)
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
                      // deposit into Pool 10 WETH, 20_000 USDC
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)
                      // fund sender with tokens
                      await setupDepositFrom(sender, "2", "4000", true)
                      // Approve pool to burn lpTokens
                      percentOfDepositToWithdraw = utils.parseUnits("0.6", 18)
                  })

                  it("burns the depositor liquidity pool tokens", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseUnits("3200", 18)
                      const actual = await lpToken.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers WETH from pool to depositor", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseUnits("1.2", wethDecimals)
                      const actual = await weth.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from pool to depositor", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseUnits("2400", usdcDecimals)
                      const actual = await usdc.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("updates the constant", async function () {
                      await pool.connect(sender).withdraw(percentOfDepositToWithdraw)
                      const expected = utils.parseUnits("233280", 36)
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
                          pool.connect(sender).withdraw(utils.parseUnits("1.0001", 18))
                      ).to.revertedWith("Pool__InvalidWithdrawPercentage")
                  })
              })
          })

          // Swap
          describe("swap", function () {
              let sendTokenAmount

              describe("valid", function () {
                  beforeEach(async function () {
                      sendTokenAmount = utils.parseUnits("2", wethDecimals) // 2 WETH

                      // deposit into Pool
                      await setupDepositFrom(yieldFarmer, "10", "20000", true)

                      // fund sender with WETH
                      await setupTransferTo(
                          sender.address,
                          utils.formatUnits(sendTokenAmount, wethDecimals),
                          "0"
                      )
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                  })

                  it("transfers the correct amount of send tokens to pool", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "WETH")
                      const actualBalance = await weth.balanceOf(pool.address)
                      const expectedBalance = utils.parseUnits("12", wethDecimals)
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("transfers the correct amount of receive tokens to sender", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "WETH")
                      const actualBalance = await usdc.balanceOf(sender.getAddress())
                      const expected = BigNumber.from(10000)
                          .mul(BigNumber.from(10).pow(usdcDecimals))
                          .div(3)
                      assert.equal(actualBalance.div(10).toString(), expected.div(10).toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).swap(sendTokenAmount, "WETH")).to.emit(
                          pool,
                          "SwapCompleted"
                      )
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
                          utils.formatUnits(sendTokenAmount, wethDecimals),
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
                      await setupTransferTo(
                          sender.address,
                          utils.formatUnits(sendTokenAmount, wethDecimals),
                          "0"
                      )
                      // do not approve Pool contract to spend sender's WETH
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "WETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })

                  it("reverts if token ticker is invalid", async function () {
                      // fund pool with tokens
                      await setupTransferTo(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await setupTransferTo(
                          sender.address,
                          utils.formatUnits(sendTokenAmount, wethDecimals),
                          "0"
                      )
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
                      const wethAmount = utils.parseUnits("6", wethDecimals)
                      const expected = utils.parseUnits("7500", usdcDecimals)
                      const actual = await pool.getSwapData("WETH", wethAmount)
                      assert.equal(actual[0].toString(), expected.toString())
                  })

                  it("returns the correct price of USDC/ETH", async function () {
                      const wethAmount = utils.parseUnits("6", wethDecimals)
                      const expected = utils.parseUnits("1250", 18)
                      const actual = await pool.getSwapData("WETH", wethAmount)
                      assert.equal(actual[1].toString(), expected.toString())
                  })

                  it("returns the correct amount of WETH", async function () {
                      const usdcAmount = utils.parseUnits("5000", usdcDecimals)
                      const expected = utils.parseUnits("2", wethDecimals)
                      const actual = await pool.getSwapData("USDC", usdcAmount)
                      assert.equal(actual[0].toString(), expected.toString())
                  })

                  it("returns the correct price of ETH/USDC", async function () {
                      const usdcAmount = utils.parseUnits("5000", usdcDecimals)
                      const expected = utils.parseUnits("0.0004", 18)
                      const actual = await pool.getSwapData("USDC", usdcAmount)
                      assert.equal(actual[1].toString(), expected.toString())
                  })
              })

              describe("invalid", function () {
                  it("reverts if receive balance is zero", async function () {
                      const wethAmount = utils.parseUnits("2", wethDecimals)
                      await expect(pool.getSwapData("WETH", wethAmount)).to.be.revertedWith(
                          "Pool__ReceiveBalanceZero"
                      )
                  })
              })
          })

          // GetDepositAmounts
          describe("getDepositAmounts", function () {
              let wethDepositAmount, usdcDepositAmount

              beforeEach(async function () {
                  wethDepositAmount = utils.parseUnits("0.2", wethDecimals)
                  usdcDepositAmount = utils.parseUnits("400", usdcDecimals)
              })

              describe("valid", function () {
                  it("send WETH, returns the correct amount of WETH", async function () {
                      const [wethAmount, _] = await pool.getDepositAmounts(
                          "WETH",
                          wethDepositAmount
                      )
                      assert.equal(wethAmount.toString(), wethDepositAmount.toString())
                  })

                  it("send WETH, returns the correct amount of USDC", async function () {
                      const [_, usdcAmount] = await pool.getDepositAmounts(
                          "WETH",
                          wethDepositAmount
                      )
                      assert.equal(usdcAmount.toString(), usdcDepositAmount.toString())
                  })

                  it("send USDC, returns the correct amount of WETH", async function () {
                      const [wethAmount, _] = await pool.getDepositAmounts(
                          "USDC",
                          usdcDepositAmount
                      )
                      assert.equal(wethAmount.toString(), wethDepositAmount.toString())
                  })

                  it("send USDC, returns the correct amount of USDC", async function () {
                      const [_, usdcAmount] = await pool.getDepositAmounts(
                          "USDC",
                          usdcDepositAmount
                      )
                      assert.equal(usdcAmount.toString(), usdcDepositAmount.toString())
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
                      const expected = utils.parseUnits("0.2", 18)
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[0].toString(), expected.toString())
                  })
                  it("returns the user share of WETH", async function () {
                      const expected = utils.parseUnits("2.5", wethDecimals)
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[1].toString(), expected.toString())
                  })
                  it("returns the user share of USDC", async function () {
                      const expected = utils.parseUnits("5000", usdcDecimals)
                      const actual = await pool.getUserAccountData(sender.address)
                      assert.equal(actual[2].toString(), expected.toString())
                  })
              })

              it("returns zero WETH when user has no deposit", async function () {
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  const expected = utils.parseUnits("0", wethDecimals)
                  const actual = await pool.getUserAccountData(sender.address)
                  assert.equal(actual[1].toString(), expected.toString())
              })

              it("returns zero WETH when the pool is empty", async function () {
                  const expected = utils.parseUnits("0", wethDecimals)
                  const actual = await pool.getUserAccountData(sender.address)
                  assert.equal(actual[1].toString(), expected.toString())
              })
          })

          /* Internal functions */

          // Internal function: to test, change to public and remove 'skip'
          describe("_calculateSwapAmount", function () {
              it("returns the correct amount to swap - WETH", async function () {
                  const sendAmount = utils.parseUnits("2", wethDecimals)
                  const sendBalance = utils.parseUnits("10", wethDecimals)
                  const receiveBalance = utils.parseUnits("16000", usdcDecimals)
                  const k = utils.parseUnits("160000", 36)
                  const expected = BigNumber.from(8000)
                      .mul(BigNumber.from(10).pow(usdcDecimals))
                      .div(3)
                  const actual = await pool._calculateSwapAmount(
                      sendAmount,
                      sendBalance,
                      receiveBalance,
                      k,
                      wethDecimals,
                      usdcDecimals
                  )
                  assert.equal(actual.div(10).toString(), expected.div(10).toString())
              })

              it("returns the correct amount to swap - USDC", async function () {
                  const sendAmount = utils.parseUnits("40", usdcDecimals)
                  const sendBalance = utils.parseUnits("200", usdcDecimals)
                  const receiveBalance = utils.parseUnits("200", wethDecimals)
                  const k = utils.parseUnits("40000", 36)
                  const expected = BigNumber.from(100)
                      .mul(BigNumber.from(10).pow(wethDecimals))
                      .div(3)
                  const actual = await pool._calculateSwapAmount(
                      sendAmount,
                      sendBalance,
                      receiveBalance,
                      k,
                      usdcDecimals,
                      wethDecimals
                  )
                  assert.equal(actual.div(10).toString(), expected.div(10).toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_calculateSwapPrice", function () {
              it("returns the correct swap price - WETH", async function () {
                  const sendAmount = utils.parseUnits("2", wethDecimals)
                  const receiveAmount = BigNumber.from(8000)
                      .mul(BigNumber.from(10).pow(usdcDecimals))
                      .div(3) // 2666.666666
                  const sendDecimals = wethDecimals
                  const receiveDecimals = usdcDecimals
                  const expected = receiveAmount
                      .mul(BigNumber.from(10).pow(18))
                      .mul(BigNumber.from(10).pow(sendDecimals))
                      .div(sendAmount)
                      .div(BigNumber.from(10).pow(receiveDecimals))
                  const actual = await pool._calculateSwapPrice(
                      sendAmount,
                      receiveAmount,
                      sendDecimals,
                      receiveDecimals
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct swap price - USDC", async function () {
                  const sendAmount = BigNumber.from(8000)
                      .mul(BigNumber.from(10).pow(usdcDecimals))
                      .div(3) // 2666.666666
                  const receiveAmount = utils.parseUnits("2", wethDecimals)
                  const sendDecimals = wethDecimals
                  const receiveDecimals = usdcDecimals
                  const expected = receiveAmount
                      .mul(BigNumber.from(10).pow(18))
                      .mul(BigNumber.from(10).pow(sendDecimals))
                      .div(sendAmount)
                      .div(BigNumber.from(10).pow(receiveDecimals))
                  //   const expected = BigNumber.from(3).mul(BigNumber.from(10).pow(18)).div(4000) // 0.00075
                  const actual = await pool._calculateSwapPrice(
                      sendAmount,
                      receiveAmount,
                      sendDecimals,
                      receiveDecimals
                  )
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_mintLiquidityPoolTokens", function () {
              it("mints the correct amount of liquidity pool tokens", async function () {
                  const usdcAmount = utils.parseUnits("2000", usdcDecimals)
                  await pool.connect(sender)._mintLiquidityPoolTokens(usdcAmount)
                  const expected = usdcAmount
                      .mul(2)
                      .mul(BigNumber.from(10).pow(18))
                      .div(BigNumber.from(10).pow(usdcDecimals))
                  const actual = await lpToken.balanceOf(sender.getAddress())
                  assert.equal(actual.toString(), expected.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_burnLiquidityPoolTokens", function () {
              it("burns the correct amount of lpTokens from depositor", async function () {
                  // Setup Pool balances
                  const wethAmount = utils.parseUnits("2", wethDecimals) // 2 WETH
                  const usdcAmount = utils.parseUnits("4000", usdcDecimals) // 4_000 USDC
                  // deposit into Pool 10 WETH, 20_000 USDC
                  await setupDepositFrom(yieldFarmer, "10", "20000", true)
                  // fund sender with tokens
                  await setupDepositFrom(
                      sender,
                      utils.formatUnits(wethAmount, wethDecimals),
                      utils.formatUnits(usdcAmount, usdcDecimals),
                      true
                  )
                  // Approve pool to burn lpTokens
                  const lpTokenAmount = utils.parseUnits("2000", 18) // 2_000 lpTokens

                  await pool.connect(sender)._burnLiquidityPoolTokens(lpTokenAmount)
                  const expected = utils.parseUnits("6000", 18)
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

          describe("_updateConstant", function () {
              it("return the correct value", async function () {
                  const wethAmount = utils.parseUnits("10", wethDecimals)
                  const usdcAmount = utils.parseUnits("20000", usdcDecimals)
                  await pool._updateConstant(wethAmount, usdcAmount)
                  const actual = await pool.getPriceConstant()
                  const expected = wethAmount
                      .mul(usdcAmount)
                      .mul(BigNumber.from(10).pow(BigNumber.from(36)))
                      .div(BigNumber.from(10).pow(BigNumber.from(wethDecimals)))
                      .div(BigNumber.from(10).pow(BigNumber.from(usdcDecimals)))
                  assert.equal(actual.toString(), expected.toString())
              })
          })
      })
