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

## Menjalankan di Android (Termux)

Aplikasi ini dapat dijalankan langsung di Android menggunakan **Termux**. Ikuti panduan langkah demi langkah berikut:

### 1. Persiapan Termux
Buka aplikasi Termux, lalu instal paket yang diperlukan:
```bash
# Update repository Termux
pkg update && pkg upgrade -y

# Instal Node.js, git, dan esbuild native
pkg install nodejs-lts git esbuild -y

# Mencegah Android mem-pause proses saat Termux di background
termux-wake-lock
```

### 2. Atur Environment Binary esbuild
Agar `esbuild` dapat berjalan di lingkungan Android Bionic libc:
```bash
export ESBUILD_BINARY_PATH=$(which esbuild)
```
*(Opsional: tambahkan perintah di atas ke `~/.bashrc` agar otomatis aktif setiap membuka Termux)*

### 3. Setup Project & Dependencies
```bash
cd aplikasi-translator-novel
npm install
cp .env.example .env.local
# Edit .env.local dan isi API Key Anda (misal: nano .env.local)
```

### 4. Menjalankan Server
> **Rekomendasi Terbaik untuk Termux:** Gunakan **Mode Production** (`npm run build && npm start`). Mode ini hanya memakan ~35MB RAM (dibandingkan ~400MB pada dev mode) dan bebas dari crash Android Low Memory Killer (LMK).

```bash
# Build aplikasi sekali:
npm run build

# Jalankan server:
npm start
```

### 5. Membuka di Browser
- Buka browser di HP Anda (Chrome/Kiwi/Firefox), lalu akses: **`http://localhost:3131`**
- Jika ingin diakses dari perangkat lain (laptop/tablet di Wi-Fi yang sama), jalankan dengan:
  ```bash
  HOST=0.0.0.0 npm start
  ```
  Lalu buka `http://<IP-HP-ANDA>:3131` dari browser perangkat lain.

### Catatan Khusus Android / Termux:
- **Penyimpanan Novel / Ekspor**: Karena browser mobile tidak mendukung File System Access API (`showDirectoryPicker`), gunakan tombol **"Ekspor ZIP"** di aplikasi. File `.zip` akan langsung masuk ke folder *Download* ponsel dan siap dibuka dengan aplikasi pembaca novel (Moon+ Reader, dll).
- **Pengaturan Baterai**: Pastikan aplikasi Termux diset ke *Baterai: Tidak Dibatasi (Unrestricted)* di pengaturan sistem Android agar server tidak dimatikan saat layar mati.

## Fitur Utama

- Penerjemahan bab per bab dengan AI (Gemini / OpenRouter)
- Glosarium dinamis per novel
- Reference context (sinopsis, gaya bahasa, lore)
- Ekspor / re-ekstrak novel ke folder fisik lokal
- Mode offline-first (client-side storage fallback)
