import {
  LiquidityPoolKeysV4,
} from '@raydium-io/raydium-sdk'
import {
  NATIVE_MINT,
} from '@solana/spl-token'
import {
  Keypair,
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import {
  CHECK_BAL_INTERVAL,
  DISTRIBUTE_WALLET_NUM,
  LOG_LEVEL,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  TOKEN_MINT,
} from './constants'
import { deleteConsoleLines, logger, PoolKeys, readJson, sleep } from './utils'
import base58 from 'bs58'

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
})

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const baseMint = new PublicKey(TOKEN_MINT)
const distritbutionNum = DISTRIBUTE_WALLET_NUM > 20 ? 20 : DISTRIBUTE_WALLET_NUM
let quoteVault: PublicKey | null = null
let poolKeys: LiquidityPoolKeysV4
let sold: number = 0
let bought: number = 0
let totalSolPut: number = 0
let changeAmount = 0
let buyNum = 0
let sellNum = 0
logger.level = LOG_LEVEL

interface Data {
  privateKey: string;
  pubkey: string;
  solBalance: number | null;
  tokenBuyTx: string | null,
  tokenSellTx: string | null,
}

const data: Data[] = readJson()
const walletPks = data.map(data => data.pubkey)
console.log("🚀 ~ walletPks:", walletPks)


const main = async () => {

  const solBalance = (await solanaConnection.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`)
  console.log(`Pool token mint: ${baseMint.toBase58()}`)
  console.log(`Wallet SOL balance: ${solBalance.toFixed(3)}SOL`)
  console.log("Check interval: ", CHECK_BAL_INTERVAL, "ms")

  let poolId: PublicKey
  poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT)
  poolId = poolKeys.id
  quoteVault = poolKeys.quoteVault
  console.log(`Successfully fetched pool info`)
  console.log(`Pool id: ${poolId.toBase58()}`)

  trackWalletOnLog(solanaConnection, quoteVault)
}

const getPoolStatus = async (poolId: PublicKey) => {
  while (true) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolId?.toBase58()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        }
      })
      const data = await res.json()

      const { url, priceNative, priceUsd, txns, volume, priceChange } = data.pair

      // console.log(`\t url: ${url}`)
      // console.log(`\t price: ${priceNative} SOL / ${priceUsd} usd`)
      // console.log(`\t Volume status                  =>   m5: $${volume.m5}\t|\th1: $${volume.h1}\t|\th6: $${volume.h6}\t|\t h24: $${volume.h24}`)
      // console.log(`\t Recent buy status (buy / sell) =>   m5: ${txns.m5.buys} / ${txns.m5.sells}\t\t|\th1: ${txns.h1.buys} / ${txns.h1.sells}\t|\th6: ${txns.h6.buys} / ${txns.h6.sells}\t|\t h24: ${txns.h24.buys} / ${txns.h24.sells}`)
      // console.log(`\t volume price change            =>   m5: ${priceChange.m5}%\t\t|\th1: ${priceChange.h1}%\t|\th6: ${priceChange.h6}%\t|\t h24: ${priceChange.h24}%`)

      await sleep(5000)
    } catch (error) {
      console.log("Error fetching ")
      await sleep(2000)
    }
  }
}

async function trackWalletOnLog(connection: Connection, quoteVault: PublicKey): Promise<void> {

  const initialWsolBal = (await connection.getTokenAccountBalance(quoteVault)).value.uiAmount
  if (!initialWsolBal) {
    console.log("Quote vault mismatch")
    return
  }

  const checkBal = setInterval(async () => {
    const bal = (await connection.getTokenAccountBalance(quoteVault)).value.uiAmount
    if (!bal) {
      console.log("Quote vault mismatch")
      return
    }
    changeAmount = bal - initialWsolBal
    deleteConsoleLines(1)
    console.log(`Other users bought ${buyNum - bought} times and sold ${sellNum - sold} times, total SOL change is ${changeAmount - totalSolPut}SOL`)
  }, CHECK_BAL_INTERVAL)
  try {
    connection.onLogs(
      quoteVault,
      async ({ logs, err, signature }) => {
        if (err) { }
        else {
          
          const parsedData = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
          const signer = parsedData?.transaction.message.accountKeys.filter((elem: any) => {
            return elem.signer == true
          })[0].pubkey.toBase58()

          // console.log(`\nTransaction success: https://solscan.io/tx/${signature}\n`)
          if(!walletPks.includes(signer!)){
            if (Number(parsedData?.meta?.preBalances[0]) > Number(parsedData?.meta?.postBalances[0])) {
              buyNum++
            } else {
              sellNum++
            }
          }


        }
      },
      "confirmed"
    );
  } catch (error) { }
}


main()