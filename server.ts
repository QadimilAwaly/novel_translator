import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Sleep helper
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
      'HTTP-Referer': 'https://ai.studio',
      'X-Title': 'Novel Translator AI',
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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

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

  // Helper: Clean JSON string
  const cleanJsonString = (str: string) => {
    let cleaned = str.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    return cleaned.trim();
  };

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
    } catch (e) {}
    return def;
  };

  // API Route: Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Route: Get App Config
  app.get('/api/config', (req, res) => {
    res.json(readConfig());
  });

  // API Route: Update App Config
  app.post('/api/config', (req, res) => {
    try {
      const current = readConfig();
      const updated = { ...current, ...req.body };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
      res.json({ status: 'success', config: updated });
    } catch (error: any) {
      console.error('Error saving config.json:', error);
      res.status(500).json({ error: 'Gagal menyimpan config.json' });
    }
  });
  // API Route: Save Chapter to Physical Folder
  app.post('/api/save-chapter', (req, res) => {
    try {
      const { folder_path, chapter_number, chapter_title, original_text, translated_text, novel_title, source_lang, target_lang } = req.body;
      const config = readConfig();

      let targetFolder = folder_path || config.global_storage_path;
      if (!path.isAbsolute(targetFolder)) {
        targetFolder = path.join(process.cwd(), targetFolder);
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const padNum = String(chapter_number || 1).padStart(2, '0');
      const fileName = `Chapter_${padNum}.md`;
      const filePath = path.join(targetFolder, fileName);

      const divider = '---';
      const mdContent = `# Chapter ${chapter_number}: ${chapter_title || 'Bab ' + chapter_number}\n\n> **Novel:** ${novel_title || 'Novel'}\n> **Bahasa:** ${source_lang || 'Asli'} -> ${target_lang || 'Target'}\n> **Updated:** ${new Date().toLocaleString()}\n\n${divider}\n\n## Hasil Terjemahan (${target_lang || 'Target'})\n\n${translated_text || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${source_lang || 'Asli'})\n\n${original_text || '*(Kosong)*'}\n`;

      fs.writeFileSync(filePath, mdContent, 'utf-8');
      res.json({ status: 'success', path: filePath });
    } catch (error: any) {
      console.error('Error saving chapter file to disk:', error);
      res.status(500).json({ error: error.message || 'Gagal menyimpan file ke folder lokal.' });
    }
  });
  // API Route: Bulk Export Entire Novel to Local Physical Storage
  app.post('/api/export-novel', (req, res) => {
    try {
      const { novel, chapters, references, glossaries, synopsis, writing_style } = req.body;
      const config = readConfig();

      let targetFolder = novel?.folder_path || config.global_storage_path;
      if (!path.isAbsolute(targetFolder)) {
        targetFolder = path.join(process.cwd(), targetFolder);
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
        novel_title: novel?.judul || 'Novel',
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
          const padNum = String(chap.nomor_chapter || 1).padStart(2, '0');
          const fileName = `Chapter_${padNum}.md`;
          const filePath = path.join(targetFolder, fileName);

          const mdContent = `# Chapter ${chap.nomor_chapter}: ${chap.judul_chapter}\n\n> **Novel:** ${novel?.judul || 'Novel'}\n> **Status:** ${chap.status_pengerjaan}\n> **Bahasa:** ${novel?.bahasa_sumber || 'Asli'} -> ${novel?.bahasa_target || 'Target'}\n> **Updated:** ${new Date().toLocaleString()}\n\n${divider}\n\n## Hasil Terjemahan (${novel?.bahasa_target || 'Target'})\n\n${chap.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${novel?.bahasa_sumber || 'Asli'})\n\n${chap.teks_asli || '*(Kosong)*'}\n`;

          fs.writeFileSync(filePath, mdContent, 'utf-8');
        });
      }

      res.json({ status: 'success', path: targetFolder, totalChapters: chapters?.length || 0 });
    } catch (error: any) {
      console.error('Error bulk exporting novel to disk:', error);
      res.status(500).json({ error: error.message || 'Gagal mengekstrak novel ke folder lokal.' });
    }
  });
  // API Route: Translate Chapter (Phase 1 & 2 Context Assembly & Translation Execution)
  app.post('/api/translate', async (req, res) => {
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

      const provider = ai_config?.provider || 'gemini';
      const model = ai_config?.model || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      const apiKeyOverride = ai_config?.apiKey;

      // Format Glossary for Injection
      const glossaryPrompt = Array.isArray(glossary_items) && glossary_items.length > 0
        ? glossary_items.map((g) => `- "${g.istilah_asli}" MUST BE TRANSLATED AS "${g.istilah_terjemahan}" [Kategori: ${g.kategori}${g.konteks ? `, Konteks: ${g.konteks}` : ''}]`).join('\n')
        : 'Belum ada istilah terdaftar.';

      // Format Reference & Lore for Injection
      const refSynopsis = reference_data?.synopsis || 'Tidak ada sinopsis.';
      const refStyle = reference_data?.writing_style || 'Gaya penerjemahan novel fiksi standar.';
      const refLore = reference_data?.lore_summary || 'Tidak ada catatan lore tambahan.';

      const systemInstruction = `Anda adalah seorang penerjemah novel profesional berpengalaman tinggi dari bahasa ${bahasa_sumber} ke ${bahasa_target}.
Tugas Anda adalah menerjemahkan bab novel berikut secara akurat, alami, puitis jika diperlukan, dan mempertahankan aliran emosi cerita tanpa memotong paragraf atau menghilangkan detail penting.

ATURAN WAJIB penerjemahan:
1. HARUS mematuhi Glosarium Terikat di bawah ini secara konsisten. Jangan mengubah istilah yang sudah ditetapkan di Glosarium.
2. HARUS menyelaraskan gaya bahasa dan nada cerita dengan Panduan Gaya & Lore yang diberikan.
3. Pertahankan tata letak paragraf asli dan pemisah antar dialog.
4. Baris pertama dari hasil terjemahan HARUS diawali dengan tag [JUDUL_BAB: Judul Bab Yang Menarik Dalam Bahasa ${bahasa_target}] jika diminta atau jika judul bab belum spesifik, kemudian ikuti dengan teks terjemahan selengkapnya.
5. Jangan tambahkan komentar meta, pendahuluan, atau catatan kaki dari penerjemah. HANYA hasilkan teks terjemahan novel langsung.
${custom_instructions ? `6. Instruksi Tambahan Pengguna: ${custom_instructions}` : ''}`;
      const prompt = `[JUDUL NOVEL]
${judul_novel || 'Novel'} - Chapter ${nomor_chapter || 1}

[PANDUAN REFERENSI & TONE]
- Sinopsis / Gambaran Cerita: ${refSynopsis}
- Gaya Bahasa & Nada: ${refStyle}
- Detail Lore & Karakter: ${refLore}

[GLOSARIUM TERIKAT (PILIHAN ISTILAH MANDATORI)]
${glossaryPrompt}

[TEKS ASLI CHAPTER (${bahasa_sumber})]
${teks_asli}

Terjemahkan teks di atas ke ${bahasa_target} sesuai aturan dan glosarium di atas:`;

      let translatedText = '';

      if (provider === 'openrouter') {
        const apiKey = apiKeyOverride || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ error: 'OPENROUTER_API_KEY belum dikonfigurasi. Silakan masukkan API Key OpenRouter Anda di Pengaturan Model.' });
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
  app.post('/api/extract-glossary', async (req, res) => {
    try {
      const { teks_asli, teks_terjemahan, nomor_chapter, existing_glossary, ai_config } = req.body;

      if (!teks_asli || !teks_terjemahan) {
        return res.status(400).json({ error: 'Teks asli dan teks terjemahan diperlukan untuk ekstraksi glosarium.' });
      }

      const provider = ai_config?.provider || 'gemini';
      const model = ai_config?.model || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gemini-2.5-flash');
      const apiKeyOverride = ai_config?.apiKey;

      const existingTermsList = Array.isArray(existing_glossary) ? existing_glossary.join(', ') : 'Belum ada';

      const prompt = `Analisis teks asli dan teks terjemahan dari Chapter ${nomor_chapter} berikut:

[TEKS ASLI]
${teks_asli.slice(0, 4000)}

[TEKS TERJEMAHAN]
${teks_terjemahan.slice(0, 4000)}

[ISTILAH YANG SUDAH ADA DILANJUTKAN (ABAIKAN KECUALI PERLU DIPERBARUI)]
${existingTermsList}

Tugas Anda:
Ekstrak semua istilah baru yang penting yang muncul dalam chapter ini, meliputi:
1. Nama Karakter (orang, gelar)
2. Nama Tempat / Lokasi / Sekte / Kota / Bangunan
3. Jurus, Teknik, Alam Kultivasi, Sihir, Kemampuan
4. Item Khusus, Senjata, Artefak, Ramuan
5. Istilah Khusus Novel / Lore Unik

Kembalikan respon DALAM FORMAT JSON SAJA dengan skema:
{
  "terms": [
    {
      "istilah_asli": "istilah dalam bahasa sumber",
      "istilah_terjemahan": "terjemahan resmi dalam bahasa target",
      "kategori": "Nama" | "Tempat" | "Jurus/Sekte" | "Item" | "Istilah Khusus",
      "konteks": "penjelasan singkat penggunaan"
    }
  ]
}

HANYA ekstrak istilah yang penting dan benar-benar berguna untuk konsistensi bab selanjutnya.`;

      let parsed = { terms: [] };

      if (provider === 'openrouter') {
        const apiKey = apiKeyOverride || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ error: 'OPENROUTER_API_KEY belum dikonfigurasi. Silakan masukkan API Key OpenRouter Anda di Pengaturan Model.' });
        }
        const jsonText = await callOpenRouterWithRetry({
          model,
          apiKey,
          systemInstruction: 'Anda adalah asisten ekstraksi glosarium novel yang mengembalikan JSON valid saja.',
          prompt,
          jsonOutput: true,
        });
        const cleaned = cleanJsonString(jsonText);
        parsed = JSON.parse(cleaned);
      } else {
        const jsonText = await callGeminiWithRetryAndFallback({
          model,
          apiKeyOverride,
          prompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              terms: {
                type: Type.ARRAY,
                description: 'Daftar istilah baru yang diekstrak dari chapter.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    istilah_asli: {
                      type: Type.STRING,
                      description: 'Nama/istilah dalam bahasa sumber asli (misal: "Lin Feng", "Azure Dragon Sect", "Spatial Ring")',
                    },
                    istilah_terjemahan: {
                      type: Type.STRING,
                      description: 'Terjemahan resmi istilah tersebut dalam bahasa target (misal: "Lin Feng", "Sekte Naga Biru", "Cincin Spasial")',
                    },
                    kategori: {
                      type: Type.STRING,
                      description: 'Kategori istilah: "Nama", "Tempat", "Jurus/Sekte", "Item", atau "Istilah Khusus"',
                    },
                    konteks: {
                      type: Type.STRING,
                      description: 'Penjelasan/konteks penggunaan singkat dalam cerita.',
                    },
                  },
                  required: ['istilah_asli', 'istilah_terjemahan', 'kategori'],
                },
              },
            },
            required: ['terms'],
          },
        });
        const cleaned = cleanJsonString(jsonText);
        parsed = JSON.parse(cleaned);
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
  if (process.env.NODE_ENV !== 'production') {
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Novel Translator Server] Listening on http://localhost:${PORT}`);
  });
}

startServer();
