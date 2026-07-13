export type AnalyticsCommand =
  | { readonly command: 'snapshot'; readonly blockNumber: bigint }
  | { readonly command: 'rebuild-flows' }
  | { readonly command: 'state' }
  | { readonly command: 'flows'; readonly fromTimestamp: bigint; readonly toTimestamp: bigint };

function parseInteger(name: string, value: string | undefined, minimum: bigint): bigint {
  if (!value || !/^\d+$/.test(value)) throw new Error(`${name} must be an integer`);
  const parsed = BigInt(value);
  if (parsed < minimum) throw new Error(`${name} must be at least ${minimum.toString()}`);
  return parsed;
}

function parseExactFlags(arguments_: readonly string[], names: readonly string[]) {
  if (arguments_.length !== names.length * 2) {
    throw new Error(`expected ${names.map((name) => `--${name} <value>`).join(' ')}`);
  }
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith('--') || !value) throw new Error('analytics arguments are malformed');
    const name = flag.slice(2);
    if (!names.includes(name) || values.has(name)) throw new Error(`unexpected flag --${name}`);
    values.set(name, value);
  }
  return values;
}

export function parseAnalyticsArguments(arguments_: readonly string[]): AnalyticsCommand {
  const [command, ...rest] = arguments_;
  switch (command) {
    case 'snapshot': {
      const flags = parseExactFlags(rest, ['block']);
      return {
        command,
        blockNumber: parseInteger('--block', flags.get('block'), 1n),
      };
    }
    case 'rebuild-flows':
    case 'state':
      if (rest.length > 0) throw new Error(`${command} does not accept arguments`);
      return { command };
    case 'flows': {
      const flags = parseExactFlags(rest, ['from-timestamp', 'to-timestamp']);
      const fromTimestamp = parseInteger('--from-timestamp', flags.get('from-timestamp'), 0n);
      const toTimestamp = parseInteger('--to-timestamp', flags.get('to-timestamp'), 0n);
      if (toTimestamp < fromTimestamp) {
        throw new Error('--to-timestamp must be greater than or equal to --from-timestamp');
      }
      return { command, fromTimestamp, toTimestamp };
    }
    default:
      throw new Error('expected snapshot, rebuild-flows, state, or flows analytics command');
  }
}
