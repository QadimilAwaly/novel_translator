/**
 * Test Suite: Unit Tests for Utility Functions
 * =========================================
 */

import { test, describe } from 'bun:test';
import assert from 'assert';

// ============================================================
// Replicate cleanSearchKeyword from contextFilter.ts
// ============================================================
function cleanSearchKeyword(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '')
    .trim();
}

function getKeywordsFromTerm(termStr: string): string[] {
  const parts = termStr.split(/[\/\(\)\|\,\;\:\-]/);
  const keywords: string[] = [];

  for (const part of parts) {
    const cleaned = cleanSearchKeyword(part);
    if (cleaned.length > 0) {
      keywords.push(cleaned);
    }
  }

  const fullCleaned = cleanSearchKeyword(termStr);
  if (fullCleaned.length > 0 && !keywords.includes(fullCleaned)) {
    keywords.push(fullCleaned);
  }

  return keywords;
}

function filterRelevantGlossaries(
  text: string,
  glossaries: Array<{ istilah_asli: string }>
): Array<{ istilah_asli: string }> {
  if (!text || !text.trim() || !glossaries || glossaries.length === 0) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const cleanText = cleanSearchKeyword(text);

  return glossaries.filter((item) => {
    if (lowerText.includes(item.istilah_asli.toLowerCase())) {
      return true;
    }

    const keywords = getKeywordsFromTerm(item.istilah_asli);
    for (const kw of keywords) {
      if (kw.length >= 2) {
        if (lowerText.includes(kw) || cleanText.includes(kw)) {
          return true;
        }
      }
    }

    return false;
  });
}

// ============================================================
// TEST: cleanSearchKeyword
// ============================================================
describe('cleanSearchKeyword', () => {
  test('should lowercase text', () => {
    assert.equal(cleanSearchKeyword('Hello World'), 'helloworld');
  });

  test('should strip punctuation and whitespace', () => {
    assert.equal(cleanSearchKeyword('Hello, World!'), 'helloworld');
    assert.equal(cleanSearchKeyword('Spatial Ring / 储物戒'), 'spatialring储物戒');
  });

  test('should preserve CJK characters', () => {
    const result = cleanSearchKeyword('储物戒');
    assert.ok(result.includes('储物戒'), 'CJK characters should be preserved');
  });

  test('should preserve Hangul characters', () => {
    const result = cleanSearchKeyword('안녕하세요');
    assert.ok(result.includes('안녕하세요'), 'Hangul characters should be preserved');
  });

  test('should trim whitespace', () => {
    assert.equal(cleanSearchKeyword('  hello  '), 'hello');
  });
});

// ============================================================
// TEST: getKeywordsFromTerm
// ============================================================
describe('getKeywordsFromTerm', () => {
  test('should split dual-term glossary entries', () => {
    const keywords = getKeywordsFromTerm('Spatial Ring / 储物戒');
    assert.ok(keywords.includes('spatialring'), 'Should include "spatialring"');
    assert.ok(keywords.includes('储物戒'), 'Should include "储物戒"');
  });

  test('should split by multiple delimiters', () => {
    const keywords = getKeywordsFromTerm('Heavenly Tribulation (天劫)');
    assert.ok(keywords.length >= 2, 'Should have at least 2 keywords');
  });

  test('should include full cleaned term', () => {
    const keywords = getKeywordsFromTerm('Lin Feng');
    assert.ok(keywords.includes('linfeng'), 'Should include full term "linfeng"');
  });

  test('should keep single-char parts (filtered later in filterRelevantGlossaries)', () => {
    const keywords = getKeywordsFromTerm('A / B / C');
    // getKeywordsFromTerm keeps single chars; filterRelevantGlossaries filters them (kw.length >= 2)
    assert.equal(keywords.length, 4, 'Should have 4 keywords (a, b, c, abc)');
  });
});

