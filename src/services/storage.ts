import { Novel, Chapter, ReferenceItem, GlossaryItem, NovelReferenceData } from '../types';
import { authHeaders } from './api';

const NOVELS_KEY = 'novel_translator_novels_v1';
const CHAPTERS_KEY = 'novel_translator_chapters_v1';
const REFERENCES_KEY = 'novel_translator_references_v1';
const GLOSSARIES_KEY = 'novel_translator_glossaries_v1';

// Seed Initial Sample Novels if localStorage is empty
export const initialNovels: Novel[] = [
  {
    id: 'novel-1',
    judul: 'Penakluk Tujuh Langit (Sovereign of Seven Heavens)',
    folder_path: '/Novel_Library/Penakluk_Tujuh_Langit',
    bahasa_sumber: 'Mandarin',
    bahasa_target: 'Indonesia',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'novel-2',
    judul: 'Sang Alkemis Bayangan (The Shadow Alchemist)',
    folder_path: '/Novel_Library/Sang_Alkemis_Bayangan',
    bahasa_sumber: 'Inggris',
    bahasa_target: 'Indonesia',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

export const initialChapters: Chapter[] = [
  {
    id: 'chap-1-1',
    novel_id: 'novel-1',
    nomor_chapter: 1,
    judul_chapter: 'Pemuda dari Sekte Naga Biru',
    teks_asli: `林枫坐在云雾缭绕的山峰之巅，缓缓睁开双眼。

他手中的古朴戒指散发着微弱的淡蓝色光芒。这枚戒指是他从荒古废墟中偶然得来的，其中隐藏着惊天的秘密。

“三年了……” 林枫自言自语道，“我在这个世界修炼了三年，终于踏入了凝气境第九重！”

就在此时，一道冰冷的声音打破了山顶的宁静。

“林枫！宗门大比即将开始，你这废柴还不快快下山接收审判！”

来人正是青龙宗的外门执事张狂。张狂面带不屑，全身散发着基础筑基期的威压。

林枫缓缓站起身来，嘴角微扬。在天劫临世之前，谁是真正的废柴，还未可知！`,
    teks_terjemahan: `Lin Feng duduk di puncak gunung yang diselimuti kabut tebal, perlahan membuka kedua matanya.

Cincin kuno di tangannya memancarkan cahaya biru muda yang samar. Cincin ini dia dapatkan secara tidak sengaja dari Reruntuhan Kuno, dan di dalamnya tersembunyi rahasia yang mengejutkan langit.

"Sudah tiga tahun..." Lin Feng bergumam pada dirinya sendiri, "Aku telah berkultivasi di dunia ini selama tiga tahun, dan akhirnya berhasil menginjakkan kaki di Tingkat Sembilan Alam Kondensasi Qi!"

Tepat pada saat ini, sebuah suara dingin memecah keheningan puncak gunung.

"Lin Feng! Kompetisi Besar Sekte akan segera dimulai, kenapa sampah seperti dirimu belum juga turun gunung untuk menerima penghakiman!"

Orang yang datang tidak lain adalah Zhang Kuang, seorang Diaken Luar dari Sekte Naga Biru. Zhang Kuang menunjukkan rasa jijik di wajahnya, dan seluruh tubuhnya memancarkan tekanan dari Alam Pendirian Fondasi awal.

Lin Feng berdiri perlahan, sudut bibirnya sedikit terangkat. Sebelum Bencana Surgawi datang menimpa dunia, siapa yang sebenarnya sampah, masih belum bisa dipastikan!`,
    status_pengerjaan: 'Selesai',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'chap-1-2',
    novel_id: 'novel-1',
    nomor_chapter: 2,
    judul_chapter: 'Ujian di Arena Pertarungan',
    teks_asli: `演武场上，人声鼎沸。数千名青龙宗外门弟子聚在一起，等待着大比的开始。

张狂冷笑着走到主擂台上，居高临下地俯视着林枫。

“林枫，你若能在我的三招之下不死，我便保你留在外门！”

林枫面无表情，握紧了双拳。他心念一动，体内储存的灵气疯狂运转，储物戒中的灵剑嗡嗡作响。

“你区区外门执事，也敢在我面前狂妄？”林枫沉声道。

全场哗然！没有人想到，平日里默不作声的废柴林枫，竟敢直面筑基期的张狂！`,
    teks_terjemahan: `Di lapangan seni beladiri, suara riuh manusia terdengar sangat bising. Ribuan murid luar Sekte Naga Biru berkumpul bersama, menantikan dimulainya Kompetisi Besar.

Zhang Kuang tersenyum dingin dan berjalan ke panggung utama, menatap Lin Feng dari tempat yang lebih tinggi dengan penuh kesombongan.

"Lin Feng, jika kamu bisa bertahan di bawah tiga jurusku tanpa mati, aku akan menjamin kamu bisa tetap tinggal di murid luar!"

Lin Feng tanpa ekspresi mengepalkan kedua tangannya. Dengan satu pikiran, Qi Spiritual yang tersimpan di dalam tubuhnya berputar secara gila-gilaan, dan Pedang Spiritual di dalam Cincin Spasial berdengung nyaring.

"Kamu hanya seorang Diaken Luar, beraninya bersikap sombong di hadapanku?" kata Lin Feng dengan suara berat.

Entire arena gempar! Tidak ada yang menyangka bahwa Lin Feng, sampah yang biasanya berdiam diri, berani menghadapi Zhang Kuang yang berada di Alam Pendirian Fondasi secara langsung!`,
    status_pengerjaan: 'Selesai',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'chap-1-3',
    novel_id: 'novel-1',
    nomor_chapter: 3,
    judul_chapter: 'Rahasia Cincin Spasial',
    teks_asli: `夜半时分，林枫独自盘坐在密室之中。

古朴的戒指忽暗忽明，一股纯净无比的荒古气息将他包围。

“这枚储物戒不仅能够储存物品，居然还能提炼纯净的灵石！”林枫眼中闪烁着异彩。

在东域神洲，灵石是修炼者不可 megubah 的资源。若能源源不断提炼灵石，他的修炼速度将暴增十倍！

然而，林枫知道，匹夫无罪，怀璧其罪。在此之前，他必须先参悟【九霄天雷诀】。`,
    teks_terjemahan: '',
    status_pengerjaan: 'Belum',
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'chap-2-1',
    novel_id: 'novel-2',
    nomor_chapter: 1,
    judul_chapter: 'The Underground Laboratory',
    teks_asli: `The narrow alleyways of Oakhaven smelled of sulfur and dried lavender. 

Arthur adjusted his brass spectacles as he slipped through the concealed door behind the potion shop. Down below, the Shadow Alchemist's haven flickered with soft amber mana lights.

"You're late, Arthur," a raspy voice echoed from the shadows. 

It was Master Vane, holding a glowing vial of Lumina Essence. "The High Council has already issued the arrest warrant. They know about the forbidden transmuted steel."`,
    teks_terjemahan: `Gang-gang sempit di Oakhaven berbau belerang dan lavender kering.

Arthur menyesuaikan kacamata kuningannya saat dia menyelip melalui pintu tersembunyi di belakang toko ramuan. Di bawah sana, tempat perlindungan Sang Alkemis Bayangan berpendar dengan cahaya mana amber yang lembut.

"Kamu terlambat, Arthur," sebuah suara serak bergema dari balik bayang-bayang.

Itu adalah Master Vane, yang memegang botol kaca berisi Esensi Lumina yang bersinar. "Dewi Tinggi sudah mengeluarkan surat perintah penangkapan. Mereka tahu tentang baja transmutasi terlarang itu."`,
    status_pengerjaan: 'Selesai',
    updatedAt: new Date().toISOString(),
  }
];

export const initialReferences: ReferenceItem[] = [
  {
    id: 'ref-1-1',
    novel_id: 'novel-1',
    kategori: 'Gaya Bahasa',
    nama_item: 'Tone dan Nuansa Terjemahan',
    deskripsi: 'Gunakan istilah kultivasi Xianxia yang gagah namun puitis. Gunakan sebutan hierarki seperti Sekte, Diaken Luar, Alam Kondensasi Qi, Alam Pendirian Fondasi, Bencana Surgawi.'
  },
  {
    id: 'ref-1-2',
    novel_id: 'novel-1',
    kategori: 'Karakter',
    nama_item: 'Lin Feng (Tokoh Utama)',
    deskripsi: 'Pemuda yang tenang, cerdas, tidak mudah terpancing, menyimpan cincin rahasia peninggalan Reruntuhan Kuno.'
  },
  {
    id: 'ref-1-3',
    novel_id: 'novel-1',
    kategori: 'Lore',
    nama_item: 'Tingkatan Alam Kultivasi',
    deskripsi: '1. Alam Kondensasi Qi (1-9) -> 2. Alam Pendirian Fondasi -> 3. Alam Inti Emas (Golden Core) -> 4. Alam Jiwa Baru Lahir (Nascent Soul).'
  },
  {
    id: 'ref-2-1',
    novel_id: 'novel-2',
    kategori: 'Gaya Bahasa',
    nama_item: 'Gaya Novel Fantasy Alchemy',
    deskripsi: 'Nuansa steampunk/fantasy klasik dengan gaya narasi yang atmosferik, dramatis, dan penuh istilah laboratorium alkimia.'
  }
];

export const initialGlossaries: GlossaryItem[] = [
  {
    id: 'glos-1-1',
    novel_id: 'novel-1',
    istilah_asli: 'Heavenly Tribulation / 天劫',
    istilah_terjemahan: 'Bencana Surgawi',
    kategori: 'Istilah Khusus',
    chapter_ditemukan: 'Chapter 1',
    konteks: 'Ujian petir dari langit bagi para kultivator'
  },
  {
    id: 'glos-1-2',
    novel_id: 'novel-1',
    istilah_asli: 'Spiritual Qi / 灵气',
    istilah_terjemahan: 'Qi Spiritual',
    kategori: 'Istilah Khusus',
    chapter_ditemukan: 'Chapter 1',
    konteks: 'Energi murni alam semesta untuk kultivasi'
  },
  {
    id: 'glos-1-3',
    novel_id: 'novel-1',
    istilah_asli: 'Azure Dragon Sect / 青龙宗',
    istilah_terjemahan: 'Sekte Naga Biru',
    kategori: 'Tempat',
    chapter_ditemukan: 'Chapter 1',
    konteks: 'Sekte kultivasi tempat Lin Feng berguru'
  },
  {
    id: 'glos-1-4',
    novel_id: 'novel-1',
    istilah_asli: 'Spatial Ring / 储物戒',
    istilah_terjemahan: 'Cincin Spasial',
    kategori: 'Item',
    chapter_ditemukan: 'Chapter 1',
    konteks: 'Cincin penyimpan barang berdimensi ekstrasolar'
  },
  {
    id: 'glos-1-5',
    novel_id: 'novel-1',
    istilah_asli: 'Nine Heavens Heavenly Thunder Formula / 九霄天雷诀',
    istilah_terjemahan: 'Jurus Petir Surgawi Sembilan Langit',
    kategori: 'Jurus/Sekte',
    chapter_ditemukan: 'Chapter 3',
    konteks: 'Jurus kultivasi elemen petir tingkat tinggi'
  },
  {
    id: 'glos-2-1',
    novel_id: 'novel-2',
    istilah_asli: 'Lumina Essence',
    istilah_terjemahan: 'Esensi Lumina',
    kategori: 'Item',
    chapter_ditemukan: 'Chapter 1',
    konteks: 'Cairan mana bersinar murni untuk transmutasi'
  }
];
export const LAST_UPDATED_KEY = 'novel_translator_pro_last_updated';

export interface LibraryStorageData {
  novels: Novel[];
  chapters: Chapter[];
  references: ReferenceItem[];
  glossaries: GlossaryItem[];
  last_updated?: string;
  _notModified?: boolean;
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export async function fetchServerStorage(): Promise<LibraryStorageData | null> {
  try {
    const res = await fetch('/api/storage', {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      const data: LibraryStorageData = json.data;
      const cachedLastUpdated = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_UPDATED_KEY) : null;
      const isUnchanged = Boolean(
        cachedLastUpdated &&
        data.last_updated &&
        cachedLastUpdated === data.last_updated
      );

      data._notModified = isUnchanged;

      if (!isUnchanged && typeof localStorage !== 'undefined') {
        if (data.last_updated) {
          localStorage.setItem(LAST_UPDATED_KEY, data.last_updated);
        }
        if (Array.isArray(data.novels)) {
          localStorage.setItem(NOVELS_KEY, JSON.stringify(data.novels));
        }
        if (Array.isArray(data.chapters)) {
          localStorage.setItem(CHAPTERS_KEY, JSON.stringify(data.chapters));
        }
        if (Array.isArray(data.references)) {
          localStorage.setItem(REFERENCES_KEY, JSON.stringify(data.references));
        }
        if (Array.isArray(data.glossaries)) {
          localStorage.setItem(GLOSSARIES_KEY, JSON.stringify(data.glossaries));
        }
      }
      return data;
    }
  } catch (err) {
    console.warn('Could not fetch server storage, using local cache:', err);
  }
  return null;
}

export function syncServerStorage(customData?: Partial<LibraryStorageData>) {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(async () => {
    try {
      const novels = customData?.novels || getStoredNovels();
      const chapters = customData?.chapters || getStoredChapters();
      const references = customData?.references || getAllStoredReferences();
      const glossaries = customData?.glossaries || getAllStoredGlossaries();

      const res = await fetch('/api/storage/sync', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          novels,
          chapters,
          references,
          glossaries,
        }),
      });
      if (res.ok && typeof localStorage !== 'undefined') {
        const json = await res.json().catch(() => null);
        if (json?.data?.last_updated) {
          localStorage.setItem(LAST_UPDATED_KEY, json.data.last_updated);
        }
      }
    } catch (err) {
      console.warn('Failed syncing library to server storage:', err);
    }
  }, 300);
}

