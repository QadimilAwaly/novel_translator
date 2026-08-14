import JSZip from 'jszip';
import { Novel, Chapter, ReferenceItem, GlossaryItem } from '../types';

export async function exportNovelAsFolderZip(
  novel: Novel,
  chapters: Chapter[],
  references: ReferenceItem[],
  glossaries: GlossaryItem[],
  synopsisText: string = '',
  writingStyleText: string = ''
) {
  const zip = new JSZip();

  // Clean folder name from novel title
  const cleanTitle = novel.judul
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');

  const rootFolder = zip.folder(cleanTitle) || zip;
  const metadataFolder = rootFolder.folder('metadata') || rootFolder;

  // 1. Build reference.json
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
    exported_at: new Date().toISOString(),
  };

  metadataFolder.file('reference.json', JSON.stringify(referenceData, null, 2));

  // 2. Build glossary.json
  const glossaryData = glossaries.map((g) => ({
    istilah_asli: g.istilah_asli,
    istilah_terjemahan: g.istilah_terjemahan,
    kategori: g.kategori,
    chapter_ditemukan: g.chapter_ditemukan || 'Manual',
    konteks: g.konteks || '',
  }));

  metadataFolder.file('glossary.json', JSON.stringify(glossaryData, null, 2));

  // 3. Build Markdown chapters (Chapter_01.md, Chapter_02.md, etc.)
  chapters.forEach((chap) => {
    const padNum = String(chap.nomor_chapter).padStart(2, '0');
    const fileName = `Chapter_${padNum}.md`;
    const divider = '---';
    const mdContent = `# Chapter ${chap.nomor_chapter}: ${chap.judul_chapter}\n\n> **Novel:** ${novel.judul}\n> **Status:** ${chap.status_pengerjaan}\n> **Bahasa:** ${novel.bahasa_sumber} -> ${novel.bahasa_target}\n\n${divider}\n\n## Hasil Terjemahan (${novel.bahasa_target})\n\n${chap.teks_terjemahan || '*(Belum diterjemahkan)*'}\n\n${divider}\n\n## Teks Asli (${novel.bahasa_sumber})\n\n${chap.teks_asli || '*(Belum ada teks asli)*'}\n`;
    rootFolder.file(fileName, mdContent);
  });

  // Generate ZIP and trigger browser download
  const content = await zip.generateAsync({ type: 'blob' });
  const downloadUrl = URL.createObjectURL(content);

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `${cleanTitle}_PhysicalLibrary.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}