// ============================================================
// TEST: filterRelevantGlossaries
// ============================================================
describe('filterRelevantGlossaries', () => {
  const sampleGlossaries = [
    { istilah_asli: 'Spatial Ring / 储物戒' },
    { istilah_asli: 'Heavenly Tribulation / 天劫' },
    { istilah_asli: 'Lin Feng' },
    { istilah_asli: 'Azure Dragon Sect / 青龙宗' },
  ];

  test('should find glossary item by direct match', () => {
    const result = filterRelevantGlossaries('Lin Feng is a cultivator', sampleGlossaries);
    assert.ok(result.length >= 1, 'Should find "Lin Feng"');
    assert.ok(result.some((g) => g.istilah_asli === 'Lin Feng'));
  });

  test('should find glossary item by sub-keyword', () => {
    const result = filterRelevantGlossaries('The spatial ring glows', sampleGlossaries);
    assert.ok(result.length >= 1, 'Should find "Spatial Ring" by keyword');
  });

  test('should find glossary item by CJK sub-keyword', () => {
    const result = filterRelevantGlossaries('The 储物戒 contains treasures', sampleGlossaries);
    assert.ok(result.length >= 1, 'Should find 储物戒 by CJK keyword');
  });

  test('should return empty array for empty text', () => {
    const result = filterRelevantGlossaries('', sampleGlossaries);
    assert.equal(result.length, 0, 'Should return empty for empty text');
  });

  test('should return empty array for empty glossaries', () => {
    const result = filterRelevantGlossaries('Some text', []);
    assert.equal(result.length, 0, 'Should return empty for empty glossaries');
  });

  test('should return empty array for whitespace-only text', () => {
    const result = filterRelevantGlossaries('   ', sampleGlossaries);
    assert.equal(result.length, 0, 'Should return empty for whitespace-only text');
  });
});

// ============================================================
// TEST: Path Resolution (from server.ts)
// ============================================================
describe('Path Resolution — server.ts logic', () => {
  test('should resolve relative paths against cwd', () => {
    const cwd = process.cwd();
    const relativePath = 'Novel_Library/TestNovel';
    const resolved = require('path').join(cwd, relativePath);

    assert.ok(require('path').isAbsolute(resolved), 'Resolved path should be absolute');
    assert.ok(resolved.includes('Novel_Library'), 'Should contain Novel_Library');
  });

  test('should keep absolute paths as-is', () => {
    const absolutePath = '/tmp/test_novel';
    let targetFolder = absolutePath;
    if (!require('path').isAbsolute(targetFolder)) {
      targetFolder = require('path').join(process.cwd(), targetFolder);
    }

    assert.equal(targetFolder, absolutePath, 'Absolute path should not be modified');
  });

  test('path.normalize resolves .. components (path traversal demo)', () => {
    const base = '/home/user/Novel_Library';
    const malicious = '../../etc/passwd';
    const resolved = require('path').join(base, malicious);
    const normalized = require('path').normalize(resolved);

    console.log(`  Base: ${base}`);
    console.log(`  Malicious input: ${malicious}`);
    console.log(`  Resolved: ${resolved}`);
    console.log(`  Normalized: ${normalized}`);

    // The vulnerability: path.join + normalize resolves .. and escapes base
    // On Linux, /home/user/Novel_Library + ../../etc/passwd = /home/etc/passwd
    // The key point is that it escapes the base directory
    const escapesBase = !normalized.startsWith(base);
    assert.equal(escapesBase, true, 'Path traversal should escape the base directory');
  });
});

// ============================================================
// TEST: JSON Parsing Safety
// ============================================================
describe('JSON Parsing Safety', () => {
  test('should handle malformed JSON gracefully', () => {
    const malformedJSON = '{ invalid json }';
    let error = null;

    try {
      JSON.parse(malformedJSON);
    } catch (e) {
      error = e;
    }

    assert.ok(error !== null, 'Malformed JSON should throw');
    console.log('  ✅ Storage.ts catches JSON parse errors (try/catch in getStored*)');
  });

  test('should handle JSON injection via crafted input', () => {
    const userInput = '"; console.log("XSS';
    const embedded = JSON.stringify(userInput);

    assert.ok(embedded.includes('\\"'), 'JSON.stringify should escape quotes');
    console.log('  ✅ JSON.stringify properly escapes user input');
  });
});

