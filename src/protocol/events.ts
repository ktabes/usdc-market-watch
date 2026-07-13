import { decodeEventLog, getAddress, type Address, type Hex } from 'viem';
import { poolEventAbi } from './abis.js';
import { marketCandidates } from './addresses.js';

interface SupplyEvent {
  readonly eventType: 'Supply';
  readonly reserve: Address;
  readonly user: Address;
  readonly onBehalfOf: Address;
  readonly amountBaseUnits: bigint;
  readonly referralCode: number;
}

interface WithdrawEvent {
  readonly eventType: 'Withdraw';
  readonly reserve: Address;
  readonly user: Address;
  readonly to: Address;
  readonly amountBaseUnits: bigint;
}

interface BorrowEvent {
  readonly eventType: 'Borrow';
  readonly reserve: Address;
  readonly user: Address;
  readonly onBehalfOf: Address;
  readonly amountBaseUnits: bigint;
  readonly interestRateMode: number;
  readonly borrowRateRay: bigint;
  readonly referralCode: number;
}

interface RepayEvent {
  readonly eventType: 'Repay';
  readonly reserve: Address;
  readonly user: Address;
  readonly repayer: Address;
  readonly amountBaseUnits: bigint;
  readonly useATokens: boolean;
}

interface LiquidationEvent {
  readonly eventType: 'LiquidationCall';
  readonly collateralAsset: Address;
  readonly debtAsset: Address;
  readonly user: Address;
  readonly debtToCoverBaseUnits: bigint;
  readonly liquidatedCollateralBaseUnits: bigint;
  readonly liquidator: Address;
  readonly receiveAToken: boolean;
}

export type NormalizedMarketEvent =
  SupplyEvent | WithdrawEvent | BorrowEvent | RepayEvent | LiquidationEvent;

function recordArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('decoded event arguments are missing');
  return value as Record<string, unknown>;
}

function addressArgument(arguments_: Record<string, unknown>, name: string): Address {
  const value = arguments_[name];
  if (typeof value !== 'string') throw new Error(`${name} is not an address`);
  return getAddress(value);
}

function bigintArgument(arguments_: Record<string, unknown>, name: string): bigint {
  const value = arguments_[name];
  if (typeof value !== 'bigint') throw new Error(`${name} is not a bigint`);
  return value;
}

function numberArgument(arguments_: Record<string, unknown>, name: string): number {
  const value = arguments_[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${name} is not a safe integer`);
  }
  return value;
}

function booleanArgument(arguments_: Record<string, unknown>, name: string): boolean {
  const value = arguments_[name];
  if (typeof value !== 'boolean') throw new Error(`${name} is not a boolean`);
  return value;
}

export function decodeMarketEvent(input: {
  readonly topics: readonly Hex[];
  readonly data: Hex;
}): NormalizedMarketEvent {
  if (input.topics.length === 0) throw new Error('event log has no topics');
  const decoded = decodeEventLog({
    abi: poolEventAbi,
    topics: input.topics as [Hex, ...Hex[]],
    data: input.data,
    strict: true,
  });
  const arguments_ = recordArguments(decoded.args);

  switch (decoded.eventName) {
    case 'Supply':
      return {
        eventType: 'Supply',
        reserve: addressArgument(arguments_, 'reserve'),
        user: addressArgument(arguments_, 'user'),
        onBehalfOf: addressArgument(arguments_, 'onBehalfOf'),
        amountBaseUnits: bigintArgument(arguments_, 'amount'),
        referralCode: numberArgument(arguments_, 'referralCode'),
      };
    case 'Withdraw':
      return {
        eventType: 'Withdraw',
        reserve: addressArgument(arguments_, 'reserve'),
        user: addressArgument(arguments_, 'user'),
        to: addressArgument(arguments_, 'to'),
        amountBaseUnits: bigintArgument(arguments_, 'amount'),
      };
    case 'Borrow':
      return {
        eventType: 'Borrow',
        reserve: addressArgument(arguments_, 'reserve'),
        user: addressArgument(arguments_, 'user'),
        onBehalfOf: addressArgument(arguments_, 'onBehalfOf'),
        amountBaseUnits: bigintArgument(arguments_, 'amount'),
        interestRateMode: numberArgument(arguments_, 'interestRateMode'),
        borrowRateRay: bigintArgument(arguments_, 'borrowRate'),
        referralCode: numberArgument(arguments_, 'referralCode'),
      };
    case 'Repay':
      return {
        eventType: 'Repay',
        reserve: addressArgument(arguments_, 'reserve'),
        user: addressArgument(arguments_, 'user'),
        repayer: addressArgument(arguments_, 'repayer'),
        amountBaseUnits: bigintArgument(arguments_, 'amount'),
        useATokens: booleanArgument(arguments_, 'useATokens'),
      };
    case 'LiquidationCall':
      return {
        eventType: 'LiquidationCall',
        collateralAsset: addressArgument(arguments_, 'collateralAsset'),
        debtAsset: addressArgument(arguments_, 'debtAsset'),
        user: addressArgument(arguments_, 'user'),
        debtToCoverBaseUnits: bigintArgument(arguments_, 'debtToCover'),
        liquidatedCollateralBaseUnits: bigintArgument(arguments_, 'liquidatedCollateralAmount'),
        liquidator: addressArgument(arguments_, 'liquidator'),
        receiveAToken: booleanArgument(arguments_, 'receiveAToken'),
      };
  }
}

export function isUsdcMarketEvent(event: NormalizedMarketEvent): boolean {
  if (event.eventType === 'LiquidationCall') {
    return (
      event.debtAsset === marketCandidates.usdc || event.collateralAsset === marketCandidates.usdc
    );
  }
  return event.reserve === marketCandidates.usdc;
}

export function normalizedEventToJson(event: NormalizedMarketEvent): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(event, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as Record<string, unknown>;
}
