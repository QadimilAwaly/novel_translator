export type LanguageCode =
  | 'Mandarin'
  | 'Inggris'
  | 'Jepang'
  | 'Korea'
  | 'Indonesia'
  | 'Spanyol'
  | 'Jerman'
  | 'Prancis'
  | 'Arab'
  | 'Italia'
  | 'Rusia'
  | 'Vietnam'
  | 'Thailand'
  | 'Melayu'
  | 'Tagalog'
  | 'Belanda'
  | 'Portugis';

export const SUPPORTED_LANGUAGES: LanguageCode[] = [
  'Mandarin',
  'Inggris',
  'Jepang',
  'Korea',
  'Indonesia',
  'Spanyol',
  'Jerman',
  'Prancis',
  'Arab',
  'Italia',
  'Rusia',
  'Vietnam',
  'Thailand',
  'Melayu',
  'Tagalog',
  'Belanda',
  'Portugis',
];

export type ChapterStatus = 'Belum' | 'Sedang' | 'Selesai';

export type ReferenceCategory = 'Karakter' | 'Tempat' | 'Lore' | 'Item' | 'Gaya Bahasa' | 'Lainnya';
export type GenderTag = 'Male' | 'Female' | 'Neutral';

export type GlossaryCategory = 'Nama' | 'Tempat' | 'Jurus/Sekte' | 'Item' | 'Istilah Khusus';
export interface Novel {
  id: string;
  judul: string;
  folder_path: string;
  bahasa_sumber: LanguageCode;
  bahasa_target: LanguageCode;
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  novel_id: string;
  nomor_chapter: number;
  judul_chapter: string;
  teks_asli: string;
  teks_terjemahan: string;
  status_pengerjaan: ChapterStatus;
  updatedAt: string;
}

export interface ReferenceItem {
  id: string;
  novel_id: string;
  kategori: ReferenceCategory;
  nama_item: string;
  deskripsi: string;
}

export interface NovelReferenceData {
  synopsis: string;
  writing_style: string;
  items: ReferenceItem[];
}
export interface GlossaryItem {
  id: string;
  novel_id: string;
  istilah_asli: string;
  istilah_terjemahan: string;
  kategori: GlossaryCategory;
  gender?: GenderTag;
  chapter_ditemukan?: string;
  konteks?: string;
}
export type AIProvider = 'gemini' | 'openrouter';

export interface AIConfig {
  provider: AIProvider;
  model: string;
  openrouterApiKey?: string;
  geminiApiKey?: string;
}

export interface TranslateRequest {
  teks_asli: string;
  bahasa_sumber: string;
  bahasa_target: string;
  nomor_chapter: number;
  judul_novel: string;
  reference_data: {
    synopsis: string;
    writing_style: string;
    lore_summary: string;
  };
  glossary_items: Array<{
    istilah_asli: string;
    istilah_terjemahan: string;
    kategori: string;
    gender?: GenderTag;
    konteks?: string;
  }>;
  ai_config?: {
    provider: AIProvider;
    model: string;
    apiKey?: string;
  };
}

export interface ExtractGlossaryRequest {
  teks_asli: string;
  teks_terjemahan: string;
  nomor_chapter: string | number;
  existing_glossary: string[];
  bahasa_sumber?: LanguageCode;
  bahasa_target?: LanguageCode;
  ai_config?: {
    provider: AIProvider;
    model: string;
    apiKey?: string;
  };
}

export interface ExtractedTerm {
  istilah_asli: string;
  istilah_terjemahan: string;
  kategori: GlossaryCategory;
  gender?: GenderTag;
  konteks: string;
}
