import { logger, retrieveEnvVariable } from "../utils"

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY', logger)
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger)
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger)

export const IS_RANDOM = retrieveEnvVariable('IS_RANDOM', logger) === 'true'
export const SWAP_ROUTING = retrieveEnvVariable('SWAP_ROUTING', logger) === 'true'
export const DISTRIBUTION_AMOUNT = Number(retrieveEnvVariable('DISTRIBUTION_AMOUNT', logger))
export const BUY_AMOUNT = Number(retrieveEnvVariable('BUY_AMOUNT', logger))
export const BUY_UPPER_AMOUNT = Number(retrieveEnvVariable('BUY_UPPER_AMOUNT', logger))
export const BUY_LOWER_AMOUNT = Number(retrieveEnvVariable('BUY_LOWER_AMOUNT', logger))

export const BUY_INTERVAL_MIN = Number(retrieveEnvVariable('BUY_INTERVAL_MIN', logger))
export const BUY_INTERVAL_MAX = Number(retrieveEnvVariable('BUY_INTERVAL_MAX', logger))

export const SELL_ALL_BY_TIMES = Number(retrieveEnvVariable('SELL_ALL_BY_TIMES', logger))
export const SELL_PERCENT = Number(retrieveEnvVariable('SELL_PERCENT', logger))

export const DISTRIBUTE_WALLET_NUM = Number(retrieveEnvVariable('DISTRIBUTE_WALLET_NUM', logger))
// export const CHECK_BAL_INTERVAL = Number(retrieveEnvVariable('CHECK_BAL_INTERVAL', logger))

export const WALLET_NUM = Number(retrieveEnvVariable('WALLET_NUM', logger))

export const TX_FEE = Number(retrieveEnvVariable('TX_FEE', logger))

export const TOKEN_MINT = retrieveEnvVariable('TOKEN_MINT', logger)
export const POOL_ID = retrieveEnvVariable('POOL_ID', logger)

export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL', logger)

export const ADDITIONAL_FEE = Number(retrieveEnvVariable('ADDITIONAL_FEE', logger))
// export const JITO_KEY = retrieveEnvVariable('JITO_KEY', logger)
// export const BLOCKENGINE_URL = retrieveEnvVariable('BLOCKENGINE_URL', logger)
// export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE', logger))


