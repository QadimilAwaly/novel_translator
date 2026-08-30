import { useState, useCallback, useMemo } from 'react';
import { Chapter, ReferenceItem, GlossaryItem, ChapterStatus, GenderTag } from '../types';
import {
  getStoredChapters,
  saveStoredChapters,
  getStoredReferences,
  saveStoredReferences,
  getStoredGlossaries,
  saveStoredGlossaries,
  deleteStoredChapter,
  deleteStoredGlossary,
  deleteStoredReference,
  LibraryStorageData,
} from '../services/storage';
import { filterRelevantGlossaries, filterRelevantReferences } from '../services/contextFilter';

export interface PromptStats {
  glossaryCount: number;
  totalGlossaries: number;
  hasReference: boolean;
}

export interface UseChapterEditorReturn {
  chapters: Chapter[];
  activeChapterId: string | null;
  activeChapter: Chapter | null;
  references: ReferenceItem[];
  glossaries: GlossaryItem[];
  synopsis: string;
  writingStyle: string;
  isDirty: boolean;
  promptStats: PromptStats;
  setActiveChapterId: (id: string | null) => void;
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  setReferences: React.Dispatch<React.SetStateAction<ReferenceItem[]>>;
  setGlossaries: React.Dispatch<React.SetStateAction<GlossaryItem[]>>;
  setSynopsis: React.Dispatch<React.SetStateAction<string>>;
  setWritingStyle: React.Dispatch<React.SetStateAction<string>>;
  reloadFromServer: (novelId: string, serverData?: LibraryStorageData | null) => void;
  updateChapterText: (chapterId: string, original: string, translated: string, novelId?: string) => Chapter | undefined;
  updateChapterStatus: (chapterId: string, status: ChapterStatus, novelId?: string) => void;
  renameChapter: (chapterId: string, newTitle: string, novelId?: string) => void;
  createChapter: (novelId: string, data: { nomor_chapter: number; judul_chapter: string; teks_asli: string }) => Chapter;
  deleteChapter: (chapterId: string, novelId?: string) => Chapter[];
  addGlossaryItem: (novelId: string, item: Omit<GlossaryItem, 'id' | 'novel_id'>) => GlossaryItem;
  deleteGlossaryItem: (id: string, novelId: string) => GlossaryItem[];
  updateGlossaryGender: (id: string, gender: GenderTag | undefined, novelId: string) => GlossaryItem[];
  addReferenceItem: (novelId: string, item: Omit<ReferenceItem, 'id' | 'novel_id'>) => ReferenceItem;
  deleteReferenceItem: (id: string, novelId: string) => ReferenceItem[];
  markClean: () => void;
}

