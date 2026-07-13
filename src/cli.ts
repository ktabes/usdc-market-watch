import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDiscoverArguments } from './cli/discover-arguments.js';
import { discoverMarket } from './protocol/discover.js';

async function main() {
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

await main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
