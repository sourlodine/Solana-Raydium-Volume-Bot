import {
  NATIVE_MINT,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  transfer,
} from '@solana/spl-token'
import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  VersionedTransaction,
  TransactionInstruction,
  TransactionMessage,
  ComputeBudgetProgram,
  Transaction
} from '@solana/web3.js'
import {
  ADDITIONAL_FEE,
  BUY_AMOUNT,
  BUY_INTERVAL_MAX,
  BUY_INTERVAL_MIN,
  BUY_LOWER_AMOUNT,
  BUY_UPPER_AMOUNT,
  DISTRIBUTE_WALLET_NUM,
  DISTRIBUTION_AMOUNT,
  IS_RANDOM,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  TOKEN_MINT,
  WALLET_NUM,
  SELL_ALL_BY_TIMES,
  SELL_PERCENT
} from './constants'
import { Data, editJson, readJson, saveDataToFile, sleep } from './utils'
import base58 from 'bs58'
import { getBuyTx, getBuyTxWithJupiter, getSellTx, getSellTxWithJupiter } from './utils/swapOnlyAmm'
import { execute } from './executor/legacy'
import { getPoolKeys } from './utils/getPoolInfo'
import { SWAP_ROUTING } from './constants'
import { ApiPoolInfoV4 } from '@raydium-io/raydium-sdk'
import { BN } from 'bn.js'

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
})

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const baseMint = new PublicKey(TOKEN_MINT)
const distritbutionNum = DISTRIBUTE_WALLET_NUM > 10 ? 10 : DISTRIBUTE_WALLET_NUM
let quoteVault: PublicKey | null = null
let poolId: PublicKey
let poolKeys: null | ApiPoolInfoV4 = null

