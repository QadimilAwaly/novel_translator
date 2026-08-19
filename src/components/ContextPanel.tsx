import React, { useState } from 'react';
import {
  BookMarked,
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Search,
  Save,
  Check,
  FileText,
  Tag,
  Sparkles,
  Info,
  X
} from 'lucide-react';
import {
  Novel,
  ReferenceItem,
  GlossaryItem,
  ReferenceCategory,
  GlossaryCategory
} from '../types';

interface ContextPanelProps {
  activeNovel: Novel | null;
  references: ReferenceItem[];
  glossaries: GlossaryItem[];
  synopsis: string;
  writingStyle: string;
  onChangeSynopsis: (val: string) => void;
  onChangeWritingStyle: (val: string) => void;
  onAddReferenceItem: (item: Omit<ReferenceItem, 'id' | 'novel_id'>) => void;
  onDeleteReferenceItem: (id: string) => void;
  onAddGlossaryItem: (item: Omit<GlossaryItem, 'id' | 'novel_id'>) => void;
  onDeleteGlossaryItem: (id: string) => void;
  onOpenNewGlossaryModal: () => void;
  onClose?: () => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  activeNovel,
  references,
  glossaries,
  synopsis,
  writingStyle,
  onChangeSynopsis,
  onChangeWritingStyle,
  onAddReferenceItem,
  onDeleteReferenceItem,
  onAddGlossaryItem,
  onDeleteGlossaryItem,
  onOpenNewGlossaryModal,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'reference' | 'glossary'>('glossary');
  const [glossaryCategory, setGlossaryCategory] = useState<string>('Semua');
  const [searchGlossary, setSearchGlossary] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // New Reference Item form state
  const [showAddRefForm, setShowAddRefForm] = useState(false);
  const [newRefCategory, setNewRefCategory] = useState<ReferenceCategory>('Karakter');
  const [newRefName, setNewRefName] = useState('');
  const [newRefDesc, setNewRefDesc] = useState('');

  if (!activeNovel) {
    return (
      <aside className="fixed lg:static inset-y-0 right-0 z-40 w-80 sm:w-96 max-w-[85vw] lg:max-w-none lg:w-80 bg-[#16181D] border-l border-gray-800 flex flex-col h-full text-gray-200 select-none p-4 justify-center items-center text-center shadow-2xl lg:shadow-none animate-in slide-in-from-right duration-200">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-gray-200 transition-colors lg:hidden"
            title="Tutup Panel Context"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <BookOpen className="w-8 h-8 text-gray-600 mb-2" />
        <p className="text-xs text-gray-400">Pilih novel untuk mengelola memori konteks.</p>
      </aside>
    );
  }

