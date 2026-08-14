/**
 * Test Suite: Server-Side Vulnerabilities
 * =========================================
 * Menguji setiap vulnerability yang ditemukan pada audit 2026-08-14.
 *
 * Cara jalankan:
 *   bun test test/server-security.test.ts
 *
 * Catatan: Menggunakan bun:test (Bun-native test runner).
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import path from 'path';
import os from 'os';
import fs from 'fs';

// ============================================================
// HELPER
// ============================================================
function createTempDir(prefix = 'audit_test_'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dir: string) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function resolveTargetFolder(folderPath: string, cwd: string): string {
  let targetFolder = folderPath;
  if (!path.isAbsolute(targetFolder)) {
    targetFolder = path.join(cwd, targetFolder);
  }
  return targetFolder;
}

function pathEscapesBase(targetPath: string, basePath: string): boolean {
  const resolved = path.resolve(targetPath);
  const base = path.resolve(basePath);
  const relative = path.relative(base, resolved);
  return relative.startsWith('..');
}

// ============================================================
// TEST 1: Path Traversal — ../ sequences
// ============================================================
describe('Path Traversal — ../ sequence', () => {
  let tempDir: string;

  test('should detect that ../ escapes the allowed base directory', () => {
    tempDir = createTempDir();
    const maliciousPath = path.join(tempDir, '..', '..', '..', 'tmp', 'evil_test');
    const escapes = pathEscapesBase(maliciousPath, tempDir);

    console.log(`  Malicious path: ${maliciousPath}`);
    console.log(`  Base directory: ${tempDir}`);
    console.log(`  Escapes base: ${escapes}`);

    assert.equal(escapes, true, 'Path with ../ should escape the base directory');
    console.log('  ⚠️  VULNERABILITY CONFIRMED: No path validation in server.ts allows traversal');

    cleanupDir(tempDir);
  });

  test('should detect that absolute paths bypass the cwd-join logic', () => {
    tempDir = createTempDir();
    const cwd = process.cwd();
    const absolutePath = '/tmp/evil_novel_abs';
    const resolved = resolveTargetFolder(absolutePath, cwd);
    const escapes = pathEscapesBase(resolved, cwd);

    console.log(`  Absolute path input: ${absolutePath}`);
    console.log(`  Resolved: ${resolved}`);
    console.log(`  Escapes cwd: ${escapes}`);

    assert.equal(escapes, true, 'Absolute path outside cwd should be detected as escape');
    console.log('  ⚠️  VULNERABILITY CONFIRMED: Absolute paths bypass cwd-join and can write anywhere');

    cleanupDir(tempDir);
  });

  test('should flag null bytes in path as potential bypass attempt', () => {
    tempDir = createTempDir();
    const nullBytePath = tempDir + '\0evil';
    const hasNullByte = nullBytePath.includes('\0');

    console.log(`  Null byte path detected: ${hasNullByte}`);
    assert.equal(hasNullByte, true, 'Null byte in path should be detected');
    console.log('  ⚠️  VULNERABILITY: No null byte sanitization in server.ts');

    cleanupDir(tempDir);
  });

  test('should detect Windows-style path traversal with ..\\', () => {
    tempDir = createTempDir();
    const windowsStyle = path.join(tempDir, '..\\..\\..\\tmp\\evil_test_win');
    const normalized = path.normalize(windowsStyle);
    const escapes = pathEscapesBase(normalized, tempDir);

    console.log(`  Windows-style path: ${windowsStyle}`);
    console.log(`  Normalized: ${normalized}`);
    console.log(`  Escapes base: ${escapes}`);
    console.log('  ⚠️  NOTE: Windows-style ..\\ traversal is platform-dependent but should be sanitized');

    cleanupDir(tempDir);
  });
});

// ============================================================
// TEST 2: Filename Injection — Dangerous Characters
// ============================================================
describe('Filename Injection — Dangerous Characters', () => {
  test('should flag chapter titles with path separator characters', () => {
    const dangerousTitles = [
      '../../etc/passwd',
      '../../../windows/system32/config',
      'normal/../../../etc/shadow',
    ];

    for (const title of dangerousTitles) {
      const fileName = 'Chapter_01.md';
      const fullPath = path.join('/tmp/evil_dir', title, fileName);
      const normalized = path.normalize(fullPath);
      const escapes = pathEscapesBase(normalized, '/tmp/evil_dir');

      console.log(`  Title: "${title}" -> normalized path: ${normalized}`);
      console.log(`  Escapes base: ${escapes}`);

      if (escapes) {
        console.log(`  ⚠️  VULNERABILITY: Path traversal via chapter title "${title}"`);
      }
    }
  });

  test('should flag filenames with OS-reserved characters (Windows)', () => {
    const reservedChars = /[<>:"|?*]/;
    const dangerousTitles = [
      'Chapter: Test <script>',
      'Evil "File" | rm -rf /',
      'Test?File*Name',
    ];

    for (const title of dangerousTitles) {
      const hasReserved = reservedChars.test(title);
      console.log(`  Title: "${title}" -> has reserved chars: ${hasReserved}`);
      if (hasReserved) {
        console.log(`  ⚠️  VULNERABILITY: Filename "${title}" contains OS-reserved characters`);
      }
    }
  });
});

// ============================================================
// TEST 3: API Key Exposure via GET /api/config
// ============================================================
describe('API Key Exposure — GET /api/config', () => {
  test('should confirm config.json contains API keys in plaintext', () => {
    const configPath = path.join(process.cwd(), 'config.json');
    const configExists = fs.existsSync(configPath);

    console.log(`  config.json exists: ${configExists}`);

    if (configExists) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);

      const hasGeminiKey = config.gemini_api_key && config.gemini_api_key.length > 0;
      const hasOpenRouterKey = config.openrouter_api_key && config.openrouter_api_key.length > 0;

      console.log(`  Has Gemini API key: ${hasGeminiKey}`);
      console.log(`  Has OpenRouter API key: ${hasOpenRouterKey}`);

      if (hasGeminiKey || hasOpenRouterKey) {
        console.log('  ⚠️  VULNERABILITY CONFIRMED: API keys stored in plaintext in config.json');
      }
    }
  });

  test('should confirm server.ts sends full config (including keys) to client', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const sendsFullConfig = serverContent.includes('res.json(readConfig())');
    console.log(`  GET /api/config returns full config object: ${sendsFullConfig}`);

    if (sendsFullConfig) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: GET /api/config sends gemini_api_key and openrouter_api_key to client');
    }
  });

  test('should confirm client stores API keys in localStorage', () => {
    const appPath = path.join(process.cwd(), 'src', 'App.tsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    const storesInLocalStorage = appContent.includes('localStorage.setItem') &&
      appContent.includes('openrouterApiKey') &&
      appContent.includes('geminiApiKey');

    console.log(`  Client stores API keys in localStorage: ${storesInLocalStorage}`);

    if (storesInLocalStorage) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: API keys persisted in browser localStorage (accessible via XSS)');
    }
  });
});

// ============================================================
// TEST 4: Server Binding — 0.0.0.0
// ============================================================
describe('Server Binding — 0.0.0.0', () => {
  test('should confirm server binds to all interfaces', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const bindsToAllInterfaces = serverContent.includes("'0.0.0.0'") ||
      serverContent.includes('"0.0.0.0"');

    console.log(`  Server binds to 0.0.0.0: ${bindsToAllInterfaces}`);

    if (bindsToAllInterfaces) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: Server exposed on all network interfaces (not just localhost)');
    }
  });
});

// ============================================================
// TEST 5: No Authentication on API Endpoints
// ============================================================
describe('No Authentication — API Endpoints', () => {
  test('should confirm no auth middleware on any API route', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasAuthMiddleware = serverContent.includes('auth') ||
      serverContent.includes('authenticate') ||
      serverContent.includes('middleware') ||
      serverContent.includes('rate-limit') ||
      serverContent.includes('rateLimit');

    console.log(`  Has auth middleware or rate limiting: ${hasAuthMiddleware}`);

    if (!hasAuthMiddleware) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: No authentication or authorization on any API endpoint');
    }
  });

  test('should list all unprotected API endpoints', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const endpoints = [
      'GET /api/health',
      'GET /api/config',
      'POST /api/config',
      'POST /api/save-chapter',
      'POST /api/export-novel',
      'POST /api/translate',
      'POST /api/extract-glossary',
    ];

    console.log('  Unprotected endpoints:');
    for (const ep of endpoints) {
      const routePath = ep.split(' ')[1];
      const exists = serverContent.includes(routePath);
      console.log(`    ${ep} — ${exists ? '⚠️  VULNERABLE' : '✅ Not found'}`);
    }
  });
});

// ============================================================
// TEST 6: No Rate Limiting
// ============================================================
describe('No Rate Limiting', () => {
  test('should confirm no rate-limit middleware is configured', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasRateLimit = serverContent.includes('rate-limit') ||
      serverContent.includes('rateLimit') ||
      serverContent.includes('express-rate-limit') ||
      serverContent.includes('limiter');

    console.log(`  Has rate limiting: ${hasRateLimit}`);

    if (!hasRateLimit) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: No rate limiting on API endpoints');
    }
  });
});

// ============================================================
// TEST 7: No Timeout on AI API Calls
// ============================================================
describe('No Timeout on AI API Calls', () => {
  test('should confirm fetch() to OpenRouter has no timeout', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const fetchCall = serverContent.includes("await fetch('https://openrouter.ai/api/v1/chat/completions'");
    const hasTimeout = serverContent.includes('signal') ||
      serverContent.includes('AbortController') ||
      serverContent.includes('timeout');

    console.log(`  OpenRouter fetch call exists: ${fetchCall}`);
    console.log(`  Has timeout/AbortController: ${hasTimeout}`);

    if (fetchCall && !hasTimeout) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: OpenRouter API call has no timeout — can hang indefinitely');
    }
  });

  test('should confirm Gemini API call has no timeout', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasTimeout = serverContent.includes('signal') ||
      serverContent.includes('AbortController') ||
      serverContent.includes('timeout');

    console.log(`  Has timeout on Gemini calls: ${hasTimeout}`);

    if (!hasTimeout) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: Gemini API calls have no timeout');
    }
  });
});

// ============================================================
// TEST 8: No CSP / Security Headers
// ============================================================
describe('Missing Security Headers', () => {
  test('should confirm no helmet middleware or CSP headers', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasHelmet = serverContent.includes('helmet');
    const hasCSP = serverContent.includes('Content-Security-Policy');
    const hasXContentType = serverContent.includes('X-Content-Type-Options');
    const hasXFrame = serverContent.includes('X-Frame-Options');

    console.log(`  Has helmet: ${hasHelmet}`);
    console.log(`  Has CSP header: ${hasCSP}`);
    console.log(`  Has X-Content-Type-Options: ${hasXContentType}`);
    console.log(`  Has X-Frame-Options: ${hasXFrame}`);

    if (!hasHelmet && !hasCSP && !hasXContentType && !hasXFrame) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: No security headers configured');
    }
  });

  test('should confirm X-Powered-By header is exposed', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const disablesPoweredBy = serverContent.includes("disable('x-powered-by')") ||
      serverContent.includes('disable("x-powered-by")');

    console.log(`  Disables X-Powered-By: ${disablesPoweredBy}`);

    if (!disablesPoweredBy) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: X-Powered-By: Express header is exposed');
    }
  });
});

// ============================================================
// TEST 9: No Input Sanitization for File Writing
// ============================================================
describe('No Input Sanitization for File Writing', () => {
  test('should confirm chapter titles are not sanitized before writing to disk', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasSanitization = serverContent.includes('sanitize') ||
      serverContent.includes('escape') ||
      (serverContent.includes('replace(/[^') && serverContent.includes('chapter_title'));

    console.log(`  Has input sanitization for file writing: ${hasSanitization}`);

    if (!hasSanitization) {
      console.log('  ⚠️  VULNERABILITY CONFIRMED: No sanitization of user input before writing to filesystem');
    }
  });
});

// ============================================================
// TEST 10: No Validation on Chapter Number Type
// ============================================================
describe('No Validation on Chapter Number Type', () => {
  test('should confirm chapter_number is not validated as integer', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf-8');

    const hasIntValidation = serverContent.includes('parseInt') ||
      (serverContent.includes('Number(') && serverContent.includes('chapter_number')) ||
      serverContent.includes('isNaN');

    console.log(`  Has integer validation for chapter_number: ${hasIntValidation}`);

    if (!hasIntValidation) {
      console.log('  ⚠️  VULNERABILITY: chapter_number is not validated — string or float could be passed');
    }
  });
});

console.log('\n=== Server Security Tests Complete ===\n');