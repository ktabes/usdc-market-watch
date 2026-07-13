import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { marketManifestSchema } from '../../src/protocol/manifest.js';

const manifestPath = fileURLToPath(
  new URL('../../manifests/hyperlend-core-usdc-999-40367898.v1.json', import.meta.url),
);

describe('committed Phase 1 market manifest', () => {
  it('matches the versioned machine-readable schema and contains only passing checks', async () => {
    const manifest = marketManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
    );
    expect(manifest.checks.length).toBeGreaterThan(30);
    expect(manifest.checks.every((check) => check.status === 'PASS')).toBe(true);
    expect(manifest.source.candidateDiscrepancies).toHaveLength(2);
  });
});
