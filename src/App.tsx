import React, { useState, useEffect } from 'react';
import { Novel, Chapter, ReferenceItem, GlossaryItem, ChapterStatus, LanguageCode, AIConfig, GenderTag } from './types';
import {
  getStoredNovels,
  saveStoredNovels,
  getStoredChapters,
  saveStoredChapters,
  getStoredReferences,
  saveStoredReferences,
  getStoredGlossaries,
  saveStoredGlossaries,
  fetchServerStorage,
  deleteStoredNovel,
  deleteStoredChapter,
  renameStoredNovel,
  deleteStoredGlossary,
  deleteStoredReference,
  LibraryStorageData
} from './services/storage';
import { translateChapterApi, extractGlossaryApi, authHeaders } from './services/api';
import { filterRelevantGlossaries, filterRelevantReferences } from './services/contextFilter';
import { exportNovelAsFolderZip } from './services/exportZip';
import { setNovelDirHandle, saveNovelToLocalFS, requestFolderPicker, removeNovelDirHandle } from './services/fileSystemStorage';
import { Header } from './components/Header';
import { NovelSidebar } from './components/NovelSidebar';
import { SplitEditor } from './components/SplitEditor';
import { ContextPanel } from './components/ContextPanel';
import { NewNovelModal } from './components/NewNovelModal';
import { NewChapterModal } from './components/NewChapterModal';
import { NewGlossaryModal } from './components/NewGlossaryModal';
import { ExportModal } from './components/ExportModal';
import { ModelSettingsModal } from './components/ModelSettingsModal';

