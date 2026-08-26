import React from 'react';
import { FolderDown, Plus, Sparkles, Languages, CheckCircle2, Sliders, Cpu, ArrowRightLeft, FolderOpen, RefreshCw, PanelLeftClose, PanelLeft, PanelRightClose, PanelRight } from 'lucide-react';
import { Novel, AIConfig, LanguageCode, SUPPORTED_LANGUAGES } from '../types';

interface HeaderProps {
  activeNovel: Novel | null;
  totalChapters: number;
  completedChapters: number;
  totalGlossaryCount: number;
  aiConfig: AIConfig;
  onOpenNewNovelModal: () => void;
  onOpenExportModal: () => void;
  onOpenModelSettingsModal: () => void;
  onUpdateNovelLanguages?: (source: LanguageCode, target: LanguageCode) => void;
  onSelectFolderForActiveNovel?: () => void;
  onReExportNovelToLocal?: () => void;
  onReloadFromDisk?: () => void;
  isLeftSidebarOpen?: boolean;
  isRightPanelOpen?: boolean;
  onToggleLeftSidebar?: () => void;
  onToggleRightPanel?: () => void;
}
export const Header: React.FC<HeaderProps> = ({
  activeNovel,
  totalChapters,
  completedChapters,
  totalGlossaryCount,
  aiConfig,
  onOpenNewNovelModal,
  onOpenExportModal,
  onOpenModelSettingsModal,
  onUpdateNovelLanguages,
  onSelectFolderForActiveNovel,
  onReExportNovelToLocal,
  onReloadFromDisk,
  isLeftSidebarOpen = true,
  isRightPanelOpen = true,
  onToggleLeftSidebar,
  onToggleRightPanel,
}) => {
  const isOpenRouter = aiConfig.provider === 'openrouter';
  const displayModel = aiConfig.model || (isOpenRouter ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');

  const handleSwapLanguages = () => {
    if (!activeNovel || !onUpdateNovelLanguages) return;
    onUpdateNovelLanguages(activeNovel.bahasa_target, activeNovel.bahasa_sumber);
  };

  return (
    <header className="bg-[#16181D] border-b border-gray-800 text-gray-200 px-4 py-3 shadow-md flex flex-wrap items-center justify-between gap-4 select-none relative z-40">
      {/* Left Toggle & Brand & Active Novel Title */}
      <div className="flex items-center gap-3">
        {onToggleLeftSidebar && (
          <button
            onClick={onToggleLeftSidebar}
            className="p-1.5 bg-[#0F1113] hover:bg-gray-800 border border-gray-800 rounded text-gray-400 hover:text-indigo-400 transition-colors"
            title={isLeftSidebarOpen ? 'Sembunyikan Panel Kiri (Library)' : 'Tampilkan Panel Kiri (Library)'}
          >
            {isLeftSidebarOpen ? <PanelLeftClose className="w-4 h-4 text-indigo-400" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        )}

        <img src="/icon.png" alt="Novel Translator Pro" className="w-6 h-6" />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-widest text-indigo-400 uppercase font-sans">
              Novel Translator Pro
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Offline-First
            </span>
          </div>
          <div className="text-xs text-gray-400 flex flex-wrap items-center gap-2 mt-0.5">
            {activeNovel ? (
              <>
                <span className="font-semibold text-gray-200 truncate max-w-[180px] sm:max-w-[260px]">
                  {activeNovel.judul}
                </span>
                <span className="text-gray-600">•</span>
                
                {/* Editable Language Bar */}
                <div className="inline-flex items-center gap-1 bg-[#0F1113] border border-gray-800 rounded px-1.5 py-0.5 text-[11px]">
                  <Languages className="w-3 h-3 text-indigo-400 shrink-0" />
                  <select
                    value={activeNovel.bahasa_sumber}
                    onChange={(e) =>
                      onUpdateNovelLanguages &&
                      onUpdateNovelLanguages(e.target.value as LanguageCode, activeNovel.bahasa_target)
                    }
                    className="bg-transparent text-indigo-300 font-medium focus:outline-none hover:text-white cursor-pointer py-0 text-[11px]"
                    title="Pilih Bahasa Asli (Sumber)"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang} className="bg-[#16181D] text-gray-200">
                        {lang}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleSwapLanguages}
                    className="p-0.5 text-gray-500 hover:text-indigo-400 rounded hover:bg-gray-800 transition-colors"
                    title="Tukar Bahasa Asli & Bahasa Target (Swap)"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                  </button>

                  <select
                    value={activeNovel.bahasa_target}
                    onChange={(e) =>
                      onUpdateNovelLanguages &&
                      onUpdateNovelLanguages(activeNovel.bahasa_sumber, e.target.value as LanguageCode)
                    }
                    className="bg-transparent text-emerald-400 font-medium focus:outline-none hover:text-white cursor-pointer py-0 text-[11px]"
                    title="Pilih Bahasa Hasil (Target)"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={lang} value={lang} className="bg-[#16181D] text-gray-200">
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              'Pilih atau buat novel untuk memulai translasi'
            )}
          </div>
        </div>
      </div>

      {/* Novel Stats & Quick Actions */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {activeNovel && (
          <div className="hidden lg:flex items-center gap-3 bg-[#0F1113] px-3 py-1.5 rounded-md border border-gray-800 text-xs">
            <div className="flex items-center gap-1.5 text-gray-300">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                Progress:{' '}
                <strong className="text-emerald-400 font-mono">
                  {completedChapters}/{totalChapters}
                </strong>{' '}
                Bab
              </span>
            </div>
            <span className="text-gray-700">|</span>
            <div className="flex items-center gap-1.5 text-gray-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>
                Glosarium:{' '}
                <strong className="text-indigo-300 font-mono">
                  {totalGlossaryCount}
                </strong>{' '}
                Istilah
              </span>
            </div>
          </div>
        )}

        {/* AI Provider & Model Badge Trigger */}
        <button
          onClick={onOpenModelSettingsModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1113] hover:bg-gray-800 text-gray-200 border border-indigo-500/30 hover:border-indigo-500/60 rounded-md text-xs transition-all shadow-sm group"
          title="Klik untuk mengubah Provider & Model AI (Gemini / OpenRouter)"
        >
          {isOpenRouter ? (
            <Cpu className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
          )}
          <span className="font-mono text-[11px] font-medium text-gray-300">
            <strong className={isOpenRouter ? 'text-amber-400' : 'text-indigo-400'}>
              {isOpenRouter ? 'OpenRouter' : 'Gemini'}:
            </strong>{' '}
            <span className="text-gray-200">{displayModel}</span>
          </span>
          <Sliders className="w-3 h-3 text-gray-500 group-hover:text-gray-300 ml-0.5" />
        </button>

        {/* Reload / Sync from Disk Button */}
        {onReloadFromDisk && (
          <button
            onClick={onReloadFromDisk}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2229] hover:bg-gray-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 hover:border-emerald-500/40 rounded-md text-xs font-medium transition-all shadow-sm active:scale-[0.98]"
            title="Muat ulang seluruh novel, bab, dan glosarium langsung dari file di disk komputer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Reload dari Disk</span>
          </button>
        )}

        {/* Re-export / Re-extract Entire Novel to Local Storage Button */}
        {activeNovel && (
          <button
            onClick={onReExportNovelToLocal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1F2229] hover:bg-gray-800 text-gray-200 hover:text-white border border-gray-700/80 rounded-md text-xs font-medium transition-all shadow-sm active:scale-[0.98]"
            title="Ekstrak ulang seluruh novel & metadata ke folder fisik lokal komputer"
          >
            <FolderDown className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Re-Ekstrak ke Lokal</span>
          </button>
        )}
        {/* Right Panel Toggle Button */}
        {onToggleRightPanel && (
          <button
            onClick={onToggleRightPanel}
            className="p-1.5 bg-[#0F1113] hover:bg-gray-800 border border-gray-800 rounded text-gray-400 hover:text-indigo-400 transition-colors"
            title={isRightPanelOpen ? 'Sembunyikan Panel Kanan (Context)' : 'Tampilkan Panel Kanan (Context)'}
          >
            {isRightPanelOpen ? <PanelRightClose className="w-4 h-4 text-indigo-400" /> : <PanelRight className="w-4 h-4" />}
          </button>
        )}

        {/* New Novel Button */}
        <button
          onClick={onOpenNewNovelModal}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-md text-xs transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Novel Baru</span>
        </button>
      </div>
    </header>
  );
};

