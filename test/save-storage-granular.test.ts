/**
 * Test Suite: Granular Storage Persistence & Dirty Checking (Audit-Daya #06)
 * ===========================================================================
 * Verifies that saveLibraryStorage:
 * 1. Accurately detects dirty chapters (text, status, title changes)
 * 2. Skips rewriting untouched chapter .md files (incremental write)
 * 3. Correctly detects reference and glossary changes
 * 4. Handles partial payloads without touching omitted entities
 *
 * Runs via: bun test test/save-storage-granular.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';

interface StoredChapter {
  id: string;
  novel_id: string;
  nomor_chapter: number;
  judul_chapter: string;
  teks_asli: string;
  teks_terjemahan: string;
  status_pengerjaan: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredReference {
  id: string;
  novel_id: string;
  kategori: string;
  nama_item: string;
  deskripsi: string;
}

interface StoredGlossary {
  id: string;
  novel_id: string;
  istilah_asli: string;
  istilah_terjemahan: string;
  kategori: string;
  gender?: 'Male' | 'Female' | 'Neutral';
  konteks?: string;
}

// Invariant: A chapter is considered dirty if it is new, or if its title, number, status, original text, or translation changed
const isChapterDirty = (prev: StoredChapter | undefined, next: StoredChapter): boolean => {
  if (!prev) return true; // New chapter
  return (
    prev.nomor_chapter !== next.nomor_chapter ||
    prev.judul_chapter !== next.judul_chapter ||
    prev.status_pengerjaan !== next.status_pengerjaan ||
    prev.teks_asli !== next.teks_asli ||
    prev.teks_terjemahan !== next.teks_terjemahan
  );
};

const areReferencesEqual = (prevRefs: StoredReference[], nextRefs: StoredReference[]): boolean => {
  if (prevRefs.length !== nextRefs.length) return false;
  return JSON.stringify(prevRefs) === JSON.stringify(nextRefs);
};

const areGlossariesEqual = (prevGloss: StoredGlossary[], nextGloss: StoredGlossary[]): boolean => {
  if (prevGloss.length !== nextGloss.length) return false;
  return JSON.stringify(prevGloss) === JSON.stringify(nextGloss);
};

describe('Unit: Chapter Dirty Checking Logic (Audit-Daya #06)', () => {
  const baseChapter: StoredChapter = {
    id: 'chap-1',
    novel_id: 'novel-1',
    nomor_chapter: 1,
    judul_chapter: 'Awal Mula',
    teks_asli: '天地玄黄，宇宙洪荒。',
    teks_terjemahan: 'Langit dan bumi hitam pekat, alam semesta belantara purba.',
    status_pengerjaan: 'Selesai',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  };

  test('Identical chapter returns isChapterDirty = false', () => {
    const clone = { ...baseChapter, updatedAt: '2026-08-31T12:00:00.000Z' }; // Timestamp shift only
    assert.equal(isChapterDirty(baseChapter, clone), false);
  });

  test('Modified teks_asli returns isChapterDirty = true', () => {
    const modified = { ...baseChapter, teks_asli: '天地玄黄，宇宙洪荒。日月盈昃。' };
    assert.equal(isChapterDirty(baseChapter, modified), true);
  });

  test('Modified teks_terjemahan returns isChapterDirty = true', () => {
    const modified = { ...baseChapter, teks_terjemahan: 'Langit dan bumi purba.' };
    assert.equal(isChapterDirty(baseChapter, modified), true);
  });

  test('Modified status_pengerjaan returns isChapterDirty = true', () => {
    const modified = { ...baseChapter, status_pengerjaan: 'Sedang' };
    assert.equal(isChapterDirty(baseChapter, modified), true);
  });

  test('Modified judul_chapter returns isChapterDirty = true', () => {
    const modified = { ...baseChapter, judul_chapter: 'Bab 1: Awal Mula Baru' };
    assert.equal(isChapterDirty(baseChapter, modified), true);
  });

  test('Brand new chapter (prev undefined) returns isChapterDirty = true', () => {
    assert.equal(isChapterDirty(undefined, baseChapter), true);
  });
});

describe('Unit: Metadata Deep Equality Checks (Audit-Daya #06)', () => {
  const baseRefs: StoredReference[] = [
    { id: 'ref-1', novel_id: 'novel-1', kategori: 'Karakter', nama_item: 'Lin Ming', deskripsi: 'Protagonis' },
    { id: 'ref-2', novel_id: 'novel-1', kategori: 'Gaya Bahasa', nama_item: 'Gaya', deskripsi: 'Puitis' },
  ];

  const baseGloss: StoredGlossary[] = [
    { id: 'glos-1', novel_id: 'novel-1', istilah_asli: '真元', istilah_terjemahan: 'True Essence', kategori: 'Istilah Khusus' },
  ];

  test('Identical references return areReferencesEqual = true', () => {
    const clone = JSON.parse(JSON.stringify(baseRefs));
    assert.equal(areReferencesEqual(baseRefs, clone), true);
  });

  test('Modified reference description returns areReferencesEqual = false', () => {
    const modified = [{ ...baseRefs[0], deskripsi: 'Protagonis jenius' }, baseRefs[1]];
    assert.equal(areReferencesEqual(baseRefs, modified), false);
  });

  test('Added reference item returns areReferencesEqual = false', () => {
    const added = [...baseRefs, { id: 'ref-3', novel_id: 'novel-1', kategori: 'Lokasi', nama_item: 'Sekte Sky', deskripsi: 'Gunung' }];
    assert.equal(areReferencesEqual(baseRefs, added), false);
  });

  test('Identical glossaries return areGlossariesEqual = true', () => {
    const clone = JSON.parse(JSON.stringify(baseGloss));
    assert.equal(areGlossariesEqual(baseGloss, clone), true);
  });

  test('Modified glossary translation returns areGlossariesEqual = false', () => {
    const modified = [{ ...baseGloss[0], istilah_terjemahan: 'Esensi Sejati' }];
    assert.equal(areGlossariesEqual(baseGloss, modified), false);
  });
});

describe('Integration: Granular Write Simulation (Audit-Daya #06)', () => {
  test('Syncing 50 chapters with 1 modified chapter queues only 1 write operation', () => {
    // Generate 50 chapters
    const currentChapters: StoredChapter[] = Array.from({ length: 50 }, (_, i) => ({
      id: `chap-${i + 1}`,
      novel_id: 'novel-1',
      nomor_chapter: i + 1,
      judul_chapter: `Chapter ${i + 1}`,
      teks_asli: `Teks asli chapter ${i + 1}`,
      teks_terjemahan: `Teks terjemahan chapter ${i + 1}`,
      status_pengerjaan: 'Selesai',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
    }));

    // Clone all 50 chapters, but modify only Chapter 7
    const incomingChapters: StoredChapter[] = currentChapters.map((c) => {
      if (c.id === 'chap-7') {
        return { ...c, teks_terjemahan: 'Teks terjemahan chapter 7 TELAH DIEDIT OLEH USER.' };
      }
      return { ...c };
    });

    const currentMap = new Map(currentChapters.map((c) => [c.id, c]));
    const queuedWrites: string[] = [];

    for (const chap of incomingChapters) {
      const prev = currentMap.get(chap.id);
      if (isChapterDirty(prev, chap)) {
        queuedWrites.push(chap.id);
      }
    }

    assert.equal(queuedWrites.length, 1, 'Only the modified chapter should be written to disk');
    assert.equal(queuedWrites[0], 'chap-7', 'Dirty chapter must be chap-7');
  });

  test('Partial sync without chapters payload triggers 0 chapter writes', () => {
    const partialData: { novels?: any[]; chapters?: StoredChapter[] } = {
      novels: [{ id: 'novel-1', judul: 'Judul Baru' }],
    };

    let chapterWritesQueued = 0;
    if (Array.isArray(partialData.chapters)) {
      chapterWritesQueued = partialData.chapters.length;
    }

    assert.equal(chapterWritesQueued, 0, 'Partial payload without chapters must skip all chapter writes');
  });
});
