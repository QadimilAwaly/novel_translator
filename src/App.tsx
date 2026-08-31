import React, { useState, useEffect, useRef } from 'react';
import { Novel, Chapter, ReferenceItem, GlossaryItem, ChapterStatus, LanguageCode, AIConfig, GenderTag } from './types';
import {
  getStoredChapters,
  saveStoredChapters,
  getStoredReferences,
  saveStoredReferences,
  getStoredGlossaries,
  saveStoredGlossaries,
} from './services/storage';
import { translateChapterApi, extractGlossaryApi, authHeaders } from './services/api';
import { filterRelevantGlossaries, filterRelevantReferences } from './services/contextFilter';
import { exportNovelAsFolderZip } from './services/exportZip';
import { setNovelDirHandle, saveNovelToLocalFS, requestFolderPicker, removeNovelDirHandle } from './services/fileSystemStorage';
import { useLibrary } from './hooks/useLibrary';
import { useChapterEditor } from './hooks/useChapterEditor';
import { Header } from './components/Header';
import { NovelSidebar } from './components/NovelSidebar';
import { SplitEditor } from './components/SplitEditor';
import { ContextPanel } from './components/ContextPanel';
import { NewNovelModal } from './components/NewNovelModal';
import { NewChapterModal } from './components/NewChapterModal';
import { NewGlossaryModal } from './components/NewGlossaryModal';
import { ExportModal } from './components/ExportModal';
import { ModelSettingsModal } from './components/ModelSettingsModal';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastConfig {
  message: string;
  actions?: ToastAction[];
}

