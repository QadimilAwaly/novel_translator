/**
 * Test Suite: Rate Limiter & Periodic Memory Cleanup
 * ===================================================
 * Verifies rate limit enforcement (429 Too Many Requests)
 * and in-memory periodic cleanup to prevent memory leaks.
 *
 * Runs via: bun test test/rate-limit.test.ts
 */

import { test, describe, beforeAll, afterAll } from 'bun:test';
import assert from 'assert';
import express from 'express';
import type { Server } from 'http';

// Mirror of pruneIpHits from server.ts for pure unit testing
function pruneIpHits(map: Map<string, number[]>, windowMs: number, now: number = Date.now()): number {
  let removedCount = 0;
  for (const [ip, hits] of map.entries()) {
    const active = hits.filter((t) => now - t < windowMs);
    if (active.length === 0) {
      map.delete(ip);
      removedCount++;
    } else if (active.length !== hits.length) {
      map.set(ip, active);
    }
  }
  return removedCount;
}

describe('Unit: pruneIpHits memory leak prevention', () => {
  test('should completely remove expired IP entries from the map', () => {
    const map = new Map<string, number[]>();
    const now = 100000;
    const windowMs = 60000;

    // Add 5 IPs that made requests 70s ago (expired)
    for (let i = 1; i <= 5; i++) {
      map.set(`192.168.1.${i}`, [now - 70000, now - 65000]);
    }

    assert.equal(map.size, 5);
    const removed = pruneIpHits(map, windowMs, now);
    assert.equal(removed, 5);
    assert.equal(map.size, 0, 'Map size should drop to 0 after pruning expired entries');
  });

  test('should preserve active hits and remove only expired timestamps', () => {
    const map = new Map<string, number[]>();
    const now = 100000;
    const windowMs = 60000;

    // IP with 1 expired hit (70s ago) and 1 active hit (10s ago)
    map.set('10.0.0.1', [now - 70000, now - 10000]);
    // IP with only active hits
    map.set('10.0.0.2', [now - 20000, now - 5000]);
    // IP with only expired hits
    map.set('10.0.0.3', [now - 90000]);

    assert.equal(map.size, 3);
    const removed = pruneIpHits(map, windowMs, now);

    assert.equal(removed, 1, 'Only IP 10.0.0.3 should be completely removed');
    assert.equal(map.size, 2);
    assert.deepEqual(map.get('10.0.0.1'), [now - 10000], 'Expired timestamp should be pruned');
    assert.deepEqual(map.get('10.0.0.2'), [now - 20000, now - 5000], 'Active timestamps preserved');
  });

  test('should scale cleanly when pruning large transient IP sets (simulated scan/churn)', () => {
    const map = new Map<string, number[]>();
    const now = 100000;
    const windowMs = 60000;

    // Simulate 500 transient scanner IPs
    for (let i = 0; i < 500; i++) {
      map.set(`scanner-${i}`, [now - 65000]);
    }

    assert.equal(map.size, 500);
    const removed = pruneIpHits(map, windowMs, now);
    assert.equal(removed, 500);
    assert.equal(map.size, 0, 'All 500 transient entries should be deleted');
  });
});

