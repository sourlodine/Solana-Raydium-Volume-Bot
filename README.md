# Raydium Volume Bot

## Objective

The goal of this bot is to facilitate over 1M in trading volume by distributing SOL across multiple wallets and engaging in perpetual buy and sell transactions on Raydium.

## Features

- **Automated Wallet Creation**: Automatically generates multiple wallets to facilitate trading.
- **Automated SOL Distribution**: Allocates SOL to these wallets.
- **Continuous Trading**: Ensures ongoing buy and sell operations across different wallets.
- **Configurable Parameters**: Offers customization options for transaction amounts, timing, distribution strategies, and more.

## Usage Instructions

1. **Clone the Repository**

   ```
   git clone https://github.com/sourlodine/Solana-Raydium-Volume-Bot.git
   cd Solana-Raydium-Volume-Bot
   ```

2. **Install Dependencies**

   ```
   npm install
   ```

3. **Set Up Environment Variables**
   Rename `.env.example` to `.env` and configure it with your RPC and WSS URLs, the main wallet's secret key, and the jito auth keypair.

4. **Launch the Bot**
   ```
   npm run start
   ```

## Comparison with Previous Versions

### Drawbacks of the Previous Version

- **Static Wallet Usage**: Utilized fixed wallets for transactions, making the trading pattern obvious on DexScreener.
- **Lack of Maker Diversity**: Did not contribute to an increase in the number of market makers, only the volume.
- **Inefficient Token Management**: Tokens were accumulated in the main wallet without being sold first.
- **Balanced Buy/Sell Transactions**: Each cycle ended with a sell, creating downward price pressure.

## Enhancements in the Current Version

- **Dynamic SOL Transfers**: Transfers SOL to a new wallet after each buy-sell cycle.
- **Increased Maker Participation**: Generates new wallets continuously, enhancing market maker diversity.
- **Prioritized Selling**: Sells remaining tokens before gathering SOL, optimizing the use of funds.
- **Buy Dominance**: Executes two buys for every sell, fostering greater buying pressure.
- **Extensive Customization**: Allows detailed configuration to suit various operational needs.

## Contact Information

For inquiries, contact me via [Telegram](https://t.me/tarpan_tg) or Discord at @tarpan_web3.

Feel free to reach out for assistance with other bots such as the aydium and Pumpfun sniper, Raydium bundler, Pumpfun bundler Shit-token Launcher, Token-freezer, Market maker bot, and more. I also offer both console-based and Telegram-integrated bot versions.
