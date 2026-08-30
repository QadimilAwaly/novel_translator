import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { makeDataSection, PROMPT_INJECTION_GUARD, buildTranslateUserPrompt } from './src/services/promptBuilder';
import { extractChapterNumber } from './src/services/chapterParser';

// Load environment variables (.env.local has precedence over .env)
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local' });
}
dotenv.config();

const currentFilename = typeof import.meta !== 'undefined' && import.meta?.url ? fileURLToPath(import.meta.url) : '';
const currentDirname = currentFilename ? path.dirname(currentFilename) : process.cwd();

function safeTokenCompare(a: string | undefined, b: string): boolean {
  const ba = Buffer.from(a ?? '');
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3131;
  // Default: hanya bind ke localhost untuk mencegah paparan jaringan (audit #3)
  const HOST = process.env.HOST || '127.0.0.1';
  const isProduction = process.env.NODE_ENV === 'production' || currentFilename.includes('dist');
  app.disable('x-powered-by'); // audit #10

  // Pastikan file prompt eksternal prompt/translation.md tersedia
  ensurePromptTemplateFile();

  // Security headers (audit #9, #20)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Dev mode (Vite) butuh inline script + websocket HMR; production memakai CSP ketat
    if (isProduction) {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://openrouter.ai https://generativelanguage.googleapis.com; font-src 'self' data:"
      );
    } else {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: http: https:; font-src 'self' data:"
      );
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // Optional API token auth — aktif hanya jika env APP_API_TOKEN diset (audit #4)
  const API_TOKEN = process.env.APP_API_TOKEN;
  if (API_TOKEN) {
    app.use('/api', (req, res, next) => {
      if (req.path === '/config' || req.path === '/api/config') return next(); // exempt (2Y)
      const provided = req.headers['x-api-token'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (typeof provided === 'string' && safeTokenCompare(provided, API_TOKEN)) return next();
      return res.status(401).json({ error: 'Unauthorized: API token diperlukan.' });
    });
  }

  // Sleep helper
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // ============================================================
  // SECURITY HELPERS (audit perbaikan)
  // ============================================================

  // Rate limiter in-memory per-IP dengan pembersihan berkala (audit #5, step 6)
  const ipHits = new Map<string, number[]>();

  function pruneIpHits(map: Map<string, number[]>, windowMs: number, now: number = Date.now()): number {
    let removedCount = 0;
    for (const [ip, hits] of map.entries()) {
      const active = hits.filter((t) => now - t < windowMs);
      if (active.length === 0) {
        map.delete(ip);
        removedCount++;
      } else if (active.length !== hits.length) {
        map.set(ip, active);
      }
    }
    return removedCount;
  }

  let rateLimitCleanupTimer: NodeJS.Timeout | null = null;
  function ensureRateLimitCleanup(windowMs: number) {
    if (rateLimitCleanupTimer) return;
    const interval = Math.max(60000, windowMs);
    rateLimitCleanupTimer = setInterval(() => {
      pruneIpHits(ipHits, windowMs, Date.now());
    }, interval);
    rateLimitCleanupTimer.unref();
  }

  function rateLimit(max: number, windowMs: number) {
    ensureRateLimitCleanup(windowMs);
    return (req: any, res: any, next: any) => {
      const ip = req.ip || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const hits = (ipHits.get(ip) || []).filter((t) => now - t < windowMs);
      if (hits.length >= max) {
        return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' });
      }
      hits.push(now);
      ipHits.set(ip, hits);
      next();
    };
  }

  // Resolve path agar SELALU berada di dalam base directory yang diizinkan (audit #1)
  // Mengembalikan string path yang aman, atau null jika mencoba keluar dari base.
  function resolveSafePath(inputPath: string, basePath: string): string | null {
    const base = path.resolve(basePath);
    let target = inputPath;
    if (!path.isAbsolute(target)) {
      target = path.join(base, target);
    }
    const resolved = path.resolve(target);
    const rel = path.relative(base, resolved);
    // rel yang diawali '..' atau absolut berarti keluar dari base → tolak
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return resolved;
    }
    return null;
  }

  // Sanitize nama file supaya aman untuk Windows (audit #6)
  function sanitizeFilename(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'untitled';
  }

  // Validasi format model ID (audit #18) — cegah input model sembarangan
  function sanitizeModelId(model: string): string {
    const cleaned = String(model || '').trim();
    // hanya izinkan huruf/angka/garis/titik/slash (format "vendor/nama-model")
    if (/^[a-zA-Z0-9._\/-]{1,100}$/.test(cleaned)) {
      return cleaned;
    }
    return '';
  }

  // Fetch dengan timeout (audit #8)
  async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

// In-memory cached system instruction template with mtime tracking for zero-cost hot-reloading
let cachedSystemInstructionTemplate: string | null = null;
let cachedPromptMtime = 0;

