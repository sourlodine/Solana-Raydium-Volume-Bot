import {
  Keypair,
  Connection,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from '@solana/web3.js'
import {
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
} from './constants'
import { Data, readJson } from './utils'
import base58 from 'bs58'

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
})
const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const gather = async () => {
  const data: Data[] = readJson()
  if (data.length == 0) {
    console.log("No wallet to gather")
    return
  }
  for (let i = 0; i < data.length; i++) {
    try {
      const wallet = Keypair.fromSecretKey(base58.decode(data[i].privateKey))
      const balance = await solanaConnection.getBalance(wallet.publicKey)
      if (balance == 0) {
        console.log("sol balance is 0, skip this wallet")
        continue
      }
      const rent = await solanaConnection.getMinimumBalanceForRentExemption(32);
      console.log("🚀 ~ gather ~ minBalance:", rent)
      
      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 600_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 20_000}),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: mainKp.publicKey,
          lamports: balance - 13 * 10 ** 3 - rent
        })
      )
      
      transaction.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash
      transaction.feePayer = wallet.publicKey
      console.log(await solanaConnection.simulateTransaction(transaction))
      const sig = await sendAndConfirmTransaction(solanaConnection, transaction, [wallet], { skipPreflight: true })
      console.log({ sig })
    } catch (error) {
      console.log("Failed to gather sol in a wallet")
    }
  }
}

gather()