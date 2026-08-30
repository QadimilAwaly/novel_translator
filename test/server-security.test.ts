/**
 * Test Suite: Server-Side Security & Path Traversal Prevention
 * ==============================================================
 * Comprehensive tests verifying the removal of sandbox-bypassing fallbacks
 * and validating that all filesystem operations are strictly confined within Novel_Library.
 *
 * Runs via: bun test test/server-security.test.ts
 */

import { test, describe, beforeAll, afterAll } from 'bun:test';
import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

const TEST_PORT = 3199;
const TEST_HOST = '127.0.0.1';
const BASE_URL = `http://${TEST_HOST}:${TEST_PORT}`;
const CWD = process.cwd();
const LIBRARY_BASE = path.join(CWD, 'Novel_Library');

// ============================================================
// 1. UNIT TESTS: resolveSafePath Logic
// ============================================================
function resolveSafePath(inputPath: string, basePath: string): string | null {
  const base = path.resolve(basePath);
  let target = inputPath;
  if (!path.isAbsolute(target)) {
    target = path.join(base, target);
  }
  const resolved = path.resolve(target);
  const rel = path.relative(base, resolved);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return resolved;
  }
  return null;
}

describe('Unit: resolveSafePath Sandboxing', () => {
  test('should return absolute path when target is inside libraryBase', () => {
    const validRelative = 'MyNovel';
    const resolved = resolveSafePath(validRelative, LIBRARY_BASE);
    assert.equal(resolved, path.join(LIBRARY_BASE, 'MyNovel'));

    const validAbsolute = path.join(LIBRARY_BASE, 'MyNovel', 'metadata');
    const resolvedAbs = resolveSafePath(validAbsolute, LIBRARY_BASE);
    assert.equal(resolvedAbs, validAbsolute);
  });

  test('should reject relative path traversal (../) escaping libraryBase', () => {
    const traversal1 = '../../../../etc/passwd';
    assert.equal(resolveSafePath(traversal1, LIBRARY_BASE), null);

    const traversal2 = '../other_dir';
    assert.equal(resolveSafePath(traversal2, LIBRARY_BASE), null);
  });

  test('should reject absolute paths outside libraryBase', () => {
    const outsidePath1 = '/data/data/com.termux/files/home';
    assert.equal(resolveSafePath(outsidePath1, LIBRARY_BASE), null);

    const outsidePath2 = '/tmp/evil_novel';
    assert.equal(resolveSafePath(outsidePath2, LIBRARY_BASE), null);

    const outsidePath3 = '/etc/shadow';
    assert.equal(resolveSafePath(outsidePath3, LIBRARY_BASE), null);
  });

  test('should reject Windows-style path traversal', () => {
    const winTraversal = '..\\..\\..\\tmp\\evil';
    assert.equal(resolveSafePath(winTraversal, LIBRARY_BASE), null);
  });
});

