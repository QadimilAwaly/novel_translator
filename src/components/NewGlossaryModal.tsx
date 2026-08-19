import React, { useState } from 'react';
import { X, Tag, User } from 'lucide-react';
import { GlossaryCategory, GenderTag } from '../types';

interface NewGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChapterNum?: number;
  onAddGlossary: (data: {
    istilah_asli: string;
    istilah_terjemahan: string;
    kategori: GlossaryCategory;
    gender?: GenderTag;
    chapter_ditemukan?: string;
    konteks?: string;
  }) => void;
}

export const NewGlossaryModal: React.FC<NewGlossaryModalProps> = ({
  isOpen,
  onClose,
  activeChapterNum,
  onAddGlossary,
}) => {
  const [istilahAsli, setIstilahAsli] = useState('');
  const [istilahTerjemahan, setIstilahTerjemahan] = useState('');
  const [kategori, setKategori] = useState<GlossaryCategory>('Nama');
  const [gender, setGender] = useState<GenderTag>('Male');
  const [konteks, setKonteks] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!istilahAsli.trim() || !istilahTerjemahan.trim()) return;

    onAddGlossary({
      istilah_asli: istilahAsli.trim(),
      istilah_terjemahan: istilahTerjemahan.trim(),
      kategori,
      gender: kategori === 'Nama' ? gender : undefined,
      chapter_ditemukan: activeChapterNum ? `Chapter ${activeChapterNum}` : 'Manual',
      konteks: konteks.trim(),
    });

    setIstilahAsli('');
    setIstilahTerjemahan('');
    setKonteks('');
    setGender('Male');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#16181D] border border-gray-800 rounded-lg w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2 text-gray-200 font-bold text-sm">
            <Tag className="w-4 h-4 text-indigo-400" />
            <span>Tambah Istilah Glosarium</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          <div className="space-y-1">
            <label className="text-gray-300 font-medium">Istilah Asli</label>
            <input
              type="text"
              placeholder="Contoh: Heavenly Tribulation / 天劫"
              value={istilahAsli}
              onChange={(e) => setIstilahAsli(e.target.value)}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-mono"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-gray-300 font-medium">
              Terjemahan Baku
            </label>
            <input
              type="text"
              placeholder="Contoh: Bencana Surgawi"
              value={istilahTerjemahan}
              onChange={(e) => setIstilahTerjemahan(e.target.value)}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-serif"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-gray-300 font-medium">Kategori Istilah</label>
            <select
              value={kategori}
              onChange={(e) => setKategori(e.target.value as GlossaryCategory)}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="Nama">Nama Karakter / Gelar</option>
              <option value="Tempat">Tempat / Lokasi / Sekte</option>
              <option value="Jurus/Sekte">Jurus / Teknik / Sihir</option>
              <option value="Item">Item / Senjata / Artefak</option>
              <option value="Istilah Khusus">Istilah Khusus / Lore</option>
            </select>
          </div>

          {kategori === 'Nama' && (
            <div className="space-y-1.5 p-2.5 bg-[#0F1113] border border-gray-800 rounded">
              <label className="text-gray-300 font-medium flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Gender / Pronoun Karakter</span>
                </span>
                <span className="text-[10px] text-indigo-400 font-normal">Panduan Pronoun (He/She)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGender('Male')}
                  className={`py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-all border ${
                    gender === 'Male'
                      ? 'bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm'
                      : 'bg-[#16181D] text-gray-400 border-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span>♂ Pria (He)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGender('Female')}
                  className={`py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-all border ${
                    gender === 'Female'
                      ? 'bg-pink-600/20 text-pink-300 border-pink-500/50 shadow-sm'
                      : 'bg-[#16181D] text-gray-400 border-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span>♀ Wanita (She)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGender('Neutral')}
                  className={`py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-all border ${
                    gender === 'Neutral'
                      ? 'bg-gray-600/20 text-gray-300 border-gray-500/50 shadow-sm'
                      : 'bg-[#16181D] text-gray-400 border-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span>⚪ Netral (They)</span>
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-gray-300 font-medium">
              Konteks / Catatan Penggunaan (Opsional)
            </label>
            <textarea
              placeholder="Penjelasan singkat mengenai istilah ini..."
              value={konteks}
              onChange={(e) => setKonteks(e.target.value)}
              rows={2}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[#1F2229] hover:bg-gray-800 text-gray-300 rounded font-medium transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded transition-colors"
            >
              Simpan Istilah
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
