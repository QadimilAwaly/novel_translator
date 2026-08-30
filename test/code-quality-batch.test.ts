/**
 * Test Suite: Code Quality Batch (Steps 10-12)
 * =============================================
 * Verifies TypeScript strictness flags, dead code removal (LANGUAGES, vite dup),
 * and silent error logging replacements across server.ts.
 *
 * Runs via: bun test test/code-quality-batch.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

describe('Step 10: TypeScript Strictness Configuration', () => {
  test('tsconfig.json includes noImplicitAny and strictNullChecks', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

    assert.equal(tsconfig.compilerOptions?.noImplicitAny, true);
    assert.equal(tsconfig.compilerOptions?.strictNullChecks, true);
  });

  test('tsconfig.json excludes full-strict flags for safe scoping', () => {
    const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

    assert.equal(tsconfig.compilerOptions?.strictFunctionTypes, undefined);
    assert.equal(tsconfig.compilerOptions?.strict, undefined);
  });
});

describe('Step 11: Dead Code Cleanup', () => {
  test('11a: NewNovelModal.tsx no longer contains unused local LANGUAGES array', () => {
    const modalPath = path.join(process.cwd(), 'src', 'components', 'NewNovelModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    assert.ok(!content.includes('const LANGUAGES: LanguageCode[] = ['), 'Dead LANGUAGES array must be removed');
    assert.ok(content.includes('SUPPORTED_LANGUAGES'), 'SUPPORTED_LANGUAGES must remain in use');
  });

  test('11b: package.json has vite in devDependencies ONLY, not in dependencies', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    assert.equal(pkg.dependencies?.vite, undefined, 'vite must not be listed in dependencies');
    assert.ok(pkg.devDependencies?.vite, 'vite must be present in devDependencies');
  });
});

describe('Step 12: Error Logging (No Silent Catches in server.ts)', () => {
  test('All 4 target catch sites in server.ts log warnings with descriptive context', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const content = fs.readFileSync(serverPath, 'utf-8');

    // Site 1: config write
    assert.ok(content.includes('[config] Failed to write default config:'), 'Site 1 must log warning');
    // Site 2: loadNovel reference.json
    assert.ok(content.includes('[loadNovel] Failed to parse reference.json:'), 'Site 2 must log warning');
    // Site 3: import-novel-folder reference.json
    assert.ok(content.includes('[import-folder] Failed to parse reference.json:'), 'Site 3 must log warning');
    // Site 4: import-novel-folder glossary.json
    assert.ok(content.includes('[import-folder] Failed to parse glossary.json:'), 'Site 4 must log warning');

    // Verify empty catch (e) {} pattern does not exist
    assert.ok(!content.includes('catch (e) {}'), 'No empty catch blocks should remain in server.ts');
  });
});