export function getStoredNovels(): Novel[] {
  const data = localStorage.getItem(NOVELS_KEY);
  if (!data) {
    localStorage.setItem(NOVELS_KEY, JSON.stringify(initialNovels));
    return initialNovels;
  }
  try {
    return JSON.parse(data);
  } catch {
    return initialNovels;
  }
}

export function saveStoredNovels(novels: Novel[]) {
  localStorage.setItem(NOVELS_KEY, JSON.stringify(novels));
  syncServerStorage({ novels });
}
export function deleteStoredNovel(novelId: string): Novel[] {
  const currentNovels = getStoredNovels();
  const updatedNovels = currentNovels.filter((n) => n.id !== novelId);
  localStorage.setItem(NOVELS_KEY, JSON.stringify(updatedNovels));

  // Also filter out its chapters, references, glossaries from local storage
  const remainingChapters = getStoredChapters().filter((c) => c.novel_id !== novelId);
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(remainingChapters));

  const remainingRefs = getAllStoredReferences().filter((r) => r.novel_id !== novelId);
  localStorage.setItem(REFERENCES_KEY, JSON.stringify(remainingRefs));

  const remainingGloss = getAllStoredGlossaries().filter((g) => g.novel_id !== novelId);
  localStorage.setItem(GLOSSARIES_KEY, JSON.stringify(remainingGloss));

  // Explicitly notify server to delete novel and physical folder on disk
  fetch('/api/storage/delete-novel', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ novel_id: novelId }),
  }).catch((err) => console.warn('Failed deleting novel on server:', err));

  return updatedNovels;
}

