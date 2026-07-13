export type ParsedIndexerCommand =
  | { readonly command: 'backfill'; readonly fromBlock: bigint; readonly toBlock: bigint }
  | { readonly command: 'sync' };

function blockFlag(arguments_: readonly string[], name: string): bigint {
  const index = arguments_.indexOf(name);
  const value = index === -1 ? undefined : arguments_[index + 1];
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} requires a non-negative integer`);
  return BigInt(value);
}

export function parseIndexerArguments(arguments_: readonly string[]): ParsedIndexerCommand {
  const command = arguments_[0];
  if (command === 'sync') {
    if (arguments_.length !== 1) throw new Error('Usage: sync');
    return { command };
  }
  if (command === 'backfill') {
    const allowed = new Set(['backfill', '--from-block', '--to-block']);
    for (const argument of arguments_) {
      if (argument.startsWith('--') && !allowed.has(argument)) {
        throw new Error(`unknown backfill option: ${argument}`);
      }
    }
    const fromBlock = blockFlag(arguments_, '--from-block');
    const toBlock = blockFlag(arguments_, '--to-block');
    if (toBlock < fromBlock) throw new Error('--to-block must be at least --from-block');
    return { command, fromBlock, toBlock };
  }
  throw new Error('Usage: backfill --from-block <number> --to-block <number> | sync');
}
