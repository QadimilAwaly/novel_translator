import React from 'react';
import { X, FolderDown, FolderTree, FileCode, CheckCircle2 } from 'lucide-react';
import { Novel } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNovel: Novel | null;
  onExportFolderZip: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  activeNovel,
  onExportFolderZip,
}) => {
  if (!isOpen || !activeNovel) return null;

  const folderName = activeNovel.judul
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#16181D] border border-gray-800 rounded-lg w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2 text-gray-200 font-bold text-sm">
            <FolderDown className="w-4 h-4 text-indigo-400" />
            <span>Ekspor Perpustakaan Fisik Novel</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs">
          <p className="text-gray-300 leading-relaxed">
            Aplikasi akan mengemas seluruh data novel{' '}
            <strong className="text-indigo-300">{activeNovel.judul}</strong> menjadi
            arsip ZIP dengan struktur folder fisik persis seperti desain sistem:
          </p>

          {/* Folder Tree Diagram */}
          <div className="p-3 bg-[#0F1113] border border-gray-800 rounded font-mono text-[11px] text-gray-300 space-y-1 overflow-x-auto">
            <div className="text-indigo-400 font-bold flex items-center gap-1.5">
              <FolderTree className="w-3.5 h-3.5" /> /Novel_Library/{folderName}
            </div>
            <div className="pl-4 text-gray-500">├── /metadata</div>
            <div className="pl-8 text-gray-300 flex items-center gap-1">
              <FileCode className="w-3 h-3 text-emerald-400 inline" /> reference.json (Lore, sinopsis, gaya bahasa)
            </div>
            <div className="pl-8 text-gray-300 flex items-center gap-1">
              <FileCode className="w-3 h-3 text-emerald-400 inline" /> glossary.json (Kamus istilah dinamis)
            </div>
            <div className="pl-4 text-gray-500">├── Chapter_01.md (Teks asli + terjemahan)</div>
            <div className="pl-4 text-gray-500">├── Chapter_02.md</div>
            <div className="pl-4 text-gray-500">└── Chapter_03.md</div>
          </div>

          <div className="p-3 bg-indigo-600/10 border border-indigo-500/20 rounded text-[11px] text-indigo-300 space-y-1">
            <div className="flex items-center gap-1 font-bold text-indigo-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Siap Dicadangkan & Diimpor Kembali
            </div>
            <p className="text-gray-400">
              File `.zip` hasil ekspor dapat dibuka atau disimpan ke disk fisik lokal Anda kapan saja.
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
              type="button"
              onClick={() => {
                onExportFolderZip();
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded transition-colors shadow-md"
            >
              <FolderDown className="w-4 h-4 text-white" />
              <span>Unduh ZIP Sekarang</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
