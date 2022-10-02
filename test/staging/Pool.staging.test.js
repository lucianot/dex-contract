const { assert, expect } = require("chai")
const { network, deployments, ethers } = require("hardhat")
const { utils } = require("ethers")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Pool", function () {
          let pool, weth, usdc, deployer, wethDecimals, usdcDecimals

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

                  // get decimals
                  wethDecimals = await pool.getWethDecimals()
                  console.log("WETH decimals: ", wethDecimals.toString())
                  usdcDecimals = await pool.getUsdcDecimals()
                  console.log("USDC decimals: ", usdcDecimals.toString())

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
                  console.log("WETH balance: ", utils.formatUnits(initialBalances[0], wethDecimals))
                  console.log("USDC balance: ", utils.formatUnits(initialBalances[1], usdcDecimals))
                  console.log("LP Token balance: ", utils.formatUnits(initialBalances[2], 18))
                  console.log("----------------------------------------")
                  assert.equal(initialBalances[2].toString(), utils.parseUnits("0", 18))

                  // get initial pool balances
                  console.log("Checking Pool balances before deposit...")
                  const poolInitialBalances = await getBalances(pool)
                  const lpTokenInitialSupply = await lpToken.totalSupply()
                  console.log(
                      "WETH balance: ",
                      utils.formatUnits(poolInitialBalances[0], wethDecimals)
                  )
                  console.log(
                      "USDC balance: ",
                      utils.formatUnits(poolInitialBalances[1], usdcDecimals)
                  )
                  console.log("LP Token supply: ", utils.formatUnits(lpTokenInitialSupply, 18))
                  console.log("----------------------------------------")
                  assert.equal(
                      poolInitialBalances[0].toString(),
                      utils.parseUnits("0", wethDecimals)
                  )
                  assert.equal(
                      poolInitialBalances[1].toString(),
                      utils.parseUnits("0", usdcDecimals)
                  )
                  assert.equal(lpTokenInitialSupply.toString(), utils.parseUnits("0", 18))

                  // get oracle price
                  console.log("Checking amounts to deposit...")
                  const oraclePrice = await pool.getLatestOraclePrice()
                  const formattedPrice = utils.formatUnits(oraclePrice, 8)
                  console.log("ETH/USD price: ", formattedPrice)

                  // get deposit amounts
                  const wethDepositAmount = utils.parseUnits("0.001", wethDecimals)
                  const [wethAmount, usdcAmount] = await pool.getDepositAmounts(
                      "WETH",
                      wethDepositAmount
                  )
                  console.log(
                      "User must deposit:",
                      utils.formatUnits(wethAmount, wethDecimals),
                      "WETH and",
                      utils.formatUnits(usdcAmount, usdcDecimals),
                      "USDC"
                  )
                  assert.equal(wethAmount.toString(), wethDepositAmount.toString())

                  const expectedUsdcAmount = wethDepositAmount
                      .mul(oraclePrice)
                      .div(1e8)
                      .div(10 ** (wethDecimals - usdcDecimals))
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
                  await depositTx.wait()

                  // assert that user balances are correct
                  console.log("Checking user balances after deposit...")
                  const balances = await getBalances(deployer)
                  console.log("WETH balance: ", utils.formatUnits(balances[0], wethDecimals))
                  console.log("USDC balance: ", utils.formatUnits(balances[1], usdcDecimals))
                  console.log("LP Token balance: ", utils.formatUnits(balances[2], 18))
                  console.log("----------------------------------------")
                  let expectedWeth = initialBalances[0].sub(wethAmount)
                  let expectedUsdc = initialBalances[1].sub(usdcAmount)
                  let expectedLpToken = initialBalances[2].add(
                      usdcAmount.mul(2).mul(10 ** (18 - usdcDecimals))
                  )
                  assert.equal(balances[0].toString(), expectedWeth.toString())
                  assert.equal(balances[1].toString(), expectedUsdc.toString())
                  assert.equal(balances[2].toString(), expectedLpToken.toString())

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after deposit...")
                  const poolBalances = await getBalances(pool)
                  const lpTokenSupply = await lpToken.totalSupply()
                  console.log("WETH balance: ", utils.formatUnits(poolBalances[0], wethDecimals))
                  console.log("USDC balance: ", utils.formatUnits(poolBalances[1], usdcDecimals))
                  console.log("LP Token supply: ", utils.formatUnits(lpTokenSupply, 18))
                  console.log("----------------------------------------")
                  let expectedPoolWeth = poolInitialBalances[0].add(wethAmount)
                  let expectedPoolUsdc = poolInitialBalances[1].add(usdcAmount)
                  let expectedLpTokenSupply = lpTokenInitialSupply.add(
                      usdcAmount.mul(2).mul(10 ** (18 - usdcDecimals))
                  )
                  assert.equal(poolBalances[0].toString(), expectedPoolWeth.toString())
                  assert.equal(poolBalances[1].toString(), expectedPoolUsdc.toString())
                  assert.equal(lpTokenSupply.toString(), expectedLpTokenSupply.toString())

                  // check swap amount
                  console.log("Checking swap prices...")
                  const swapAmount = utils.parseUnits("0.0001", wethDecimals)
                  const constant = await pool.getPriceConstant()
                  console.log("Constant: ", utils.formatUnits(constant, 36))
                  const [receiveTokenAmount, swapPrice] = await pool.getSwapData("WETH", swapAmount)
                  console.log(
                      "Receive amount: ",
                      utils.formatUnits(receiveTokenAmount, usdcDecimals)
                  )
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
                  console.log(
                      "WETH balance: ",
                      utils.formatUnits(balancesAfterSwap[0], wethDecimals)
                  )
                  expectedWeth = balances[0].sub(swapAmount)
                  assert.equal(balancesAfterSwap[0].toString(), expectedWeth.toString())
                  console.log(
                      "USDC balance: ",
                      utils.formatUnits(balancesAfterSwap[1], usdcDecimals)
                  )
                  expectedUsdc = balances[1].add(receiveTokenAmount)
                  assert.equal(balancesAfterSwap[1].toString(), expectedUsdc.toString())
                  console.log("LP Token balance: ", utils.formatUnits(balancesAfterSwap[2], 18))
                  assert.equal(balancesAfterSwap[2].toString(), lpTokenSupply.toString())
                  console.log("----------------------------------------")

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after swap...")
                  const poolBalancesAfterSwap = await getBalances(pool)
                  const lpTokenSupplyAfterSwap = await lpToken.totalSupply()

                  console.log(
                      "WETH balance: ",
                      utils.formatUnits(poolBalancesAfterSwap[0], wethDecimals)
                  )
                  expectedPoolWeth = poolBalances[0].add(swapAmount)
                  assert.equal(poolBalancesAfterSwap[0].toString(), expectedPoolWeth.toString())

                  console.log(
                      "USDC balance: ",
                      utils.formatUnits(poolBalancesAfterSwap[1], usdcDecimals)
                  )
                  expectedPoolUsdc = poolBalances[1].sub(receiveTokenAmount)
                  assert.equal(poolBalancesAfterSwap[1].toString(), expectedPoolUsdc.toString())

                  console.log("LP Token supply: ", utils.formatUnits(lpTokenSupplyAfterSwap, 18))
                  assert.equal(lpTokenSupplyAfterSwap.toString(), lpTokenSupply.toString())
                  console.log("----------------------------------------")

                  // check user Pool data
                  console.log("Getting user Pool data...")
                  let accountData = await pool.getUserAccountData(deployer.address)
                  console.log("Pool participation: ", utils.formatUnits(accountData[0], 18))
                  assert.equal(accountData[0].toString(), utils.parseEther("1").toString())
                  console.log("WETH share: ", utils.formatUnits(accountData[1], wethDecimals))
                  let expectedWethParticipation = poolBalancesAfterSwap[0]
                  assert.equal(accountData[1].toString(), expectedWethParticipation.toString())
                  console.log("USDC balance: ", utils.formatUnits(accountData[2], usdcDecimals))
                  let expectedUsdcParticipation = poolBalancesAfterSwap[1]
                  assert.equal(accountData[2].toString(), expectedUsdcParticipation.toString())
                  console.log("----------------------------------------")

                  // user withdraws from Pool
                  console.log("User withdrawing liquidity...")
                  const withdrawPercent = utils.parseUnits("0.5", 18)
                  const withdrawTx = await pool.withdraw(withdrawPercent)
                  console.log("Mining...")
                  await withdrawTx.wait()
                  const wethWithdrawAmount = poolBalancesAfterSwap[0].div(2)
                  const usdcWithdrawAmount = poolBalancesAfterSwap[1].div(2)
                  console.log(
                      "WETH withdrawn: ",
                      utils.formatUnits(wethWithdrawAmount, wethDecimals)
                  )
                  console.log(
                      "USDC withdrawn: ",
                      utils.formatUnits(usdcWithdrawAmount, usdcDecimals)
                  )
                  console.log("----------------------------------------")

                  // assert that user's balances are correct
                  console.log("Checking user balances after withdraw...")
                  let balancesAfterWithdraw = await getBalances(deployer)

                  console.log(
                      "WETH balance: ",
                      utils.formatUnits(balancesAfterWithdraw[0], wethDecimals)
                  )
                  expectedWeth = balancesAfterSwap[0].add(wethWithdrawAmount)
                  assert.equal(balancesAfterWithdraw[0].toString(), expectedWeth.toString())

                  console.log(
                      "USDC balance: ",
                      utils.formatUnits(balancesAfterWithdraw[1], usdcDecimals)
                  )
                  expectedUsdc = balancesAfterSwap[1].add(usdcWithdrawAmount)
                  assert.equal(balancesAfterWithdraw[1].toString(), expectedUsdc.toString())

                  console.log("LP Token balance: ", utils.formatUnits(balancesAfterWithdraw[2], 18))
                  expectedLpToken = lpTokenSupply.div(2)
                  assert.equal(balancesAfterWithdraw[2].toString(), expectedLpToken.toString())
                  console.log("----------------------------------------")

                  // assert that pool balances are correct
                  console.log("Checking Pool balances after withdraw...")
                  const poolBalancesAfterWithdraw = await getBalances(pool)
                  const lpTokenSupplyAfterWithdraw = await lpToken.totalSupply()

                  console.log(
                      "WETH balance: ",
                      utils.formatUnits(poolBalancesAfterWithdraw[0], wethDecimals)
                  )
                  expectedPoolWeth = poolBalancesAfterSwap[0].sub(wethWithdrawAmount)
                  assert.equal(poolBalancesAfterWithdraw[0].toString(), expectedPoolWeth.toString())

                  console.log(
                      "USDC balance: ",
                      utils.formatUnits(poolBalancesAfterSwap[1], usdcDecimals)
                  )
                  expectedPoolUsdc = poolBalancesAfterSwap[1].sub(usdcWithdrawAmount)
                  assert.equal(poolBalancesAfterWithdraw[1].toString(), expectedPoolUsdc.toString())

                  console.log("LP Token supply: ", utils.formatUnits(lpTokenSupplyAfterWithdraw))
                  expectedLpTokenSupply = lpTokenSupply.sub(expectedLpToken)
                  assert.equal(
                      lpTokenSupplyAfterWithdraw.toString(),
                      expectedLpTokenSupply.toString()
                  )
                  console.log("----------------------------------------")

                  // check user pool data
                  console.log("Getting user Pool data...")
                  accountData = await pool.getUserAccountData(deployer.address)
                  console.log("Pool participation: ", utils.formatUnits(accountData[0], 18))
                  assert.equal(accountData[0].toString(), utils.parseEther("1").toString())
                  console.log("WETH share: ", utils.formatUnits(accountData[1], wethDecimals))
                  expectedWethParticipation = poolBalancesAfterWithdraw[0]
                  assert.equal(accountData[1].toString(), expectedWethParticipation.toString())
                  console.log("USDC balance: ", utils.formatUnits(accountData[2], usdcDecimals))
                  expectedUsdcParticipation = poolBalancesAfterWithdraw[1]
                  assert.equal(accountData[2].toString(), expectedUsdcParticipation.toString())
                  console.log("----------------------------------------")
                  console.log("Test complete!")
              })
          })
      })
