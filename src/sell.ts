import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  ADDITIONAL_FEE,
  BUY_AMOUNT,
  BUY_INTERVAL_MAX,
  BUY_INTERVAL_MIN,
  BUY_LOWER_AMOUNT,
  BUY_UPPER_AMOUNT,
  DISTRIBUTE_WALLET_NUM,
  IS_RANDOM,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  TOKEN_MINT,
} from './constants';
import { sleep } from './utils';
import base58 from 'bs58';
import { ApiPoolInfoV4 } from '@raydium-io/raydium-sdk';

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY));
const baseMint = new PublicKey(TOKEN_MINT);
const distritbutionNum = DISTRIBUTE_WALLET_NUM > 10 ? 10 : DISTRIBUTE_WALLET_NUM;
let quoteVault: PublicKey | null = null;
let poolId: PublicKey;
let poolKeys: null | ApiPoolInfoV4 = null;

const MAX_RETRIES = 10;
const RETRY_DELAY = 2000;
const POST_BUY_DELAY = 1000;
const POST_SELL_DELAY = 5000;

class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

async function executeTradeLoop(kp: Keypair, initBalance: number, poolId: PublicKey) {
  let soldIndex = 1;

  while (true) {
    try {
      const buyAmount = calculateBuyAmount();
      await validateBalance(kp, buyAmount);

      await retryOperation(() => buy(kp, baseMint, buyAmount, poolId));
      await sleep(POST_BUY_DELAY);

      await retryOperation(() => sell(poolId, baseMint, kp, soldIndex, initBalance));
      soldIndex++;

      const interval = calculateInterval(distritbutionNum);
      await sleep(POST_SELL_DELAY + interval);
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        console.log(error.message);
        return;
      }
      console.error('Trade loop error:', error);
      await sleep(RETRY_DELAY);
    }
  }
}

function calculateBuyAmount(): number {
  if (!IS_RANDOM) return BUY_AMOUNT;
  return Number((Math.random() * (BUY_UPPER_AMOUNT - BUY_LOWER_AMOUNT) + BUY_LOWER_AMOUNT).toFixed(6));
}

async function validateBalance(wallet: Keypair, requiredAmount: number) {
  const solBalance = (await solanaConnection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL;
  if (solBalance < ADDITIONAL_FEE) {
    throw new InsufficientBalanceError(`Balance is not enough: ${solBalance} SOL`);
  }
}

async function retryOperation<T>(operation: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      console.log(`Attempt ${i + 1} failed, retrying...`);
    }
    await sleep(RETRY_DELAY);
  }
  throw new Error(`Operation failed after ${maxRetries} attempts`);
}

const main = async () => {
  const data = await distributeSolAndToken(mainKp, distritbutionNum, baseMint);
  if (!data) {
    console.log('Distribution failed');
    return;
  }

  // Process wallets in parallel with rate limiting
  await Promise.all(
    data.map(async ({ kp }, i) => {
      await sleep(((BUY_INTERVAL_MAX + BUY_INTERVAL_MIN) * i) / 2);

      const initBalance = await validateInitialBalance(kp);
      if (!initBalance) return;

      await executeTradeLoop(kp, initBalance, poolId);
    }),
  );
};