export function renameStoredNovel(novelId: string, newTitle: string): Novel[] {
  const currentNovels = getStoredNovels();
  const updatedNovels = currentNovels.map((n) =>
    n.id === novelId ? { ...n, judul: newTitle, updatedAt: new Date().toISOString() } : n
  );
  localStorage.setItem(NOVELS_KEY, JSON.stringify(updatedNovels));

  fetch('/api/storage/rename-novel', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ novel_id: novelId, new_title: newTitle }),
  }).catch((err) => console.warn('Failed renaming novel on server:', err));

  return updatedNovels;
}


export function getStoredChapters(novelId?: string): Chapter[] {
  const data = localStorage.getItem(CHAPTERS_KEY);
  let chapters: Chapter[] = initialChapters;
  if (data) {
    try {
      chapters = JSON.parse(data);
    } catch {
      chapters = initialChapters;
    }
  } else {
    localStorage.setItem(CHAPTERS_KEY, JSON.stringify(initialChapters));
  }

  if (novelId) {
    return chapters.filter((c) => c.novel_id === novelId).sort((a, b) => a.nomor_chapter - b.nomor_chapter);
  }
  return chapters;
}

export function saveStoredChapters(chapters: Chapter[]) {
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(chapters));
  syncServerStorage({ chapters });
}
export function deleteStoredChapter(chapterId: string, novelId?: string): Chapter[] {
  const allChapters = getStoredChapters();
  const updatedAll = allChapters.filter((c) => c.id !== chapterId);
  localStorage.setItem(CHAPTERS_KEY, JSON.stringify(updatedAll));

  // Explicitly notify server to unlink file
  fetch('/api/storage/delete-chapter', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ chapter_id: chapterId, novel_id: novelId }),
  }).catch((err) => console.warn('Failed deleting chapter on server:', err));

  if (novelId) {
    return updatedAll.filter((c) => c.novel_id === novelId);
  }
  return updatedAll;
}


