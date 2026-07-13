import type { IngestionFailure, RpcFailureClassification } from './types.js';

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  initialDelayMs: 250,
  maximumDelayMs: 2_000,
};

export class RpcOperationError extends Error implements IngestionFailure {
  readonly classification: RpcFailureClassification;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(failure: IngestionFailure, options?: ErrorOptions) {
    super(failure.message, options);
    this.name = 'RpcOperationError';
    this.classification = failure.classification;
    this.retryable = failure.retryable;
    this.attempts = failure.attempts;
  }
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/[^\s]+/gi, '[rpc-url-redacted]').slice(0, 2_000);
}

export function classifyRpcError(error: unknown): Omit<IngestionFailure, 'attempts'> {
  const message = safeMessage(error);
  const lower = message.toLowerCase();

  if (/429|rate.?limit|too many requests/.test(lower)) {
    return { classification: 'rate_limit', retryable: true, message };
  }
  if (/timeout|timed out|aborterror/.test(lower)) {
    return { classification: 'timeout', retryable: true, message };
  }
  if (/enotfound|econnreset|econnrefused|fetch failed|network/.test(lower)) {
    return { classification: 'network', retryable: true, message };
  }
  if (/500|502|503|504|internal server|bad gateway|service unavailable/.test(lower)) {
    return { classification: 'server', retryable: true, message };
  }
  if (/block range|query range|more than 50|range too (large|wide)/.test(lower)) {
    return { classification: 'range_limit', retryable: false, message };
  }
  if (/invalid (argument|params|request)|parse error|method not found/.test(lower)) {
    return { classification: 'invalid_request', retryable: false, message };
  }
  return { classification: 'unknown', retryable: false, message };
}

const defaultSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function withRpcRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  sleep: (milliseconds: number) => Promise<void> = defaultSleep,
): Promise<T> {
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive safe integer');
  }

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const classified = classifyRpcError(error);
      if (!classified.retryable || attempt === policy.maxAttempts) {
        throw new RpcOperationError({ ...classified, attempts: attempt }, { cause: error });
      }
      const delay = Math.min(policy.initialDelayMs * 2 ** (attempt - 1), policy.maximumDelayMs);
      await sleep(delay);
    }
  }

  throw new Error('unreachable retry state');
}