const main = async () => {

  const solBalance = (await solanaConnection.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL
  console.log(`Volume bot is running`)
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`)
  console.log(`Pool token mint: ${baseMint.toBase58()}`)
  console.log(`Wallet SOL balance: ${solBalance.toFixed(3)}SOL`)
  console.log(`Buying interval max: ${BUY_INTERVAL_MAX}ms`)
  console.log(`Buying interval min: ${BUY_INTERVAL_MIN}ms`)
  console.log(`Buy upper limit amount: ${BUY_UPPER_AMOUNT}SOL`)
  console.log(`Buy lower limit amount: ${BUY_LOWER_AMOUNT}SOL`)
  console.log(`Distribute SOL to ${distritbutionNum} wallets`)

  if (SWAP_ROUTING) {
    console.log("Buy and sell with jupiter swap v6 routing")
  } else {
    poolKeys = await getPoolKeys(solanaConnection, baseMint)
    if (poolKeys == null) {
      return
    }
    // poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT)
    poolId = new PublicKey(poolKeys.id)
    quoteVault = new PublicKey(poolKeys.quoteVault)
    console.log(`Successfully fetched pool info`)
    console.log(`Pool id: ${poolId.toBase58()}`)
  }

  let data: {
    kp: Keypair;
    buyAmount: number;
  }[] | null = null

  if (solBalance < (BUY_LOWER_AMOUNT + ADDITIONAL_FEE) * distritbutionNum) {
    console.log("Sol balance is not enough for distribution")
  }

  data = await distributeSolAndToken(mainKp, distritbutionNum, baseMint)
  if (data === null) {
    console.log("Distribution failed")
    return
  }

  data.map(async ({ kp }, i) => {
    await sleep((BUY_INTERVAL_MAX + BUY_INTERVAL_MIN) * i / 2)
    
    const ata = await getAssociatedTokenAddress(baseMint, kp.publicKey)
    const initBalance = (await solanaConnection.getTokenAccountBalance(ata)).value.uiAmount
    if(!initBalance || initBalance == 0){
      console.log("Error, distribution didn't work")
      return null
    }

    let soldIndex = 1
    while (true) {
      // buy part
      const BUY_INTERVAL = Math.round(Math.random() * (BUY_INTERVAL_MAX - BUY_INTERVAL_MIN) + BUY_INTERVAL_MIN)

      const solBalance = await solanaConnection.getBalance(kp.publicKey) / LAMPORTS_PER_SOL

      let buyAmount: number
      if (IS_RANDOM)
        buyAmount = Number((Math.random() * (BUY_UPPER_AMOUNT - BUY_LOWER_AMOUNT) + BUY_LOWER_AMOUNT).toFixed(6))
      else
        buyAmount = BUY_AMOUNT

      if (solBalance < ADDITIONAL_FEE) {
        console.log("Balance is not enough: ", solBalance, "SOL")
        return
      }

      // try buying until success
      let i = 0
      while (true) {
        if (i > 10) {
          console.log("Error in buy transaction")
          return
        }

        const result = await buy(kp, baseMint, buyAmount, poolId)
        if (result) {
          break
        } else {
          i++
          console.log("Buy failed, try again")
          await sleep(2000)
        }
      }

      await sleep(1000)

      // try selling until success
      let j = 0
      while (true) {
        if (j > 10) {
          console.log("Error in sell transaction")
          return
        }
        const result = await sell(poolId, baseMint, kp, soldIndex, initBalance)
        if (result) {
          soldIndex++
          break
        } else {
          j++
          console.log("Sell failed, try again")
          await sleep(2000)
        }
      }
      await sleep(5000 + distritbutionNum * BUY_INTERVAL)
    }
  })
}

interface WalletData {
  kp: Keypair, 
  buyAmount: number
}

const distributeSolAndToken = async (mainKp: Keypair, distritbutionNum: number, baseMint: PublicKey) => {
  const data: Data[] = []
  const wallets: WalletData[]  = []
  const mainAta = await getAssociatedTokenAddress(baseMint, mainKp.publicKey)
  let mainTokenBalance: string | null = null
  try {
    mainTokenBalance = (await solanaConnection.getTokenAccountBalance(mainAta)).value.amount
  } catch (error) {
    console.log("Error getting token balance of the main wallet\n Can't continue this mode without token in main wallet")
    return null
  }
  if(!mainTokenBalance || mainTokenBalance == "0" ){
    console.log("Error getting token balance of the main wallet\n Can't continue this mode without token in main wallet")
    return null
  }
  console.log("Main wallet's tokenbalance is ", mainTokenBalance)
  try {
    let tokenAmountPerWallet = 
    new BN(mainTokenBalance).div(new BN(WALLET_NUM).mul(new BN(Math.floor(SELL_PERCENT))).div(new BN(100))).toString()
  const distributionIx: TransactionInstruction[] = []
    distributionIx.push(
      ComputeBudgetProgram.setComputeUnitLimit({units: 800_000}),
      ComputeBudgetProgram.setComputeUnitPrice({microLamports: 250_000})
    )
    for (let i = 0; i < distritbutionNum; i++) {
      let solAmount = DISTRIBUTION_AMOUNT
      if (DISTRIBUTION_AMOUNT < ADDITIONAL_FEE + BUY_UPPER_AMOUNT)
        solAmount = ADDITIONAL_FEE + BUY_UPPER_AMOUNT
      
      const wallet = Keypair.generate()
      wallets.push({ kp: wallet, buyAmount: solAmount })
      const destAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey)

      distributionIx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports: solAmount * LAMPORTS_PER_SOL
        }),
        createAssociatedTokenAccountInstruction(mainKp.publicKey, destAta, wallet.publicKey, baseMint),
        createTransferInstruction(mainAta, destAta, mainKp.publicKey, BigInt(tokenAmountPerWallet))
      )
    }
    let index = 0
    while (true) {
      try {
        if (index > 3) {
          console.log("Error in distribution")
          return null
        }
        
    console.log(tokenAmountPerWallet)
    console.log("object")
        const transaction1 = new Transaction().add(...distributionIx)
        transaction1.feePayer = mainKp.publicKey
        transaction1.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash
        console.log(await solanaConnection.simulateTransaction(transaction1))
        
        const siTx = new Transaction().add(...distributionIx)
        const latestBlockhash = await solanaConnection.getLatestBlockhash()
        siTx.feePayer = mainKp.publicKey
        siTx.recentBlockhash = latestBlockhash.blockhash
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: distributionIx,
        }).compileToV0Message()
        const transaction = new VersionedTransaction(messageV0)
        transaction.sign([mainKp])
        const txSig = await execute(transaction, latestBlockhash)
        const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : ''
        console.log("SOL and token distributed ", tokenBuyTx)
        break
      } catch (error) {
        index++
        console.log(error)
      }
    }

    wallets.map((wallet) => {
      data.push({
        privateKey: base58.encode(wallet.kp.secretKey),
        pubkey: wallet.kp.publicKey.toBase58(),
        solBalance: wallet.buyAmount + ADDITIONAL_FEE,
        tokenBuyTx: null,
        tokenSellTx: null
      })
    })
    try {
      saveDataToFile(data)
    } catch (error) {
      
    }
    console.log("Success in transferring sol")
    return wallets
  } catch (error) {
    console.log(`Failed to transfer SOL`)
    return null
  }
}


const buy = async (newWallet: Keypair, baseMint: PublicKey, buyAmount: number, poolId: PublicKey) => {
  let solBalance: number = 0
  try {
    solBalance = await solanaConnection.getBalance(newWallet.publicKey)
  } catch (error) {
    console.log("Error getting balance of wallet")
    return null
  }
  if (solBalance == 0) {
    return null
  }
  try {
    let tx;
    if (SWAP_ROUTING)
      tx = await getBuyTxWithJupiter(newWallet, baseMint, buyAmount)
    else
      tx = await getBuyTx(solanaConnection, newWallet, baseMint, NATIVE_MINT, buyAmount, poolId.toBase58())
    if (tx == null) {
      console.log(`Error getting buy transaction`)
      return null
    }
    const latestBlockhash = await solanaConnection.getLatestBlockhash()
    const txSig = await execute(tx, latestBlockhash)
    const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : ''
    editJson({
      tokenBuyTx,
      pubkey: newWallet.publicKey.toBase58(),
      solBalance: solBalance / 10 ** 9 - buyAmount,
    })
    return tokenBuyTx
  } catch (error) {
    return null
  }
}

const sell = async (poolId: PublicKey, baseMint: PublicKey, wallet: Keypair, index: number, initBalance: number) => {
  const amount = initBalance * (SELL_ALL_BY_TIMES - index) / SELL_ALL_BY_TIMES
  
  try {
    const data: Data[] = readJson()
    if (data.length == 0) {
      await sleep(1000)
      return null
    }

    const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey)
    const tokenBalInfo = await solanaConnection.getTokenAccountBalance(tokenAta)
    if (!tokenBalInfo) {
      console.log("Balance incorrect")
      return null
    }
    const tokenBalance = tokenBalInfo.value.uiAmount
    if(!tokenBalance) return null
    const tokenToSell = new BN(tokenBalance - amount).mul(new BN(10 ** tokenBalInfo.value.decimals)).toString()
    try {
      let sellTx;
      if (SWAP_ROUTING)
        sellTx = await getSellTxWithJupiter(wallet, baseMint, tokenToSell)
      else
        sellTx = await getSellTx(solanaConnection, wallet, baseMint, NATIVE_MINT, tokenToSell, poolId.toBase58())

      if (sellTx == null) {
        console.log(`Error getting buy transaction`)
        return null
      }

      const latestBlockhashForSell = await solanaConnection.getLatestBlockhash()
      const txSellSig = await execute(sellTx, latestBlockhashForSell, false)
      const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : ''
      const solBalance = await solanaConnection.getBalance(wallet.publicKey)
      editJson({
        pubkey: wallet.publicKey.toBase58(),
        tokenSellTx,
        solBalance
      })
      return tokenSellTx
    } catch (error) {
      return null
    }
  } catch (error) {
    return null
  }
}


main()

