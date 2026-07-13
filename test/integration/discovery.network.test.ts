import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { protocolSources } from '../../src/protocol/addresses.js';
import { discoverMarket } from '../../src/protocol/discover.js';
import { marketManifestSchema } from '../../src/protocol/manifest.js';

const shouldRun = process.env.RUN_NETWORK_INTEGRATION_TESTS === 'true';
const describeWithNetwork = shouldRun ? describe : describe.skip;
const manifestPath = fileURLToPath(
  new URL('../../manifests/hyperlend-core-usdc-999-40367898.v1.json', import.meta.url),
);

describeWithNetwork('pinned HyperLend USDC discovery', () => {
  it('reproduces the committed contract relationships and state', async () => {
    const expected = marketManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    );
    const actual = await discoverMarket({
      rpcUrl: process.env.HYPEREVM_ARCHIVE_RPC_URL ?? protocolSources.archiveRpc,
      blockNumber: BigInt(expected.pinnedBlock.number),
      generatedAt: expected.generatedAt,
    });

    expect(actual).toEqual(expected);
  }, 60_000);
});
