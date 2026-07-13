import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAddress } from 'viem';
import { parseAnalyticsArguments } from './cli/analytics-arguments.js';
import { parseDiscoverArguments } from './cli/discover-arguments.js';
import { parseIndexerArguments } from './cli/indexer-arguments.js';
import { parseEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import { PostgresAnalyticsStore } from './analytics/postgres-store.js';
import {
  createMarketSnapshot,
  exactJson,
  getCurrentState,
  getFlows,
  rebuildHourlyFlows,
} from './analytics/service.js';
import { ViemMarketStateSource } from './analytics/source.js';
import { PostgresIndexerStore } from './indexer/postgres-store.js';
import { backfill, indexingReportToJson, sync } from './indexer/service.js';
import { ViemChainSource } from './indexer/source.js';
import { committedMarketManifest } from './protocol/committed-manifest.js';
import { discoverMarket } from './protocol/discover.js';

async function runDiscover() {
  const arguments_ = parseDiscoverArguments(process.argv.slice(2), process.env);
  const manifest = await discoverMarket({
    rpcUrl: arguments_.rpcUrl,
    blockNumber: arguments_.blockNumber,
  });
  const json = `${JSON.stringify(manifest, null, 2)}\n`;

  if (arguments_.outputPath) {
    await writeFile(resolve(arguments_.outputPath), json, { encoding: 'utf8', flag: 'wx' });
  }
  process.stdout.write(json);
}

async function runIndexer() {
  const command = parseIndexerArguments(process.argv.slice(2));
  const environment = parseEnv(process.env);
  const connection = createDatabase(environment.databaseUrl);
  const poolContract = committedMarketManifest.contracts.pool;
  if (!poolContract) throw new Error('committed manifest is missing the Pool contract');
  const source = new ViemChainSource({
    rpcUrl: environment.hyperEvmArchiveRpcUrl,
    poolAddress: getAddress(poolContract.address),
  });
  const store = new PostgresIndexerStore(connection.client);

  try {
    const common = {
      source,
      store,
      manifest: committedMarketManifest,
      confirmationLag: environment.confirmationLag,
      chunkSize: BigInt(environment.logBlockChunkSize),
    };
    const report =
      command.command === 'backfill'
        ? await backfill({ ...common, fromBlock: command.fromBlock, toBlock: command.toBlock })
        : await sync(common);
    process.stdout.write(`${JSON.stringify(indexingReportToJson(report), null, 2)}\n`);
  } finally {
    await connection.client.end();
  }
}

async function runAnalytics() {
  const command = parseAnalyticsArguments(process.argv.slice(2));
  const environment = parseEnv(process.env);
  const connection = createDatabase(environment.databaseUrl);
  const store = new PostgresAnalyticsStore(connection.client);

  try {
    let result: unknown;
    switch (command.command) {
      case 'snapshot':
        result = await createMarketSnapshot({
          source: new ViemMarketStateSource({ rpcUrl: environment.hyperEvmArchiveRpcUrl }),
          store,
          manifest: committedMarketManifest,
          blockNumber: command.blockNumber,
          confirmationLag: environment.confirmationLag,
        });
        break;
      case 'rebuild-flows':
        result = await rebuildHourlyFlows({ store, manifest: committedMarketManifest });
        break;
      case 'state':
        result = await getCurrentState({ store, manifest: committedMarketManifest });
        break;
      case 'flows':
        result = await getFlows({
          store,
          manifest: committedMarketManifest,
          fromTimestamp: command.fromTimestamp,
          toTimestamp: command.toTimestamp,
        });
        break;
    }
    process.stdout.write(`${JSON.stringify(exactJson(result), null, 2)}\n`);
  } finally {
    await connection.client.end();
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'discover') await runDiscover();
  else if (command === 'backfill' || command === 'sync') await runIndexer();
  else await runAnalytics();
}

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
