import React, { useState } from 'react';
import {
  Library,
  ChevronRight,
  ChevronDown,
  Plus,
  FileText,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  FolderTree,
  Upload,
  Trash2,
  BookOpenCheck,
  Edit2,
  Check,
  X
} from 'lucide-react';
import { Novel, Chapter, ChapterStatus } from '../types';

interface NovelSidebarProps {
  novels: Novel[];
  activeNovelId: string | null;
  onSelectNovel: (id: string) => void;
  chapters: Chapter[];
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onAddChapter: () => void;
  onImportChapterFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDeleteChapter: (id: string, e: React.MouseEvent) => void;
  onDeleteNovel: (id: string, e: React.MouseEvent) => void;
  onRenameNovel: (id: string, newTitle: string) => void;
  onRenameChapter: (id: string, newTitle: string) => void;
}

export const NovelSidebar: React.FC<NovelSidebarProps> = ({
  novels,
  activeNovelId,
  onSelectNovel,
  chapters,
  activeChapterId,
  onSelectChapter,
  onAddChapter,
  onImportChapterFile,
  onDeleteChapter,
  onDeleteNovel,
  onRenameNovel,
  onRenameChapter,
}) => {
  const [expandedNovelId, setExpandedNovelId] = useState<string | null>(activeNovelId);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingNovelId, setEditingNovelId] = useState<string | null>(null);
  const [novelTitleInput, setNovelTitleInput] = useState('');

  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapterTitleInput, setChapterTitleInput] = useState('');
  const activeNovel = novels.find((n) => n.id === activeNovelId);

  const toggleNovelExpand = (id: string) => {
    onSelectNovel(id);
    setExpandedNovelId((prev) => (prev === id ? id : id));
  };

  const getStatusBadge = (status: ChapterStatus) => {
    switch (status) {
      case 'Selesai':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">
            <CheckCircle className="w-3 h-3 text-emerald-400" /> Selesai
          </span>
        );
      case 'Sedang':
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-1.5 py-0.5 rounded">
            <Clock className="w-3 h-3 text-yellow-500" /> Sedang
          </span>
        );
      case 'Belum':
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-400 border border-gray-700 px-1.5 py-0.5 rounded">
            <AlertCircle className="w-3 h-3 text-gray-400" /> Belum
          </span>
        );
    }
  };

  const filteredChapters = chapters.filter((c) =>
    c.judul_chapter.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(c.nomor_chapter).includes(searchTerm)
  );

  return (
    <aside className="w-full lg:w-64 bg-[#16181D] border-r border-gray-800 flex flex-col h-full text-gray-200 select-none shrink-0">
      {/* Panel Title */}
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest text-indigo-400">
          <div className="w-2.5 h-2.5 bg-indigo-500 rounded-sm"></div>
          <span>Novel Library</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">
          {novels.length} Judul
        </span>
      </div>

      {/* Novel List Accordion */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {novels.map((novel) => {
          const isSelected = novel.id === activeNovelId;
          const isExpanded = expandedNovelId === novel.id || isSelected;

          return (
            <div
              key={novel.id}
              className={`rounded border transition-all ${
                isSelected
                  ? 'bg-indigo-600/10 border-indigo-500/30'
                  : 'bg-[#111318] border-gray-800/80 hover:bg-white/5'
              }`}
            >
              {/* Novel Header Bar */}
              <div
                onClick={() => toggleNovelExpand(novel.id)}
                className="p-2.5 flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center gap-2 overflow-hidden pr-2">
                  <div className="text-gray-400 group-hover:text-indigo-400 transition-colors">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-indigo-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1">
                    {editingNovelId === novel.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={novelTitleInput}
                          onChange={(e) => setNovelTitleInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              onRenameNovel(novel.id, novelTitleInput);
                              setEditingNovelId(null);
                            } else if (e.key === 'Escape') {
                              setEditingNovelId(null);
                            }
                          }}
                          className="bg-[#0F1113] border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-full"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            onRenameNovel(novel.id, novelTitleInput);
                            setEditingNovelId(null);
                          }}
                          className="p-1 text-emerald-400 hover:bg-gray-800 rounded"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingNovelId(null)}
                          className="p-1 text-gray-400 hover:bg-gray-800 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className={`text-xs font-semibold truncate ${isSelected ? 'text-indigo-400' : 'text-gray-200 group-hover:text-white'}`}>
                          {novel.judul}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-0.5 font-mono">
                          <FolderTree className="w-3 h-3 text-gray-600 inline" />
                          <span className="truncate max-w-[140px]">{novel.folder_path}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNovelId(novel.id);
                      setNovelTitleInput(novel.judul);
                    }}
                    title="Ubah Nama Novel"
                    className="p-1 text-gray-500 hover:text-indigo-400 rounded hover:bg-gray-800 transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => onDeleteNovel(novel.id, e)}
                    title="Hapus Novel"
                    className="p-1 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Expanded Chapter Sub-list */}
              {isExpanded && isSelected && (
                <div className="px-2 pb-2.5 pt-1 border-t border-gray-800/80 space-y-2">
                  {/* Search Chapter */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
                    <input
                      type="text"
                      placeholder="Cari chapter..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-[#0F1113] border border-gray-800 rounded pl-8 pr-2 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>

                  {/* Chapter List */}
                  <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                    {filteredChapters.length > 0 ? (
                      filteredChapters.map((chap) => {
                        const isChapSelected = chap.id === activeChapterId;
                        return (
                          <div
                            key={chap.id}
                            onClick={() => onSelectChapter(chap.id)}
                            className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs transition-all border ${
                              isChapSelected
                                ? 'bg-indigo-600/10 border-l-2 border-indigo-500 border-t-transparent border-r-transparent border-b-transparent text-indigo-400 font-semibold'
                                : 'bg-[#0F1113] border-gray-800/50 hover:bg-white/5 text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden pr-2 flex-1">
                              <FileText className={`w-3.5 h-3.5 shrink-0 ${isChapSelected ? 'text-indigo-400' : 'text-gray-500'}`} />
                              {editingChapterId === chap.id ? (
                                <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="text"
                                    value={chapterTitleInput}
                                    onChange={(e) => setChapterTitleInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        onRenameChapter(chap.id, chapterTitleInput);
                                        setEditingChapterId(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingChapterId(null);
                                      }
                                    }}
                                    className="bg-[#0F1113] border border-indigo-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none w-full"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => {
                                      onRenameChapter(chap.id, chapterTitleInput);
                                      setEditingChapterId(null);
                                    }}
                                    className="p-0.5 text-emerald-400 hover:bg-gray-800 rounded"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingChapterId(null)}
                                    className="p-0.5 text-gray-400 hover:bg-gray-800 rounded"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <span className="truncate">
                                  Bab {chap.nomor_chapter}: {chap.judul_chapter}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {getStatusBadge(chap.status_pengerjaan)}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingChapterId(chap.id);
                                  setChapterTitleInput(chap.judul_chapter);
                                }}
                                title="Ubah Judul Chapter"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-indigo-400 rounded transition-opacity"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => onDeleteChapter(chap.id, e)}
                                title="Hapus Chapter"
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-500 hover:text-red-400 rounded transition-opacity"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-4 text-xs text-gray-500">
                        Belum ada chapter ditemukan.
                      </div>
                    )}
                  </div>

                  {/* Add & Import Actions */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      onClick={onAddChapter}
                      className="flex items-center justify-center gap-1 py-1.5 px-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded text-xs font-semibold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Bab</span>
                    </button>

                    <label className="flex items-center justify-center gap-1 py-1.5 px-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded text-xs font-medium cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5 text-gray-400" />
                      <span>Impor File</span>
                      <input
                        type="file"
                        accept=".txt,.md"
                        className="hidden"
                        onChange={onImportChapterFile}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-gray-800 bg-[#0F1113] text-[10px] text-gray-500 flex items-center justify-between">
        <span className="flex items-center gap-1 text-gray-400">
          <BookOpenCheck className="w-3.5 h-3.5 text-indigo-400" />
          {activeNovel ? activeNovel.judul.slice(0, 18) + '...' : 'Pilih Novel'}
        </span>
        <span className="font-mono text-gray-500">
          {chapters.length} Bab
        </span>
      </div>
    </aside>
  );
};
