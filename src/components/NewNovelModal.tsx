import React, { useState } from 'react';
import { X, BookPlus, Languages, FolderTree, FolderOpen } from 'lucide-react';
import { LanguageCode, SUPPORTED_LANGUAGES } from '../types';
import { requestFolderPicker } from '../services/fileSystemStorage';

interface NewNovelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateNovel: (data: {
    judul: string;
    folder_path: string;
    bahasa_sumber: LanguageCode;
    bahasa_target: LanguageCode;
    dirHandle?: FileSystemDirectoryHandle;
  }) => void;
}

export const NewNovelModal: React.FC<NewNovelModalProps> = ({
  isOpen,
  onClose,
  onCreateNovel,
}) => {
  const [judul, setJudul] = useState('');
  const [bahasaSumber, setBahasaSumber] = useState<LanguageCode>('Mandarin');
  const [bahasaTarget, setBahasaTarget] = useState<LanguageCode>('Indonesia');
  const [folderPath, setFolderPath] = useState('');
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | undefined>(undefined);
  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim()) return;

    const cleanFolder = folderPath || `/Novel_Library/${judul.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_')}`;

    onCreateNovel({
      judul: judul.trim(),
      folder_path: cleanFolder,
      bahasa_sumber: bahasaSumber,
      bahasa_target: bahasaTarget,
      dirHandle,
    });

    setJudul('');
    setFolderPath('');
    setDirHandle(undefined);
    onClose();
  };

  const handlePickFolder = async () => {
    const handle = await requestFolderPicker();
    if (handle) {
      setDirHandle(handle);
      setFolderPath(`[Penyimpanan Lokal] ${handle.name}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#16181D] border border-gray-800 rounded-lg w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2 text-gray-200 font-bold text-sm">
            <BookPlus className="w-4 h-4 text-indigo-400" />
            <span>Tambah Novel Baru</span>
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
            <label className="text-gray-300 font-medium">Judul Novel</label>
            <input
              type="text"
              placeholder="Contoh: Sang Penguasa Pedang Surgawi"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-gray-300 font-medium flex items-center gap-1">
                <Languages className="w-3.5 h-3.5 text-indigo-400" /> Bahasa Asli
              </label>
              <select
                value={bahasaSumber}
                onChange={(e) => setBahasaSumber(e.target.value as LanguageCode)}
                className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-200 focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-gray-300 font-medium flex items-center gap-1">
                <Languages className="w-3.5 h-3.5 text-emerald-400" /> Bahasa Target
              </label>
              <select
                value={bahasaTarget}
                onChange={(e) => setBahasaTarget(e.target.value as LanguageCode)}
                className="w-full p-2.5 bg-[#0F1113] border border-gray-800 rounded text-gray-200 focus:outline-none focus:border-indigo-500"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-3 bg-[#0F1113] border border-gray-800 rounded text-[11px] text-gray-400 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-indigo-400 font-mono">
                <FolderTree className="w-3.5 h-3.5" />
                <span>Folder Penyimpanan Lokal Fisik:</span>
              </div>
              <button
                type="button"
                onClick={handlePickFolder}
                className="flex items-center gap-1 px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded border border-indigo-500/30 text-[10px] font-semibold transition-colors"
              >
                <FolderOpen className="w-3 h-3" />
                <span>Pilih Folder</span>
              </button>
            </div>
            <p className="font-mono text-gray-300 truncate">
              {folderPath || `/Novel_Library/${judul ? judul.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') : 'Judul_Novel'}`}
            </p>
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
              Buat Novel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
