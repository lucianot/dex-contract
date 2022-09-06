const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, sender

          async function fundAddress(toAddress, wethAmount, usdcAmount) {
              // fund Pool contract with WETH
              await weth.transfer(toAddress, utils.parseEther(wethAmount))

              // fund Pool contract with USDC
              await usdc.transfer(toAddress, utils.parseEther(usdcAmount))
          }

          beforeEach(async function () {
              // deploy Pool
              ;[deployer, sender] = await ethers.getSigners()
              await deployments.fixture(["all", "pool"])
              pool = await ethers.getContract("Pool", deployer)

              // deploy tokens
              weth = await ethers.getContract("WethToken", deployer)
              usdc = await ethers.getContract("UsdcToken", deployer)
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
                      const actualBalance = await usdc.balanceOf(sender.address)
                      const expectedBalance = utils.parseEther("2666.666666666666666666")
                      assert.equal(actualBalance.toString(), expectedBalance.toString())
                  })

                  it("emits event", async function () {
                      await expect(pool.connect(sender).swap(sendTokenAmount, "ETH"))
                          .to.emit(pool, "SwapCompleted")
                          .withArgs(utils.parseEther("2666.666666666666666666"))
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
                      await fundAddress(sender.address, utils.formatEther(sendTokenAmount), "0")
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

          describe("convertTokenAmount", function () {
              it("returns the correct amount of USDC", async function () {
                  await fundAddress(pool.address, "10", "16000")
                  const wethAmount = utils.parseEther("2")
                  const expected = utils.parseEther("2666.666666666666666666")
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
                  const expected = utils.parseEther("1.111111111111111111")
                  const actual = await pool.convertTokenAmount(
                      usdcAmount,
                      usdc.address,
                      weth.address
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("returns the receive token balance if send token balance is zero", async function () {
                  await fundAddress(pool.address, "0", "16000")
                  const wethAmount = utils.parseEther("2")
                  const expected = utils.parseEther("16000")
                  const actual = await pool.convertTokenAmount(
                      wethAmount,
                      weth.address,
                      usdc.address
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
          describe.skip("_calculateCurrentSwapPrice", function () {
              it("returns the correct amount", async function () {
                  const sendAmount = utils.parseEther("2")
                  const sendBalance = utils.parseEther("10")
                  const receiveBalance = utils.parseEther("16000")
                  const expected = utils.parseEther("0.00075")
                  const actual = await pool._calculateCurrentSwapPrice(
                      sendAmount,
                      sendBalance,
                      receiveBalance
                  )
                  assert.equal(actual.toString(), expected.toString())
              })

              it("reverts if receive balance is zero", async function () {
                  const sendAmount = utils.parseEther("2")
                  const sendBalance = utils.parseEther("10")
                  const receiveBalance = utils.parseEther("0")
                  await expect(
                      pool._calculateCurrentSwapPrice(sendAmount, sendBalance, receiveBalance)
                  ).to.be.revertedWith("Pool__ReceiveBalanceZero")
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe.skip("_getContractBalance", function () {
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

          // Internal function: to test, change to public and remove 'skip'
          describe.skip("_requestApprovalFromSender", function () {
              it("gets approval from sender", async function () {
                  const sendTokenAmount = utils.parseEther("2")
                  await pool.requestApprovalFromSender(
                      weth.address,
                      sendTokenAmount,
                      sender.address
                  )
                  const actualApprovedAmount = await weth.allowance(pool.address, sender.address)
                  assert.equal(actualApprovedAmount.toString(), sendTokenAmount.toString())
              })
          })

          // Internal function: to test, change to public and remove 'skip'
          describe.skip("_receiveTokenFromSender", function () {
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
          describe.skip("_sendTokenToSender", function () {
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
      })