// Helper: Load System Instruction Template from prompt/translation.md
function getTranslationSystemInstructionTemplate(): string {
  const promptPaths = [
    path.join(process.cwd(), 'prompt', 'translation.md'),
    path.join(process.cwd(), 'prompts', 'translation.md'),
  ];

  for (const p of promptPaths) {
    if (fs.existsSync(p)) {
      try {
        const stat = fs.statSync(p);
        if (cachedSystemInstructionTemplate && cachedPromptMtime === stat.mtimeMs) {
          return cachedSystemInstructionTemplate;
        }

        const content = fs.readFileSync(p, 'utf-8');
        const sysMatch = content.match(/##\s*SYSTEM INSTRUCTION\s*([\s\S]*?)(?=---\s*|\n##\s*USER PROMPT|$)/i);
        const parsed = (sysMatch ? sysMatch[1] : content).trim();

        if (parsed) {
          cachedSystemInstructionTemplate = parsed;
          cachedPromptMtime = stat.mtimeMs;
          return cachedSystemInstructionTemplate;
        }
      } catch (err) {
        console.warn('Failed reading external prompt template from', p, err);
      }
    }
  }

  // Built-in fallback
  return `Anda adalah seorang penerjemah novel profesional berpengalaman tinggi dari bahasa {{BAHASA_SUMBER}} ke {{BAHASA_TARGET}}.
Tugas Anda adalah menerjemahkan bab novel berikut secara akurat, alami, puitis jika diperlukan, dan mempertahankan aliran emosi cerita tanpa memotong paragraf atau menghilangkan detail penting.

ATURAN WAJIB penerjemahan:
1. HARUS mematuhi Glosarium Terikat di bawah ini secara konsisten. Jangan mengubah istilah yang sudah ditetapkan di Glosarium.
2. HARUS menyelaraskan gaya bahasa dan nada cerita dengan Panduan Gaya & Lore yang diberikan.
3. KONSISTENSI SUDUT PANDANG (POV): Gunakan satu sudut pandang (Point of View / POV) yang KONSISTEN di seluruh bab. DILARANG KERAS berpindah POV secara acak (misalnya tiba-tiba berubah dari orang pertama "aku/saya" ke orang ketiga "dia/nama karakter" atau sebaliknya antar paragraf). Pertahankan konsistensi narator dari awal hingga akhir bab, terutama saat menerjemahkan bahasa dengan subjek tersirat (seperti bahasa Jepang).
4. KONSISTENSI PRONOUN & GENDER KARAKTER: Untuk setiap karakter / nama yang memiliki tag Gender di Glosarium (Male / Female), WAJIB menggunakan pronoun yang sesuai (Male -> he/him/his/himself; Female -> she/her/hers/herself; Neutral -> they/them/it). DILARANG KERAS menukar pronoun he/she pada karakter yang sudah ditentukan gendernya dalam bahasa Inggris.
5. Pertahankan tata letak paragraf asli dan pemisah antar dialog.
6. Baris pertama dari hasil terjemahan HARUS diawali dengan tag [JUDUL_BAB: Judul Bab Yang Menarik Dalam Bahasa {{BAHASA_TARGET}}] jika diminta atau jika judul bab belum spesifik, kemudian ikuti dengan teks terjemahan selengkapnya.
7. Jangan tambahkan komentar meta, pendahuluan, atau catatan kaki dari penerjemah. HANYA hasilkan teks terjemahan novel langsung.`;
}

// Single-pass token replacer: O(N) efficiency and immune to cascading injection
function renderPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
}
function ensurePromptTemplateFile(): void {
  const promptDir = path.join(process.cwd(), 'prompt');
  const promptFile = path.join(promptDir, 'translation.md');
  if (!fs.existsSync(promptFile)) {
    try {
      if (!fs.existsSync(promptDir)) {
        fs.mkdirSync(promptDir, { recursive: true });
      }
      const defaultContent = getTranslationSystemInstructionTemplate();
      fs.writeFileSync(promptFile, defaultContent, 'utf-8');
    } catch (e) {
      console.warn('Failed auto-creating prompt/translation.md:', e);
    }
  }
}

  // Helper: OpenRouter API Call
  const callOpenRouter = async ({
    model,
    apiKey,
    systemInstruction,
    prompt,
    jsonOutput = false,
  }: {
    model: string;
    apiKey: string;
    systemInstruction: string;
    prompt: string;
    jsonOutput?: boolean;
  }) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Novel Translator Pro',
    };

    const body: any = {
      model: model || 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    };

    if (jsonOutput) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, 60000);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = errorData.error?.message || errorData.message || `HTTP ${response.status}`;
      throw new Error(`[OpenRouter Error] ${msg}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  // Helper: OpenRouter with Retry
  const callOpenRouterWithRetry = async (params: {
    model: string;
    apiKey: string;
    systemInstruction: string;
    prompt: string;
    jsonOutput?: boolean;
  }) => {
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await callOpenRouter(params);
      } catch (err: any) {
        lastError = err;
        const errStr = String(err?.message || err);
        const isTransient = errStr.includes('503') || errStr.includes('429') || errStr.includes('502') || errStr.includes('504');
        if (isTransient && attempt < 3) {
          console.warn(`[OpenRouter Retry ${attempt}] ${errStr}`);
          await sleep(1500 * attempt);
        } else {
          throw err;
        }
      }
    }
    throw lastError;
  };

  // Helper: Get Gemini AI Client
  const getGenAI = (customKey?: string) => {
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY belum dikonfigurasi.');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  };

  // Helper: Gemini Call with Automatic Retry & Model Fallback on 503/High Demand
  const callGeminiWithRetryAndFallback = async ({
    model,
    apiKeyOverride,
    prompt,
    systemInstruction,
    responseMimeType,
    responseSchema,
  }: {
    model: string;
    apiKeyOverride?: string;
    prompt: string;
    systemInstruction?: string;
    responseMimeType?: string;
    responseSchema?: any;
  }) => {
    const ai = getGenAI(apiKeyOverride);

    // Build fallback list if primary model fails with 503
    const modelsToTry = [model];
    if (model === 'gemini-2.5-flash') {
      modelsToTry.push('gemini-2.5-pro');
    } else if (!modelsToTry.includes('gemini-2.5-flash')) {
      modelsToTry.push('gemini-2.5-flash');
    }

    let lastError: any = null;

    for (const currentModel of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const config: any = { temperature: 0.3 };
          if (systemInstruction) config.systemInstruction = systemInstruction;
          if (responseMimeType) config.responseMimeType = responseMimeType;
          if (responseSchema) config.responseSchema = responseSchema;

          const response = await ai.models.generateContent({
            model: currentModel,
            contents: prompt,
            config,
          });

          if (response.text) {
            return response.text;
          }
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          const isTransient =
            errStr.includes('503') ||
            errStr.includes('UNAVAILABLE') ||
            errStr.includes('high demand') ||
            errStr.includes('429') ||
            errStr.includes('RESOURCE_EXHAUSTED');

          console.warn(`[Gemini Attempt ${attempt} on ${currentModel}] Failed:`, errStr);

          if (isTransient && attempt < 2) {
            await sleep(1500 * attempt);
          } else if (!isTransient) {
            // Non-transient error (e.g., bad API key, prompt error)
            throw err;
          }
        }
      }
    }

    const lastMsg = String(lastError?.message || lastError);
    if (lastMsg.includes('503') || lastMsg.includes('high demand') || lastMsg.includes('UNAVAILABLE')) {
      throw new Error(
        'Layanan Google Gemini sedang mengalami lonjakan beban tinggi (503 High Demand). Silakan coba beberapa saat lagi, atau alihkan provider ke OpenRouter / Gemini 2.5 Flash melalui tombol Pengaturan Model di sudut kanan atas.'
      );
    }

    throw lastError || new Error('Gagal menghubungi layanan Gemini AI.');
  };

  // Helper: Extract first balanced JSON block { ... } or [ ... ]
  function extractFirstJsonBlock(input: string): string | null {
    const firstBrace = input.indexOf('{');
    const firstBracket = input.indexOf('[');

    let startIdx = -1;
    let openChar = '{';
    let closeChar = '}';

    if (firstBrace !== -1 && firstBracket !== -1) {
      if (firstBrace < firstBracket) {
        startIdx = firstBrace;
        openChar = '{';
        closeChar = '}';
      } else {
        startIdx = firstBracket;
        openChar = '[';
        closeChar = ']';
      }
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      openChar = '{';
      closeChar = '}';
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      openChar = '[';
      closeChar = ']';
    } else {
      return null;
    }

    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = startIdx; i < input.length; i++) {
      const char = input[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === openChar) {
          depth++;
        } else if (char === closeChar) {
          depth--;
          if (depth === 0) {
            return input.slice(startIdx, i + 1);
          }
        }
      }
    }

    return null;
  }

  // Helper: Robust LLM JSON Parser (Audit Step 4)
  function cleanJsonString<T = any>(str: string): T {
    if (!str || typeof str !== 'string' || !str.trim()) {
      throw new Error('LLM returned empty or non-string response');
    }

    let text = str.trim();

    // 1. Extract first fenced code block if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      text = fenceMatch[1].trim();
    }

    // 2. Strip single-backtick wrapper if present
    if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
      text = text.slice(1, -1).trim();
    }

    // 3. Try direct JSON.parse
    try {
      return JSON.parse(text) as T;
    } catch {
      // 4. Try brace-matching extraction for embedded JSON (preamble/trailing prose)
      const extracted = extractFirstJsonBlock(text) || extractFirstJsonBlock(str);
      if (extracted) {
        try {
          return JSON.parse(extracted) as T;
        } catch {
          // Fall through to error
        }
      }
    }

    const preview = (str.length > 200 ? str.slice(0, 200) + '...' : str).replace(/[\r\n]+/g, ' ');
    throw new Error(`LLM returned invalid JSON: ${preview}`);
  }

  // Helper: Read/Write App Config File (config.json)
  const CONFIG_PATH = path.join(process.cwd(), 'config.json');

  const getDefaultConfig = () => ({
    global_storage_path: path.join(process.cwd(), 'Novel_Library'),
    default_provider: 'gemini',
    default_model: 'gemini-2.5-flash',
    gemini_api_key: '',
    openrouter_api_key: '',
  });

  const readConfig = () => {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        return { ...getDefaultConfig(), ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('Error reading config.json:', e);
    }
    const def = getDefaultConfig();
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(def, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[config] Failed to write default config:', e);
    }
    return def;
  };

  // Config aman untuk dikirim ke client — TANPA API key mentah (audit #2)
  const getSafeConfig = () => {
    const cfg = readConfig();
    return {
      global_storage_path: cfg.global_storage_path,
      default_provider: cfg.default_provider,
      default_model: cfg.default_model,
      has_gemini_api_key: Boolean(cfg.gemini_api_key),
      has_openrouter_api_key: Boolean(cfg.openrouter_api_key),
    };
  };

  // Helper: Persistent Server-Backed Novel & Metadata Storage
  const getLibraryStorageDir = (): string => {
    const config = readConfig();
    const rawPath = config.global_storage_path || path.join(process.cwd(), 'Novel_Library');
    const resolved = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(process.cwd(), rawPath);
    if (!fs.existsSync(resolved)) {
      try {
        fs.mkdirSync(resolved, { recursive: true });
      } catch (err) {
        console.error('Failed creating library directory:', err);
      }
    }
    return resolved;
  };

  const getLibraryIndexFilePath = (): string => {
    return path.join(getLibraryStorageDir(), 'library_index.json');
  };

  interface StoredNovel {
    id: string;
    judul: string;
    folder_path: string;
    bahasa_sumber: string;
    bahasa_target: string;
    createdAt: string;
    updatedAt: string;
  }

  // Helper: Resolve existing novel directory on disk to prevent duplicates
  const resolveNovelFolderOnDisk = (libraryBase: string, novel: { id: string; judul: string; folder_path?: string }): string => {
    // 1. If novel.folder_path points to an existing directory inside libraryBase, use it
    if (novel.folder_path) {
      const directPath = resolveSafePath(novel.folder_path, libraryBase);
      if (directPath && fs.existsSync(directPath)) {
        return directPath;
      }
    }

    // 2. Check if folder exists by clean title
    const cleanTitle = sanitizeFilename(novel.judul || 'Novel_' + novel.id);
    const directClean = path.join(libraryBase, cleanTitle);
    if (fs.existsSync(directClean)) {
      return directClean;
    }

    // 3. Check if folder exists by snake_case title
    const snakeTitle = cleanTitle.replace(/\s+/g, '_');
    const directSnake = path.join(libraryBase, snakeTitle);
    if (fs.existsSync(directSnake)) {
      return directSnake;
    }

    // 4. Normalized match (ignore space/underscore/case differences)
    if (fs.existsSync(libraryBase)) {
      try {
        const entries = fs.readdirSync(libraryBase);
        const normTarget = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const entry of entries) {
          if (entry.startsWith('.')) continue;
          const normEntry = entry.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normEntry === normTarget && normTarget.length > 3) {
            return path.join(libraryBase, entry);
          }
        }
      } catch (e) {
        console.warn('Resolve folder scan warning:', e);
      }
    }

    return directClean;
  };

  interface StoredChapter {
    id: string;
    novel_id: string;
    nomor_chapter: number;
    judul_chapter: string;
    teks_asli: string;
    teks_terjemahan: string;
    status_pengerjaan: string;
    createdAt: string;
    updatedAt: string;
  }

  interface StoredReference {
    id: string;
    novel_id: string;
    kategori: string;
    nama_item: string;
    deskripsi: string;
  }

  interface StoredGlossary {
    id: string;
    novel_id: string;
    istilah_asli: string;
    istilah_terjemahan: string;
    kategori: string;
    gender?: 'Male' | 'Female' | 'Neutral';
    konteks?: string;
  }
  const loadNovelDataFromDisk = (folderPath: string, novelId: string): {
    chapters: StoredChapter[];
    references: StoredReference[];
    glossaries: StoredGlossary[];
  } => {
    const chapters: StoredChapter[] = [];
    const references: StoredReference[] = [];
    const glossaries: StoredGlossary[] = [];

    const refPath = path.join(folderPath, 'metadata', 'reference.json');
    if (fs.existsSync(refPath)) {
      try {
        const refJson = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
        if (Array.isArray(refJson.reference_items)) {
          refJson.reference_items.forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const it = item as Record<string, unknown>;
              references.push({
                id: String(it.id || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
                novel_id: novelId,
                kategori: String(it.kategori || 'Karakter'),
                nama_item: String(it.nama_item || ''),
                deskripsi: String(it.deskripsi || ''),
              });
            }
          });
        }
      } catch (e) {
        console.warn('Error reading reference.json in', folderPath, e);
      }
    }

    const glosPath = path.join(folderPath, 'metadata', 'glossary.json');
    if (fs.existsSync(glosPath)) {
      try {
        const glosJson = JSON.parse(fs.readFileSync(glosPath, 'utf-8'));
        if (Array.isArray(glosJson)) {
          glosJson.forEach((item: unknown) => {
            if (item && typeof item === 'object') {
              const it = item as Record<string, unknown>;
              glossaries.push({
                id: String(it.id || `glos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
                novel_id: novelId,
                istilah_asli: String(it.istilah_asli || ''),
                istilah_terjemahan: String(it.istilah_terjemahan || ''),
                kategori: String(it.kategori || 'Istilah Khusus'),
                gender: it.gender && (it.gender === 'Male' || it.gender === 'Female' || it.gender === 'Neutral') ? (it.gender as 'Male' | 'Female' | 'Neutral') : undefined,
                konteks: it.konteks ? String(it.konteks) : undefined,
              });
            }
          });
        }
      } catch (e) {
        console.warn('Error reading glossary.json in', folderPath, e);
      }
    }

    if (fs.existsSync(folderPath)) {
      try {
        const files = fs.readdirSync(folderPath);
        files.forEach((file) => {
          if ((file.endsWith('.md') || file.endsWith('.txt')) && !file.startsWith('.')) {
            const chapFilePath = path.join(folderPath, file);
            const content = fs.readFileSync(chapFilePath, 'utf-8');

            const nomorChapter = extractChapterNumber(file) ?? (chapters.length + 1);

            let title = `Chapter ${nomorChapter}`;
            const titleMatch = content.match(/^#\s+(?:Chapter|Bab)\s+\d+[:\s\-]*(.+)$/m);
            if (titleMatch && titleMatch[1]) {
              title = titleMatch[1].trim();
            }

            let statusPengerjaan = 'Belum';
            const statusMatch = content.match(/>\s*\*\*Status:\*\*\s*(.+)$/m);
            if (statusMatch && statusMatch[1]) {
              statusPengerjaan = statusMatch[1].trim();
            }

            let originalText = '';
            let translatedText = '';

            const transMatch = content.match(/## Hasil Terjemahan[^\n]*\n([\s\S]*?)(?:\n---|\n## Teks Asli|$)/);
            if (transMatch) {
              translatedText = transMatch[1].trim();
            }

            const origMatch = content.match(/## Teks Asli[^\n]*\n([\s\S]*?)(?:\n---|$)/);
            if (origMatch) {
              originalText = origMatch[1].trim();
            }

            if (!originalText && !translatedText) {
              originalText = content;
            }

            if (!translatedText && content.includes('*(Belum diterjemahkan)*')) {
              translatedText = '';
            }

            if (translatedText.length > 0 && statusPengerjaan === 'Belum') {
              statusPengerjaan = 'Selesai';
            }

            chapters.push({
              id: `chap-${novelId}-${nomorChapter}-${crypto.randomUUID().slice(0, 8)}`,
              novel_id: novelId,
              nomor_chapter: nomorChapter,
              judul_chapter: title,
              teks_asli: originalText,
              teks_terjemahan: translatedText,
              status_pengerjaan: statusPengerjaan,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });
          }
        });
      } catch (err) {
        console.error(`Error reading chapters from ${folderPath}:`, err);
      }
    }

    chapters.sort((a, b) => a.nomor_chapter - b.nomor_chapter);
    return { chapters, references, glossaries };
  };

  const parseNovelFolderDisk = (folderPath: string, folderName: string): {
    novel: StoredNovel;
    chapters: StoredChapter[];
    references: StoredReference[];
    glossaries: StoredGlossary[];
  } => {
    const novelId = `novel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let refJson: {
      novel_title?: string;
      source_language?: string;
      target_language?: string;
      updated_at?: string;
    } | null = null;

    const refPath = path.join(folderPath, 'metadata', 'reference.json');
    if (fs.existsSync(refPath)) {
      try {
        refJson = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
      } catch (e) {
        console.warn('[loadNovel] Failed to parse reference.json:', folderPath, e);
      }
    }

    const novel: StoredNovel = {
      id: novelId,
      judul: refJson?.novel_title || folderName.replace(/_/g, ' '),
      folder_path: folderPath,
      bahasa_sumber: refJson?.source_language || 'Mandarin',
      bahasa_target: refJson?.target_language || 'Indonesia',
      createdAt: refJson?.updated_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { chapters, references, glossaries } = loadNovelDataFromDisk(folderPath, novelId);
    return { novel, chapters, references, glossaries };
  };

  const scanAndSyncNovelFolders = (currentData: {
    novels: StoredNovel[];
    chapters: StoredChapter[];
    references: StoredReference[];
    glossaries: StoredGlossary[];
    last_updated: string;
  }) => {
    let hasChanges = false;
    try {
      const libraryBase = getLibraryStorageDir();
      if (!fs.existsSync(libraryBase)) return currentData;

      const entries = fs.readdirSync(libraryBase);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const entryPath = path.join(libraryBase, entry);
        if (!fs.statSync(entryPath).isDirectory()) continue;

        // Check if novel already indexed
        const existingNovel = currentData.novels.find((n) => {
          if (!n) return false;
          if (n.folder_path && (n.folder_path === entryPath || path.resolve(n.folder_path) === path.resolve(entryPath))) {
            return true;
          }
          const cleanJudul = sanitizeFilename(n.judul || '');
          if (cleanJudul.toLowerCase() === entry.toLowerCase() || entry.toLowerCase().includes(cleanJudul.toLowerCase())) {
            return true;
          }
          if (entry.toLowerCase().replace(/_/g, ' ') === (n.judul || '').toLowerCase()) {
            return true;
          }
          return false;
        });

        if (!existingNovel) {
          // New novel folder found on disk!
          const parsed = parseNovelFolderDisk(entryPath, entry);
          currentData.novels.push(parsed.novel);
          currentData.chapters.push(...parsed.chapters);
          currentData.references.push(...parsed.references);
          currentData.glossaries.push(...parsed.glossaries);
          hasChanges = true;
        } else {
          // Novel exists, check if chapters on disk need syncing
          const existingChaps = currentData.chapters.filter((c) => c.novel_id === existingNovel.id);
          if (existingChaps.length === 0) {
            const parsed = parseNovelFolderDisk(entryPath, entry);
            if (parsed.chapters.length > 0) {
              parsed.chapters.forEach((c) => { c.novel_id = existingNovel.id; });
              currentData.chapters.push(...parsed.chapters);
              hasChanges = true;
            }
            if (currentData.glossaries.filter((g) => g.novel_id === existingNovel.id).length === 0 && parsed.glossaries.length > 0) {
              parsed.glossaries.forEach((g) => { g.novel_id = existingNovel.id; });
              currentData.glossaries.push(...parsed.glossaries);
              hasChanges = true;
            }
            if (currentData.references.filter((r) => r.novel_id === existingNovel.id).length === 0 && parsed.references.length > 0) {
              parsed.references.forEach((r) => { r.novel_id = existingNovel.id; });
              currentData.references.push(...parsed.references);
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        currentData.last_updated = new Date().toISOString();
        const filePath = getLibraryIndexFilePath();
        const manifest = {
          novels: currentData.novels,
          last_updated: currentData.last_updated,
        };
        fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
      }
    } catch (scanErr) {
      console.warn('Scan novel folders error:', scanErr);
    }
    return currentData;
  };

  const readLibraryStorage = () => {
    const filePath = getLibraryIndexFilePath();
    const libraryBase = getLibraryStorageDir();
    let indexedNovels: StoredNovel[] = [];
    let lastUpdated = new Date().toISOString();

    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.novels)) {
          indexedNovels = parsed.novels;
          lastUpdated = parsed.last_updated || lastUpdated;
        }
      }
    } catch (err) {
      console.error('Error reading library_index.json:', err);
    }

    const allChapters: StoredChapter[] = [];
    const allReferences: StoredReference[] = [];
    const allGlossaries: StoredGlossary[] = [];

    // Load each indexed novel's actual markdown and metadata files directly from disk
    for (const novel of indexedNovels) {
      const folder = resolveNovelFolderOnDisk(libraryBase, novel);
      if (fs.existsSync(folder)) {
        const data = loadNovelDataFromDisk(folder, novel.id);
        allChapters.push(...data.chapters);
        allReferences.push(...data.references);
        allGlossaries.push(...data.glossaries);
      }
    }

    const result = {
      novels: indexedNovels,
      chapters: allChapters,
      references: allReferences,
      glossaries: allGlossaries,
      last_updated: lastUpdated,
    };

    // Scan for unindexed novel folders and sync
    return scanAndSyncNovelFolders(result);
  };

  const saveLibraryStorage = (data: {
    novels?: StoredNovel[];
    chapters?: StoredChapter[];
    references?: StoredReference[];
    glossaries?: StoredGlossary[];
  }) => {
    const current = readLibraryStorage();
    const newNovels = Array.isArray(data.novels) ? data.novels : current.novels;
    const libraryBase = getLibraryStorageDir();

    // 1. Detect deleted novels and remove physical folders on disk!
    if (Array.isArray(data.novels)) {
      const remainingIds = new Set(newNovels.map((n) => n.id));
      const deletedNovels = current.novels.filter((n) => !remainingIds.has(n.id));

      for (const delNovel of deletedNovels) {
        const cleanTitle = sanitizeFilename(delNovel.judul || 'Novel_' + delNovel.id);
        const folderByName = path.join(libraryBase, cleanTitle);
        const folderByPath = delNovel.folder_path ? resolveSafePath(delNovel.folder_path, libraryBase) : null;

        if (folderByPath && fs.existsSync(folderByPath)) {
          try {
            fs.rmSync(folderByPath, { recursive: true, force: true });
          } catch (rmErr) {
            console.error('Error removing folderByPath:', rmErr);
          }
        }
        if (folderByName && fs.existsSync(folderByName) && folderByName !== folderByPath) {
          try {
            fs.rmSync(folderByName, { recursive: true, force: true });
          } catch (rmErr) {
            console.error('Error removing folderByName:', rmErr);
          }
        }
      }

      // Also clean up chapters, references, glossaries of deleted novels
      data.chapters = (data.chapters || current.chapters).filter((c) => remainingIds.has(c.novel_id));
      data.references = (data.references || current.references).filter((r) => remainingIds.has(r.novel_id));
      data.glossaries = (data.glossaries || current.glossaries).filter((g) => remainingIds.has(g.novel_id));
    }

    // 2. Detect deleted chapters and unlink files on disk
    if (Array.isArray(data.chapters)) {
      const remainingChapIds = new Set(data.chapters.map((c) => c.id));
      const deletedChapters = current.chapters.filter((c) => !remainingChapIds.has(c.id));

      for (const delChap of deletedChapters) {
        const parentNovel = newNovels.find((n) => n.id === delChap.novel_id);
        if (parentNovel) {
          const cleanNovelTitle = sanitizeFilename(parentNovel.judul || 'Novel_' + parentNovel.id);
          const novelFolder = parentNovel.folder_path && fs.existsSync(parentNovel.folder_path)
            ? path.resolve(parentNovel.folder_path)
            : path.join(libraryBase, cleanNovelTitle);
          const padNum = String(Number(delChap.nomor_chapter) || 1).padStart(2, '0');
          const chapFilePath = path.join(novelFolder, `Chapter_${padNum}.md`);
          if (fs.existsSync(chapFilePath)) {
            try {
              fs.unlinkSync(chapFilePath);
            } catch (unlinkErr) {
              console.error('Error unlinking deleted chapter file:', unlinkErr);
            }
          }
        }
      }
    }

    // 3. Detect renamed novels and rename physical directory
    if (Array.isArray(data.novels)) {
      for (const novel of newNovels) {
        const oldNovel = current.novels.find((n) => n.id === novel.id);
        if (oldNovel && oldNovel.judul !== novel.judul) {
          const oldCleanTitle = sanitizeFilename(oldNovel.judul || 'Novel_' + oldNovel.id);
          const newCleanTitle = sanitizeFilename(novel.judul || 'Novel_' + novel.id);
          const oldFolder = path.join(libraryBase, oldCleanTitle);
          const newFolder = path.join(libraryBase, newCleanTitle);

          if (fs.existsSync(oldFolder) && !fs.existsSync(newFolder)) {
            try {
              fs.renameSync(oldFolder, newFolder);
              novel.folder_path = newFolder;
            } catch (renErr) {
              console.error('Error renaming novel folder on disk:', renErr);
            }
          }
        }
      }
    }

    const updated = {
      novels: newNovels,
      chapters: Array.isArray(data.chapters) ? data.chapters : current.chapters,
      references: Array.isArray(data.references) ? data.references : current.references,
      glossaries: Array.isArray(data.glossaries) ? data.glossaries : current.glossaries,
      last_updated: new Date().toISOString(),
    };

    const filePath = getLibraryIndexFilePath();
    const manifest = {
      novels: newNovels,
      last_updated: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
    // Auto-sync physical folders for existing novels
    try {
      for (const novel of updated.novels) {
        const novelFolder = resolveNovelFolderOnDisk(libraryBase, novel);
        if (!fs.existsSync(novelFolder)) {
          fs.mkdirSync(novelFolder, { recursive: true });
        }
        const metadataFolder = path.join(novelFolder, 'metadata');
        if (!fs.existsSync(metadataFolder)) {
          fs.mkdirSync(metadataFolder, { recursive: true });
        }

        const novelRefs = updated.references.filter((r: StoredReference) => r.novel_id === novel.id);
        const novelGloss = updated.glossaries.filter((g: StoredGlossary) => g.novel_id === novel.id);
        const novelChaps = updated.chapters.filter((c: StoredChapter) => c.novel_id === novel.id);

        const synopsisItem = novelRefs.find((r: StoredReference) => r.nama_item?.toLowerCase().includes('sinopsis') || r.kategori === 'Sinopsis');
        const styleItem = novelRefs.find((r: StoredReference) => r.kategori === 'Gaya Bahasa');

        // Write metadata/reference.json
        const refPayload = {
          novel_title: novel.judul,
          source_language: novel.bahasa_sumber,
          target_language: novel.bahasa_target,
          synopsis: synopsisItem?.deskripsi || '',
          writing_style: styleItem?.deskripsi || '',
          reference_items: novelRefs,
          updated_at: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(metadataFolder, 'reference.json'), JSON.stringify(refPayload, null, 2), 'utf-8');

        // Write metadata/glossary.json
        fs.writeFileSync(path.join(metadataFolder, 'glossary.json'), JSON.stringify(novelGloss, null, 2), 'utf-8');

        // Write Chapter Markdown files
        for (const chap of novelChaps) {
          const padNum = String(Number(chap.nomor_chapter) || 1).padStart(2, '0');
          const safeChapTitle = sanitizeFilename(chap.judul_chapter || 'Chapter ' + chap.nomor_chapter);
          const chapPath = path.join(novelFolder, `Chapter_${padNum}.md`);
          const divider = '---';
          const mdContent = `# Chapter ${chap.nomor_chapter}: ${safeChapTitle}\n\n> **Novel:** ${sanitizeFilename(novel.judul)}\n> **Status:** ${chap.status_pengerjaan}\n> **Bahasa:** ${novel.bahasa_sumber} -> ${novel.bahasa_target}\n> **Updated:** ${new Date().toLocaleString()}\n\n${divider}\n\n## Hasil Terjemahan (${novel.bahasa_target})\n\n${chap.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${novel.bahasa_sumber})\n\n${chap.teks_asli || '*(Kosong)*'}\n`;
          fs.writeFileSync(chapPath, mdContent, 'utf-8');
        }
      }
    } catch (syncErr) {
      console.warn('Physical folder auto-sync warning:', syncErr);
    }

    return updated;
  };

  // API Route: Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Route: Get App Config (tanpa API key mentah — audit #2)
  app.get('/api/config', (req, res) => {
    res.json(getSafeConfig());
  });

  // API Route: Update App Config (API key tetap disimpan server-side di config.json)
  app.post('/api/config', (req, res) => {
    try {
      const current = readConfig();
      const body = req.body || {};
      // Hanya izinkan field yang dikenal; jangan terima path sesuka hati (audit #1, #6)
      const updated: Record<string, unknown> = { ...current };
      if (typeof body.global_storage_path === 'string') {
        const raw = body.global_storage_path.trim();
        if (raw && !raw.includes('\0')) {
          updated.global_storage_path = raw;
        }
      }
      if (typeof body.default_provider === 'string') updated.default_provider = body.default_provider;
      if (typeof body.default_model === 'string') updated.default_model = body.default_model;
      if (body.gemini_api_key !== undefined) updated.gemini_api_key = String(body.gemini_api_key);
      if (body.openrouter_api_key !== undefined) updated.openrouter_api_key = String(body.openrouter_api_key);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ status: 'success', config: getSafeConfig() });
    } catch (error: unknown) {
      const errMessage = error instanceof Error ? error.message : 'Gagal menyimpan config.json';
      console.error('Error saving config.json:', errMessage);
      res.status(500).json({ error: 'Gagal menyimpan config.json' });
    }
  });
  // API Route: Get Server-Backed Master Storage
  app.get('/api/storage', rateLimit(100, 60000), (req, res) => {
    try {
      const data = readLibraryStorage();
      res.json({ status: 'success', data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca storage';
      console.error('Error fetching storage:', msg);
      res.status(500).json({ error: 'Gagal membaca data perpustakaan novel dari server.' });
    }
  });

  // API Route: Sync Full/Partial Storage to Disk
  app.post('/api/storage/sync', rateLimit(60, 60000), (req, res) => {
    try {
      const updated = saveLibraryStorage(req.body || {});
      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal sinkronisasi storage';
      console.error('Error syncing storage:', msg);
      res.status(500).json({ error: 'Gagal menyinkronkan data ke disk server.' });
    }
  });
  // API Route: Delete Novel and its Physical Folder on Disk
  app.post('/api/storage/delete-novel', rateLimit(60, 60000), (req, res) => {
    try {
      const { novel_id } = req.body || {};
      if (!novel_id || typeof novel_id !== 'string') {
        return res.status(400).json({ error: 'novel_id wajib disertakan.' });
      }

      const current = readLibraryStorage();
      const updatedNovels = current.novels.filter((n) => n.id !== novel_id);
      const updatedChapters = current.chapters.filter((c) => c.novel_id !== novel_id);
      const updatedReferences = current.references.filter((r) => r.novel_id !== novel_id);
      const updatedGlossaries = current.glossaries.filter((g) => g.novel_id !== novel_id);

      const updated = saveLibraryStorage({
        novels: updatedNovels,
        chapters: updatedChapters,
        references: updatedReferences,
        glossaries: updatedGlossaries,
      });

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus novel';
      console.error('Error deleting novel from storage:', msg);
      res.status(500).json({ error: 'Gagal menghapus novel dari disk server.' });
    }
  });

  // API Route: Delete Chapter and its Markdown file on Disk
  app.post('/api/storage/delete-chapter', rateLimit(60, 60000), (req, res) => {
    try {
      const { chapter_id } = req.body || {};
      if (!chapter_id || typeof chapter_id !== 'string') {
        return res.status(400).json({ error: 'chapter_id wajib disertakan.' });
      }

      const current = readLibraryStorage();
      const updatedChapters = current.chapters.filter((c) => c.id !== chapter_id);

      const updated = saveLibraryStorage({
        chapters: updatedChapters,
      });

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus bab';
      console.error('Error deleting chapter from storage:', msg);
      res.status(500).json({ error: 'Gagal menghapus bab dari disk server.' });
    }
  });
  // API Route: Delete Glossary Item from Storage
  app.post('/api/storage/delete-glossary', rateLimit(60, 60000), (req, res) => {
    try {
      const { glossary_id, novel_id } = req.body || {};
      if (!glossary_id || typeof glossary_id !== 'string') {
        return res.status(400).json({ error: 'glossary_id wajib disertakan.' });
      }

      const current = readLibraryStorage();
      const updatedGlossaries = current.glossaries.filter((g) => g.id !== glossary_id);

      const updated = saveLibraryStorage({
        glossaries: updatedGlossaries,
      });

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus istilah glosarium';
      console.error('Error deleting glossary item from storage:', msg);
      res.status(500).json({ error: 'Gagal menghapus istilah glosarium dari disk server.' });
    }
  });


  // API Route: Rename Novel and its Physical Directory on Disk
  app.post('/api/storage/rename-novel', rateLimit(60, 60000), (req, res) => {
    try {
      const { novel_id, new_title } = req.body || {};
      if (!novel_id || !new_title || typeof new_title !== 'string') {
        return res.status(400).json({ error: 'novel_id dan new_title wajib disertakan.' });
      }

      const current = readLibraryStorage();
      const updatedNovels = current.novels.map((n) =>
        n.id === novel_id ? { ...n, judul: new_title.trim(), updatedAt: new Date().toISOString() } : n
      );

      const updated = saveLibraryStorage({
        novels: updatedNovels,
      });

      res.json({ status: 'success', data: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah nama novel';
      console.error('Error renaming novel in storage:', msg);
      res.status(500).json({ error: 'Gagal mengubah nama novel di disk server.' });
    }
  });
  // API Route: Save Chapter to Physical Folder
  app.post('/api/save-chapter', rateLimit(60, 60000), (req, res) => {
    try {
      const { folder_path, chapter_number, chapter_title, original_text, translated_text, novel_title, source_lang, target_lang } = req.body;
      const libraryBase = getLibraryStorageDir();
      const cleanNovelTitle = sanitizeFilename(novel_title || 'Novel');
      let targetFolder = path.join(libraryBase, cleanNovelTitle);

      if (folder_path && typeof folder_path === 'string' && !folder_path.startsWith('[')) {
        const safe = resolveSafePath(folder_path, libraryBase);
        if (safe) {
          targetFolder = safe;
        }
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const padNum = String(Number(chapter_number) || 1).padStart(2, '0');
      const safeTitle = sanitizeFilename(chapter_title || 'Bab ' + chapter_number);
      const fileName = `Chapter_${padNum}.md`;
      const filePath = path.join(targetFolder, fileName);

      const divider = '---';
      const mdContent = `# Chapter ${chapter_number}: ${safeTitle}\n\n> **Novel:** ${sanitizeFilename(novel_title || 'Novel')}\n> **Bahasa:** ${source_lang || 'Asli'} -> ${target_lang || 'Target'}\n> **Updated:** ${new Date().toLocaleString()}\n\n${divider}\n\n## Hasil Terjemahan (${target_lang || 'Target'})\n\n${translated_text || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${source_lang || 'Asli'})\n\n${original_text || '*(Kosong)*'}\n`;

      fs.writeFileSync(filePath, mdContent, 'utf-8');
      res.json({ status: 'success', path: filePath });
    } catch (error: any) {
      console.error('Error saving chapter file to disk:', error);
      res.status(500).json({ error: error.message || 'Gagal menyimpan file ke folder lokal.' });
    }
  });

  // API Route: Bulk Export Entire Novel to Local Physical Storage
  app.post('/api/export-novel', rateLimit(30, 60000), (req, res) => {
    try {
      const { novel, chapters, references, glossaries, synopsis, writing_style } = req.body;
      const libraryBase = getLibraryStorageDir();
      const cleanTitle = sanitizeFilename(novel?.judul || 'Novel_' + (novel?.id || Date.now()));

      let targetFolder = path.join(libraryBase, cleanTitle);
      if (novel?.folder_path && typeof novel.folder_path === 'string' && !novel.folder_path.startsWith('[')) {
        const safe = resolveSafePath(novel.folder_path, libraryBase);
        if (safe) {
          targetFolder = safe;
        }
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const metadataFolder = path.join(targetFolder, 'metadata');
      if (!fs.existsSync(metadataFolder)) {
        fs.mkdirSync(metadataFolder, { recursive: true });
      }

      // 1. Write metadata/reference.json
      const refData = {
        novel_title: sanitizeFilename(novel?.judul || 'Novel'),
        source_language: novel?.bahasa_sumber || 'Mandarin',
        target_language: novel?.bahasa_target || 'Indonesia',
        synopsis: synopsis || '',
        writing_style: writing_style || '',
        reference_items: Array.isArray(references) ? references : [],
        updated_at: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(metadataFolder, 'reference.json'), JSON.stringify(refData, null, 2), 'utf-8');

      // 2. Write metadata/glossary.json
      fs.writeFileSync(path.join(metadataFolder, 'glossary.json'), JSON.stringify(glossaries || [], null, 2), 'utf-8');

      // 3. Write all Markdown Chapter files
      const divider = '---';
      if (Array.isArray(chapters)) {
        chapters.forEach((chap) => {
          const padNum = String(Number(chap.nomor_chapter) || 1).padStart(2, '0');
          const fileName = `Chapter_${padNum}.md`;
          const filePath = path.join(targetFolder, fileName);
          const safeTitle = sanitizeFilename(chap.judul_chapter || 'Chapter ' + chap.nomor_chapter);

          const mdContent = `# Chapter ${chap.nomor_chapter}: ${safeTitle}\n\n> **Novel:** ${sanitizeFilename(novel?.judul || 'Novel')}\n> **Status:** ${chap.status_pengerjaan}\n> **Bahasa:** ${novel?.bahasa_sumber || 'Asli'} -> ${novel?.bahasa_target || 'Target'}\n> **Updated:** ${new Date().toLocaleString()}\n\n${divider}\n\n## Hasil Terjemahan (${novel?.bahasa_target || 'Target'})\n\n${chap.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${novel?.bahasa_sumber || 'Asli'})\n\n${chap.teks_asli || '*(Kosong)*'}\n`;

          fs.writeFileSync(filePath, mdContent, 'utf-8');
        });
      }

      res.json({ status: 'success', path: targetFolder, totalChapters: chapters?.length || 0 });
    } catch (error: any) {
      console.error('Error bulk exporting novel to disk:', error);
      res.status(500).json({ error: error.message || 'Gagal mengekstrak novel ke folder lokal.' });
    }
  });

  // API Route: Scan & Import Existing Local Novel Folder
  app.post('/api/import-novel-folder', rateLimit(30, 60000), (req, res) => {
    try {
      const { folder_path } = req.body;
      if (!folder_path || typeof folder_path !== 'string') {
        return res.status(400).json({ error: 'folder_path wajib diisi.' });
      }

      const libraryBase = getLibraryStorageDir();
      const targetFolder = resolveSafePath(folder_path, libraryBase);
      if (!targetFolder) {
        return res.status(400).json({ error: 'Folder berada di luar direktori penyimpanan yang diizinkan (Novel_Library).' });
      }

      if (!fs.existsSync(targetFolder)) {
        return res.status(404).json({ error: `Folder "${folder_path}" tidak ditemukan.` });
      }
      // Read metadata/reference.json & metadata/glossary.json if exists
      const metadataFolder = path.join(targetFolder, 'metadata');
      let referenceJson: any = null;
      let glossaryJson: any[] = [];

      const refPath = path.join(metadataFolder, 'reference.json');
      if (fs.existsSync(refPath)) {
        try {
          referenceJson = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
        } catch (e) {
          console.warn('[import-folder] Failed to parse reference.json:', e);
        }
      }

      const glosPath = path.join(metadataFolder, 'glossary.json');
      if (fs.existsSync(glosPath)) {
        try {
          glossaryJson = JSON.parse(fs.readFileSync(glosPath, 'utf-8'));
        } catch (e) {
          console.warn('[import-folder] Failed to parse glossary.json:', e);
        }
      }

      // Scan directory for Chapter_*.md files or .txt/.md files
      const files = fs.readdirSync(targetFolder);
      const chapters: any[] = [];

      files.forEach((file) => {
        if (file.startsWith('.') || file === 'metadata') return;
        const filePath = path.join(targetFolder, file);
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return;

        if (file.endsWith('.md') || file.endsWith('.txt')) {
          const content = fs.readFileSync(filePath, 'utf-8');

          // Try matching chapter number from filename (e.g. Chapter_01.md or 01.txt)
          const nomorChapter = extractChapterNumber(file) ?? (chapters.length + 1);

          // Parse title and markdown sections if formatted
          let title = file.replace(/\.[^/.]+$/, '');
          const titleLineMatch = content.match(/^#\s*(?:Chapter\s*\d+:\s*)?(.*)$/m);
          if (titleLineMatch && titleLineMatch[1].trim()) {
            title = titleLineMatch[1].trim();
          }

          let originalText = content;
          let translatedText = '';

          // Parse split section format if present
          if (content.includes('## Hasil Terjemahan') || content.includes('## Teks Terjemahan')) {
            const transMatch = content.match(/## (?:Hasil Terjemahan|Teks Terjemahan)\s*\([^)]*\)\s*\n([\s\S]*?)(?=\n---\n|\n## Teks Asli|$)/);
            if (transMatch) {
              translatedText = transMatch[1].trim();
            }
          }

          if (content.includes('## Teks Asli')) {
            const origMatch = content.match(/## Teks Asli\s*\([^)]*\)\s*\n([\s\S]*?)(?=$)/);
            if (origMatch) {
              originalText = origMatch[1].trim();
            }
          }

          chapters.push({
            nomor_chapter: nomorChapter,
            judul_chapter: title,
            teks_asli: originalText,
            teks_terjemahan: translatedText,
            status_pengerjaan: translatedText.trim() ? 'Selesai' : 'Belum',
          });
        }
      });

      // Sort chapters by chapter number
      chapters.sort((a, b) => a.nomor_chapter - b.nomor_chapter);

      const folderName = path.basename(targetFolder);
      const novelTitle = referenceJson?.novel_title || folderName.replace(/_/g, ' ');

      res.json({
        status: 'success',
        folder_path: targetFolder,
        novel_title: novelTitle,
        source_language: referenceJson?.source_language || 'Mandarin',
        target_language: referenceJson?.target_language || 'Indonesia',
        synopsis: referenceJson?.synopsis || '',
        writing_style: referenceJson?.writing_style || '',
        reference_items: referenceJson?.reference_items || [],
        glossaries: Array.isArray(glossaryJson) ? glossaryJson : [],
        chapters,
      });
    } catch (error: any) {
      console.error('Error importing novel folder:', error);
      res.status(500).json({ error: error.message || 'Gagal mengimpor folder novel.' });
    }
  });
  // API Route: Translate Chapter (Phase 1 & 2 Context Assembly & Translation Execution)
  app.post('/api/translate', rateLimit(30, 60000), async (req, res) => {
    try {
      const {
        teks_asli,
        bahasa_sumber,
        bahasa_target,
        nomor_chapter,
        judul_novel,
        reference_data,
        glossary_items,
        custom_instructions,
        ai_config,
      } = req.body;

      if (!teks_asli || !teks_asli.trim()) {
        return res.status(400).json({ error: 'Teks asli tidak boleh kosong.' });
      }
      if (typeof teks_asli === 'string' && teks_asli.length > 200000) {
        return res.status(400).json({ error: 'Teks asli terlalu besar (maks 200.000 karakter).' });
      }

      const config = readConfig();
      const provider = ai_config?.provider || config.default_provider || 'gemini';
      let model = ai_config?.model || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      model = sanitizeModelId(model) || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      // Jangan percaya API key dari client — resolve server-side dari config.json / env (audit #2)
      const apiKeyOverride = provider === 'openrouter' ? (config.openrouter_api_key || process.env.OPENROUTER_API_KEY) : (config.gemini_api_key || process.env.GEMINI_API_KEY);

      // Format Glossary for Injection with Pronoun & Gender Information
      const glossaryPrompt = Array.isArray(glossary_items) && glossary_items.length > 0
        ? glossary_items.map((item: unknown) => {
            const g = item as Record<string, unknown>;
            const genderInfo = g.gender ? `, Gender: ${g.gender} (WAJIB PRONOUN: ${g.gender === 'Male' ? 'he/him/his/himself' : g.gender === 'Female' ? 'she/her/hers/herself' : 'they/them/theirs'})` : '';
            return `- "${g.istilah_asli}" MUST BE TRANSLATED AS "${g.istilah_terjemahan}" [Kategori: ${g.kategori}${genderInfo}${g.konteks ? `, Konteks: ${g.konteks}` : ''}]`;
          }).join('\n')
        : 'Belum ada istilah terdaftar.';
      // Format Reference for Injection (Sinopsis & lore dihapus total dari prompt translasi per owner decision)
      const refStyle = reference_data?.writing_style || 'Gaya penerjemahan novel fiksi standar.';
      const systemInstructionTemplate = getTranslationSystemInstructionTemplate();

      const templateVariables: Record<string, string> = {
        BAHASA_SUMBER: String(bahasa_sumber || 'Asli'),
        BAHASA_TARGET: String(bahasa_target || 'Target'),
      };

      const systemInstruction = renderPromptTemplate(systemInstructionTemplate, templateVariables) + PROMPT_INJECTION_GUARD;

      // User context prompt is securely assembled using makeDataSection delimiters (Step 7)
      const prompt = buildTranslateUserPrompt({
        judul_novel,
        nomor_chapter,
        refStyle,
        glossaryPrompt,
        teks_asli,
        bahasa_sumber,
        bahasa_target,
      });
      let translatedText = '';

      if (provider === 'openrouter') {
        const apiKey = apiKeyOverride;
        if (!apiKey) {
          return res.status(400).json({ error: 'OPENROUTER_API_KEY belum dikonfigurasi. Silakan set API Key OpenRouter di Pengaturan Model.' });
        }
        translatedText = await callOpenRouterWithRetry({
          model,
          apiKey,
          systemInstruction,
          prompt,
        });
      } else {
        translatedText = await callGeminiWithRetryAndFallback({
          model,
          apiKeyOverride,
          systemInstruction,
          prompt,
        });
      }
      let suggestedTitle: string | undefined;

      // Extract generated chapter title if tag [JUDUL_BAB: ...] present
      const titleMatch = translatedText.match(/\[JUDUL_BAB:\s*([^\]]+)\]/i);
      if (titleMatch) {
        suggestedTitle = titleMatch[1].trim();
        translatedText = translatedText.replace(/\[JUDUL_BAB:\s*([^\]]+)\]\s*\n?/i, '').trim();
      }

      return res.json({
        translatedText,
        suggestedTitle,
        promptStats: {
          glossaryCount: Array.isArray(glossary_items) ? glossary_items.length : 0,
          hasReference: Boolean(reference_data?.synopsis || reference_data?.lore_summary),
        },
      });
    } catch (error: any) {
      console.error('Error translating chapter:', error);
      return res.status(500).json({ error: error.message || 'Gagal melakukan translasi.' });
    }
  });

  // API Route: Extract & Sync Glossary (Phase 3 Progression & Auto Extraction)
  app.post('/api/extract-glossary', rateLimit(20, 60000), async (req, res) => {
    try {
      const { teks_asli, teks_terjemahan, nomor_chapter, existing_glossary, reference_data, bahasa_sumber, bahasa_target, ai_config } = req.body;

      if (!teks_asli || !teks_terjemahan) {
        return res.status(400).json({ error: 'Teks asli dan teks terjemahan diperlukan untuk ekstraksi glosarium.' });
      }

      const sourceLang = typeof bahasa_sumber === 'string' && bahasa_sumber.trim() ? bahasa_sumber.trim() : 'Bahasa Asli';
      const targetLang = typeof bahasa_target === 'string' && bahasa_target.trim() ? bahasa_target.trim() : 'Bahasa Target';

      const config = readConfig();
      const provider = ai_config?.provider || config.default_provider || 'gemini';
      let model = ai_config?.model || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      model = sanitizeModelId(model) || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      // API key resolve server-side (audit #2)
      const apiKeyOverride = provider === 'openrouter' ? (config.openrouter_api_key || process.env.OPENROUTER_API_KEY) : (config.gemini_api_key || process.env.GEMINI_API_KEY);

      const formattedExistingGlossary = Array.isArray(existing_glossary) && existing_glossary.length > 0
        ? existing_glossary.map((item: unknown) => {
            if (typeof item === 'string') return `- "${item}"`;
            if (item && typeof item === 'object') {
              const g = item as Record<string, unknown>;
              const genderInfo = g.gender ? `, Gender: ${g.gender}` : '';
              return `- "${g.istilah_asli}" -> "${g.istilah_terjemahan}" [Kategori: ${g.kategori || 'Istilah Khusus'}${genderInfo}${g.konteks ? `, Konteks: ${g.konteks}` : ''}]`;
            }
            return '';
          }).filter(Boolean).join('\n')
        : 'Belum ada istilah terdaftar.';

      const extractSystemInstruction = `Anda adalah asisten ekstraksi glosarium novel dari ${sourceLang} ke ${targetLang} yang mengembalikan JSON valid saja.` + PROMPT_INJECTION_GUARD;

      const prompt = `Analisis teks asli (${sourceLang}) dan teks terjemahan (${targetLang}) dari Chapter ${nomor_chapter} berikut:

[GLOSARIUM RELEVAN YANG SUDAH TERDAFTAR (WAJIB DIIKUTI KONSISTENSINYA)]
${makeDataSection('GLOSARIUM_TERDAFTAR', formattedExistingGlossary)}

[TEKS ASLI (${sourceLang})]
${makeDataSection('TEKS_ASLI', teks_asli.slice(0, 5000))}

[TEKS TERJEMAHAN (${targetLang})]
${makeDataSection('TEKS_TERJEMAHAN', teks_terjemahan.slice(0, 5000))}

Tugas Anda:
Ekstrak semua istilah baru yang penting yang muncul dalam chapter ini dari bahasa sumber (${sourceLang}) ke bahasa target (${targetLang}), meliputi:
1. Nama Karakter (orang, gelar) - WAJIB sertakan gender ("Male" / "Female" / "Neutral") untuk panduan pronoun he/she
2. Nama Tempat / Lokasi / Sekte / Kota / Bangunan
3. Jurus, Teknik, Alam Kultivasi, Sihir, Kemampuan
4. Item Khusus, Senjata, Artefak, Ramuan
5. Istilah Khusus Novel / Lore Unik

ATURAN KONSISTENSI & LARANGAN:
1. KONSISTENSI KATA TURUNAN / NAMA KELUARGA / IBU-ANAK:
   Jika menemukan istilah/nama baru yang mengandung kata atau nama keluarga yang sudah terdaftar di Glosarium di atas (contoh: glosarium memiliki "ルカリム" -> "Lukalim", dan di bab ini muncul nama karakter "エルストラ・コーズ・ルカリム"), Anda WAJIB menggunakan ejaan baku yang sudah terdaftar ("Lukalim" -> "Elstra Coz Lukalim"). DILARANG KERAS membuat variasi ejaan baru (seperti "Lucalym")!
2. DILARANG mengekstrak ulang istilah yang sudah terdaftar di Glosarium di atas.
3. DILARANG mengekstrak kalimat dialog biasa, seruan, mantra panjang utuh, atau kata benda umum sehari-hari (seperti "buku", "tas", "pakaian"). HANYA ekstrak nama entitas dan istilah khusus yang berharga.
4. 'istilah_asli' HARUS berupa kata/frasa dalam bahasa sumber (${sourceLang}).
5. 'istilah_terjemahan' HARUS berupa padanan/terjemahan resmi dalam bahasa target (${targetLang}), BUKAN bahasa lain.
6. Jika kategori adalah "Nama", tentukan 'gender' ("Male" untuk pria, "Female" untuk wanita, "Neutral" untuk lainnya) untuk memastikan konsistensi pronoun bahasa Inggris (he vs she).
7. 'konteks' berupa catatan singkat dalam bahasa target (${targetLang}).

Kembalikan respon DALAM FORMAT JSON SAJA dengan skema:
{
  "terms": [
    {
      "istilah_asli": "istilah dalam bahasa sumber (${sourceLang})",
      "istilah_terjemahan": "terjemahan resmi dalam bahasa target (${targetLang})",
      "kategori": "Nama" | "Tempat" | "Jurus/Sekte" | "Item" | "Istilah Khusus",
      "gender": "Male" | "Female" | "Neutral" (Wajib jika kategori "Nama"),
      "konteks": "penjelasan singkat penggunaan dalam bahasa ${targetLang}"
    }
  ]
}
HANYA ekstrak istilah yang penting dan benar-benar berguna untuk konsistensi bab selanjutnya.`;
      let parsed: { terms: any[] } = { terms: [] };

      if (provider === 'openrouter') {
        const apiKey = apiKeyOverride;
        if (!apiKey) {
          return res.status(400).json({ error: 'OPENROUTER_API_KEY belum dikonfigurasi. Silakan set API Key OpenRouter di Pengaturan Model.' });
        }
        const jsonText = await callOpenRouterWithRetry({
          model,
          apiKey,
          systemInstruction: extractSystemInstruction,
          prompt,
          jsonOutput: true,
        });
        try {
          parsed = cleanJsonString<{ terms: any[] }>(jsonText);
        } catch (e) {
          return res.status(502).json({
            error: 'LLM mengembalikan JSON yang tidak valid. Coba lagi atau kurangi panjang bab.',
            detail: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          });
        }
      } else {
        const jsonText = await callGeminiWithRetryAndFallback({
          model,
          apiKeyOverride,
          systemInstruction: extractSystemInstruction,
          prompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              terms: {
                type: Type.ARRAY,
                description: `Daftar istilah baru yang diekstrak dari chapter dari ${sourceLang} ke ${targetLang}.`,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    istilah_asli: {
                      type: Type.STRING,
                      description: `Nama/istilah dalam bahasa sumber asli (${sourceLang})`,
                    },
                    istilah_terjemahan: {
                      type: Type.STRING,
                      description: `Terjemahan resmi istilah tersebut dalam bahasa target (${targetLang})`,
                    },
                    kategori: {
                      type: Type.STRING,
                      description: 'Kategori istilah: "Nama", "Tempat", "Jurus/Sekte", "Item", atau "Istilah Khusus"',
                    },
                    gender: {
                      type: Type.STRING,
                      description: 'Gender karakter jika kategori "Nama": "Male", "Female", atau "Neutral" (untuk panduan pronoun he/she dalam bahasa Inggris)',
                    },
                    konteks: {
                      type: Type.STRING,
                      description: `Penjelasan/konteks penggunaan singkat dalam bahasa ${targetLang}.`,
                    },
                  },
                  required: ['istilah_asli', 'istilah_terjemahan', 'kategori'],
                },
              },
            },
            required: ['terms'],
          },
        });
        try {
          parsed = cleanJsonString<{ terms: any[] }>(jsonText);
        } catch (e) {
          return res.status(502).json({
            error: 'LLM mengembalikan JSON yang tidak valid. Coba lagi atau kurangi panjang bab.',
            detail: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          });
        }
      }

      return res.json({
        terms: parsed.terms || [],
      });
    } catch (error: any) {
      console.error('Error extracting glossary:', error);
      return res.status(500).json({ error: error.message || 'Gagal mengekstrak glosarium otomatis.' });
    }
  });

  // Vite Development / Production Middleware
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`[Novel Translator Server] Listening on http://${HOST}:${PORT}`);
    if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
      console.log(`[Novel Translator Server] Network address: http://${HOST}:${PORT}`);
    }
  });
}

startServer();
