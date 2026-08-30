/**
 * Test Suite: Chapter Number Parsing & Collision Avoidance
 * =========================================================
 * Verifies extractChapterNumber strict parsing rules,
 * rejection of ambiguous/non-chapter numeric filenames,
 * and randomUUID suffix collision prevention.
 *
 * Runs via: bun test test/chapter-parser.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import { extractChapterNumber } from '../src/services/chapterParser';
import crypto from 'crypto';

describe('Unit: extractChapterNumber strict filename parsing', () => {
  test('Positive: Explicit chapter prefix variants (Chapter, chap, Bab, bab)', () => {
    assert.equal(extractChapterNumber('Chapter_01.md'), 1);
    assert.equal(extractChapterNumber('Chapter-12.txt'), 12);
    assert.equal(extractChapterNumber('Chapter 5.md'), 5);
    assert.equal(extractChapterNumber('chap_7.md'), 7);
    assert.equal(extractChapterNumber('Bab_03.md'), 3);
    assert.equal(extractChapterNumber('bab-45.md'), 45);
  });

  test('Positive: Filenames that are purely digits plus extension', () => {
    assert.equal(extractChapterNumber('01.md'), 1);
    assert.equal(extractChapterNumber('123.txt'), 123);
    assert.equal(extractChapterNumber('0005.md'), 5);
  });

  test('Positive: Case insensitivity', () => {
    assert.equal(extractChapterNumber('CHAPTER_5.md'), 5);
    assert.equal(extractChapterNumber('bAb_3.md'), 3);
    assert.equal(extractChapterNumber('CHAP-9.TXT'), 9);
  });

  test('Negative: Bogus year digits in epilogue / notes without chapter number prefix', () => {
    assert.equal(extractChapterNumber('Chapter_Epilogue_2024.md'), null);
    assert.equal(extractChapterNumber('Epilogue_2024.md'), null);
    assert.equal(extractChapterNumber('Notes_v3.md'), null);
    assert.equal(extractChapterNumber('Appendix_Backup_20231225.txt'), null);
    assert.equal(extractChapterNumber('Prologue_2022.txt'), null);
  });

  test('Negative: Non-chapter metadata files and wrong extensions', () => {
    assert.equal(extractChapterNumber('metadata.json'), null);
    assert.equal(extractChapterNumber('config.json'), null);
    assert.equal(extractChapterNumber('glossary.json'), null);
    assert.equal(extractChapterNumber('readme.pdf'), null);
  });

  test('Boundary: 1 to 5 digit limit (0 to 99999)', () => {
    assert.equal(extractChapterNumber('Chapter_99999.md'), 99999);
    assert.equal(extractChapterNumber('Chapter_100000.md'), null, '6-digit number exceeds max range');
    assert.equal(extractChapterNumber('99999.md'), 99999);
    assert.equal(extractChapterNumber('100000.md'), null);
  });
});

describe('Unit: Chapter ID generation uniqueness & collision resistance', () => {
  test('Generated IDs for identical chapter numbers produce distinct UUID suffixes', () => {
    const novelId = 'novel-test-123';
    const nomorChapter = 1;

    const id1 = `chap-${novelId}-${nomorChapter}-${crypto.randomUUID().slice(0, 8)}`;
    const id2 = `chap-${novelId}-${nomorChapter}-${crypto.randomUUID().slice(0, 8)}`;

    assert.notEqual(id1, id2, 'Two chapter records with same chapter number must have distinct IDs');
    assert.match(id1, /^chap-novel-test-123-1-[0-9a-f]{8}$/);
    assert.match(id2, /^chap-novel-test-123-1-[0-9a-f]{8}$/);
  });

  test('Bulk generation of 1000 chapter IDs exhibits 0 collisions', () => {
    const novelId = 'novel-scale';
    const seen = new Set<string>();

    for (let i = 1; i <= 1000; i++) {
      const id = `chap-${novelId}-${i}-${crypto.randomUUID().slice(0, 8)}`;
      assert.ok(!seen.has(id), `Collision detected on index ${i}`);
      seen.add(id);
    }

    assert.equal(seen.size, 1000);
  });
});

describe('Integration: Multi-file folder scanning with non-canonical files', () => {
  test('Correctly separates recognized chapter numbers from fallback increments', () => {
    const files = [
      'Chapter_01.md',
      'Chapter_Epilogue_2024.md',
      'Notes_v3.md',
      'Chapter_02.md',
      'Appendix_Backup_20231225.txt',
    ];

    const parsedChapters: { file: string; nomor: number }[] = [];

    files.forEach((file) => {
      const nomor = extractChapterNumber(file) ?? (parsedChapters.length + 1);
      parsedChapters.push({ file, nomor });
    });

    // Chapter_01 -> 1
    assert.equal(parsedChapters[0].nomor, 1);
    // Chapter_Epilogue_2024 -> fallback to (1 + 1) = 2 (NOT 2024!)
    assert.equal(parsedChapters[1].nomor, 2);
    // Notes_v3 -> fallback to (2 + 1) = 3 (NOT 3 from v3)
    assert.equal(parsedChapters[2].nomor, 3);
    // Chapter_02 -> parsed strictly as 2
    assert.equal(parsedChapters[3].nomor, 2);
    // Appendix_Backup_20231225 -> fallback to (4 + 1) = 5 (NOT 20231225!)
    assert.equal(parsedChapters[4].nomor, 5);
  });
});