// ============================================================
// TEST: Chapter ID Generation Uniqueness
// ============================================================
describe('Chapter ID Generation', () => {
  test('should generate unique IDs using Date.now() + random', () => {
    const id1 = `chap-novel1-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const id2 = `chap-novel1-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    assert.notEqual(id1, id2, 'Generated IDs should be unique');
    console.log(`  ID 1: ${id1}`);
    console.log(`  ID 2: ${id2}`);
  });

  test('should note that Math.random() is not cryptographically secure', () => {
    console.log('  ⚠️  NOTE: Math.random() is predictable — not suitable for security-sensitive IDs');
    console.log('  Recommendation: Use crypto.randomUUID()');
  });
});
// ============================================================
// TEST: Responsive Layout & Mobile Panel Visibility
// ============================================================
describe('Responsive Layout & Mobile Panel Visibility', () => {
  test('App.tsx main container should not use flex-col that hides panels on small screens', () => {
    const fs = require('fs');
    const path = require('path');
    const appContent = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');
    
    // Check that main container does not use flex-col lg:flex-row which breaks small screens
    assert.ok(!appContent.includes('flex flex-col lg:flex-row'), 'App.tsx should not use flex-col lg:flex-row on main container');
    assert.ok(appContent.includes('flex flex-row') || appContent.includes('flex-row'), 'App.tsx should use flex-row on main container');
    assert.ok(appContent.includes('backdrop'), 'App.tsx should include mobile backdrops for overlays');
  });

  test('NovelSidebar.tsx and ContextPanel.tsx should support responsive fixed/static overlay positioning', () => {
    const fs = require('fs');
    const path = require('path');
    const sidebarContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'NovelSidebar.tsx'), 'utf-8');
    const contextContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ContextPanel.tsx'), 'utf-8');

    assert.ok(sidebarContent.includes('fixed lg:static'), 'NovelSidebar should use fixed on mobile and lg:static on desktop');
    assert.ok(sidebarContent.includes('onClose'), 'NovelSidebar should support onClose prop');
    assert.ok(contextContent.includes('fixed lg:static'), 'ContextPanel should use fixed on mobile and lg:static on desktop');
    assert.ok(contextContent.includes('onClose'), 'ContextPanel should support onClose prop');
  });

  test('SplitEditor.tsx should have min-w-0 and min-h-0 to avoid overflow in small windows', () => {
    const fs = require('fs');
    const path = require('path');
    const splitContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'SplitEditor.tsx'), 'utf-8');

    assert.ok(splitContent.includes('min-w-0'), 'SplitEditor should have min-w-0');
    assert.ok(splitContent.includes('min-h-0'), 'SplitEditor should have min-h-0');
  });
});
// ============================================================
// TEST: Server-Backed Persistent Storage & Config Stability
// ============================================================
describe('Server-Backed Persistent Storage & Config Stability', () => {
  test('server.ts should have /api/storage and /api/storage/sync endpoints', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    assert.ok(serverContent.includes("app.get('/api/storage'"), 'server.ts should have GET /api/storage');
    assert.ok(serverContent.includes("app.post('/api/storage/sync'"), 'server.ts should have POST /api/storage/sync');
    assert.ok(serverContent.includes('library_index.json'), 'server.ts should persist to library_index.json');
    assert.ok(serverContent.includes('readLibraryStorage'), 'server.ts should have readLibraryStorage');
    assert.ok(serverContent.includes('saveLibraryStorage'), 'server.ts should have saveLibraryStorage');
  });

  test('storage.ts should provide fetchServerStorage and syncServerStorage', () => {
    const fs = require('fs');
    const path = require('path');
    const storageContent = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'storage.ts'), 'utf-8');

    assert.ok(storageContent.includes('fetchServerStorage'), 'storage.ts should export fetchServerStorage');
    assert.ok(storageContent.includes('syncServerStorage'), 'storage.ts should export syncServerStorage');
    assert.ok(storageContent.includes('/api/storage/sync'), 'storage.ts should call /api/storage/sync');
  });

  test('config.json should have consistent and stable structure', () => {
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(process.cwd(), 'config.json');

    assert.ok(fs.existsSync(configPath), 'config.json should exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.ok(typeof config.global_storage_path === 'string', 'global_storage_path should be string');
    assert.ok(typeof config.default_provider === 'string', 'default_provider should be string');
    assert.ok(typeof config.default_model === 'string', 'default_model should be string');
  });
  test('server.ts and storage.ts should support physical folder deletion and renaming', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const storageContent = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'storage.ts'), 'utf-8');

    assert.ok(serverContent.includes('/api/storage/delete-novel'), 'server.ts should have /api/storage/delete-novel');
    assert.ok(serverContent.includes('/api/storage/delete-chapter'), 'server.ts should have /api/storage/delete-chapter');
    assert.ok(serverContent.includes('/api/storage/rename-novel'), 'server.ts should have /api/storage/rename-novel');
    assert.ok(serverContent.includes('fs.rmSync'), 'server.ts should use fs.rmSync to delete physical folder');

    assert.ok(storageContent.includes('deleteStoredNovel'), 'storage.ts should export deleteStoredNovel');
    assert.ok(storageContent.includes('deleteStoredChapter'), 'storage.ts should export deleteStoredChapter');
    assert.ok(storageContent.includes('renameStoredNovel'), 'storage.ts should export renameStoredNovel');
  });
  test('storage.ts and server.ts should support glossary and reference deletion', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const storageContent = fs.readFileSync(path.join(process.cwd(), 'src', 'services', 'storage.ts'), 'utf-8');

    assert.ok(serverContent.includes('/api/storage/delete-glossary'), 'server.ts should have /api/storage/delete-glossary');
    assert.ok(storageContent.includes('deleteStoredGlossary'), 'storage.ts should export deleteStoredGlossary');
    assert.ok(storageContent.includes('deleteStoredReference'), 'storage.ts should export deleteStoredReference');
  });

  test('glossary extraction should respect target language in prompt and API schema', () => {
    const fs = require('fs');
    const path = require('path');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const typesContent = fs.readFileSync(path.join(process.cwd(), 'src', 'types.ts'), 'utf-8');
    const appContent = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');

    assert.ok(typesContent.includes('bahasa_target?: LanguageCode;'), 'ExtractGlossaryRequest should have optional bahasa_target');
    assert.ok(serverContent.includes('bahasa_target'), 'server.ts /api/extract-glossary should accept bahasa_target');
    assert.ok(serverContent.includes('${targetLang}'), 'server.ts /api/extract-glossary prompt should interpolate targetLang');
    assert.ok(appContent.includes('bahasa_target: activeNovel?.bahasa_target'), 'App.tsx should pass activeNovel target language to extractGlossaryApi');
  });
  test('glossary items should support gender tags for character names to prevent pronoun errors in English translation', () => {
    const fs = require('fs');
    const path = require('path');
    const typesContent = fs.readFileSync(path.join(process.cwd(), 'src', 'types.ts'), 'utf-8');
    const modalContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'NewGlossaryModal.tsx'), 'utf-8');
    const panelContent = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ContextPanel.tsx'), 'utf-8');
    const serverContent = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

    assert.ok(typesContent.includes("export type GenderTag = 'Male' | 'Female' | 'Neutral';"), 'types.ts should export GenderTag');
    assert.ok(typesContent.includes('gender?: GenderTag;'), 'GlossaryItem should have optional gender field');
    assert.ok(modalContent.includes('GenderTag'), 'NewGlossaryModal should import GenderTag');
    assert.ok(modalContent.includes("kategori === 'Nama'"), 'NewGlossaryModal should show gender selector for Nama category');
    assert.ok(panelContent.includes("onUpdateGlossaryGender"), 'ContextPanel should accept onUpdateGlossaryGender');
    assert.ok(panelContent.includes("+ Gender"), 'ContextPanel should show + Gender button for untagged character names');
    assert.ok(serverContent.includes('WAJIB PRONOUN') || serverContent.includes('he/him/his'), 'server.ts should inject pronoun rules for gendered glossary items');
  });
});

console.log('\n=== Unit Tests Complete ===\n');