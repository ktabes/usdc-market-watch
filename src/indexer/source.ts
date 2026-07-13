import { createPublicClient, getAddress, http, type Address } from 'viem';
import { poolEventAbi } from '../protocol/abis.js';
import { HYPEREVM_CHAIN_ID } from '../protocol/addresses.js';
import { withRpcRetry, type RetryPolicy } from './retry.js';
import type { BlockRange, ChainBlock, ChainLog, ChainSource } from './types.js';

export interface ViemChainSourceOptions {
  readonly rpcUrl: string;
  readonly poolAddress: Address;
  readonly retryPolicy?: RetryPolicy;
  readonly requestsPerSecond?: number;
}

export class ViemChainSource implements ChainSource {
  private readonly client;
  private readonly poolAddress: Address;
  private readonly retryPolicy: RetryPolicy | undefined;
  private readonly minimumRequestIntervalMs: number;
  private nextRequestAt = 0;

  constructor(options: ViemChainSourceOptions) {
    this.client = createPublicClient({
      transport: http(options.rpcUrl, { retryCount: 0, timeout: 20_000 }),
    });
    this.poolAddress = options.poolAddress;
    this.retryPolicy = options.retryPolicy;
    const requestsPerSecond = options.requestsPerSecond ?? 30;
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
      throw new RangeError('requestsPerSecond must be positive');
    }
    this.minimumRequestIntervalMs = Math.ceil(1_000 / requestsPerSecond);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const delay = this.nextRequestAt - now;
    if (delay > 0) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    this.nextRequestAt = Date.now() + this.minimumRequestIntervalMs;
  }

  private request<T>(operation: () => Promise<T>): Promise<T> {
    const execute = async () => {
      await this.throttle();
      return operation();
    };
    return this.retryPolicy ? withRpcRetry(execute, this.retryPolicy) : withRpcRetry(execute);
  }

  getChainId(): Promise<number> {
    return this.request(() => this.client.getChainId());
  }

  getLatestBlockNumber(): Promise<bigint> {
    return this.request(() => this.client.getBlockNumber());
  }

  async getBlock(blockNumber: bigint): Promise<ChainBlock> {
    const block = await this.request(() => this.client.getBlock({ blockNumber }));
    return { number: block.number, hash: block.hash, timestamp: block.timestamp };
  }

  async getMarketLogs(range: BlockRange): Promise<readonly ChainLog[]> {
    const logs = await this.request(() =>
      this.client.getLogs({
        address: this.poolAddress,
        events: poolEventAbi,
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        strict: true,
      }),
    );

    return logs.map((log) => {
      if (
        log.blockNumber === null ||
        log.blockHash === null ||
        log.transactionHash === null ||
        log.transactionIndex === null ||
        log.logIndex === null
      ) {
        throw new Error('finalized event log is missing block or transaction identity');
      }
      return {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
        address: getAddress(log.address),
        topics: log.topics,
        data: log.data,
      };
    });
  }
}

export function assertIndexerChainId(chainId: number): void {
  if (chainId !== HYPEREVM_CHAIN_ID) {
    throw new Error(`Indexer chain mismatch: expected ${HYPEREVM_CHAIN_ID}, received ${chainId}`);
  }
}