// ============================================================
// 2. STATIC INVARIANT TESTS: Confirmation of 4 Removed Fallbacks
// ============================================================
describe('Static Invariants: Removal of Sandbox-Bypassing Fallbacks', () => {
  const serverContent = fs.readFileSync(path.join(CWD, 'server.ts'), 'utf-8');

  test('Site A: /api/save-chapter must not contain fs.existsSync fallback', () => {
    const saveChapterMatch = serverContent.match(/app\.post\('\/api\/save-chapter'[\s\S]*?app\.post\('/);
    const code = saveChapterMatch ? saveChapterMatch[0] : '';
    assert.ok(code.length > 0, 'Found /api/save-chapter route');
    assert.ok(
      !code.includes('targetFolder = path.resolve(folder_path)'),
      'Site A must not fall back to path.resolve(folder_path)'
    );
    assert.ok(code.includes('resolveSafePath(folder_path, libraryBase)'), 'Site A uses resolveSafePath');
  });

  test('Site B: /api/export-novel must not contain fs.existsSync fallback', () => {
    const exportMatch = serverContent.match(/app\.post\('\/api\/export-novel'[\s\S]*?app\.post\('/);
    const code = exportMatch ? exportMatch[0] : '';
    assert.ok(code.length > 0, 'Found /api/export-novel route');
    assert.ok(
      !code.includes('targetFolder = path.resolve(novel.folder_path)'),
      'Site B must not fall back to path.resolve(novel.folder_path)'
    );
    assert.ok(code.includes('resolveSafePath(novel.folder_path, libraryBase)'), 'Site B uses resolveSafePath');
  });

  test('Site C: /api/import-novel-folder must strictly reject paths outside libraryBase with 400', () => {
    const importMatch = serverContent.match(/app\.post\('\/api\/import-novel-folder'[\s\S]*?app\.post\('/);
    const code = importMatch ? importMatch[0] : '';
    assert.ok(code.length > 0, 'Found /api/import-novel-folder route');
    assert.ok(
      !code.includes('targetFolder = path.resolve(folder_path)'),
      'Site C must not fall back to path.resolve(folder_path)'
    );
    assert.ok(code.includes('res.status(400)'), 'Site C returns 400 when path is invalid or outside library');
  });

  test('Site D: saveLibraryStorage delete must use resolveSafePath on folder_path', () => {
    const deleteMatch = serverContent.match(/for\s*\(\s*const delNovel of deletedNovels\s*\)[\s\S]*?data\.chapters/);
    const code = deleteMatch ? deleteMatch[0] : '';
    assert.ok(code.length > 0, 'Found deletedNovels loop in saveLibraryStorage');
    assert.ok(
      !code.includes('delNovel.folder_path ? path.resolve(delNovel.folder_path) :'),
      'Site D must not use unsandboxed path.resolve on delNovel.folder_path'
    );
    assert.ok(
      code.includes('resolveSafePath(delNovel.folder_path, libraryBase)'),
      'Site D must route folderByPath through resolveSafePath'
    );
  });
});

// ============================================================
// 3. HTTP INTEGRATION TESTS: Live API Traversal Resistance
// ============================================================
describe('HTTP Integration: Real Endpoint Security & Regression Tests', () => {
  let serverProcess: ChildProcess | null = null;

  beforeAll(async () => {
    // Start live server instance on test port (production mode skips Vite dev watcher for instant startup)
    serverProcess = spawn('bun', ['server.ts'], {
      cwd: CWD,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        HOST: TEST_HOST,
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });

    // Wait for server to become responsive
    const maxWait = 15000;
    const start = Date.now();
    let ready = false;

    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (!ready) {
      throw new Error('Test server failed to start on port ' + TEST_PORT);
    }
  }, 20000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    // Clean up any test folders created during integration test
    const testNovelFolder = path.join(LIBRARY_BASE, 'TestIntegrationNovel');
    if (fs.existsSync(testNovelFolder)) {
      try { fs.rmSync(testNovelFolder, { recursive: true, force: true }); } catch {}
    }
  });

  test('POST /api/import-novel-folder: Should return 400 on traversal path (../../../../etc/passwd)', async () => {
    const res = await fetch(`${BASE_URL}/api/import-novel-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: '../../../../etc/passwd' }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.ok(data.error?.includes('di luar direktori penyimpanan'));
  });

  test('POST /api/import-novel-folder: Should return 400 on absolute path outside libraryBase', async () => {
    const res = await fetch(`${BASE_URL}/api/import-novel-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder_path: '/data/data/com.termux/files/home' }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error?: string };
    assert.ok(data.error?.includes('di luar direktori penyimpanan'));
  });

  test('POST /api/save-chapter: Traversal folder_path should be ignored and safely default to libraryBase', async () => {
    const res = await fetch(`${BASE_URL}/api/save-chapter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folder_path: '../../../../tmp/evil_test_dir',
        chapter_number: 1,
        chapter_title: 'Bab Test Keamanan',
        novel_title: 'TestIntegrationNovel',
        original_text: 'Teks Asli',
        translated_text: 'Teks Terjemahan',
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { status: string; path: string };
    assert.equal(data.status, 'success');
    // Path MUST be inside Novel_Library, NOT in /tmp
    assert.ok(data.path.startsWith(LIBRARY_BASE), `Path ${data.path} must start with ${LIBRARY_BASE}`);
    assert.ok(!data.path.includes('evil_test_dir'), 'Must not write to evil_test_dir');
  });

  test('POST /api/export-novel: Traversal novel.folder_path should be safely confined to libraryBase', async () => {
    const res = await fetch(`${BASE_URL}/api/export-novel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        novel: {
          id: 'test-novel-export',
          judul: 'TestIntegrationNovel',
          folder_path: '/tmp/evil_export_dir',
          bahasa_sumber: 'Mandarin',
          bahasa_target: 'Indonesia',
        },
        chapters: [{ nomor_chapter: 1, judul_chapter: 'Bab 1', teks_asli: 'Asli', teks_terjemahan: 'Hasil', status_pengerjaan: 'Selesai' }],
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { status: string; path: string };
    assert.equal(data.status, 'success');
    assert.ok(data.path.startsWith(LIBRARY_BASE), `Export path ${data.path} must start with ${LIBRARY_BASE}`);
    assert.ok(!data.path.includes('evil_export_dir'), 'Must not write to evil_export_dir');
  });

  test('POST /api/export-novel: Legitimate in-library path succeeds and creates files (Regression Guard)', async () => {
    const legitFolder = path.join(LIBRARY_BASE, 'TestIntegrationNovel');
    const res = await fetch(`${BASE_URL}/api/export-novel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        novel: {
          id: 'test-novel-legit',
          judul: 'TestIntegrationNovel',
          folder_path: legitFolder,
          bahasa_sumber: 'Mandarin',
          bahasa_target: 'Indonesia',
        },
        chapters: [{ nomor_chapter: 1, judul_chapter: 'Bab 1', teks_asli: 'Asli', teks_terjemahan: 'Hasil', status_pengerjaan: 'Selesai' }],
      }),
    });
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(path.join(legitFolder, 'Chapter_01.md')));
    assert.ok(fs.existsSync(path.join(legitFolder, 'metadata', 'reference.json')));
  });
});