export default function App() {
  // Custom Hooks for Subsystem State Isolation (Step 8)
  const library = useLibrary();
  const chapterEditor = useChapterEditor();

  const {
    novels,
    activeNovelId,
    activeNovel,
    reloadLibraryFromDisk,
  } = library;

  const {
    chapters,
    activeChapterId,
    activeChapter,
    references,
    synopsis,
    writingStyle,
    glossaries,
    promptStats,
    setSynopsis,
    setWritingStyle,
  } = chapterEditor;

  // Global App Config State (stored in config.json on server)
  const [globalStoragePath, setGlobalStoragePath] = useState<string>('');
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    openrouterApiKey: '',
    geminiApiKey: '',
  });

  // Fetch config.json on mount (API key TIDAK dikirim server — audit #2)
  useEffect(() => {
    fetch('/api/config', {
      headers: authHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          if (data.global_storage_path) setGlobalStoragePath(data.global_storage_path);
          setAiConfig((prev) => ({
            ...prev,
            provider: data.default_provider || prev.provider,
            model: data.default_model || prev.model,
          }));
        }
      })
      .catch((err) => console.error('Failed fetching config.json:', err));
  }, []);

  // Modals States
  const [isNewNovelModalOpen, setIsNewNovelModalOpen] = useState(false);
  const [isNewChapterModalOpen, setIsNewChapterModalOpen] = useState(false);
  const [isNewGlossaryModalOpen, setIsNewGlossaryModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isModelSettingsModalOpen, setIsModelSettingsModalOpen] = useState(false);

  // Panel visibility states (responsive defaults)
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1280;
    }
    return true;
  });

  // AI Loading & Notification States
  const [isTranslating, setIsTranslating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showToast = (msg: string | ToastConfig) => {
    if (typeof msg === 'string') {
      setToast({ message: msg });
      setTimeout(() => setToast(null), 4000);
    } else {
      setToast(msg);
      if (!msg.actions || msg.actions.length === 0) {
        setTimeout(() => setToast(null), 4000);
      }
    }
  };

  const handleSaveAiConfig = async (newConfig: AIConfig, newGlobalPath?: string) => {
    setAiConfig(newConfig);
    if (typeof newGlobalPath === 'string') {
      setGlobalStoragePath(newGlobalPath);
    }

    try {
      const body: Record<string, unknown> = {
        global_storage_path: newGlobalPath !== undefined ? newGlobalPath : globalStoragePath,
        default_provider: newConfig.provider,
        default_model: newConfig.model,
      };
      if (newConfig.geminiApiKey) body.gemini_api_key = newConfig.geminiApiKey;
      if (newConfig.openrouterApiKey) body.openrouter_api_key = newConfig.openrouterApiKey;

      await fetch('/api/config', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch (e) {
      console.error('Failed saving config.json:', e);
    }

    showToast(`Pengaturan tersimpan ke config.json (${newConfig.provider.toUpperCase()}: ${newConfig.model}).`);
  };

  // Keep isDirty ref current for stable focus handler (Race condition fix — audit #8)
  const isDirtyRef = useRef(chapterEditor.isDirty);
  useEffect(() => {
    isDirtyRef.current = chapterEditor.isDirty;
  }, [chapterEditor.isDirty]);

  // 1. Initial Load of Novels & Window Focus Auto-Reload with isDirty protection & Focus Cooldown (Finding #03)
  const FOCUS_COOLDOWN_MS = 30000; // 30s cooldown for window refocus
  const lastFocusTimeRef = useRef<number>(0);

  useEffect(() => {
    // Initial mount: muat data langsung (force)
    reloadLibraryFromDisk(undefined, { force: true }).then((serverData) => {
      if (serverData && serverData.novels.length > 0) {
        const targetId = activeNovelId || serverData.novels[0].id;
        chapterEditor.reloadFromServer(targetId, serverData);
      }
    });

    const handleFocus = () => {
      const now = Date.now();
      if (lastFocusTimeRef.current !== 0 && now - lastFocusTimeRef.current < FOCUS_COOLDOWN_MS) {
        // Skip focus reload jika baru saja refetch dalam window cooldown (30s)
        return;
      }

      if (isDirtyRef.current) {
        // Jangan overwrite uncommitted edits; beri tahu user (audit #8)
        showToast({
          message: 'Ada perubahan belum disimpan di chapter. Muat ulang dari disk akan menimpa edit Anda.',
          actions: [
            {
              label: 'Muat Ulang (Buang Edit)',
              onClick: () => {
                chapterEditor.markClean();
                lastFocusTimeRef.current = Date.now();
                reloadLibraryFromDisk(undefined, { force: true }).then((serverData) => {
                  if (serverData && activeNovelId) {
                    chapterEditor.reloadFromServer(activeNovelId, serverData);
                  }
                });
              },
            },
            {
              label: 'Batal',
              onClick: () => {},
            },
          ],
        });
        return;
      }

      lastFocusTimeRef.current = now;
      reloadLibraryFromDisk({ cooldownMs: FOCUS_COOLDOWN_MS }).then((serverData) => {
        // Hanya reload chapterEditor jika data di server benar-benar berubah
        if (serverData && !serverData._notModified && activeNovelId) {
          chapterEditor.reloadFromServer(activeNovelId, serverData);
        }
      });
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // 2. Load Chapters, References, Glossaries when Active Novel changes
  useEffect(() => {
    if (!activeNovelId) return;
    chapterEditor.reloadFromServer(activeNovelId);
  }, [activeNovelId]);

  // Auto-Save active novel to Local File System if folder handle is attached
  const syncToLocalFS = async () => {
    if (!activeNovel) return;
    const success = await saveNovelToLocalFS(
      activeNovel,
      chapters,
      references,
      glossaries,
      synopsis,
      writingStyle
    );
    if (success) {
      console.log(`[Auto-Save FS] Synchronized novel "${activeNovel.judul}" to local folder.`);
    }
  };

  useEffect(() => {
    if (activeNovel && chapters.length > 0) {
      // Debounce auto-save 800ms untuk mencegah tumpukan write saat user mengetik (audit #17)
      const t = setTimeout(() => syncToLocalFS(), 800);
      return () => clearTimeout(t);
    }
  }, [chapters, references, glossaries, synopsis, writingStyle]);

  const handleSelectFolderForActiveNovel = async () => {
    if (!activeNovel) return;
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      const handle = await requestFolderPicker();
      if (handle) {
        setNovelDirHandle(activeNovel.id, handle);
        library.updateNovel(activeNovel.id, { folder_path: `[Lokal] ${handle.name}` });
        await saveNovelToLocalFS(activeNovel, chapters, references, glossaries, synopsis, writingStyle, handle);
        showToast(`Folder penyimpanan fisik dihubungkan ke "${handle.name}".`);
      }
    } else {
      setIsExportModalOpen(true);
    }
  };

  // Handler: Re-export / Re-extract Entire Novel to Local Storage
  const handleReExportNovelToLocal = async () => {
    if (!activeNovel) return;
    try {
      const fsSuccess = await saveNovelToLocalFS(
        activeNovel,
        chapters,
        references,
        glossaries,
        synopsis,
        writingStyle
      );

      const res = await fetch('/api/export-novel', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          novel: activeNovel,
          chapters,
          references,
          glossaries,
          synopsis,
          writing_style: writingStyle,
        }),
      });

      if (res.ok || fsSuccess) {
        showToast(`Seluruh novel (${chapters.length} bab) berhasil di-ekstrak ulang ke folder lokal!`);
      } else {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(`Gagal re-ekstrak novel: ${errData.error || 'Server menolak permintaan'}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal mengekstrak novel';
      console.error('Error re-exporting novel:', err);
      showToast(`Terjadi kesalahan: ${message}`);
    }
  };

  // Handler: Import & Merge Existing Local Novel Folder
  const handleImportNovelFolder = async () => {
    const inputPath = prompt(
      'Masukkan path folder fisik novel yang ingin di-import / di-merge (misal: E:\\Novel_Library\\The_Executed_Duke atau /Users/nama/Novels/The_Executed_Duke):'
    );
    if (!inputPath || !inputPath.trim()) return;

    try {
      const res = await fetch('/api/import-novel-folder', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ folder_path: inputPath.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.status) {
        alert(`Gagal mengimpor folder: ${data.error || 'Folder tidak dapat dibaca'}`);
        return;
      }

      const existingNovel = novels.find((n) => n.judul.toLowerCase() === data.novel_title.toLowerCase());
      const novelId = existingNovel ? existingNovel.id : `novel-${Date.now()}`;

      const importedNovel: Novel = {
        id: novelId,
        judul: data.novel_title,
        folder_path: data.folder_path,
        bahasa_sumber: data.source_language || 'Mandarin',
        bahasa_target: data.target_language || 'Indonesia',
        createdAt: existingNovel ? existingNovel.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (existingNovel) {
        library.updateNovel(novelId, importedNovel);
      } else {
        library.addNovel(importedNovel);
      }

      const allChapters = getStoredChapters().filter((c) => c.novel_id !== novelId);
      const newChapters: Chapter[] = (data.chapters || []).map((c: any) => ({
        id: `chap-${novelId}-${c.nomor_chapter}-${Date.now()}`,
        novel_id: novelId,
        nomor_chapter: c.nomor_chapter,
        judul_chapter: c.judul_chapter,
        teks_asli: c.teks_asli,
        teks_terjemahan: c.teks_terjemahan,
        status_pengerjaan: c.status_pengerjaan || 'Belum',
        updatedAt: new Date().toISOString(),
      }));

      saveStoredChapters([...allChapters, ...newChapters]);

      if (Array.isArray(data.reference_items) && data.reference_items.length > 0) {
        const existingRefs = getStoredReferences(novelId);
        const newRefs: ReferenceItem[] = data.reference_items.map((r: any) => ({
          id: `ref-${novelId}-${Date.now()}-${Math.random()}`,
          novel_id: novelId,
          kategori: r.kategori || 'Lore',
          nama_item: r.nama_item || 'Item',
          deskripsi: r.deskripsi || '',
        }));
        saveStoredReferences([...existingRefs, ...newRefs]);
      }

      if (Array.isArray(data.glossaries) && data.glossaries.length > 0) {
        const existingGloss = getStoredGlossaries(novelId);
        const newGloss: GlossaryItem[] = data.glossaries.map((g: any) => ({
          id: `glos-${novelId}-${Date.now()}-${Math.random()}`,
          novel_id: novelId,
          istilah_asli: g.istilah_asli,
          istilah_terjemahan: g.istilah_terjemahan,
          kategori: g.kategori || 'Istilah Khusus',
          chapter_ditemukan: g.chapter_ditemukan || 'Imported',
          konteks: g.konteks || '',
        }));
        saveStoredGlossaries([...existingGloss, ...newGloss]);
      }

      library.setActiveNovelId(novelId);
      chapterEditor.reloadFromServer(novelId);
      showToast(`Berhasil meng-impor/merge "${importedNovel.judul}" (${newChapters.length} bab ditemukan)!`);
    } catch (err: any) {
      console.error('Error importing novel folder:', err);
      showToast(`Gagal mengimpor: ${err.message || 'Kesalahan jaringan'}`);
    }
  };

  // Helper: Save chapter to local disk via server API (/api/save-chapter)
  const saveChapterToDiskServer = async (chap: Chapter) => {
    if (!activeNovel) return;
    try {
      const folderPath = activeNovel.folder_path && !activeNovel.folder_path.startsWith('[')
        ? activeNovel.folder_path
        : globalStoragePath;

      await fetch('/api/save-chapter', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          folder_path: folderPath,
          chapter_number: chap.nomor_chapter,
          chapter_title: chap.judul_chapter,
          original_text: chap.teks_asli,
          translated_text: chap.teks_terjemahan,
          novel_title: activeNovel.judul,
          source_lang: activeNovel.bahasa_sumber,
          target_lang: activeNovel.bahasa_target,
        }),
      });
    } catch (err) {
      console.error('Error saving chapter file to disk via server:', err);
    }
  };

  // Handler: Select Chapter
  const handleSelectChapter = (id: string) => {
    chapterEditor.setActiveChapterId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsLeftSidebarOpen(false);
    }
  };

  // Handler: Update Chapter Text (Original & Translation)
  const handleUpdateChapterText = (original: string, translated: string) => {
    if (!activeChapterId || !activeNovelId) return;
    const updatedChapter = chapterEditor.updateChapterText(activeChapterId, original, translated, activeNovelId);
    if (updatedChapter) {
      saveChapterToDiskServer(updatedChapter);
    }
  };

  // Handler: Update Chapter Status
  const handleUpdateChapterStatus = (status: ChapterStatus) => {
    if (!activeChapterId || !activeNovelId) return;
    chapterEditor.updateChapterStatus(activeChapterId, status, activeNovelId);
    showToast(`Status Bab diperbarui menjadi "${status}".`);
  };

  // Handler: Create New Novel
  const handleCreateNovel = (data: {
    judul: string;
    folder_path: string;
    bahasa_sumber: LanguageCode;
    bahasa_target: LanguageCode;
    dirHandle?: FileSystemDirectoryHandle;
  }) => {
    const newNovel: Novel = {
      id: `novel-${Date.now()}`,
      judul: data.judul,
      folder_path: data.folder_path,
      bahasa_sumber: data.bahasa_sumber,
      bahasa_target: data.bahasa_target,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (data.dirHandle) {
      setNovelDirHandle(newNovel.id, data.dirHandle);
    }

    library.addNovel(newNovel);
    showToast(`Novel "${newNovel.judul}" berhasil dibuat.`);
  };

  // Handler: Delete Novel
  const handleDeleteNovel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Apakah Anda yakin ingin menghapus novel ini beserta seluruh bab dan glosariumnya?')) return;

    library.removeNovel(id);
    removeNovelDirHandle(id);
    showToast('Novel dan foldernya di disk berhasil dihapus.');
  };

  // Handler: Rename Novel
  const handleRenameNovel = (id: string, newTitle: string) => {
    library.renameNovel(id, newTitle);
    showToast('Judul novel dan folder di disk berhasil diperbarui.');
  };

  // Handler: Rename Chapter
  const handleRenameChapter = (id: string, newTitle: string) => {
    chapterEditor.renameChapter(id, newTitle, activeNovelId || undefined);
    showToast('Judul bab berhasil diperbarui.');
  };

  // Handler: Create New Chapter
  const handleCreateChapter = (data: {
    nomor_chapter: number;
    judul_chapter: string;
    teks_asli: string;
  }) => {
    if (!activeNovelId) return;
    const newChapter = chapterEditor.createChapter(activeNovelId, data);
    showToast(`Bab ${newChapter.nomor_chapter} berhasil ditambahkan.`);
  };

  // Handler: Import Chapter from File (.txt or .md)
  const handleImportChapterFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeNovelId || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (file.size > 5 * 1024 * 1024) {
      showToast('File terlalu besar (maks 5MB).');
      if (e.target) e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const chapterName = file.name.replace(/\.[^/.]+$/, '');
      const nextNum = chapters.length + 1;

      handleCreateChapter({
        nomor_chapter: nextNum,
        judul_chapter: chapterName,
        teks_asli: content,
      });
    };
    reader.readAsText(file);
  };

  // Handler: Delete Chapter
  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Hapus chapter ini?')) return;

    chapterEditor.deleteChapter(id, activeNovelId || undefined);
    showToast('Bab berhasil dihapus.');
  };

  // Handler: Add Glossary Item
  const handleAddGlossaryItem = (item: Omit<GlossaryItem, 'id' | 'novel_id'>) => {
    if (!activeNovelId) return;
    const newItem = chapterEditor.addGlossaryItem(activeNovelId, item);
    showToast(`Istilah "${newItem.istilah_asli}" ditambahkan ke glosarium.`);
  };

  // Handler: Delete Glossary Item
  const handleDeleteGlossaryItem = (id: string) => {
    if (!activeNovelId) return;
    chapterEditor.deleteGlossaryItem(id, activeNovelId);
    showToast('Istilah berhasil dihapus dari glosarium.');
  };

  // Handler: Update Glossary Gender Tag
  const handleUpdateGlossaryGender = (id: string, gender: GenderTag | undefined) => {
    if (!activeNovelId) return;
    const updated = chapterEditor.updateGlossaryGender(id, gender, activeNovelId);
    showToast(`Gender istilah "${updated.find((g) => g.id === id)?.istilah_asli}" diperbarui.`);
  };

  // Handler: Add Reference Item
  const handleAddReferenceItem = (item: Omit<ReferenceItem, 'id' | 'novel_id'>) => {
    if (!activeNovelId) return;
    const newItem = chapterEditor.addReferenceItem(activeNovelId, item);
    showToast(`Lore/Karakter "${newItem.nama_item}" ditambahkan.`);
  };

  // Handler: Delete Reference Item
  const handleDeleteReferenceItem = (id: string) => {
    if (!activeNovelId) return;
    chapterEditor.deleteReferenceItem(id, activeNovelId);
    showToast('Lore/Referensi berhasil dihapus.');
  };

  // Phase 1 & 2: Translate Chapter via LLM with Context Assembly
  const handleTranslateChapter = async () => {
    if (!activeNovel || !activeChapter || !activeChapter.teks_asli.trim()) return;

    setIsTranslating(true);
    try {
      const relevantGlossaries = filterRelevantGlossaries(activeChapter.teks_asli, glossaries);
      const relevantReferences = filterRelevantReferences(activeChapter.teks_asli, references);

      const reqData = {
        teks_asli: activeChapter.teks_asli,
        bahasa_sumber: activeNovel.bahasa_sumber,
        bahasa_target: activeNovel.bahasa_target,
        nomor_chapter: activeChapter.nomor_chapter,
        judul_novel: activeNovel.judul,
        reference_data: {
          synopsis,
          writing_style: writingStyle,
          lore_summary: relevantReferences.map((r) => `[${r.kategori}] ${r.nama_item}: ${r.deskripsi}`).join('\n'),
        },
        glossary_items: relevantGlossaries.map((g) => ({
          istilah_asli: g.istilah_asli,
          istilah_terjemahan: g.istilah_terjemahan,
          kategori: g.kategori,
          gender: g.gender,
          konteks: g.konteks,
        })),
        ai_config: {
          provider: aiConfig.provider,
          model: aiConfig.model,
        },
      };

      const result = await translateChapterApi(reqData);
      handleUpdateChapterText(activeChapter.teks_asli, result.translatedText);
      if (
        result.suggestedTitle &&
        (activeChapter.judul_chapter === `Bab ${activeChapter.nomor_chapter}` ||
          activeChapter.judul_chapter === `Chapter ${activeChapter.nomor_chapter}` ||
          !activeChapter.judul_chapter.trim())
      ) {
        handleRenameChapter(activeChapter.id, result.suggestedTitle);
      }
      handleUpdateChapterStatus('Selesai');
      showToast(`Chapter ${activeChapter.nomor_chapter} berhasil diterjemahkan!`);
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal menerjemahkan: ${err.message || 'Kesalahan jaringan.'}`);
    } finally {
      setIsTranslating(false);
    }
  };

  // Phase 3: Automatic Glossary Extraction & AI Progression
  const handleExtractGlossary = async () => {
    if (!activeChapter || !activeChapter.teks_terjemahan) return;

    setIsExtracting(true);
    try {
      const relevantGlossaries = filterRelevantGlossaries(activeChapter.teks_asli, glossaries);
      const relevantReferences = filterRelevantReferences(activeChapter.teks_asli, references);

      const result = await extractGlossaryApi({
        teks_asli: activeChapter.teks_asli,
        teks_terjemahan: activeChapter.teks_terjemahan,
        nomor_chapter: activeChapter.nomor_chapter,
        bahasa_sumber: activeNovel?.bahasa_sumber || 'Mandarin',
        bahasa_target: activeNovel?.bahasa_target || 'Indonesia',
        reference_data: {
          synopsis,
          writing_style: writingStyle,
          lore_summary: relevantReferences.map((r) => `[${r.kategori}] ${r.nama_item}: ${r.deskripsi}`).join('\n'),
        },
        existing_glossary: relevantGlossaries.map((g) => ({
          istilah_asli: g.istilah_asli,
          istilah_terjemahan: g.istilah_terjemahan,
          kategori: g.kategori,
          gender: g.gender,
          konteks: g.konteks,
        })),
        ai_config: {
          provider: aiConfig.provider,
          model: aiConfig.model,
        },
      });

      if (result.terms && result.terms.length > 0) {
        let addedCount = 0;
        const newGlossaryItems: GlossaryItem[] = [...glossaries];

        result.terms.forEach((term) => {
          const exists = newGlossaryItems.some(
            (g) => g.istilah_asli.toLowerCase() === term.istilah_asli.toLowerCase()
          );
          if (!exists && activeNovelId) {
            newGlossaryItems.push({
              id: `glos-auto-${crypto.randomUUID()}`,
              novel_id: activeNovelId,
              istilah_asli: term.istilah_asli,
              istilah_terjemahan: term.istilah_terjemahan,
              kategori: term.kategori || 'Istilah Khusus',
              gender: term.gender,
              chapter_ditemukan: `Chapter ${activeChapter.nomor_chapter}`,
              konteks: term.konteks || '',
            });
            addedCount++;
          }
        });
        saveStoredGlossaries(newGlossaryItems, activeNovelId || undefined);
        chapterEditor.setGlossaries(newGlossaryItems);
        showToast(`Berhasil mengekstrak ${addedCount} istilah baru ke glosarium!`);
      } else {
        showToast('Tidak ada istilah baru tambahan ditemukan pada bab ini.');
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Gagal ekstraksi glosarium: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Export Physical Folder ZIP
  const handleExportFolderZip = () => {
    if (!activeNovel) return;
    exportNovelAsFolderZip(activeNovel, chapters, references, glossaries, synopsis, writingStyle);
    showToast('File physical library .ZIP berhasil diunduh.');
  };

  // Update Source and Target Languages for Active Novel
  const handleUpdateNovelLanguages = (source: LanguageCode, target: LanguageCode) => {
    if (!activeNovel) return;
    library.updateNovel(activeNovel.id, { bahasa_sumber: source, bahasa_target: target });
    showToast(`Bahasa diperbarui: ${source} ➔ ${target}`);
  };

  const completedChaptersCount = chapters.filter((c) => c.status_pengerjaan === 'Selesai').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#111318] font-sans antialiased text-gray-200">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1F2229] border border-indigo-500/30 text-indigo-300 px-4 py-2.5 rounded shadow-2xl text-xs font-medium flex items-center gap-3 animate-in fade-in slide-in-from-bottom duration-200">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
          <span>{toast.message}</span>
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex items-center gap-2 ml-2">
              {toast.actions.map((act, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    act.onClick();
                    setToast(null);
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs transition cursor-pointer font-medium"
                >
                  {act.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Header Bar */}
      <Header
        activeNovel={activeNovel}
        totalChapters={chapters.length}
        completedChapters={completedChaptersCount}
        totalGlossaryCount={glossaries.length}
        aiConfig={aiConfig}
        onOpenNewNovelModal={() => setIsNewNovelModalOpen(true)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onOpenModelSettingsModal={() => setIsModelSettingsModalOpen(true)}
        onUpdateNovelLanguages={handleUpdateNovelLanguages}
        onSelectFolderForActiveNovel={handleSelectFolderForActiveNovel}
        onReExportNovelToLocal={handleReExportNovelToLocal}
        onReloadFromDisk={async () => {
          const serverData = await reloadLibraryFromDisk(undefined, { force: true });
          if (serverData && activeNovelId) {
            chapterEditor.reloadFromServer(activeNovelId, serverData);
          }
          if (serverData) {
            showToast('Seluruh data novel, bab, dan glosarium berhasil dimuat ulang dari disk!');
          } else {
            showToast('Gagal memuat ulang data dari disk.');
          }
        }}
        isLeftSidebarOpen={isLeftSidebarOpen}
        isRightPanelOpen={isRightPanelOpen}
        onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
        onToggleRightPanel={() => setIsRightPanelOpen((prev) => !prev)}
      />
      <main className="flex-1 flex flex-row overflow-hidden relative min-h-0 min-w-0">
        {/* Panel 1: Navigasi Novel & Chapter (Left) */}
        {isLeftSidebarOpen && (
          <>
            {/* Mobile Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
              onClick={() => setIsLeftSidebarOpen(false)}
              aria-label="Tutup Library Sidebar"
            />
            <NovelSidebar
              novels={novels}
              activeNovelId={activeNovelId}
              onSelectNovel={library.setActiveNovelId}
              chapters={chapters}
              activeChapterId={activeChapterId}
              onSelectChapter={handleSelectChapter}
              onAddChapter={() => setIsNewChapterModalOpen(true)}
              onImportChapterFile={handleImportChapterFile}
              onDeleteChapter={handleDeleteChapter}
              onDeleteNovel={handleDeleteNovel}
              onRenameNovel={handleRenameNovel}
              onRenameChapter={handleRenameChapter}
              onImportNovelFolder={handleImportNovelFolder}
              onAddNovel={() => setIsNewNovelModalOpen(true)}
              onClose={() => setIsLeftSidebarOpen(false)}
            />
          </>
        )}

        {/* Panel 2: Split-View Editor Kerja (Center) */}
        <SplitEditor
          activeNovel={activeNovel}
          activeChapter={activeChapter}
          onUpdateChapterText={handleUpdateChapterText}
          onUpdateChapterStatus={handleUpdateChapterStatus}
          onTranslateChapter={handleTranslateChapter}
          onExtractGlossary={handleExtractGlossary}
          onUpdateNovelLanguages={handleUpdateNovelLanguages}
          onAddNovel={() => setIsNewNovelModalOpen(true)}
          onAddChapter={() => setIsNewChapterModalOpen(true)}
          isTranslating={isTranslating}
          isExtracting={isExtracting}
          promptStats={promptStats}
        />

        {/* Panel 3: Konteks, Lore & Glosarium (Right) */}
        {isRightPanelOpen && (
          <>
            {/* Mobile Backdrop */}
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 lg:hidden"
              onClick={() => setIsRightPanelOpen(false)}
              aria-label="Tutup Context Panel"
            />
            <ContextPanel
              activeNovel={activeNovel}
              references={references}
              glossaries={glossaries}
              synopsis={synopsis}
              writingStyle={writingStyle}
              onChangeSynopsis={setSynopsis}
              onChangeWritingStyle={setWritingStyle}
              onAddReferenceItem={handleAddReferenceItem}
              onDeleteReferenceItem={handleDeleteReferenceItem}
              onAddGlossaryItem={handleAddGlossaryItem}
              onDeleteGlossaryItem={handleDeleteGlossaryItem}
              onUpdateGlossaryGender={handleUpdateGlossaryGender}
              onOpenNewGlossaryModal={() => setIsNewGlossaryModalOpen(true)}
              onClose={() => setIsRightPanelOpen(false)}
            />
          </>
        )}
      </main>
      {/* Dialog Modals */}
      <NewNovelModal
        isOpen={isNewNovelModalOpen}
        onClose={() => setIsNewNovelModalOpen(false)}
        onCreateNovel={handleCreateNovel}
      />

      <NewChapterModal
        isOpen={isNewChapterModalOpen}
        onClose={() => setIsNewChapterModalOpen(false)}
        nextChapterNumber={chapters.length + 1}
        onCreateChapter={handleCreateChapter}
      />

      <NewGlossaryModal
        isOpen={isNewGlossaryModalOpen}
        onClose={() => setIsNewGlossaryModalOpen(false)}
        activeChapterNum={activeChapter?.nomor_chapter}
        onAddGlossary={handleAddGlossaryItem}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        activeNovel={activeNovel}
        onExportFolderZip={handleExportFolderZip}
      />

      <ModelSettingsModal
        isOpen={isModelSettingsModalOpen}
        onClose={() => setIsModelSettingsModalOpen(false)}
        aiConfig={aiConfig}
        onSaveConfig={handleSaveAiConfig}
      />
    </div>
  );
}
