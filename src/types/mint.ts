import { struct, u32, u8 } from '@solana/buffer-layout';
import { bool, publicKey, u64 } from '@solana/buffer-layout-utils';
import { PublicKey } from '@solana/web3.js';
import { LiquidityPoolKeysV4 } from '@raydium-io/raydium-sdk';

/** Information about a mint */
export interface Mint {
  /** Address of the mint */
  address: PublicKey;
  /**
   * Optional authority used to mint new tokens. The mint authority may only be provided during mint creation.
   * If no mint authority is present then the mint has a fixed supply and no further tokens may be minted.
   */
  mintAuthority: PublicKey | null;
  /** Total supply of tokens */
  supply: bigint;
  /** Number of base 10 digits to the right of the decimal place */
  decimals: number;
  /** Is this mint initialized */
  isInitialized: boolean;
  /** Optional authority to freeze token accounts */
  freezeAuthority: PublicKey | null;
}

/** Mint as stored by the program */
export interface RawMint {
  mintAuthorityOption: 1 | 0;
  mintAuthority: PublicKey;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthorityOption: 1 | 0;
  freezeAuthority: PublicKey;
}

/** Buffer layout for de/serializing a mint */
export const MintLayout = struct<RawMint>([
  u32('mintAuthorityOption'),
  publicKey('mintAuthority'),
  u64('supply'),
  u8('decimals'),
  bool('isInitialized'),
  u32('freezeAuthorityOption'),
  publicKey('freezeAuthority'),
]);

export interface PoolState {
  quoteVault: PublicKey | null;
  poolKeys: LiquidityPoolKeysV4 | null;
  stats: {
    sold: number;
    bought: number;
    totalSolPut: number;
    changeAmount: number;
    buyNum: number;
    sellNum: number;
  };
}