export default function App() {
  // Main Data States
  const [novels, setNovels] = useState<Novel[]>([]);
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  const [references, setReferences] = useState<ReferenceItem[]>([]);
  const [synopsis, setSynopsis] = useState<string>('');
  const [writingStyle, setWritingStyle] = useState<string>('');

  const [glossaries, setGlossaries] = useState<GlossaryItem[]>([]);

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
  const [promptStats, setPromptStats] = useState<{ glossaryCount: number; hasReference: boolean }>({
    glossaryCount: 0,
    hasReference: false,
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSaveAiConfig = async (newConfig: AIConfig, newGlobalPath?: string) => {
    setAiConfig(newConfig);
    if (typeof newGlobalPath === 'string') {
      setGlobalStoragePath(newGlobalPath);
    }
    // JANGAN simpan API key di localStorage (audit #2) — key hanya disimpan server-side via POST /api/config

    try {
      const body: Record<string, unknown> = {
        global_storage_path: newGlobalPath !== undefined ? newGlobalPath : globalStoragePath,
        default_provider: newConfig.provider,
        default_model: newConfig.model,
      };
      // Hanya kirim API key jika user mengisi field — biarkan kosong untuk mempertahankan key server
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

  // Helper: Load in-memory state for active novel from serverData or localStorage
  const loadNovelData = (novelId: string, serverData?: LibraryStorageData | null) => {
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

    setPromptStats({
      glossaryCount: loadedGloss.length,
      hasReference: loadedRefs.length > 0,
    });
  };

  // Helper: Reload full library directly from server disk
  const reloadLibraryFromDisk = async (preferredNovelId?: string) => {
    try {
      const serverData = await fetchServerStorage();
      if (serverData && Array.isArray(serverData.novels) && serverData.novels.length > 0) {
        setNovels(serverData.novels);
        const targetId = preferredNovelId || activeNovelId || serverData.novels[0].id;
        setActiveNovelId(targetId);
        loadNovelData(targetId, serverData);
        return true;
      }
    } catch (e) {
      console.warn('Failed reloading storage from server disk:', e);
    }
    return false;
  };

  // 1. Initial Load of Novels & Auto-Reload on Mount & Window Focus
  useEffect(() => {
    reloadLibraryFromDisk();

    const handleFocus = () => {
      reloadLibraryFromDisk();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // 2. Load Chapters, References, Glossaries when Active Novel changes
  useEffect(() => {
    if (!activeNovelId) return;
    loadNovelData(activeNovelId);
  }, [activeNovelId]);
  const activeNovel = novels.find((n) => n.id === activeNovelId) || null;
  const activeChapter = chapters.find((c) => c.id === activeChapterId) || null;

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
        const updatedNovels = novels.map((n) =>
          n.id === activeNovel.id ? { ...n, folder_path: `[Lokal] ${handle.name}` } : n
        );
        setNovels(updatedNovels);
        saveStoredNovels(updatedNovels);
        await saveNovelToLocalFS(activeNovel, chapters, references, glossaries, synopsis, writingStyle, handle);
        showToast(`Folder penyimpanan fisik dihubungkan ke "${handle.name}".`);
      }
    } else {
      // Fallback if browser doesn't support direct local directory write
      setIsExportModalOpen(true);
    }
  };

  // Handler: Re-export / Re-extract Entire Novel to Local Storage
  const handleReExportNovelToLocal = async () => {
    if (!activeNovel) return;
    try {
      // 1. Try local FS API first
      const fsSuccess = await saveNovelToLocalFS(
        activeNovel,
        chapters,
        references,
        glossaries,
        synopsis,
        writingStyle
      );

      // 2. Also send to server endpoint /api/export-novel
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

      // Create new novel object or update existing if title matches
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

      // Save Novel
      const updatedNovels = existingNovel
        ? novels.map((n) => (n.id === novelId ? importedNovel : n))
        : [importedNovel, ...novels];
      setNovels(updatedNovels);
      saveStoredNovels(updatedNovels);

      // Save Chapters
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

      const updatedAllChapters = [...allChapters, ...newChapters];
      saveStoredChapters(updatedAllChapters);

      // Save References & Glossaries
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

      setActiveNovelId(novelId);
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


  // Handler: Select Novel
  const handleSelectNovel = (id: string) => {
    setActiveNovelId(id);
  };

  // Handler: Select Chapter
  const handleSelectChapter = (id: string) => {
    setActiveChapterId(id);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsLeftSidebarOpen(false);
    }
  };
  // Handler: Update Chapter Text (Original & Translation)
  const handleUpdateChapterText = (original: string, translated: string) => {
    if (!activeChapterId || !activeNovelId) return;

    const allChapters = getStoredChapters();
    let updatedChapter: Chapter | undefined;

    const updatedAll = allChapters.map((c) => {
      if (c.id === activeChapterId) {
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
    const activeChapters = updatedAll.filter((c) => c.novel_id === activeNovelId);
    setChapters(activeChapters);

    if (updatedChapter) {
      saveChapterToDiskServer(updatedChapter);
    }
  };

  // Handler: Update Chapter Status
  const handleUpdateChapterStatus = (status: ChapterStatus) => {
    if (!activeChapterId || !activeNovelId) return;

    const allChapters = getStoredChapters();
    const updatedAll = allChapters.map((c) => {
      if (c.id === activeChapterId) {
        return {
          ...c,
          status_pengerjaan: status,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });

    saveStoredChapters(updatedAll);
    const activeChapters = updatedAll.filter((c) => c.novel_id === activeNovelId);
    setChapters(activeChapters);
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

    const updatedNovels = [newNovel, ...novels];
    setNovels(updatedNovels);
    saveStoredNovels(updatedNovels);
    setActiveNovelId(newNovel.id);
    showToast(`Novel "${newNovel.judul}" berhasil dibuat.`);
  };

  // Handler: Delete Novel
  const handleDeleteNovel = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Apakah Anda yakin ingin menghapus novel ini beserta seluruh bab dan glosariumnya?')) return;

    const updatedNovels = deleteStoredNovel(id);
    setNovels(updatedNovels);
    removeNovelDirHandle(id); // bersihkan handle folder — cegah memory leak (audit #14)

    if (activeNovelId === id) {
      if (updatedNovels.length > 0) {
        setActiveNovelId(updatedNovels[0].id);
      } else {
        setActiveNovelId(null);
      }
    }
    showToast('Novel dan foldernya di disk berhasil dihapus.');
  };

  // Handler: Rename Novel
  const handleRenameNovel = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    const updatedNovels = renameStoredNovel(id, trimmed);
    setNovels(updatedNovels);
    showToast('Judul novel dan folder di disk berhasil diperbarui.');
  };

  // Handler: Rename Chapter
  const handleRenameChapter = (id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed || !activeNovelId) return;

    const allChapters = getStoredChapters();
    const updatedAll = allChapters.map((c) => {
      if (c.id === id) {
        return { ...c, judul_chapter: trimmed, updatedAt: new Date().toISOString() };
      }
      return c;
    });

    saveStoredChapters(updatedAll);
    const activeChapters = updatedAll.filter((c) => c.novel_id === activeNovelId);
    setChapters(activeChapters);
    showToast('Judul bab berhasil diperbarui.');
  };

  // Handler: Create New Chapter
  const handleCreateChapter = (data: {
    nomor_chapter: number;
    judul_chapter: string;
    teks_asli: string;
  }) => {
    if (!activeNovelId) return;

    const newChapter: Chapter = {
      id: `chap-${activeNovelId}-${Date.now()}`,
      novel_id: activeNovelId,
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

    const activeChapters = updatedAllChapters.filter((c) => c.novel_id === activeNovelId);
    setChapters(activeChapters);
    setActiveChapterId(newChapter.id);
    showToast(`Bab ${newChapter.nomor_chapter} berhasil ditambahkan.`);
  };

  // Handler: Import Chapter from File (.txt or .md)
  const handleImportChapterFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeNovelId || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    // Batasi ukuran import file (audit #12) — maks 5MB
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

    const activeChapters = deleteStoredChapter(id, activeNovelId || undefined);
    setChapters(activeChapters);

    if (activeChapterId === id) {
      if (activeChapters.length > 0) {
        setActiveChapterId(activeChapters[0].id);
      } else {
        setActiveChapterId(null);
      }
    }
    showToast('Bab berhasil dihapus.');
  };

  // Handler: Add Glossary Item
  const handleAddGlossaryItem = (item: Omit<GlossaryItem, 'id' | 'novel_id'>) => {
    if (!activeNovelId) return;

    const newItem: GlossaryItem = {
      ...item,
      id: `glos-${crypto.randomUUID()}`,
      novel_id: activeNovelId,
      gender: item.gender,
    };
    const allGloss = getStoredGlossaries(activeNovelId);
    const updatedAll = [newItem, ...allGloss];
    saveStoredGlossaries(updatedAll, activeNovelId);
    setGlossaries(updatedAll);
    showToast(`Istilah "${newItem.istilah_asli}" ditambahkan ke glosarium.`);
  };

  // Handler: Delete Glossary Item
  const handleDeleteGlossaryItem = (id: string) => {
    if (!activeNovelId) return;

    const updated = deleteStoredGlossary(id, activeNovelId);
    setGlossaries(updated);
    showToast('Istilah berhasil dihapus dari glosarium.');
  };

  // Handler: Update Glossary Gender Tag
  const handleUpdateGlossaryGender = (id: string, gender: GenderTag | undefined) => {
    if (!activeNovelId) return;

    const updated = glossaries.map((g) => (g.id === id ? { ...g, gender } : g));
    saveStoredGlossaries(updated, activeNovelId);
    setGlossaries(updated);
    showToast(`Gender istilah "${updated.find((g) => g.id === id)?.istilah_asli}" diperbarui.`);
  };
  // Handler: Add Reference Item
  const handleAddReferenceItem = (item: Omit<ReferenceItem, 'id' | 'novel_id'>) => {
    if (!activeNovelId) return;

    const newItem: ReferenceItem = {
      ...item,
      id: `ref-${Date.now()}`,
      novel_id: activeNovelId,
    };

    const updated = [newItem, ...references];
    saveStoredReferences(updated, activeNovelId);
    setReferences(updated);
    showToast(`Lore/Karakter "${newItem.nama_item}" ditambahkan.`);
  };

  // Handler: Delete Reference Item
  const handleDeleteReferenceItem = (id: string) => {
    if (!activeNovelId) return;

    const updated = deleteStoredReference(id, activeNovelId);
    setReferences(updated);
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

      setPromptStats({
        glossaryCount: relevantGlossaries.length,
        hasReference: relevantReferences.length > 0,
      });

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
          // Check duplicate
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
        saveStoredGlossaries(newGlossaryItems);
        setGlossaries(newGlossaryItems);
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
    const updatedNovels = novels.map((n) =>
      n.id === activeNovel.id
        ? { ...n, bahasa_sumber: source, bahasa_target: target, updatedAt: new Date().toISOString() }
        : n
    );
    setNovels(updatedNovels);
    saveStoredNovels(updatedNovels);
    showToast(`Bahasa diperbarui: ${source} ➔ ${target}`);
  };

  const completedChaptersCount = chapters.filter((c) => c.status_pengerjaan === 'Selesai').length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#111318] font-sans antialiased text-gray-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-[#1F2229] border border-indigo-500/30 text-indigo-300 px-4 py-2.5 rounded shadow-2xl text-xs font-medium flex items-center gap-2 animate-in fade-in slide-in-from-bottom duration-200">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
          <span>{toastMessage}</span>
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
          const success = await reloadLibraryFromDisk();
          if (success) {
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
              onSelectNovel={handleSelectNovel}
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
