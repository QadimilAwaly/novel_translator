import React, { useState, useEffect } from 'react';
import { X, FilePlus, Sparkles } from 'lucide-react';
interface NewChapterModalProps {
  isOpen: boolean;
  onClose: () => void;
  nextChapterNumber: number;
  onCreateChapter: (data: {
    nomor_chapter: number;
    judul_chapter: string;
    teks_asli: string;
  }) => void;
}

export const NewChapterModal: React.FC<NewChapterModalProps> = ({
  isOpen,
  onClose,
  nextChapterNumber,
  onCreateChapter,
}) => {
  const [nomorChapter, setNomorChapter] = useState(nextChapterNumber);
  const [judulChapter, setJudulChapter] = useState('');
  const [teksAsli, setTeksAsli] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNomorChapter(nextChapterNumber);
      setJudulChapter('');
      setTeksAsli('');
    }
  }, [isOpen, nextChapterNumber]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalTitle = judulChapter.trim() || `Bab ${nomorChapter}`;

    onCreateChapter({
      nomor_chapter: Number(nomorChapter) || nextChapterNumber,
      judul_chapter: finalTitle,
      teks_asli: teksAsli,
    });

    setJudulChapter('');
    setTeksAsli('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#16181D] border border-gray-800 rounded-lg w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2 text-gray-200 font-bold text-sm">
            <FilePlus className="w-4 h-4 text-indigo-400" />
            <span>Tambah Chapter Baru</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-gray-300 font-medium">Nomor Bab</label>
              <input
                type="number"
                min={1}
                value={nomorChapter}
                onChange={(e) => setNomorChapter(Number(e.target.value))}
                className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-100 focus:outline-none focus:border-indigo-500 font-mono"
                required
              />
            </div>

            <div className="col-span-2 space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-gray-300 font-medium">Judul Bab</label>
                <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Kosongkan = AI beri judul otomatis
                </span>
              </div>
              <input
                type="text"
                placeholder={`Default: Bab ${nomorChapter}`}
                value={judulChapter}
                onChange={(e) => setJudulChapter(e.target.value)}
                className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-gray-300 font-medium">
              Teks Novel Asli (Opsional)
            </label>
            <textarea
              placeholder="Tempel atau ketik teks bab novel di sini..."
              value={teksAsli}
              onChange={(e) => setTeksAsli(e.target.value)}
              rows={6}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 font-sans resize-none"
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
              Tambah Bab
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
