const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, sender

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
                  pool = await ethers.getContract("Pool", deployer)
                  console.log("Pool address: ", pool.address)

                  // connect to tokens
                  lpToken = await ethers.getContract("LiquidityPoolToken", deployer)
                  console.log("LiquidityPoolToken address: ", lpToken.address)

                  weth = await ethers.getContractAt("WethToken", await pool.getWethToken())
                  console.log("WethToken address: ", weth.address)

                  usdc = await ethers.getContractAt("UsdcToken", await pool.getUsdcToken())
                  console.log("UsdcToken address: ", usdc.address)
                  console.log("----------------------------------")

                  // reset all balances
                  console.log("Resetting all balances...")
                  const tx = await pool.resetPool()
                  console.log("Mining...")
                  await tx.wait()
              })

              it("user successfully deposits token, completes swap, then withdraws funds", async function () {
                  // get initial user balances
                  console.log("Checking user balances before deposit...")
                  const initialBalances = await getBalances(deployer)
                  console.log("WETH balance: ", utils.formatEther(initialBalances[0]))
                  console.log("USDC balance: ", utils.formatEther(initialBalances[1]))
                  console.log("LP Token balance: ", utils.formatEther(initialBalances[2]))
                  console.log("----------------------------------------")
                  assert.equal(initialBalances[2].toString(), utils.parseEther("0"))

                  // get initial pool balances
                  console.log("Checking Pool balances before deposit...")
                  const poolInitialBalances = await getBalances(pool)
                  const lpTokenInitialSupply = await lpToken.totalSupply()
                  console.log("WETH balance: ", utils.formatEther(poolInitialBalances[0]))
                  console.log("USDC balance: ", utils.formatEther(poolInitialBalances[1]))
                  console.log("LP Token supply: ", utils.formatEther(lpTokenInitialSupply))
                  console.log("----------------------------------------")
                  assert.equal(poolInitialBalances[0].toString(), utils.parseEther("0"))
                  assert.equal(poolInitialBalances[1].toString(), utils.parseEther("0"))
                  assert.equal(lpTokenInitialSupply.toString(), utils.parseEther("0"))

                  // get oracle price
                  console.log("Checking amounts to deposit...")
                  const oraclePrice = await pool.getLatestOraclePrice()
                  const formattedPrice = utils.formatUnits(oraclePrice, 8)
                  console.log("ETH/USD price: ", formattedPrice)

                  // get deposit amounts
                  const wethDepositAmount = utils.parseEther("0.001")
                  const expectedUsdcAmount = wethDepositAmount.mul(oraclePrice).div(1e8)
                  const [wethAmount, usdcAmount] = await pool.getDepositAmounts(
                      "WETH",
                      wethDepositAmount
                  )
                  console.log(
                      "User must deposit:",
                      utils.formatEther(wethAmount),
                      "WETH and",
                      utils.formatEther(usdcAmount),
                      "USDC"
                  )
                  assert.equal(wethAmount.toString(), wethDepositAmount.toString())
                  assert.equal(usdcAmount.toString(), expectedUsdcAmount.toString())
                  console.log("----------------------------------------")

                  // approve pool to spend user's tokens
                  console.log("Approving Pool to spend user's tokens...")
                  await weth.approve(pool.address, wethAmount)
                  await usdc.approve(pool.address, usdcAmount)

                  // deposit into Pool
                  console.log("User depositing...")
                  const depositTx = await pool.deposit(wethAmount, "WETH")
                  console.log("Mining...")
                  const depositReceipt = await depositTx.wait()

                  // assert that user balances are correct
                  console.log("Checking user balances after deposit...")
                  const balances = await getBalances(deployer)
                  console.log("WETH balance: ", utils.formatEther(balances[0]))
                  console.log("USDC balance: ", utils.formatEther(balances[1]))
                  console.log("LP Token balance: ", utils.formatEther(balances[2]))
                  console.log("----------------------------------------")
                  let expectedWeth = initialBalances[0].sub(wethAmount)
                  let expectedUsdc = initialBalances[1].sub(usdcAmount)
                  let expectedLpToken = initialBalances[2].add(usdcAmount.mul(2))
                  assert.equal(balances[0].toString(), expectedWeth.toString())
                  assert.equal(balances[1].toString(), expectedUsdc.toString())
                  assert.equal(balances[2].toString(), expectedLpToken.toString())

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after deposit...")
                  const poolBalances = await getBalances(pool)
                  const lpTokenSupply = await lpToken.totalSupply()
                  console.log("WETH balance: ", utils.formatEther(poolBalances[0]))
                  console.log("USDC balance: ", utils.formatEther(poolBalances[1]))
                  console.log("LP Token supply: ", utils.formatEther(lpTokenSupply))
                  console.log("----------------------------------------")
                  let expectedPoolWeth = poolInitialBalances[0].add(wethAmount)
                  let expectedPoolUsdc = poolInitialBalances[1].add(usdcAmount)
                  let expectedLpTokenSupply = lpTokenInitialSupply.add(usdcAmount.mul(2))
                  assert.equal(poolBalances[0].toString(), expectedPoolWeth.toString())
                  assert.equal(poolBalances[1].toString(), expectedPoolUsdc.toString())
                  assert.equal(lpTokenSupply.toString(), expectedLpTokenSupply.toString())

                  // check swap amount
                  console.log("Checking swap prices...")
                  const swapAmount = utils.parseEther("0.0001")
                  const constant = await pool.getPriceConstant()
                  console.log("Constant: ", utils.formatEther(constant))
                  const [receiveTokenAmount, swapPrice] = await pool.getSwapData("WETH", swapAmount)
                  console.log("Receive amount: ", utils.formatEther(receiveTokenAmount))
                  console.log("Swap price: ", utils.formatUnits(swapPrice, 18))
                  console.log("----------------------------------------")

                  // approve pool to spend user's tokens
                  console.log("Approving Pool to spend user's tokens...")
                  await weth.approve(pool.address, swapAmount)

                  // user swaps USDC for WETH
                  console.log("User swapping tokens...")
                  const swapTx = await pool.swap(swapAmount, "WETH")
                  console.log("Mining...")
                  await swapTx.wait()
                  console.log("----------------------------------------")

                  // assert that user's balances are correct
                  console.log("Checking user balances after swap...")
                  let balancesAfterSwap = await getBalances(deployer)
                  console.log("WETH balance: ", utils.formatEther(balancesAfterSwap[0]))
                  expectedWeth = balances[0].sub(swapAmount)
                  assert.equal(balancesAfterSwap[0].toString(), expectedWeth.toString())
                  console.log("USDC balance: ", utils.formatEther(balancesAfterSwap[1]))
                  expectedUsdc = balances[1].add(receiveTokenAmount)
                  assert.equal(balancesAfterSwap[1].toString(), expectedUsdc.toString())
                  console.log("LP Token balance: ", utils.formatEther(balancesAfterSwap[2]))
                  assert.equal(balancesAfterSwap[2].toString(), lpTokenSupply.toString())
                  console.log("----------------------------------------")

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after swap...")
                  const poolBalancesAfterSwap = await getBalances(pool)
                  const lpTokenSupplyAfterSwap = await lpToken.totalSupply()

                  console.log("WETH balance: ", utils.formatEther(poolBalancesAfterSwap[0]))
                  expectedPoolWeth = poolBalances[0].add(swapAmount)
                  assert.equal(poolBalancesAfterSwap[0].toString(), expectedPoolWeth.toString())

                  console.log("USDC balance: ", utils.formatEther(poolBalancesAfterSwap[1]))
                  expectedPoolUsdc = poolBalances[1].sub(receiveTokenAmount)
                  assert.equal(poolBalancesAfterSwap[1].toString(), expectedPoolUsdc.toString())

                  console.log("LP Token supply: ", utils.formatEther(lpTokenSupplyAfterSwap))
                  assert.equal(lpTokenSupplyAfterSwap.toString(), lpTokenSupply.toString())
                  console.log("----------------------------------------")

                  // check user Pool data
                  console.log("Getting user Pool data...")
                  let accountData = await pool.getUserAccountData(deployer.address)
                  console.log("Pool participation: ", utils.formatEther(accountData[0]))
                  assert.equal(accountData[0].toString(), utils.parseEther("1").toString())
                  console.log("WETH share: ", utils.formatEther(accountData[1]))
                  let expectedWethParticipation = poolBalancesAfterSwap[0]
                  assert.equal(accountData[1].toString(), expectedWethParticipation.toString())
                  console.log("USDC balance: ", utils.formatEther(accountData[2]))
                  let expectedUsdcParticipation = poolBalancesAfterSwap[1]
                  assert.equal(accountData[2].toString(), expectedUsdcParticipation.toString())
                  console.log("----------------------------------------")

                  // user withdraws from Pool
                  console.log("User withdrawing liquidity...")
                  const withdrawPercent = utils.parseEther("0.5")
                  const withdrawTx = await pool.withdraw(withdrawPercent)
                  console.log("Mining...")
                  await withdrawTx.wait()
                  const wethWithdrawAmount = poolBalancesAfterSwap[0].div(2)
                  const usdcWithdrawAmount = poolBalancesAfterSwap[1].div(2)
                  console.log("WETH withdrawn: ", utils.formatEther(wethWithdrawAmount))
                  console.log("USDC withdrawn: ", utils.formatEther(usdcWithdrawAmount))
                  console.log("----------------------------------------")

                  // assert that user's balances are correct
                  console.log("Checking user balances after withdraw...")
                  let balancesAfterWithdraw = await getBalances(deployer)

                  console.log("WETH balance: ", utils.formatEther(balancesAfterWithdraw[0]))
                  expectedWeth = balancesAfterSwap[0].add(wethWithdrawAmount)
                  assert.equal(balancesAfterWithdraw[0].toString(), expectedWeth.toString())

                  console.log("USDC balance: ", utils.formatEther(balancesAfterWithdraw[1]))
                  expectedUsdc = balancesAfterSwap[1].add(usdcWithdrawAmount)
                  assert.equal(balancesAfterWithdraw[1].toString(), expectedUsdc.toString())

                  console.log("LP Token balance: ", utils.formatEther(balancesAfterWithdraw[2]))
                  expectedLpToken = lpTokenSupply.div(2)
                  assert.equal(balancesAfterWithdraw[2].toString(), expectedLpToken.toString())
                  console.log("----------------------------------------")

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after withdraw...")
                  const poolBalancesAfterWithdraw = await getBalances(pool)
                  const lpTokenSupplyAfterWithdraw = await lpToken.totalSupply()

                  console.log("WETH balance: ", utils.formatEther(poolBalancesAfterWithdraw[0]))
                  expectedPoolWeth = poolBalancesAfterSwap[0].sub(wethWithdrawAmount)
                  assert.equal(poolBalancesAfterWithdraw[0].toString(), expectedPoolWeth.toString())

                  console.log("USDC balance: ", utils.formatEther(poolBalancesAfterSwap[1]))
                  expectedPoolUsdc = poolBalancesAfterSwap[1].sub(usdcWithdrawAmount)
                  assert.equal(poolBalancesAfterWithdraw[1].toString(), expectedPoolUsdc.toString())

                  console.log("LP Token supply: ", utils.formatEther(lpTokenSupplyAfterWithdraw))
                  expectedLpTokenSupply = lpTokenSupply.sub(expectedLpToken)
                  assert.equal(
                      lpTokenSupplyAfterWithdraw.toString(),
                      expectedLpTokenSupply.toString()
                  )
                  console.log("----------------------------------------")

                  // check user pool data
                  console.log("Getting user Pool data...")
                  accountData = await pool.getUserAccountData(deployer.address)
                  console.log("Pool participation: ", utils.formatEther(accountData[0]))
                  assert.equal(accountData[0].toString(), utils.parseEther("1").toString())
                  console.log("WETH share: ", utils.formatEther(accountData[1]))
                  expectedWethParticipation = poolBalancesAfterWithdraw[0]
                  assert.equal(accountData[1].toString(), expectedWethParticipation.toString())
                  console.log("USDC balance: ", utils.formatEther(accountData[2]))
                  expectedUsdcParticipation = poolBalancesAfterWithdraw[1]
                  assert.equal(accountData[2].toString(), expectedUsdcParticipation.toString())
                  console.log("----------------------------------------")
                  console.log("Test complete!")
              })
          })
      })