export function getAllStoredReferences(): ReferenceItem[] {
  const data = localStorage.getItem(REFERENCES_KEY);
  if (!data) return initialReferences;
  try {
    return JSON.parse(data);
  } catch {
    return initialReferences;
  }
}

export function getStoredReferences(novelId: string): ReferenceItem[] {
  const allRefs = getAllStoredReferences();
  return allRefs.filter((r) => r.novel_id === novelId);
}

export function saveStoredReferences(refs: ReferenceItem[], novelId?: string) {
  const targetId = novelId || (refs.length > 0 ? refs[0].novel_id : undefined);
  if (targetId) {
    const all = getAllStoredReferences().filter((r) => r.novel_id !== targetId);
    const merged = [...all, ...refs];
    localStorage.setItem(REFERENCES_KEY, JSON.stringify(merged));
    syncServerStorage({ references: merged });
  } else {
    localStorage.setItem(REFERENCES_KEY, JSON.stringify(refs));
    syncServerStorage({ references: refs });
  }
}
export function deleteStoredReference(referenceId: string, novelId?: string): ReferenceItem[] {
  const allRefs = getAllStoredReferences();
  const updatedAll = allRefs.filter((r) => r.id !== referenceId);
  localStorage.setItem(REFERENCES_KEY, JSON.stringify(updatedAll));
  syncServerStorage({ references: updatedAll });

  if (novelId) {
    return updatedAll.filter((r) => r.novel_id === novelId);
  }
  return updatedAll;
}


