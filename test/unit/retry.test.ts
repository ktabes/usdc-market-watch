import { describe, expect, it, vi } from 'vitest';
import { classifyRpcError, RpcOperationError, withRpcRetry } from '../../src/indexer/retry.js';

describe('bounded RPC retry', () => {
  it('retries a transient rate limit with bounded exponential delays', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('HTTP 429 too many requests'))
      .mockRejectedValueOnce(new Error('503 service unavailable'))
      .mockResolvedValue('ok');
    const delays: number[] = [];

    await expect(
      withRpcRetry(
        operation,
        { maxAttempts: 4, initialDelayMs: 100, maximumDelayMs: 150 },
        (delay) => {
          delays.push(delay);
          return Promise.resolve();
        },
      ),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 150]);
  });

  it('does not retry invalid requests or oversized ranges', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('invalid params: block range too wide'));
    await expect(withRpcRetry(operation)).rejects.toMatchObject({
      classification: 'range_limit',
      retryable: false,
      attempts: 1,
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops after the configured number of transient attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('fetch failed: ECONNRESET'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRpcRetry(operation, { maxAttempts: 3, initialDelayMs: 1, maximumDelayMs: 2 }, sleep),
    ).rejects.toBeInstanceOf(RpcOperationError);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('classifies and redacts transport failures', () => {
    const classified = classifyRpcError(
      new Error('fetch failed https://user:secret@rpc.example/path?key=secret ENOTFOUND'),
    );
    expect(classified.classification).toBe('network');
    expect(classified.message).not.toContain('secret');
    expect(classified.message).toContain('[rpc-url-redacted]');
  });
});
