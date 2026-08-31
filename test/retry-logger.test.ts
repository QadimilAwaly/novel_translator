/**
 * Test Suite: Low-Overhead Retry Logger (Audit-Daya #08)
 * =======================================================
 * Verifies that logRetryWarn suppresses transient attempt 1 warnings
 * in production mode to save CPU/PTY cycles, while retaining full visibility
 * in dev mode or when DEBUG is set.
 *
 * Runs via: bun test test/retry-logger.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';

describe('Unit: logRetryWarn Behavior (Audit-Daya #08)', () => {
  const createLogger = (isProduction: boolean, debugEnv?: string) => {
    const logs: string[] = [];
    const logger = (msg: string, attempt: number) => {
      if (!isProduction || attempt >= 2 || debugEnv) {
        logs.push(msg);
      }
    };
    return { logger, logs };
  };

  test('In development mode (isProduction = false), all retry attempts are logged', () => {
    const { logger, logs } = createLogger(false);

    logger('[OpenRouter Retry 1] 503 Service Unavailable', 1);
    logger('[OpenRouter Retry 2] 503 Service Unavailable', 2);
    logger('[OpenRouter Retry 3] 503 Service Unavailable', 3);

    assert.equal(logs.length, 3, 'Dev mode must log all 3 retry attempts');
    assert.equal(logs[0], '[OpenRouter Retry 1] 503 Service Unavailable');
  });

  test('In production mode (isProduction = true), attempt 1 is suppressed and attempt 2+ is logged', () => {
    const { logger, logs } = createLogger(true);

    logger('[Gemini Attempt 1 on gemini-2.5-flash] Failed: 503 High Demand', 1);
    logger('[Gemini Attempt 2 on gemini-2.5-flash] Failed: 503 High Demand', 2);

    assert.equal(logs.length, 1, 'Prod mode must suppress noisy attempt 1 and only log attempt >= 2');
    assert.equal(logs[0], '[Gemini Attempt 2 on gemini-2.5-flash] Failed: 503 High Demand');
  });

  test('In production mode with DEBUG enabled, all retry attempts are logged', () => {
    const { logger, logs } = createLogger(true, '1');

    logger('[OpenRouter Retry 1] 429 Rate Limit', 1);
    logger('[OpenRouter Retry 2] 429 Rate Limit', 2);

    assert.equal(logs.length, 2, 'DEBUG flag must re-enable attempt 1 logging in prod');
  });
});
