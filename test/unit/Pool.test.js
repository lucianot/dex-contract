const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains, getNamedAccounts } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, sender, mockV3Aggregator, usdcEthLatestPrice

          async function fundAddress(toAddress, wethAmount, usdcAmount) {
              // fund account with WETH
              await weth.transfer(toAddress, utils.parseEther(wethAmount))

              // fund account with USDC
              await usdc.transfer(toAddress, utils.parseEther(usdcAmount))
          }

          beforeEach(async function () {
              // connect to Pool
              ;[deployer, sender] = await ethers.getSigners()
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

              // set constant
              await pool._setPriceConstant(utils.parseEther("160000"))
          })

          // Swap
          describe("swap", function () {
              let sendTokenAmount

              describe("valid", function () {
                  beforeEach(async function () {
                      sendTokenAmount = utils.parseEther("2") // 2 WETH
                      // fund pool with tokens
                      await fundAddress(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await fundAddress(sender.address, utils.formatEther(sendTokenAmount), "0")
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                  })

                  it("transfers the correct amount of send tokens to pool", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "ETH")
                      const actualBalance = await weth.balanceOf(pool.address)
                      const expectedBalance = utils.parseEther("12")
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("transfers the correct amount of receive tokens to sender", async function () {
                      await pool.connect(sender).swap(sendTokenAmount, "ETH")
                      const actualBalance = await usdc.balanceOf(sender.getAddress())
                      const expectedBalance = utils.parseEther("2666.666666666666666667")
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).swap(sendTokenAmount, "ETH"))
                          .to.emit(pool, "SwapCompleted")
                          .withArgs(utils.parseEther("2666.666666666666666667"))
                  })
              })

              describe("invalid", function () {
                  beforeEach(async function () {
                      sendTokenAmount = utils.parseEther("2") // 2 WETH
                  })

                  it("reverts if sender does not have enough send tokens", async function () {
                      // fund pool with tokens
                      await fundAddress(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "ETH")
                      ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
                  })

                  it("reverts if pool does not have enough receive tokens", async function () {
                      // fund sender with WETH
                      await fundAddress(
                          sender.getAddress(),
                          utils.formatEther(sendTokenAmount),
                          "0"
                      )
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, sendTokenAmount)
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "ETH")
                      ).to.be.revertedWith("Pool__ReceiveBalanceZero()")
                  })

                  it("reverts if pool does not have enough allowance", async function () {
                      // fund pool with tokens
                      await fundAddress(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await fundAddress(sender.address, utils.formatEther(sendTokenAmount), "0")
                      // do not approve Pool contract to spend sender's WETH
                      await expect(
                          pool.connect(sender).swap(sendTokenAmount, "ETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })
              })
          })

          // Deposit
          describe("deposit", function () {
              describe("valid", function () {
                  let wethAmount, usdcAmount

                  beforeEach(async function () {
                      wethAmount = utils.parseEther("2") // 2 WETH
                      usdcAmount = utils.parseEther("4000") // 4_000 USDC
                      // fund pool with tokens
                      await fundAddress(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await fundAddress(
                          sender.address,
                          utils.formatEther(wethAmount),
                          utils.formatEther(usdcAmount)
                      )
                      // approve Pool contract to spend sender's WETH
                      await weth.connect(sender).approve(pool.address, wethAmount)
                      // approve Pool contract to spend sender's USDC
                      await usdc.connect(sender).approve(pool.address, usdcAmount)
                  })

                  // WETH
                  it("transfers WETH from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "ETH")
                      const expected = utils.parseEther("12")
                      const actual = await weth.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("transfers USDC from depositor to pool", async function () {
                      await pool.connect(sender).deposit(wethAmount, "ETH")
                      const expected = utils.parseEther("20000")
                      const actual = await usdc.balanceOf(pool.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("mints LP tokens to depositor", async function () {
                      await pool.connect(sender).deposit(wethAmount, "ETH")
                      const expected = utils.parseEther("8000")
                      const actual = await lpToken.balanceOf(sender.address)
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("updates the constant", async function () {
                      await pool.connect(sender).deposit(wethAmount, "ETH")
                      const expected = utils.parseEther("240000")
                      const actual = await pool.getPriceConstant()
                      assert.equal(actual.toString(), expected.toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).deposit(wethAmount, "ETH")).to.emit(
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
                      const expected = utils.parseEther("20000")
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
                      await fundAddress(pool.address, "10", "16000") // 10 WETH, 16_000 USDC
                      // fund sender with WETH
                      await fundAddress(
                          sender.address,
                          utils.formatEther(wethAmount),
                          utils.formatEther(usdcAmount)
                      )
                  })

                  it("reverts if pool does not have enough allowance for WETH", async function () {
                      // approve Pool contract to spend sender's USDC
                      await usdc.connect(sender).approve(pool.address, usdcAmount)
                      await expect(
                          pool.connect(sender).deposit(wethAmount, "ETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })

                  it("reverts if pool does not have enough allowance for USDC", async function () {
                      // approve Pool contract to spend sender's USDC
                      await weth.connect(sender).approve(pool.address, wethAmount)
                      await expect(
                          pool.connect(sender).deposit(wethAmount, "ETH")
                      ).to.be.revertedWith("ERC20: insufficient allowance")
                  })
              })
          })

          // ConvertTokenAmount
          describe("convertTokenAmount", function () {
              it("returns the correct amount of USDC", async function () {
                  await fundAddress(pool.address, "10", "16000")
                  const wethAmount = utils.parseEther("2")
                  const expected = utils.parseEther("2666.666666666666666667")
                  const actual = await pool.convertTokenAmount(
                      wethAmount,
                      weth.address,
                      usdc.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of WETH", async function () {
                  await fundAddress(pool.address, "10", "16000")
                  const usdcAmount = utils.parseEther("2000")
                  const expected = utils.parseEther("1.111111111111111112")
                  const actual = await pool.convertTokenAmount(
                      usdcAmount,
                      usdc.address,
                      weth.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("reverts if receive balance is zero", async function () {
                  const wethAmount = utils.parseEther("2")
                  await expect(
                      pool.convertTokenAmount(wethAmount, weth.address, usdc.address)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
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
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_getContractBalance", function () {
              it("returns the correct amount of WETH", async function () {
                  await fundAddress(pool.address, "10", "0")
                  const sendAddress = pool.getWethAddress()
                  const expected = utils.parseEther("10")
                  const actual = await pool._getContractBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the correct amount of USDC", async function () {
                  await fundAddress(pool.address, "0", "16000")
                  const sendAddress = pool.getUsdcAddress()
                  const expected = utils.parseEther("16000")
                  const actual = await pool._getContractBalance(sendAddress)
                  assert.equal(actual.toString(), expected.toString())
              })
          })

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
          describe("_getLatestPrice", function () {
              it("returns the current price of pair", async function () {
                  const actual = await pool._getLatestPrice()
                  assert.equal(actual.toString(), usdcEthLatestPrice.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_requestApprovalFromSender", function () {
              it("gets approval from sender", async function () {
                  const sendTokenAmount = utils.parseEther("2")
                  await pool._requestApprovalFromSender(
                      weth.address,
                      sendTokenAmount,
                      sender.address
                  )
                  const actualApprovedAmount = await weth.allowance(pool.address, sender.address)
                  assert.equal(actualApprovedAmount.toString(), sendTokenAmount.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_receiveTokenFromSender", function () {
              let currentContractBalance, transferAmount

              beforeEach(async function () {
                  currentContractBalance = utils.parseEther("10")
                  transferAmount = utils.parseEther("2")
                  await fundAddress(pool.address, utils.formatEther(currentContractBalance), "0")
                  await weth.connect(sender).approve(pool.address, transferAmount)
              })

              it("transfers token from sender to contract", async function () {
                  // fund sender with WETH
                  await fundAddress(sender.address, utils.formatEther(transferAmount), "0")
                  await pool._receiveTokenFromSender(weth.address, sender.address, transferAmount)
                  const expectedContractBalance = currentContractBalance.add(transferAmount)
                  const actualContractBalance = await weth.balanceOf(pool.address)
                  assert.equal(actualContractBalance.toString(), expectedContractBalance.toString())
              })

              it("reverts if sender does not have enough token", async function () {
                  await expect(
                      pool._receiveTokenFromSender(weth.address, sender.address, transferAmount)
                  ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_sendTokenToSender", function () {
              let currentContractBalance, transferAmount

              beforeEach(async function () {
                  currentContractBalance = utils.parseEther("16000")
                  transferAmount = utils.parseEther("2000")
              })

              it("transfers token from contract to sender", async function () {
                  // fund sender with USDC
                  await fundAddress(pool.address, "0", utils.formatEther(currentContractBalance))
                  await pool._sendTokenToSender(usdc.address, sender.address, transferAmount)
                  const expectedContractBalance = currentContractBalance.sub(transferAmount)
                  const actualContractBalance = await usdc.balanceOf(pool.address)
                  assert.equal(actualContractBalance.toString(), expectedContractBalance.toString())
              })

              it("reverts if pool does not have enough token", async function () {
                  await expect(
                      pool._sendTokenToSender(usdc.address, sender.address, transferAmount)
                  ).to.be.revertedWith("ERC20: transfer amount exceeds balance")
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe("_getTokenAddresses", function () {
              it("returns the correct addresses", async function () {
                  const result = await pool._getTokenAddresses("ETH")
                  const { 0: sendAddress, 1: receiveAddress } = result
                  assert.equal(sendAddress, weth.address)
                  assert.equal(receiveAddress, usdc.address)
              })

              it("returns the correct addresses", async function () {
                  const result = await pool._getTokenAddresses("USDC")
                  const { 0: sendAddress, 1: receiveAddress } = result
                  assert.equal(sendAddress, usdc.address)
                  assert.equal(receiveAddress, weth.address)
              })

              it("reverts if ticker is invalid", async function () {
                  await expect(pool._getTokenAddresses("XYZ")).to.be.revertedWith(
                      "Pool__InvalidTicker"
                  )
              })
          })
      })
