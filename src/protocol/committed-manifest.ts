import manifestJson from '../../manifests/hyperlend-core-usdc-999-40367898.v1.json' with { type: 'json' };
import { marketManifestSchema } from './manifest.js';

export const committedMarketManifest = marketManifestSchema.parse(manifestJson);
