import { NATIVE_MINT, getAssociatedTokenAddress } from '@solana/spl-token';
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
  Transaction,
} from '@solana/web3.js';
import base58 from 'bs58';

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
} from './src/constants';
import { Data, editJson, readJson, saveDataToFile, sleep } from './src/utils';
import { getBuyTx, getBuyTxWithJupiter, getSellTx, getSellTxWithJupiter } from './src/utils/swapOnlyAmm';
import { execute } from './src/executor/legacy';
import { getPoolKeys } from './src/utils/getPoolInfo';
import { SWAP_ROUTING } from './src/constants';

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY));
const baseMint = new PublicKey(TOKEN_MINT);
const distritbutionNum = DISTRIBUTE_WALLET_NUM > 10 ? 10 : DISTRIBUTE_WALLET_NUM;
let poolId: PublicKey;
let poolKeys = null;

const main = async () => {
  const solBalance = (await solanaConnection.getBalance(mainKp.publicKey)) / LAMPORTS_PER_SOL;
  console.log(`Volume bot is running`);
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`);
  console.log(`Pool token mint: ${baseMint.toBase58()}`);
  console.log(`Wallet SOL balance: ${solBalance.toFixed(3)}SOL`);
  console.log(`Buying interval max: ${BUY_INTERVAL_MAX}ms`);
  console.log(`Buying interval min: ${BUY_INTERVAL_MIN}ms`);
  console.log(`Buy upper limit amount: ${BUY_UPPER_AMOUNT}SOL`);
  console.log(`Buy lower limit amount: ${BUY_LOWER_AMOUNT}SOL`);
  console.log(`Distribute SOL to ${distritbutionNum} wallets`);

  if (SWAP_ROUTING) {
    console.log('Buy and sell with jupiter swap v6 routing');
  } else {
    poolKeys = await getPoolKeys(solanaConnection, baseMint);
    if (poolKeys == null) {
      return;
    }
    // poolKeys = await PoolKeys.fetchPoolKeyInfo(solanaConnection, baseMint, NATIVE_MINT)
    poolId = new PublicKey(poolKeys.id);
    console.log(`Successfully fetched pool info`);
    console.log(`Pool id: ${poolId.toBase58()}`);
  }

  let data:
    | {
        kp: Keypair;
        buyAmount: number;
      }[]
    | null = null;

  if (solBalance < (BUY_LOWER_AMOUNT + ADDITIONAL_FEE) * distritbutionNum) {
    console.log('Sol balance is not enough for distribution');
  }

  data = await distributeSol(mainKp, distritbutionNum);
  if (data === null) {
    console.log('Distribution failed');
    return;
  }

  data.map(async ({ kp }, i) => {
    await sleep(((BUY_INTERVAL_MAX + BUY_INTERVAL_MIN) * i) / 2);
    while (true) {
      // buy part
      const BUY_INTERVAL = Math.round(Math.random() * (BUY_INTERVAL_MAX - BUY_INTERVAL_MIN) + BUY_INTERVAL_MIN);

      const solBalance = (await solanaConnection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;

      let buyAmount: number;
      if (IS_RANDOM)
        buyAmount = Number((Math.random() * (BUY_UPPER_AMOUNT - BUY_LOWER_AMOUNT) + BUY_LOWER_AMOUNT).toFixed(6));
      else buyAmount = BUY_AMOUNT;

      if (solBalance < ADDITIONAL_FEE) {
        console.log('Balance is not enough: ', solBalance, 'SOL');
        return;
      }

      // try buying until success
      let i = 0;
      while (true) {
        if (i > 10) {
          console.log('Error in buy transaction');
          return;
        }

        const result = await buy(kp, baseMint, buyAmount, poolId);
        if (result) {
          break;
        } else {
          i++;
          console.log('Buy failed, try again');
          await sleep(2000);
        }
      }

      await sleep(3000);

      // try selling until success
      let j = 0;
      while (true) {
        if (j > 10) {
          console.log('Error in sell transaction');
          return;
        }
        const result = await sell(poolId, baseMint, kp);
        if (result) {
          break;
        } else {
          j++;
          console.log('Sell failed, try again');
          await sleep(2000);
        }
      }
      await sleep(5000 + distritbutionNum * BUY_INTERVAL);
    }
  });
};

const distributeSol = async (mainKp: Keypair, distritbutionNum: number) => {
  const data: Data[] = [];
  const wallets = [];
  try {
    const sendSolTx: TransactionInstruction[] = [];
    sendSolTx.push(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 250_000 }),
    );
    for (let i = 0; i < distritbutionNum; i++) {
      let solAmount = DISTRIBUTION_AMOUNT;
      if (DISTRIBUTION_AMOUNT < ADDITIONAL_FEE + BUY_UPPER_AMOUNT) solAmount = ADDITIONAL_FEE + BUY_UPPER_AMOUNT;

      const wallet = Keypair.generate();
      wallets.push({ kp: wallet, buyAmount: solAmount });

      sendSolTx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports: solAmount * LAMPORTS_PER_SOL,
        }),
      );
    }
    wallets.map((wallet) => {
      data.push({
        privateKey: base58.encode(wallet.kp.secretKey),
        pubkey: wallet.kp.publicKey.toBase58(),
        solBalance: wallet.buyAmount + ADDITIONAL_FEE,
        tokenBuyTx: null,
        tokenSellTx: null,
      });
    });
    try {
      saveDataToFile(data);
    } catch (error) {}
    let index = 0;
    while (true) {
      try {
        if (index > 3) {
          console.log('Error in distribution');
          return null;
        }
        const siTx = new Transaction().add(...sendSolTx);
        const latestBlockhash = await solanaConnection.getLatestBlockhash();
        siTx.feePayer = mainKp.publicKey;
        siTx.recentBlockhash = latestBlockhash.blockhash;
        const messageV0 = new TransactionMessage({
          payerKey: mainKp.publicKey,
          recentBlockhash: latestBlockhash.blockhash,
          instructions: sendSolTx,
        }).compileToV0Message();
        const transaction = new VersionedTransaction(messageV0);
        transaction.sign([mainKp]);
        const txSig = await execute(transaction, latestBlockhash);
        const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
        console.log('SOL distributed ', tokenBuyTx);
        break;
      } catch (error) {
        index++;
      }
    }

    console.log('Success in transferring sol');
    return wallets;
  } catch (error) {
    console.log(`Failed to transfer SOL`);
    return null;
  }
};

const buy = async (newWallet: Keypair, baseMint: PublicKey, buyAmount: number, poolId: PublicKey) => {
  let solBalance: number = 0;
  try {
    solBalance = await solanaConnection.getBalance(newWallet.publicKey);
  } catch (error) {
    console.log('Error getting balance of wallet');
    return null;
  }
  if (solBalance == 0) {
    return null;
  }
  try {
    let tx;
    if (SWAP_ROUTING) tx = await getBuyTxWithJupiter(newWallet, baseMint, buyAmount);
    else tx = await getBuyTx(solanaConnection, newWallet, baseMint, NATIVE_MINT, buyAmount, poolId.toBase58());
    if (tx == null) {
      console.log(`Error getting buy transaction`);
      return null;
    }
    const latestBlockhash = await solanaConnection.getLatestBlockhash();
    const txSig = await execute(tx, latestBlockhash);
    const tokenBuyTx = txSig ? `https://solscan.io/tx/${txSig}` : '';
    editJson({
      tokenBuyTx,
      pubkey: newWallet.publicKey.toBase58(),
      solBalance: solBalance / 10 ** 9 - buyAmount,
    });
    return tokenBuyTx;
  } catch (error) {
    return null;
  }
};

