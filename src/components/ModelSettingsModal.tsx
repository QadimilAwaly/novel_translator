import React, { useState } from 'react';
import { X, Cpu, Key, Check, HelpCircle, Sparkles, Sliders, FolderTree } from 'lucide-react';
import { AIConfig, AIProvider } from '../types';

interface ModelSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  aiConfig: AIConfig;
  globalStoragePath?: string;
  onSaveConfig: (newConfig: AIConfig, globalPath?: string) => void;
}

const GEMINI_PRESETS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'Rekomendasi — Sangat Cepat & Akurat' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Kualitas Tinggi untuk Narasi Kompleks' },
];

const OPENROUTER_PRESETS = [
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (Google)', desc: 'Cepat & Hemat Token' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Anthropic)', desc: 'Prosa Paling Puitis & Alami' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (DeepSeek)', desc: 'Sangat Efisien & Pintar' },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1 (Reasoning)', desc: 'Model Penalar Tingkat Tinggi' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (OpenAI)', desc: 'Model Flagship Multiguna' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (Meta)', desc: 'Model Open Source Unggulan' },
];

export const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  isOpen,
  onClose,
  aiConfig,
  globalStoragePath = '',
  onSaveConfig,
}) => {
  const [provider, setProvider] = useState<AIProvider>(aiConfig.provider);
  const [model, setModel] = useState<string>(aiConfig.model);
  const [openrouterKey, setOpenrouterKey] = useState<string>(aiConfig.openrouterApiKey || '');
  const [geminiKey, setGeminiKey] = useState<string>(aiConfig.geminiApiKey || '');
  const [storagePath, setStoragePath] = useState<string>(globalStoragePath);
  if (!isOpen) return null;

  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    if (newProvider === 'openrouter' && !model.includes('/')) {
      setModel('google/gemini-2.5-flash');
    } else if (newProvider === 'gemini' && model.includes('/')) {
      setModel('gemini-2.5-flash');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(
      {
        provider,
        model: model.trim() || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash'),
        openrouterApiKey: openrouterKey.trim(),
        geminiApiKey: geminiKey.trim(),
      },
      storagePath.trim()
    );
    onClose();
  };

  const presets = provider === 'openrouter' ? OPENROUTER_PRESETS : GEMINI_PRESETS;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-[#16181D] border border-gray-800 rounded-lg w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#0F1113]">
          <div className="flex items-center gap-2 text-gray-200 font-bold text-sm">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <span>Pengaturan Provider & Model AI</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 rounded hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
          {/* 1. Choose Provider */}
          <div className="space-y-1.5">
            <label className="text-gray-300 font-medium flex items-center justify-between">
              <span>Pilih Provider AI:</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('gemini')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-all ${
                  provider === 'gemini'
                    ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-sm'
                    : 'bg-[#0F1113] border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-indigo-400">
                    <Sparkles className="w-3.5 h-3.5" /> Google Gemini
                  </span>
                  {provider === 'gemini' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
                <span className="text-[10px] text-gray-500">Bawaan platform / Native API</span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('openrouter')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-all ${
                  provider === 'openrouter'
                    ? 'bg-indigo-600/10 border-indigo-500 text-white shadow-sm'
                    : 'bg-[#0F1113] border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-indigo-400">
                    <Cpu className="w-3.5 h-3.5" /> OpenRouter
                  </span>
                  {provider === 'openrouter' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                </div>
                <span className="text-[10px] text-gray-500">Claude, DeepSeek, GPT-4o, Llama, dll</span>
              </button>
            </div>
          </div>

          {/* 2. Model Selection (Presets + Manual Input) */}
          <div className="space-y-2">
            <label className="text-gray-300 font-medium flex items-center justify-between">
              <span>Rekomendasi Model ({provider === 'openrouter' ? 'OpenRouter' : 'Gemini'}):</span>
            </label>

            {/* Quick Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setModel(p.id)}
                  className={`p-2 rounded border text-left transition-all ${
                    model === p.id
                      ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300'
                      : 'bg-[#0F1113] border-gray-800 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <div className="font-semibold text-[11px] truncate">{p.name}</div>
                  <div className="text-[9px] text-gray-500 truncate">{p.desc}</div>
                </button>
              ))}
            </div>

            {/* Manual Model Input Field */}
            <div className="space-y-1 pt-1">
              <label className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                <Cpu className="w-3 h-3 text-indigo-400" /> Model ID Manual:
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={provider === 'openrouter' ? 'Contoh: anthropic/claude-3.5-sonnet atau deepseek/deepseek-chat' : 'Contoh: gemini-2.5-flash'}
                className="w-full p-2 bg-[#0F1113] border border-gray-800 rounded text-gray-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                required
              />
              <p className="text-[10px] text-gray-500">
                {provider === 'openrouter'
                  ? 'Ketik ID model persis dari OpenRouter (contoh: "qwen/qwen-2.5-72b-instruct", "mistralai/mistral-large").'
                  : 'Ketik ID model Gemini (contoh: "gemini-2.5-flash", "gemini-2.5-pro").'}
              </p>
            </div>
          </div>

          {/* 3. Global Storage Path Setting (Manual Path Input) */}
          <div className="p-3 bg-[#0F1113] border border-gray-800 rounded space-y-2">
            <div className="space-y-1">
              <label className="text-gray-300 font-medium flex items-center gap-1.5">
                <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
                <span>Global Storage Path (Folder Penyimpanan Fisik Default)</span>
              </label>
              <input
                type="text"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
                placeholder="Contoh: E:/Novel_Library atau /Users/nama/Novels"
                className="w-full p-2 bg-[#16181D] border border-gray-800 rounded text-gray-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[10px] text-gray-500">
                Lokasi folder fisik di server/komputer lokal Anda di mana file Markdown bab & metadata <code className="text-indigo-400 font-mono">config.json</code> disimpan.
              </p>
            </div>
          </div>

          {/* 4. API Key Settings */}
          <div className="p-3 bg-[#0F1113] border border-gray-800 rounded space-y-2">
            {provider === 'openrouter' ? (
              <div className="space-y-1">
                <label className="text-gray-300 font-medium flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>API Key OpenRouter</span>
                </label>
                <input
                  type="password"
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full p-2 bg-[#16181D] border border-gray-800 rounded text-gray-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-gray-500">
                  Kosongkan jika lingkungan server Anda sudah memiliki <code className="text-indigo-400 font-mono">OPENROUTER_API_KEY</code>.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-gray-300 font-medium flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>API Key Gemini Kustom (Opsional)</span>
                </label>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full p-2 bg-[#16181D] border border-gray-800 rounded text-gray-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-gray-500">
                  Kosongkan untuk menggunakan API Key Gemini default sistem.
                </p>
              </div>
            )}
          </div>

          {/* Active Config Summary */}
          <div className="flex items-center gap-2 p-2 bg-indigo-600/10 border border-indigo-500/20 rounded text-[11px] text-indigo-300">
            <HelpCircle className="w-4 h-4 shrink-0 text-indigo-400" />
            <span>
              Penerjemahan & ekstraksi glosarium akan dikirim ke <strong>{provider === 'openrouter' ? 'OpenRouter' : 'Google Gemini'}</strong> menggunakan model <code className="font-mono text-white font-semibold">{model || 'default'}</code>.
            </span>
          </div>

          {/* Actions */}
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
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded transition-colors shadow-sm"
            >
              Simpan Pengaturan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
