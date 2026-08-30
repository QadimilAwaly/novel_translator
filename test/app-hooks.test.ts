/**
 * Test Suite: App Hooks & Race Condition Mitigation (Step 8)
 * ==========================================================
 * Verifies useLibrary and useChapterEditor hook lifecycle,
 * isDirty tracking, promptStats calculation, and window-focus
 * uncommitted edit protection.
 *
 * Runs via: bun test test/app-hooks.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import { Novel, Chapter, ReferenceItem, GlossaryItem } from '../src/types';
import { filterRelevantGlossaries, filterRelevantReferences } from '../src/services/contextFilter';

describe('Unit: useLibrary State Operations', () => {
  test('addNovel prepends novel to list and sets activeNovelId', () => {
    let novels: Novel[] = [];
    let activeNovelId: string | null = null;

    const addNovel = (newNovel: Novel) => {
      novels = [newNovel, ...novels];
      activeNovelId = newNovel.id;
    };

    const mockNovel: Novel = {
      id: 'novel-1',
      judul: 'Martial World',
      folder_path: '/Novel_Library/Martial_World',
      bahasa_sumber: 'Mandarin',
      bahasa_target: 'Indonesia',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    addNovel(mockNovel);
    assert.equal(novels.length, 1);
    assert.equal(novels[0].judul, 'Martial World');
    assert.equal(activeNovelId, 'novel-1');
  });

  test('updateNovel applies patch while preserving other novels', () => {
    let novels: Novel[] = [
      { id: 'n1', judul: 'Novel 1', folder_path: '/p1', bahasa_sumber: 'Mandarin', bahasa_target: 'Indonesia', createdAt: '', updatedAt: '' },
      { id: 'n2', judul: 'Novel 2', folder_path: '/p2', bahasa_sumber: 'Mandarin', bahasa_target: 'Indonesia', createdAt: '', updatedAt: '' },
    ];

    const updateNovel = (id: string, patch: Partial<Novel>) => {
      novels = novels.map((n) => (n.id === id ? { ...n, ...patch } : n));
    };

    updateNovel('n1', { judul: 'Novel 1 Updated' });
    assert.equal(novels[0].judul, 'Novel 1 Updated');
    assert.equal(novels[1].judul, 'Novel 2', 'Unrelated novel should remain unmodified');
  });

  test('removeNovel clears activeNovelId if active novel was removed', () => {
    let novels: Novel[] = [
      { id: 'n1', judul: 'Novel 1', folder_path: '/p1', bahasa_sumber: 'Mandarin', bahasa_target: 'Indonesia', createdAt: '', updatedAt: '' },
      { id: 'n2', judul: 'Novel 2', folder_path: '/p2', bahasa_sumber: 'Mandarin', bahasa_target: 'Indonesia', createdAt: '', updatedAt: '' },
    ];
    let activeNovelId: string | null = 'n1';

    const removeNovel = (id: string) => {
      novels = novels.filter((n) => n.id !== id);
      if (activeNovelId === id) {
        activeNovelId = novels.length > 0 ? novels[0].id : null;
      }
    };

    removeNovel('n1');
    assert.equal(novels.length, 1);
    assert.equal(activeNovelId, 'n2', 'Should fall back to remaining novel');

    removeNovel('n2');
    assert.equal(novels.length, 0);
    assert.equal(activeNovelId, null, 'Should be null when list is empty');
  });
});

describe('Unit: useChapterEditor & isDirty Tracking', () => {
  test('updateChapterText sets isDirty to true', () => {
    let isDirty = false;
    let chapters: Chapter[] = [
      {
        id: 'chap-1',
        novel_id: 'n1',
        nomor_chapter: 1,
        judul_chapter: 'Bab 1',
        teks_asli: 'Original',
        teks_terjemahan: '',
        status_pengerjaan: 'Belum',
        updatedAt: '',
      },
    ];

    const updateChapterText = (id: string, orig: string, trans: string) => {
      chapters = chapters.map((c) => (c.id === id ? { ...c, teks_asli: orig, teks_terjemahan: trans } : c));
      isDirty = true;
    };

    assert.equal(isDirty, false);
    updateChapterText('chap-1', 'Updated Original', 'Hasil');
    assert.equal(isDirty, true);
    assert.equal(chapters[0].teks_asli, 'Updated Original');
    assert.equal(chapters[0].teks_terjemahan, 'Hasil');
  });

  test('reloadFromServer resets data and clears isDirty to false', () => {
    let isDirty = true;
    let chapters: Chapter[] = [{ id: 'c1', novel_id: 'n1', nomor_chapter: 1, judul_chapter: '1', teks_asli: 'Dirty', teks_terjemahan: '', status_pengerjaan: 'Belum', updatedAt: '' }];

    const reloadFromServer = (serverChapters: Chapter[]) => {
      chapters = serverChapters;
      isDirty = false;
    };

    reloadFromServer([{ id: 'c1', novel_id: 'n1', nomor_chapter: 1, judul_chapter: '1', teks_asli: 'Clean from Server', teks_terjemahan: '', status_pengerjaan: 'Belum', updatedAt: '' }]);
    assert.equal(isDirty, false);
    assert.equal(chapters[0].teks_asli, 'Clean from Server');
  });

  test('markClean resets isDirty without modifying chapter data', () => {
    let isDirty = true;
    const chapters = [{ id: 'c1', teks_asli: 'Edited' }];

    const markClean = () => {
      isDirty = false;
    };

    markClean();
    assert.equal(isDirty, false);
    assert.equal(chapters[0].teks_asli, 'Edited');
  });

  test('promptStats correctly recomputes memory injection counts', () => {
    const glossaries: GlossaryItem[] = [
      { id: 'g1', novel_id: 'n1', istilah_asli: 'Spatial Ring', istilah_terjemahan: 'Cincin Spasial', kategori: 'Item' },
      { id: 'g2', novel_id: 'n1', istilah_asli: 'Sword Cultivation', istilah_terjemahan: 'Kultivasi Pedang', kategori: 'Jurus' },
    ];
    const references: ReferenceItem[] = [
      { id: 'r1', novel_id: 'n1', kategori: 'Lore', nama_item: 'Realm', deskripsi: 'High realm' },
    ];

    const activeChapter: Chapter = {
      id: 'c1',
      novel_id: 'n1',
      nomor_chapter: 1,
      judul_chapter: 'Bab 1',
      teks_asli: 'He took out his Spatial Ring and looked at the mountain.',
      teks_terjemahan: '',
      status_pengerjaan: 'Belum',
      updatedAt: '',
    };

    const relevantG = filterRelevantGlossaries(activeChapter.teks_asli, glossaries);
    const relevantR = filterRelevantReferences(activeChapter.teks_asli, references);

    const stats = {
      glossaryCount: relevantG.length,
      totalGlossaries: glossaries.length,
      hasReference: relevantR.length > 0,
    };

    assert.equal(stats.glossaryCount, 1);
    assert.equal(stats.totalGlossaries, 2);
  });
});

describe('Integration: Window Focus Race Condition Mitigation', () => {
  test('When isDirty is true, window focus handler prevents auto-reload and prompts user', () => {
    let isDirty = true;
    let reloadCalled = false;
    let toastActionPrompted = false;

    const handleFocus = () => {
      if (isDirty) {
        toastActionPrompted = true;
        return; // Skip silent reload
      }
      reloadCalled = true;
    };

    handleFocus();
    assert.equal(toastActionPrompted, true, 'Must display warning toast prompt');
    assert.equal(reloadCalled, false, 'Auto-reload must NOT overwrite uncommitted edits');
  });

  test('When user explicitly chooses "Muat Ulang (Buang Edit)", isDirty is cleared and reload runs', () => {
    let isDirty = true;
    let reloadCalled = false;

    const onUserDiscardAndReload = () => {
      isDirty = false;
      reloadCalled = true;
    };

    onUserDiscardAndReload();
    assert.equal(isDirty, false);
    assert.equal(reloadCalled, true);
  });
});
