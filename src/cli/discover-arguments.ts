export interface ParsedDiscoverArguments {
  readonly blockNumber: bigint;
  readonly rpcUrl: string;
  readonly outputPath?: string;
}

function readFlag(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

export function parseDiscoverArguments(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
): ParsedDiscoverArguments {
  if (arguments_[0] !== 'discover') {
    throw new Error('Usage: discover --block <number> [--rpc-url <url>] [--out <path>]');
  }

  const blockText = readFlag(arguments_, '--block');
  if (!blockText || !/^\d+$/.test(blockText) || blockText === '0') {
    throw new Error('--block must be a positive base-10 integer');
  }

  const rpcUrl = readFlag(arguments_, '--rpc-url') ?? environment.HYPEREVM_ARCHIVE_RPC_URL;
  if (!rpcUrl) {
    throw new Error('HYPEREVM_ARCHIVE_RPC_URL or --rpc-url is required');
  }
  const parsedRpcUrl = new URL(rpcUrl);
  if (!['http:', 'https:'].includes(parsedRpcUrl.protocol)) {
    throw new Error('RPC URL must use http or https');
  }
  if (parsedRpcUrl.username || parsedRpcUrl.password || parsedRpcUrl.search || parsedRpcUrl.hash) {
    throw new Error(
      'RPC URL must be a public non-secret endpoint without userinfo, query parameters, or fragments',
    );
  }

  const outputPath = readFlag(arguments_, '--out');
  return {
    blockNumber: BigInt(blockText),
    rpcUrl,
    ...(outputPath ? { outputPath } : {}),
  };
}
