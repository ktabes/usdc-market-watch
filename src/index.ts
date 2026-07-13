import 'dotenv/config';
import { parseEnv } from './config/env.js';

const env = parseEnv(process.env);

// Never log DATABASE_URL or other credentials.
console.info('USDC Market Watch configuration is valid.', {
  nodeEnv: env.nodeEnv,
  chainId: env.hyperEvmChainId,
  confirmationLag: env.confirmationLag,
  logBlockChunkSize: env.logBlockChunkSize,
});
