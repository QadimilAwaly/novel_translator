import { Novel, Chapter, ReferenceItem, GlossaryItem } from '../types';

// In-memory handle cache for active session
const dirHandles = new Map<string, FileSystemDirectoryHandle>();

export function setNovelDirHandle(novelId: string, handle: FileSystemDirectoryHandle) {
  dirHandles.set(novelId, handle);
}

export function getNovelDirHandle(novelId: string): FileSystemDirectoryHandle | undefined {
  return dirHandles.get(novelId);
}

export async function requestFolderPicker(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const picker = (window as unknown as { showDirectoryPicker: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
      const handle = await picker({ mode: 'readwrite' });
      return handle;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error?.name !== 'AbortError') {
        console.error('Error selecting folder:', err);
        alert(`Gagal membuka folder picker: ${error?.message || 'Terjadi kesalahan'}`);
      }
    }
  } else {
    alert('Browser Anda tidak mendukung File System Access API (showDirectoryPicker). Silakan gunakan browser Chrome / Edge versi desktop.');
  }
  return null;
}

export async function saveNovelToLocalFS(
  novel: Novel,
  chapters: Chapter[],
  references: ReferenceItem[],
  glossaries: GlossaryItem[],
  synopsisText: string = '',
  writingStyleText: string = '',
  customHandle?: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const handle = customHandle || getNovelDirHandle(novel.id);
    if (!handle) return false;

    // Verify permission if needed
    if ((handle as any).requestPermission) {
      const status = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (status !== 'granted') {
        const req = await (handle as any).requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') return false;
      }
    }

    // Create / get metadata folder
    const metadataDir = await handle.getDirectoryHandle('metadata', { create: true });

    // 1. Write metadata/reference.json
    const referenceData = {
      novel_title: novel.judul,
      source_language: novel.bahasa_sumber,
      target_language: novel.bahasa_target,
      synopsis: synopsisText,
      writing_style: writingStyleText,
      reference_items: references.map((r) => ({
        kategori: r.kategori,
        nama_item: r.nama_item,
        deskripsi: r.deskripsi,
      })),
      updated_at: new Date().toISOString(),
    };

    const refFileHandle = await metadataDir.getFileHandle('reference.json', { create: true });
    const refWritable = await (refFileHandle as any).createWritable();
    await refWritable.write(JSON.stringify(referenceData, null, 2));
    await refWritable.close();

    // 2. Write metadata/glossary.json
    const glossaryData = glossaries.map((g) => ({
      istilah_asli: g.istilah_asli,
      istilah_terjemahan: g.istilah_terjemahan,
      kategori: g.kategori,
      chapter_ditemukan: g.chapter_ditemukan || 'Manual',
      konteks: g.konteks || '',
    }));

    const glosFileHandle = await metadataDir.getFileHandle('glossary.json', { create: true });
    const glosWritable = await (glosFileHandle as any).createWritable();
    await glosWritable.write(JSON.stringify(glossaryData, null, 2));
    await glosWritable.close();

    // 3. Write Chapter markdown files
    for (const chap of chapters) {
      const padNum = String(chap.nomor_chapter).padStart(2, '0');
      const fileName = `Chapter_${padNum}.md`;

      const divider = '---';
      const mdContent = `# Chapter ${chap.nomor_chapter}: ${chap.judul_chapter}\n\n> **Novel:** ${novel.judul}\n> **Status:** ${chap.status_pengerjaan}\n> **Bahasa:** ${novel.bahasa_sumber} -> ${novel.bahasa_target}\n\n${divider}\n\n## Hasil Terjemahan (${novel.bahasa_target})\n\n${chap.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${novel.bahasa_sumber})\n\n${chap.teks_asli || '*(Belum ada teks asli)*'}\n`;
      const chapFileHandle = await handle.getFileHandle(fileName, { create: true });
      const chapWritable = await (chapFileHandle as any).createWritable();
      await chapWritable.write(mdContent);
      await chapWritable.close();
    }

    return true;
  } catch (err) {
    console.error('Failed auto-saving to local directory:', err);
    return false;
  }
}