export function getAllStoredGlossaries(): GlossaryItem[] {
  const data = localStorage.getItem(GLOSSARIES_KEY);
  if (!data) return initialGlossaries;
  try {
    return JSON.parse(data);
  } catch {
    return initialGlossaries;
  }
}

export function getStoredGlossaries(novelId: string): GlossaryItem[] {
  const allGloss = getAllStoredGlossaries();
  return allGloss.filter((g) => g.novel_id === novelId);
}

export function saveStoredGlossaries(gloss: GlossaryItem[], novelId?: string) {
  const targetId = novelId || (gloss.length > 0 ? gloss[0].novel_id : undefined);
  if (targetId) {
    const all = getAllStoredGlossaries().filter((g) => g.novel_id !== targetId);
    const merged = [...all, ...gloss];
    localStorage.setItem(GLOSSARIES_KEY, JSON.stringify(merged));
    syncServerStorage({ glossaries: merged });
  } else {
    localStorage.setItem(GLOSSARIES_KEY, JSON.stringify(gloss));
    syncServerStorage({ glossaries: gloss });
  }
}
export function deleteStoredGlossary(glossaryId: string, novelId?: string): GlossaryItem[] {
  const allGloss = getAllStoredGlossaries();
  const updatedAll = allGloss.filter((g) => g.id !== glossaryId);
  localStorage.setItem(GLOSSARIES_KEY, JSON.stringify(updatedAll));
  syncServerStorage({ glossaries: updatedAll });

  // Also call delete endpoint
  fetch('/api/storage/delete-glossary', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ glossary_id: glossaryId, novel_id: novelId }),
  }).catch((err) => console.warn('Failed deleting glossary on server:', err));

  if (novelId) {
    return updatedAll.filter((g) => g.novel_id === novelId);
  }
  return updatedAll;
}
