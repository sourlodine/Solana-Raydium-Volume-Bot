import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';
import { NATIVE_MINT } from '@solana/spl-token';
import { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  CHECK_BAL_INTERVAL,
  DISTRIBUTE_WALLET_NUM,
  LOG_LEVEL,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  TOKEN_MINT,
} from './constants';
import { deleteConsoleLines, logger, PoolKeys, readJson, sleep } from './utils';
import base58 from 'bs58';
import { PoolState } from './types';

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY));
const baseMint = new PublicKey(TOKEN_MINT);
const distritbutionNum = DISTRIBUTE_WALLET_NUM > 20 ? 20 : DISTRIBUTE_WALLET_NUM;
let quoteVault: PublicKey | null = null;
let poolKeys: LiquidityPoolKeysV4;
let sold: number = 0;
let bought: number = 0;
let totalSolPut: number = 0;
let changeAmount = 0;
let buyNum = 0;
let sellNum = 0;
logger.level = LOG_LEVEL;

interface Data {
  privateKey: string;
  pubkey: string;
  solBalance: number | null;
  tokenBuyTx: string | null;
  tokenSellTx: string | null;
}

const data: Data[] = readJson();
const walletPks = data.map((data) => data.pubkey);
console.log('🚀 ~ walletPks:', walletPks);

const state: PoolState = {
  quoteVault: null,
  poolKeys: null,
  stats: {
    sold: 0,
    bought: 0,
    totalSolPut: 0,
    changeAmount: 0,
    buyNum: 0,
    sellNum: 0,
  },
};

// Improved error handling and connection management
const initializeConnection = async () => {
  try {
    const solBalance = await solanaConnection.getBalance(mainKp.publicKey);
    console.log({
      walletAddress: mainKp.publicKey.toBase58(),
      poolTokenMint: baseMint.toBase58(),
      solBalance: (solBalance / LAMPORTS_PER_SOL).toFixed(3),
      checkInterval: CHECK_BAL_INTERVAL,
    });

    state.poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT);
    state.quoteVault = state.poolKeys.quoteVault;

    return state.poolKeys.id;
  } catch (error) {
    logger.error('Failed to initialize connection:', error);
    throw error;
  }
};

// Optimized transaction tracking
async function trackWalletOnLog(connection: Connection, quoteVault: PublicKey): Promise<void> {
  const initialWsolBal = await getTokenBalance(connection, quoteVault);
  if (!initialWsolBal) return;

  // Set up balance checking interval
  setupBalanceChecking(connection, quoteVault, initialWsolBal);

  // Set up transaction monitoring
  setupTransactionMonitoring(connection, quoteVault);
}

// Helper functions for better code organization
async function getTokenBalance(connection: Connection, vault: PublicKey): Promise<number | null> {
  try {
    const balance = (await connection.getTokenAccountBalance(vault)).value.uiAmount;
    if (!balance) {
      logger.error('Quote vault mismatch');
      return null;
    }
    return balance;
  } catch (error) {
    logger.error('Failed to get token balance:', error);
    return null;
  }
}

function setupBalanceChecking(connection: Connection, quoteVault: PublicKey, initialBalance: number) {
  setInterval(async () => {
    const currentBalance = await getTokenBalance(connection, quoteVault);
    if (!currentBalance) return;

    state.stats.changeAmount = currentBalance - initialBalance;
    deleteConsoleLines(1);
    console.log(
      `Other users bought ${state.stats.buyNum - state.stats.bought} times and ` +
        `sold ${state.stats.sellNum - state.stats.sold} times, ` +
        `total SOL change is ${state.stats.changeAmount - state.stats.totalSolPut}SOL`,
    );
  }, CHECK_BAL_INTERVAL);
}

function setupTransactionMonitoring(connection: Connection, quoteVault: PublicKey) {
  connection.onLogs(
    quoteVault,
    async ({ err, signature }) => {
      if (err) return;

      try {
        const parsedData = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });

        const signer = parsedData?.transaction.message.accountKeys.find((elem: any) => elem.signer)?.pubkey.toBase58();

        if (signer && !walletPks.includes(signer)) {
          const isUserBuying = Number(parsedData?.meta?.preBalances[0]) > Number(parsedData?.meta?.postBalances[0]);
          isUserBuying ? state.stats.buyNum++ : state.stats.sellNum++;
        }
      } catch (error) {
        logger.error('Error processing transaction:', error);
      }
    },
    'confirmed',
  );
}

// Simplified main function
const main = async () => {
  try {
    const poolId = await initializeConnection();
    await trackWalletOnLog(solanaConnection, state.quoteVault!);
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
};

main();