  const handleSaveReferenceMeta = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleCreateReferenceItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRefName.trim()) return;
    onAddReferenceItem({
      kategori: newRefCategory,
      nama_item: newRefName.trim(),
      deskripsi: newRefDesc.trim(),
    });
    setNewRefName('');
    setNewRefDesc('');
    setShowAddRefForm(false);
  };

  const filteredGlossary = glossaries.filter((g) => {
    const matchCat = glossaryCategory === 'Semua' || g.kategori === glossaryCategory;
    const matchSearch =
      g.istilah_asli.toLowerCase().includes(searchGlossary.toLowerCase()) ||
      g.istilah_terjemahan.toLowerCase().includes(searchGlossary.toLowerCase()) ||
      (g.konteks && g.konteks.toLowerCase().includes(searchGlossary.toLowerCase()));
    return matchCat && matchSearch;
  });

  const categoriesList: GlossaryCategory[] = ['Nama', 'Tempat', 'Jurus/Sekte', 'Item', 'Istilah Khusus'];

  return (
    <aside className="fixed lg:static inset-y-0 right-0 z-40 w-80 sm:w-96 max-w-[85vw] lg:max-w-none lg:w-80 bg-[#16181D] border-l border-gray-800 flex flex-col h-full text-gray-200 select-none shrink-0 shadow-2xl lg:shadow-none animate-in slide-in-from-right duration-200">
      {/* Panel Tab Header */}
      <div className="flex border-b border-gray-800 bg-[#0F1113] items-center">
        <button
          onClick={() => setActiveTab('glossary')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'glossary'
              ? 'border-indigo-500 text-indigo-400 bg-white/5'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Glossary ({glossaries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('reference')}
          className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'reference'
              ? 'border-indigo-500 text-indigo-400 bg-white/5'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
          <span>Reference</span>
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors lg:hidden mr-1"
            title="Tutup Panel Context"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Body: GLOSSARY */}
      {activeTab === 'glossary' && (
        <div className="flex-1 flex flex-col h-full overflow-hidden p-4 space-y-4">
          {/* Action Bar & Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-indigo-400" />
                <span>Active Terms</span>
              </span>
              <button
                onClick={onOpenNewGlossaryModal}
                className="flex items-center gap-1 py-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded text-[11px] transition-colors shadow-sm"
              >
                <Plus className="w-3 h-3 stroke-[3]" />
                <span>Tambah Istilah</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500" />
              <input
                type="text"
                placeholder="Cari istilah asli/terjemahan..."
                value={searchGlossary}
                onChange={(e) => setSearchGlossary(e.target.value)}
                className="w-full bg-[#0F1113] border border-gray-800 rounded pl-8 pr-2 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] no-scrollbar">
              <button
                onClick={() => setGlossaryCategory('Semua')}
                className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                  glossaryCategory === 'Semua'
                    ? 'bg-indigo-600 text-white font-semibold'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                Semua
              </button>
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setGlossaryCategory(cat)}
                  className={`px-2 py-0.5 rounded whitespace-nowrap transition-colors ${
                    glossaryCategory === cat
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Glossary List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredGlossary.length > 0 ? (
              filteredGlossary.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 bg-[#1F2229] border border-gray-800 rounded hover:border-indigo-500/40 transition-all text-xs space-y-1 group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-indigo-300 font-semibold text-xs">
                      {item.istilah_asli}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {item.kategori === 'Nama' && item.gender && (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-semibold flex items-center gap-0.5 ${
                            item.gender === 'Male'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/25'
                              : item.gender === 'Female'
                              ? 'bg-pink-500/10 text-pink-400 border-pink-500/25'
                              : 'bg-gray-500/10 text-gray-400 border-gray-500/25'
                          }`}
                          title={`Pronoun Panduan: ${item.gender === 'Male' ? 'He/Him/His' : item.gender === 'Female' ? 'She/Her/Hers' : 'They/Them'}`}
                        >
                          {item.gender === 'Male' ? '♂ He/Him' : item.gender === 'Female' ? '♀ She/Her' : '⚪ They/It'}
                        </span>
                      )}
                      <span className="text-[9px] bg-[#0F1113] text-gray-400 px-1.5 py-0.5 rounded border border-gray-800 font-mono">
                        {item.kategori}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Hapus istilah "${item.istilah_asli}" (${item.istilah_terjemahan}) dari glosarium?`)) {
                            onDeleteGlossaryItem(item.id);
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title={`Hapus Istilah "${item.istilah_asli}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="text-gray-200 font-serif text-xs">
                    ➔ {item.istilah_terjemahan}
                  </div>

                  {item.konteks && (
                    <p className="text-[10px] text-gray-400 leading-tight">
                      {item.konteks}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-xs text-gray-500">
                Belum ada istilah dalam glosarium.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Body: REFERENCE */}
      {activeTab === 'reference' && (
        <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-4">
          {/* Form Synopsis & Style */}
          <div className="bg-[#1F2229] p-3 rounded border border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-indigo-400" />
                <span>Style & Tone Novel</span>
              </span>
              <button
                onClick={handleSaveReferenceMeta}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                {savedSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
                <span>{savedSuccess ? 'Tersimpan' : 'Simpan'}</span>
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 font-bold uppercase">
                Sinopsis Novel
              </label>
              <textarea
                value={synopsis}
                onChange={(e) => onChangeSynopsis(e.target.value)}
                placeholder="Tuliskan gambaran cerita/sinopsis..."
                rows={3}
                className="w-full p-2 bg-[#0F1113] border border-gray-800 rounded text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-500 font-bold uppercase">
                Gaya Bahasa & Tone
              </label>
              <textarea
                value={writingStyle}
                onChange={(e) => onChangeWritingStyle(e.target.value)}
                placeholder="Contoh: Formal, Penuh Aksi, Sentuhan Xianxia/Kultivasi..."
                rows={2}
                className="w-full p-2 bg-[#0F1113] border border-gray-800 rounded text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 resize-none"
              />
            </div>
          </div>

          {/* Reference Items List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1">
                <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
                <span>Karakter & Lore</span>
              </span>
              <button
                onClick={() => setShowAddRefForm(!showAddRefForm)}
                className="p-1 text-indigo-400 hover:bg-gray-800 rounded transition-colors"
                title="Tambah Detail Lore"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Add Ref Inline Form */}
            {showAddRefForm && (
              <form onSubmit={handleCreateReferenceItem} className="p-3 bg-[#0F1113] border border-indigo-500/40 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-indigo-300">Tambah Lore/Karakter</span>
                  <select
                    value={newRefCategory}
                    onChange={(e) => setNewRefCategory(e.target.value as ReferenceCategory)}
                    className="bg-[#16181D] border border-gray-800 text-[10px] text-gray-300 p-1 rounded"
                  >
                    <option value="Karakter">Karakter</option>
                    <option value="Tempat">Tempat</option>
                    <option value="Lore">Lore</option>
                    <option value="Item">Item</option>
                    <option value="Gaya Bahasa">Gaya Bahasa</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <input
                  type="text"
                  placeholder="Nama Karakter / Item / Lokasi..."
                  value={newRefName}
                  onChange={(e) => setNewRefName(e.target.value)}
                  className="w-full p-1.5 bg-[#16181D] border border-gray-800 rounded text-xs text-gray-200 focus:outline-none focus:border-indigo-500"
                  required
                />

                <textarea
                  placeholder="Deskripsi detail..."
                  value={newRefDesc}
                  onChange={(e) => setNewRefDesc(e.target.value)}
                  rows={2}
                  className="w-full p-1.5 bg-[#16181D] border border-gray-800 rounded text-xs text-gray-200 focus:outline-none focus:border-indigo-500 resize-none"
                />

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAddRefForm(false)}
                    className="px-2.5 py-1 bg-gray-800 text-gray-400 rounded text-[11px]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-indigo-600 text-white font-bold rounded text-[11px]"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {references.length > 0 ? (
                references.map((item) => (
                  <div key={item.id} className="p-2.5 bg-[#1F2229] border border-gray-800 rounded space-y-1 relative group text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-indigo-300 font-sans">{item.nama_item}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] bg-[#0F1113] text-gray-400 px-1.5 py-0.5 rounded border border-gray-800">
                          {item.kategori}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Hapus referensi "${item.nama_item}"?`)) {
                              onDeleteReferenceItem(item.id);
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title={`Hapus Referensi "${item.nama_item}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{item.deskripsi}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-xs text-gray-500">
                  Belum ada detail lore tambahan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
