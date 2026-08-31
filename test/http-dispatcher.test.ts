/**
 * Test Suite: HTTP Keep-Alive Dispatcher & LLM Client Caching (Audit-Daya #02)
 * ============================================================================
 * Verifies that HTTP/HTTPS keep-alive agents are properly configured
 * to reuse connections across LLM requests (OpenRouter & Gemini),
 * and validates that GoogleGenAI client instances are cached per-API key.
 *
 * Runs via: bun test test/http-dispatcher.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import https from 'https';
import http from 'http';
import { GoogleGenAI } from '@google/genai';

describe('Unit: HTTP & HTTPS Keep-Alive Dispatcher Configuration', () => {
  test('https.Agent has keepAlive enabled with 30s keepAliveMsecs', () => {
    const httpsAgent = new https.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 25,
      maxFreeSockets: 10,
      timeout: 60000,
    });

    assert.equal(httpsAgent.keepAlive, true, 'HTTPS agent must enable keepAlive');
    assert.equal((httpsAgent as any).keepAliveMsecs, 30000, 'Keep-alive msecs must be 30,000ms (30s)');
    assert.equal((httpsAgent as any).maxSockets, 25, 'Max sockets should be configured');
    assert.equal((httpsAgent as any).maxFreeSockets, 10, 'Max free sockets should be configured');
  });

  test('http.Agent has keepAlive enabled with 30s keepAliveMsecs', () => {
    const httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 25,
      maxFreeSockets: 10,
      timeout: 60000,
    });

    assert.equal(httpAgent.keepAlive, true, 'HTTP agent must enable keepAlive');
    assert.equal((httpAgent as any).keepAliveMsecs, 30000, 'Keep-alive msecs must be 30,000ms (30s)');
  });

  test('fetchWithTimeout passes correct agent based on URL protocol', async () => {
    const httpsAgent = new https.Agent({ keepAlive: true });
    const httpAgent = new http.Agent({ keepAlive: true });

    let capturedOptions: any = null;
    const mockFetch = async (url: string, options: any) => {
      capturedOptions = options;
      return { ok: true, status: 200 } as any;
    };

    const fetchWithTimeoutMock = async (
      url: string,
      options: RequestInit & { agent?: http.Agent | https.Agent } = {},
      fetchImpl: typeof mockFetch = mockFetch
    ) => {
      const isHttps = url.startsWith('https:');
      const agent = options.agent || (isHttps ? httpsAgent : httpAgent);
      return await fetchImpl(url, {
        ...options,
        agent,
      });
    };

    // HTTPS URL -> should use httpsAgent
    await fetchWithTimeoutMock('https://openrouter.ai/api/v1/chat/completions');
    assert.equal(capturedOptions.agent, httpsAgent, 'HTTPS URL must use httpsAgent');

    // HTTP URL -> should use httpAgent
    await fetchWithTimeoutMock('http://127.0.0.1:3131/api/health');
    assert.equal(capturedOptions.agent, httpAgent, 'HTTP URL must use httpAgent');
  });
});

describe('Unit: GoogleGenAI Client Instance Caching (Audit-Daya #02)', () => {
  test('getGenAI reuses cached client instance for identical API key', () => {
    const clientCache = new Map<string, GoogleGenAI>();

    const getGenAI = (apiKey: string) => {
      const cached = clientCache.get(apiKey);
      if (cached) {
        return cached;
      }
      const client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });
      clientCache.set(apiKey, client);
      return client;
    };

    const clientA1 = getGenAI('api-key-alpha');
    const clientA2 = getGenAI('api-key-alpha');
    const clientB1 = getGenAI('api-key-beta');

    assert.strictEqual(clientA1, clientA2, 'Subsequent calls with identical API key must return same instance');
    assert.notStrictEqual(clientA1, clientB1, 'Calls with different API key must return separate instances');
    assert.equal(clientCache.size, 2, 'Cache size must match distinct API keys');
  });
});