describe('HTTP Integration: Rate Limiter Middleware', () => {
  let server: Server;
  let baseUrl: string;
  const TEST_PORT = 3280;

  beforeAll(async () => {
    const app = express();
    const testIpHits = new Map<string, number[]>();

    // Rate limiter configured for 3 requests per 800ms
    const testRateLimit = (max: number, windowMs: number) => {
      return (req: any, res: any, next: any) => {
        const ip = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || 'unknown';
        const now = Date.now();
        const hits = (testIpHits.get(ip) || []).filter((t) => now - t < windowMs);
        if (hits.length >= max) {
          return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' });
        }
        hits.push(now);
        testIpHits.set(ip, hits);
        next();
      };
    };

    app.get('/api/test-limit', testRateLimit(3, 800), (req, res) => {
      res.json({ success: true });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('should allow requests within max limit (3 requests -> 200 OK)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/test-limit`, {
        headers: { 'x-forwarded-for': '1.1.1.1' },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
    }
  });

  test('should block (429 Too Many Requests) on 4th request from same IP', async () => {
    const res = await fetch(`${baseUrl}/api/test-limit`, {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    });
    assert.equal(res.status, 429);
    const data = await res.json();
    assert.ok(data.error.includes('Terlalu banyak permintaan'));
  });

  test('should allow requests from a different IP independently', async () => {
    const res = await fetch(`${baseUrl}/api/test-limit`, {
      headers: { 'x-forwarded-for': '2.2.2.2' },
    });
    assert.equal(res.status, 200);
  });

  test('should reset rate limit after window expiration', async () => {
    // Wait for the 800ms window to expire
    await new Promise((r) => setTimeout(r, 900));

    const res = await fetch(`${baseUrl}/api/test-limit`, {
      headers: { 'x-forwarded-for': '1.1.1.1' },
    });
    assert.equal(res.status, 200, 'Request should be allowed again after window expires');
  });
});

describe('Unit: Lazy On-Demand Rate Limit Pruning (Audit-Daya #07)', () => {
  test('should lazily prune expired IP entries on incoming request without background timer', () => {
    const ipHits = new Map<string, number[]>();
    let lastPruneTime = 0;
    const windowMs = 1000;
    const max = 5;

    const rateLimitMiddleware = (reqIp: string, now: number) => {
      // Lazy prune
      if (now - lastPruneTime > windowMs && ipHits.size > 0) {
        pruneIpHits(ipHits, windowMs, now);
        lastPruneTime = now;
      }

      const hits = (ipHits.get(reqIp) || []).filter((t) => now - t < windowMs);
      if (hits.length >= max) {
        return { status: 429 };
      }
      hits.push(now);
      ipHits.set(reqIp, hits);
      return { status: 200 };
    };

    // IP 1 and IP 2 make requests at t = 100
    rateLimitMiddleware('1.1.1.1', 100);
    rateLimitMiddleware('2.2.2.2', 100);
    assert.equal(ipHits.size, 2);

    // At t = 1500 (window expired for IP 1 & 2), IP 3 makes a request
    const res = rateLimitMiddleware('3.3.3.3', 1500);
    assert.equal(res.status, 200);

    // IP 1 & 2 should have been lazily pruned from map; only IP 3 remains
    assert.equal(ipHits.size, 1);
    assert.ok(ipHits.has('3.3.3.3'));
    assert.ok(!ipHits.has('1.1.1.1'));
    assert.ok(!ipHits.has('2.2.2.2'));
  });
});

describe('HTTP Integration: Per-Route JSON Body Parser Limits (Audit-Daya #05)', () => {
  let server: Server;
  let baseUrl: string;
  const TEST_PORT = 3281;

  beforeAll(async () => {
    const app = express();

    // Bulk endpoints: 10mb
    app.use('/api/bulk-test', express.json({ limit: '10mb' }));
    // Default regular endpoints: 2mb
    app.use(express.json({ limit: '2mb' }));

    app.post('/api/regular-test', (req, res) => {
      res.json({ received: req.body?.data?.length || 0 });
    });

    app.post('/api/bulk-test', (req, res) => {
      res.json({ received: req.body?.data?.length || 0 });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(TEST_PORT, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('regular endpoint should accept payload under 2mb (e.g. 500kb)', async () => {
    const payload = { data: 'A'.repeat(500 * 1024) }; // ~500 KB
    const res = await fetch(`${baseUrl}/api/regular-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
  });

  test('regular endpoint should reject payload over 2mb with 413 Payload Too Large', async () => {
    const payload = { data: 'A'.repeat(2.5 * 1024 * 1024) }; // ~2.5 MB (> 2MB)
    const res = await fetch(`${baseUrl}/api/regular-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 413);
  });

  test('bulk endpoint should accept payload over 2mb up to 10mb (e.g. 3mb)', async () => {
    const payload = { data: 'A'.repeat(3 * 1024 * 1024) }; // ~3 MB (> 2MB, < 10MB)
    const res = await fetch(`${baseUrl}/api/bulk-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
  });
});