const sell = async (poolId: PublicKey, baseMint: PublicKey, wallet: Keypair) => {
  try {
    const data: Data[] = readJson();
    if (data.length == 0) {
      await sleep(1000);
      return null;
    }

    const tokenAta = await getAssociatedTokenAddress(baseMint, wallet.publicKey);
    const tokenBalInfo = await solanaConnection.getTokenAccountBalance(tokenAta);
    if (!tokenBalInfo) {
      console.log('Balance incorrect');
      return null;
    }
    const tokenBalance = tokenBalInfo.value.amount;

    try {
      let sellTx;
      if (SWAP_ROUTING) sellTx = await getSellTxWithJupiter(wallet, baseMint, tokenBalance);
      else sellTx = await getSellTx(solanaConnection, wallet, baseMint, NATIVE_MINT, tokenBalance, poolId.toBase58());

      if (sellTx == null) {
        console.log(`Error getting buy transaction`);
        return null;
      }

      const latestBlockhashForSell = await solanaConnection.getLatestBlockhash();
      const txSellSig = await execute(sellTx, latestBlockhashForSell, false);
      const tokenSellTx = txSellSig ? `https://solscan.io/tx/${txSellSig}` : '';
      const solBalance = await solanaConnection.getBalance(wallet.publicKey);
      editJson({
        pubkey: wallet.publicKey.toBase58(),
        tokenSellTx,
        solBalance,
      });
      return tokenSellTx;
    } catch (error) {
      return null;
    }
  } catch (error) {
    return null;
  }
};

main();