export function useChapterEditor(): UseChapterEditorReturn {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [glossaries, setGlossaries] = useState<GlossaryItem[]>([]);
  const [synopsis, setSynopsis] = useState<string>('');
  const [writingStyle, setWritingStyle] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const activeChapter = useMemo(() => {
    return chapters.find((c) => c.id === activeChapterId) || null;
  }, [chapters, activeChapterId]);

  const promptStats = useMemo<PromptStats>(() => {
    if (!activeChapter || !activeChapter.teks_asli.trim()) {
      return {
        glossaryCount: 0,
        totalGlossaries: glossaries.length,
        hasReference: false,
      };
    }
    const relevantGlossaries = filterRelevantGlossaries(activeChapter.teks_asli, glossaries);
    const relevantReferences = filterRelevantReferences(activeChapter.teks_asli, references);
    return {
      glossaryCount: relevantGlossaries.length,
      totalGlossaries: glossaries.length,
      hasReference: relevantReferences.length > 0,
    };
  }, [activeChapter?.teks_asli, glossaries, references]);

  const reloadFromServer = useCallback((novelId: string, serverData?: LibraryStorageData | null) => {
    // 1. Chapters
    const loadedChapters = serverData?.chapters && serverData.chapters.length > 0
      ? serverData.chapters.filter((c) => c.novel_id === novelId)
      : getStoredChapters(novelId);
    setChapters(loadedChapters);
    if (loadedChapters.length > 0) {
      setActiveChapterId((prev) => (loadedChapters.some((c) => c.id === prev) ? prev : loadedChapters[0].id));
    } else {
      setActiveChapterId(null);
    }

    // 2. References
    const loadedRefs = serverData?.references && serverData.references.length > 0
      ? serverData.references.filter((r) => r.novel_id === novelId)
      : getStoredReferences(novelId);
    setReferences(loadedRefs);

    const styleRef = loadedRefs.find((r) => r.kategori === 'Gaya Bahasa');
    setWritingStyle(styleRef?.deskripsi || '');

    const synopsisRef = loadedRefs.find((r) => r.nama_item?.toLowerCase().includes('sinopsis'));
    setSynopsis(synopsisRef?.deskripsi || 'Satu pahlawan bangkit menghadapi bencana surgawi.');

    // 3. Glossaries
    const loadedGloss = serverData?.glossaries && serverData.glossaries.length > 0
      ? serverData.glossaries.filter((g) => g.novel_id === novelId)
      : getStoredGlossaries(novelId);
    setGlossaries(loadedGloss);

    setIsDirty(false);
  }, []);

  const updateChapterText = useCallback((chapterId: string, original: string, translated: string, novelId?: string) => {
    const allChapters = getStoredChapters();
    let updatedChapter: Chapter | undefined;

    const updatedAll = allChapters.map((c) => {
      if (c.id === chapterId) {
        updatedChapter = {
          ...c,
          teks_asli: original,
          teks_terjemahan: translated,
          updatedAt: new Date().toISOString(),
        };
        return updatedChapter;
      }
      return c;
    });

    saveStoredChapters(updatedAll);
    if (novelId) {
      const activeChapters = updatedAll.filter((c) => c.novel_id === novelId);
      setChapters(activeChapters);
    } else {
      setChapters((prev) =>
        prev.map((c) => (c.id === chapterId ? { ...c, teks_asli: original, teks_terjemahan: translated, updatedAt: new Date().toISOString() } : c))
      );
    }
    setIsDirty(true);
    return updatedChapter;
  }, []);

  const updateChapterStatus = useCallback((chapterId: string, status: ChapterStatus, novelId?: string) => {
    const allChapters = getStoredChapters();
    const updatedAll = allChapters.map((c) => {
      if (c.id === chapterId) {
        return {
          ...c,
          status_pengerjaan: status,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });

    saveStoredChapters(updatedAll);
    if (novelId) {
      const activeChapters = updatedAll.filter((c) => c.novel_id === novelId);
      setChapters(activeChapters);
    } else {
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, status_pengerjaan: status, updatedAt: new Date().toISOString() } : c)));
    }
  }, []);

  const renameChapter = useCallback((chapterId: string, newTitle: string, novelId?: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const allChapters = getStoredChapters();
    const updatedAll = allChapters.map((c) => {
      if (c.id === chapterId) {
        return { ...c, judul_chapter: trimmed, updatedAt: new Date().toISOString() };
      }
      return c;
    });

    saveStoredChapters(updatedAll);
    if (novelId) {
      const activeChapters = updatedAll.filter((c) => c.novel_id === novelId);
      setChapters(activeChapters);
    } else {
      setChapters((prev) => prev.map((c) => (c.id === chapterId ? { ...c, judul_chapter: trimmed, updatedAt: new Date().toISOString() } : c)));
    }
  }, []);

  const createChapter = useCallback((novelId: string, data: { nomor_chapter: number; judul_chapter: string; teks_asli: string }): Chapter => {
    const newChapter: Chapter = {
      id: `chap-${novelId}-${Date.now()}`,
      novel_id: novelId,
      nomor_chapter: data.nomor_chapter,
      judul_chapter: data.judul_chapter,
      teks_asli: data.teks_asli,
      teks_terjemahan: '',
      status_pengerjaan: 'Belum',
      updatedAt: new Date().toISOString(),
    };

    const allChapters = getStoredChapters();
    const updatedAllChapters = [...allChapters, newChapter];
    saveStoredChapters(updatedAllChapters);

    const activeChapters = updatedAllChapters.filter((c) => c.novel_id === novelId);
    setChapters(activeChapters);
    setActiveChapterId(newChapter.id);
    return newChapter;
  }, []);

  const deleteChapter = useCallback((chapterId: string, novelId?: string): Chapter[] => {
    const activeChapters = deleteStoredChapter(chapterId, novelId);
    setChapters(activeChapters);
    setActiveChapterId((prev) => {
      if (prev === chapterId) {
        return activeChapters.length > 0 ? activeChapters[0].id : null;
      }
      return prev;
    });
    return activeChapters;
  }, []);

  const addGlossaryItem = useCallback((novelId: string, item: Omit<GlossaryItem, 'id' | 'novel_id'>): GlossaryItem => {
    const newItem: GlossaryItem = {
      ...item,
      id: `glos-${crypto.randomUUID()}`,
      novel_id: novelId,
      gender: item.gender,
    };
    const allGloss = getStoredGlossaries(novelId);
    const updatedAll = [newItem, ...allGloss];
    saveStoredGlossaries(updatedAll, novelId);
    setGlossaries(updatedAll);
    return newItem;
  }, []);

  const deleteGlossaryItem = useCallback((id: string, novelId: string): GlossaryItem[] => {
    const updated = deleteStoredGlossary(id, novelId);
    setGlossaries(updated);
    return updated;
  }, []);

  const updateGlossaryGender = useCallback((id: string, gender: GenderTag | undefined, novelId: string): GlossaryItem[] => {
    const updated = getStoredGlossaries(novelId).map((g) => (g.id === id ? { ...g, gender } : g));
    saveStoredGlossaries(updated, novelId);
    setGlossaries(updated);
    return updated;
  }, []);

  const addReferenceItem = useCallback((novelId: string, item: Omit<ReferenceItem, 'id' | 'novel_id'>): ReferenceItem => {
    const newItem: ReferenceItem = {
      ...item,
      id: `ref-${Date.now()}`,
      novel_id: novelId,
    };
    const existing = getStoredReferences(novelId);
    const updated = [newItem, ...existing];
    saveStoredReferences(updated, novelId);
    setReferences(updated);
    return newItem;
  }, []);

  const deleteReferenceItem = useCallback((id: string, novelId: string): ReferenceItem[] => {
    const updated = deleteStoredReference(id, novelId);
    setReferences(updated);
    return updated;
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  return {
    chapters,
    activeChapterId,
    activeChapter,
    references,
    glossaries,
    synopsis,
    writingStyle,
    isDirty,
    promptStats,
    setActiveChapterId,
    setChapters,
    setReferences,
    setGlossaries,
    setSynopsis,
    setWritingStyle,
    reloadFromServer,
    updateChapterText,
    updateChapterStatus,
    renameChapter,
    createChapter,
    deleteChapter,
    addGlossaryItem,
    deleteGlossaryItem,
    updateGlossaryGender,
    addReferenceItem,
    deleteReferenceItem,
    markClean,
  };
}
