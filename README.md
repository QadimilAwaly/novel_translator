<div align="center">

# Novel Translator Pro

</div>

Penerjemah novel AI kontekstual dengan alur memori otomatis, manajemen glosarium dinamis, dan ekspor struktur folder fisik.

## Run Locally

**Prerequisites:** Node.js (runtime diuji dengan Bun)

1. Install dependencies:
   `npm install`
2. Salin `.env.example` menjadi `.env.local`, lalu set `GEMINI_API_KEY` (atau `OPENROUTER_API_KEY`)
3. Jalankan app:
   `npm run dev`

## Fitur Utama

- Penerjemahan bab per bab dengan AI (Gemini / OpenRouter)
- Glosarium dinamis per novel
- Reference context (sinopsis, gaya bahasa, lore)
- Ekspor / re-ekstrak novel ke folder fisik lokal
- Mode offline-first (client-side storage fallback)
