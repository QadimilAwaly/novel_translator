import React, { useState } from 'react';
import {
  Copy,
  Check,
  Download,
  Sparkles,
  Wand2,
  RefreshCw,
  Eye,
  Edit3,
  AArrowUp,
  AArrowDown,
  BookMarked,
  Info,
  Languages,
  ArrowRightLeft,
  Plus
} from 'lucide-react';
import { Chapter, Novel, ChapterStatus, LanguageCode, SUPPORTED_LANGUAGES } from '../types';

interface SplitEditorProps {
  activeNovel: Novel | null;
  activeChapter: Chapter | null;
  onUpdateChapterText: (original: string, translated: string) => void;
  onUpdateChapterStatus: (status: ChapterStatus) => void;
  onTranslateChapter: () => void;
  onExtractGlossary: () => void;
  onUpdateNovelLanguages?: (source: LanguageCode, target: LanguageCode) => void;
  onAddNovel?: () => void;
  onAddChapter?: () => void;
  isTranslating: boolean;
  isExtracting: boolean;
  promptStats?: {
    glossaryCount: number;
    hasReference: boolean;
  };
}
export const SplitEditor: React.FC<SplitEditorProps> = ({
  activeNovel,
  activeChapter,
  onUpdateChapterText,
  onUpdateChapterStatus,
  onTranslateChapter,
  onExtractGlossary,
  onUpdateNovelLanguages,
  onAddNovel,
  onAddChapter,
  isTranslating,
  isExtracting,
  promptStats,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  if (!activeNovel) {
    return (
      <div className="flex-1 bg-[#111318] flex flex-col items-center justify-center p-8 text-center text-gray-400 select-none">
        <div className="w-16 h-16 rounded-lg bg-[#16181D] border border-gray-800 flex items-center justify-center mb-4 text-indigo-400 shadow-xl">
          <BookMarked className="w-8 h-8" />
        </div>
        <h2 className="text-base font-bold text-gray-200">Tidak Ada Novel Dipilih</h2>
        <p className="text-xs text-gray-500 max-w-md mt-1 mb-4">
          Pilih salah satu novel di panel perpustakaan atau buat novel baru untuk memulai.
        </p>
        {onAddNovel && (
          <button
            onClick={onAddNovel}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Novel Baru</span>
          </button>
        )}
      </div>
    );
  }

  if (!activeChapter) {
    return (
      <div className="flex-1 bg-[#111318] flex flex-col items-center justify-center p-8 text-center text-gray-400 select-none">
        <div className="w-16 h-16 rounded-lg bg-[#16181D] border border-gray-800 flex items-center justify-center mb-4 text-indigo-400 shadow-xl">
          <BookMarked className="w-8 h-8" />
        </div>
        <h2 className="text-base font-bold text-gray-200">{activeNovel.judul}</h2>
        <p className="text-xs text-gray-500 max-w-md mt-1 mb-4">
          Belum ada bab yang dipilih. Pilih bab di panel kiri atau buat bab baru.
        </p>
        {onAddChapter && (
          <button
            onClick={onAddChapter}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Bab Baru</span>
          </button>
        )}
      </div>
    );
  }

  const handleCopyTranslation = () => {
    if (!activeChapter.teks_terjemahan) return;
    navigator.clipboard.writeText(activeChapter.teks_terjemahan);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadMarkdown = () => {
    const filename = `Chapter_${String(activeChapter.nomor_chapter).padStart(2, '0')}.md`;
    const divider = '---';
    const mdContent = `# Chapter ${activeChapter.nomor_chapter}: ${activeChapter.judul_chapter}\n\n## Hasil Terjemahan (${activeNovel.bahasa_target})\n${activeChapter.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${activeNovel.bahasa_sumber})\n${activeChapter.teks_asli || '*(Belum ada teks asli)*'}\n`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const originalWordCount = activeChapter.teks_asli ? activeChapter.teks_asli.trim().split(/\s+/).length : 0;
  const translatedWordCount = activeChapter.teks_terjemahan ? activeChapter.teks_terjemahan.trim().split(/\s+/).length : 0;

  const fontClasses = {
    sm: 'text-xs leading-relaxed',
    base: 'text-sm leading-relaxed',
    lg: 'text-base leading-relaxed',
  }[fontSize];

  return (
    <div className="flex-1 bg-[#111318] flex flex-col h-full overflow-hidden text-gray-200 min-w-0 min-h-0">
      {/* Top Action Bar */}
      <div className="p-3 bg-[#16181D] border-b border-gray-800 flex flex-wrap items-center justify-between gap-3 shadow-sm select-none">
        {/* Left: Chapter Title & Status Dropdown */}
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 font-mono font-bold text-xs px-2.5 py-1 rounded">
            Bab {activeChapter.nomor_chapter}
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-200 font-sans">
              {activeChapter.judul_chapter}
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
              <span>Status:</span>
              <select
                value={activeChapter.status_pengerjaan}
                onChange={(e) => onUpdateChapterStatus(e.target.value as ChapterStatus)}
                className="bg-[#0F1113] border border-gray-800 rounded px-2 py-0.5 text-[11px] text-indigo-400 font-medium focus:outline-none focus:border-indigo-500"
              >
                <option value="Belum">Belum Diterjemahkan</option>
                <option value="Sedang">Sedang Diterjemahkan</option>
                <option value="Selesai">Selesai</option>
              </select>
            </div>
          </div>
        </div>

        {/* Center/Right: Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Font Controls */}
          <div className="hidden sm:flex items-center bg-[#0F1113] border border-gray-800 rounded p-0.5 text-gray-400">
            <button
              onClick={() => setFontSize('sm')}
              className={`p-1.5 rounded text-xs ${fontSize === 'sm' ? 'bg-indigo-600/10 text-indigo-400' : 'hover:text-gray-200'}`}
              title="Ukuran Teks Kecil"
            >
              <AArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFontSize('base')}
              className={`p-1.5 rounded text-xs ${fontSize === 'base' ? 'bg-indigo-600/10 text-indigo-400' : 'hover:text-gray-200'}`}
              title="Ukuran Teks Sedang"
            >
              <AArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#0F1113] border border-gray-800 rounded p-0.5 text-gray-400">
            <button
              onClick={() => setViewMode('editor')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                viewMode === 'editor' ? 'bg-indigo-600/10 text-indigo-400' : 'hover:text-gray-200'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editor</span>
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                viewMode === 'preview' ? 'bg-indigo-600/10 text-indigo-400' : 'hover:text-gray-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>

          {/* Phase 3: Extract Glossary */}
          <button
            onClick={onExtractGlossary}
            disabled={isExtracting || !activeChapter.teks_terjemahan}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2229] hover:bg-gray-800 disabled:opacity-50 text-gray-200 border border-gray-700 rounded text-xs font-medium transition-all shadow-sm"
            title="Ekstrak istilah baru otomatis dari chapter ini ke Glosarium"
          >
            {isExtracting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="hidden md:inline">Ekstrak Glosarium</span>
          </button>

          {/* Phase 1 & 2: Translate Chapter */}
          <button
            onClick={onTranslateChapter}
            disabled={isTranslating || !activeChapter.teks_asli.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded text-xs shadow-lg shadow-indigo-600/20 transition-all active:scale-[0.98]"
          >
            {isTranslating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
            ) : (
              <Wand2 className="w-3.5 h-3.5 text-white fill-white" />
            )}
            <span>{isTranslating ? 'Menerjemahkan...' : 'Translate Chapter'}</span>
          </button>
        </div>
      </div>

      {/* Context Assembly Injection Stats Banner */}
      <div className="px-4 py-1.5 bg-[#0F1113] border-b border-gray-800 text-[11px] text-gray-500 flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>
            Memory Injected:{' '}
            <strong className="text-indigo-300">
              {promptStats?.glossaryCount ?? 0}
            </strong>{' '}
            Glosarium &{' '}
            <strong className="text-indigo-300">
              {promptStats?.hasReference ? 'Aktif' : 'Standar'}
            </strong>{' '}
            Referensi Lore
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Kata Asli: <strong className="text-gray-300">{originalWordCount}</strong></span>
          <span>Kata Hasil: <strong className="text-indigo-300">{translatedWordCount}</strong></span>
        </div>
      </div>

      {/* Split Editor Body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-800 overflow-hidden min-h-0">
        {/* Left Column: Teks Asli */}
        <div className="flex flex-col h-full bg-[#111318] p-4 min-h-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between text-xs text-gray-400 select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
              <span className="font-bold text-[10px] text-gray-400 uppercase">Bahasa Asli:</span>
              <select
                value={activeNovel.bahasa_sumber}
                onChange={(e) =>
                  onUpdateNovelLanguages &&
                  onUpdateNovelLanguages(e.target.value as LanguageCode, activeNovel.bahasa_target)
                }
                className="bg-[#0F1113] border border-gray-800 text-indigo-300 font-semibold rounded px-2 py-0.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                title="Pilih Bahasa Sumber"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang} className="bg-[#16181D] text-gray-200">
                    {lang}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[10px] font-mono text-gray-500">
              {activeChapter.teks_asli.length} Karakter
            </span>
          </div>

          <textarea
            value={activeChapter.teks_asli}
            onChange={(e) => onUpdateChapterText(e.target.value, activeChapter.teks_terjemahan)}
            placeholder={`Tempel atau ketik teks novel asli dalam ${activeNovel.bahasa_sumber} di sini...`}
            className={`flex-1 p-3 bg-transparent text-gray-300 resize-none focus:outline-none font-serif ${fontClasses} placeholder-gray-600 border-none`}
          />
        </div>

        {/* Right Column: Teks Terjemahan LLM */}
        <div className="flex flex-col h-full bg-[#111318] p-4 border-l border-gray-800 relative min-h-0 overflow-hidden">
          <div className="mb-3 flex items-center justify-between text-xs text-gray-400 select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
              <span className="font-bold text-[10px] text-indigo-400 uppercase">Bahasa Target:</span>
              <select
                value={activeNovel.bahasa_target}
                onChange={(e) =>
                  onUpdateNovelLanguages &&
                  onUpdateNovelLanguages(activeNovel.bahasa_sumber, e.target.value as LanguageCode)
                }
                className="bg-[#0F1113] border border-gray-800 text-emerald-400 font-semibold rounded px-2 py-0.5 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                title="Pilih Bahasa Hasil Terjemahan"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang} className="bg-[#16181D] text-gray-200">
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyTranslation}
                disabled={!activeChapter.teks_terjemahan}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-indigo-300 transition-colors"
                title="Salin Terjemahan"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={handleDownloadMarkdown}
                disabled={!activeChapter.teks_terjemahan}
                className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-indigo-300 transition-colors"
                title="Unduh file Chapter.md"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Editor Mode vs Preview Mode */}
          {viewMode === 'editor' ? (
            <textarea
              value={activeChapter.teks_terjemahan}
              onChange={(e) => onUpdateChapterText(activeChapter.teks_asli, e.target.value)}
              placeholder="Hasil terjemahan AI akan muncul di sini. Anda juga bisa mengeditnya secara manual..."
              className={`flex-1 p-3 bg-transparent text-gray-200 resize-none focus:outline-none font-serif ${fontClasses} placeholder-gray-600 border-none`}
            />
          ) : (
            <div className={`flex-1 p-3 overflow-y-auto text-gray-200 whitespace-pre-wrap font-serif ${fontClasses}`}>
              {activeChapter.teks_terjemahan || (
                <span className="text-gray-600 italic">Belum ada terjemahan. Klik "Translate Chapter" untuk menghasilkan teks.</span>
              )}
            </div>
          )}

          {/* Translation Loader Overlay */}
          {isTranslating && (
            <div className="absolute inset-0 bg-[#0F1113]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center select-none z-10">
              <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3"></div>
              <p className="text-sm font-semibold text-indigo-300 font-sans">Menerjemahkan dengan Gemini AI...</p>
              <p className="text-xs text-gray-400 max-w-xs mt-1">
                Merakit konteks dari reference.json dan glossary.json agar istilah novel konsisten.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
