import { ABI_VERSION } from '../protocol/abis.js';
import {
  decodeMarketEvent,
  isMarketEvent,
  normalizedEventToJson,
  type NormalizedMarketEvent,
} from '../protocol/events.js';
import type { Address } from 'viem';
import type { ChainBlock, ChainLog, PreparedMarketLog } from './types.js';

export interface DecodedLogBatch {
  readonly records: readonly PreparedMarketLog[];
  readonly decodedCount: number;
  readonly filteredCount: number;
}

export function decodeAndFilterMarketLogs(
  logs: readonly ChainLog[],
  blocks: ReadonlyMap<bigint, ChainBlock>,
  underlyingAsset: Address,
): DecodedLogBatch {
  const records: PreparedMarketLog[] = [];
  let filteredCount = 0;

  for (const log of logs) {
    const event = decodeMarketEvent({ topics: log.topics, data: log.data });
    if (!isMarketEvent(event, underlyingAsset)) {
      filteredCount += 1;
      continue;
    }
    const block = blocks.get(log.blockNumber);
    if (!block) throw new Error(`missing block header for event block ${log.blockNumber}`);
    if (block.hash !== log.blockHash) {
      throw new Error(`block hash mismatch for event block ${log.blockNumber}`);
    }
    records.push({ log, block, event, decodedPayload: normalizedEventToJson(event) });
  }

  return { records, decodedCount: logs.length, filteredCount };
}

export interface EventColumns {
  readonly eventType: NormalizedMarketEvent['eventType'];
  readonly reserve: string | null;
  readonly collateralAsset: string | null;
  readonly debtAsset: string | null;
  readonly userAddress: string;
  readonly onBehalfOf: string | null;
  readonly counterparty: string | null;
  readonly amountBaseUnits: bigint | null;
  readonly debtToCoverBaseUnits: bigint | null;
  readonly liquidatedCollateralBaseUnits: bigint | null;
  readonly borrowRateRay: bigint | null;
  readonly interestRateMode: number | null;
  readonly referralCode: number | null;
  readonly useATokens: boolean | null;
  readonly receiveAToken: boolean | null;
}

export function eventToColumns(event: NormalizedMarketEvent): EventColumns {
  switch (event.eventType) {
    case 'Supply':
      return {
        eventType: event.eventType,
        reserve: event.reserve,
        collateralAsset: null,
        debtAsset: null,
        userAddress: event.user,
        onBehalfOf: event.onBehalfOf,
        counterparty: null,
        amountBaseUnits: event.amountBaseUnits,
        debtToCoverBaseUnits: null,
        liquidatedCollateralBaseUnits: null,
        borrowRateRay: null,
        interestRateMode: null,
        referralCode: event.referralCode,
        useATokens: null,
        receiveAToken: null,
      };
    case 'Withdraw':
      return {
        eventType: event.eventType,
        reserve: event.reserve,
        collateralAsset: null,
        debtAsset: null,
        userAddress: event.user,
        onBehalfOf: null,
        counterparty: event.to,
        amountBaseUnits: event.amountBaseUnits,
        debtToCoverBaseUnits: null,
        liquidatedCollateralBaseUnits: null,
        borrowRateRay: null,
        interestRateMode: null,
        referralCode: null,
        useATokens: null,
        receiveAToken: null,
      };
    case 'Borrow':
      return {
        eventType: event.eventType,
        reserve: event.reserve,
        collateralAsset: null,
        debtAsset: null,
        userAddress: event.user,
        onBehalfOf: event.onBehalfOf,
        counterparty: null,
        amountBaseUnits: event.amountBaseUnits,
        debtToCoverBaseUnits: null,
        liquidatedCollateralBaseUnits: null,
        borrowRateRay: event.borrowRateRay,
        interestRateMode: event.interestRateMode,
        referralCode: event.referralCode,
        useATokens: null,
        receiveAToken: null,
      };
    case 'Repay':
      return {
        eventType: event.eventType,
        reserve: event.reserve,
        collateralAsset: null,
        debtAsset: null,
        userAddress: event.user,
        onBehalfOf: null,
        counterparty: event.repayer,
        amountBaseUnits: event.amountBaseUnits,
        debtToCoverBaseUnits: null,
        liquidatedCollateralBaseUnits: null,
        borrowRateRay: null,
        interestRateMode: null,
        referralCode: null,
        useATokens: event.useATokens,
        receiveAToken: null,
      };
    case 'LiquidationCall':
      return {
        eventType: event.eventType,
        reserve: null,
        collateralAsset: event.collateralAsset,
        debtAsset: event.debtAsset,
        userAddress: event.user,
        onBehalfOf: null,
        counterparty: event.liquidator,
        amountBaseUnits: null,
        debtToCoverBaseUnits: event.debtToCoverBaseUnits,
        liquidatedCollateralBaseUnits: event.liquidatedCollateralBaseUnits,
        borrowRateRay: null,
        interestRateMode: null,
        referralCode: null,
        useATokens: null,
        receiveAToken: event.receiveAToken,
      };
  }
}

export { ABI_VERSION as DECODER_VERSION };
