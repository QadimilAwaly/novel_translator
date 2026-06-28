# Novel Translator & Compiler 📚🤖

Sebuah aplikasi penerjemah dan kompilator e-book (EPUB) canggih bertenaga AI (Google Gemini). Aplikasi ini didesain khusus untuk para penerjemah web novel, memungkinkan proses translasi beribu-ribu kata menjadi sangat mudah dengan tetap menjaga konsistensi nama karakter dan istilah di setiap *chapter*.

---

## 🌟 Fungsi Utama

1. **Penerjemahan AI Kontekstual yang Natural**  
   Menerjemahkan novel bahasa asing (Korea, Jepang, China, dll) ke berbagai bahasa target dengan gaya bahasa luwes bak penerjemah manusia, menggunakan model Google Gemini API terbaru.

2. **Manajemen Referensi (Glosarium) Otomatis**  
   Mengingat nama karakter, tempat, dan jurus sihir. Aplikasi otomatis mendeteksi karakter baru dan merekomendasikan penulisannya. Di *chapter* berikutnya, AI dipaksa memakai nama yang sama sehingga tidak ada lagi masalah "nama tokoh berubah-ubah".

3. **Injeksi Token Super Efisien (Smart Filter)**  
   Hanya menyuntikkan referensi karakter yang **benar-benar muncul** di dalam teks sumber ke dalam *prompt* AI. Hal ini menghemat ribuan kuota token API dan mencegah AI mengalami kebingungan (*hallucination*).

4. **Kompilator EPUB Bawaan (Novel Compiler)**  
   Gabungkan ratusan *chapter* berformat `.txt` menjadi sebuah file E-book `.epub` standar secara instan. Fitur ini otomatis membuat Daftar Isi (TOC), mengurutkan bab dengan cerdas (*natural sorting*), dan dapat disisipkan gambar *cover*.

5. **Penyimpanan Terstruktur**  
   Otomatis membuat dan menata *folder* penyimpanan berdasarkan judul novel, serta memberikan penomoran bab secara berurutan.

---

## 🚀 Keunggulan Aplikasi

* **📱 Dukungan Penuh Termux (Android)**  
  Aplikasi ini tidak bergantung pada SDK resmi bawaan Google yang sulit di-install di HP. Sistem telah ditulis ulang menggunakan HTTP REST murni, sehingga 100% berjalan mulus di dalam Termux Android tanpa kendala kompilasi C++!
* **🖥️ Dual Antarmuka (Web UI & Desktop GUI)**  
  Tersedia tampilan Web modern yang responsif (berbasis Flask & Bootstrap 5) untuk digunakan via *browser*, serta aplikasi Desktop klasik (Tkinter) sebagai cadangan. Tab "Translator" dan "Compiler" kini tergabung mulus di antarmuka Web.
* **⚡ Ringan dan Cepat**  
  Proses terjemahan *chapter* panjang dapat dikerjakan di latar belakang (*async job*) tanpa membuat antarmuka macet (*freeze*).
* **🧠 Bebas Pilih Prompt & Model AI**  
  Pengguna bebas memilih dari daftar Model Gemini yang tersedia (`gemini-2.5-flash`, `gemini-2.0-flash`, dll) dan gaya *prompt* translasi sesuai *genre* novel (Action, Romance, Sci-Fi).
* **🛡️ Bebas Filter Kasar**  
  Pengaturan bawaan mematikan ambang batas sensor API (*Harassment, Hate Speech, Sexually Explicit, Dangerous Content* diubah ke `BLOCK_NONE`), sehingga adegan pertarungan, darah, atau kata makian dalam novel fiksi tidak ditolak oleh AI.

---

## ⚙️ Arsitektur Sistem

Aplikasi ini menggunakan pola arsitektur **Model-View-Controller (MVC)** yang bersih:

```mermaid
graph TD
    Main[main.py Entrypoint] -->|CLI Flag: --web| WebApp[web_app.py Flask Web UI]
    Main -->|Default| DesktopGUI[views/main_view.py Tkinter GUI]
    
    WebApp --> Controller[controllers/main_controller.py / Routes]
    DesktopGUI --> Controller
    
    Controller --> ConfigService[config.py Config Loader]
    Controller --> TransService[services/translation_service.py (REST API Gemini)]
    Controller --> RefService[services/reference_service.py]
    Controller --> ExportService[services/export_service.py (EPUB & TXT)]
```

---

## 🛠️ Instalasi & Persiapan

### 1. Persyaratan Pustaka (Dependencies)
Pastikan Anda sudah menginstal Python. Kemudian, install modul yang dibutuhkan menggunakan pip:
```bash
pip install -r requirements.txt
```
*(Atau jalankan secara manual: `pip install flask ebooklib beautifulsoup4 lxml`)*

### 2. Konfigurasi API Key
Anda membutuhkan **Google Gemini API Key**. 
Buat file teks bernama `api_key.txt` di dalam folder root aplikasi ini, lalu paste API Key Anda di dalamnya:
```text
AIzaSy...
```
*(Alternatif: Anda juga bisa menyimpannya di variabel lingkungan OS / Environment Variables dengan nama `GEMINI_API_KEY`).*

---

## 💻 Cara Menjalankan Aplikasi

Aplikasi utama dijalankan melalui `main.py`.

### 1. Menggunakan Web UI (Disarankan)
Buka terminal/CMD/Termux dan jalankan perintah berikut:
```bash
python main.py --web
```
Setelah berjalan, buka _browser_ Anda di alamat `http://127.0.0.1:5000`. 
Di sinilah Anda bisa mengakses panel Translator maupun Compiler secara terpadu.

### 2. Menggunakan Desktop GUI (Tkinter)
Jika Anda menggunakan PC/Laptop dan menyukai tampilan native desktop klasik, cukup jalankan:
```bash
python main.py
```

### 3. Menjalankan Novel Compiler (Standalone Backup)
Bila Anda hanya ingin menggabungkan `.txt` menjadi EPUB tanpa membuka fitur translasi, Anda bisa menjalankan *file* mandirinya:
```bash
python "Novel Compiler.py"
```
