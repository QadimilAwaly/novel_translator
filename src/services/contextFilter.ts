import { GlossaryItem, ReferenceItem } from '../types';

/**
 * Normalizes text for matching across CJK (Chinese/Japanese/Korean) and Latin scripts.
 * Strips punctuation and converts Latin to lower case.
 */
function cleanSearchKeyword(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '')
    .trim();
}

/**
 * Extracts sub-terms from a glossary term string like "Spatial Ring / 储物戒" or "Lin Feng".
 * Returns an array of clean sub-keywords.
 */
function getKeywordsFromTerm(termStr: string): string[] {
  const parts = termStr.split(/[\/\(\)\|\,\;\:\-]/);
  const keywords: string[] = [];

  for (const part of parts) {
    const cleaned = cleanSearchKeyword(part);
    if (cleaned.length > 0) {
      keywords.push(cleaned);
    }
  }

  // Also include the whole cleaned term if it was split
  const fullCleaned = cleanSearchKeyword(termStr);
  if (fullCleaned.length > 0 && !keywords.includes(fullCleaned)) {
    keywords.push(fullCleaned);
  }

  return keywords;
}

/**
 * Filter glossaries to only include items whose original term (or part of it)
 * appears in the original chapter text.
 */
export function filterRelevantGlossaries(
  text: string,
  glossaries: GlossaryItem[]
): GlossaryItem[] {
  if (!text || !text.trim() || !glossaries || glossaries.length === 0) {
    return [];
  }

  const lowerText = text.toLowerCase();
  // Clean version of text without punctuation for CJK / strict match
  const cleanText = cleanSearchKeyword(text);

  return glossaries.filter((item) => {
    // 1. Direct raw match check on original term
    if (lowerText.includes(item.istilah_asli.toLowerCase())) {
      return true;
    }

    // 2. Sub-keywords check (e.g. for dual terms "Spatial Ring / 储物戒")
    const keywords = getKeywordsFromTerm(item.istilah_asli);
    for (const kw of keywords) {
      if (kw.length >= 2) {
        if (lowerText.includes(kw) || cleanText.includes(kw)) {
          return true;
        }
      }
    }

    return false;
  });
}

/**
 * Filter references to only include items relevant to the text.
 * Always keeps 'Gaya Bahasa' and 'Sinopsis' items, while filtering
 * 'Karakter', 'Tempat', 'Lore', and 'Item' based on name/description matches.
 */
export function filterRelevantReferences(
  text: string,
  references: ReferenceItem[]
): ReferenceItem[] {
  if (!text || !text.trim() || !references || references.length === 0) {
    return [];
  }

  const lowerText = text.toLowerCase();
  const cleanText = cleanSearchKeyword(text);

  return references.filter((item) => {
    // Always include global style or general synopsis rules
    if (
      item.kategori === 'Gaya Bahasa' ||
      item.nama_item.toLowerCase().includes('gaya') ||
      item.nama_item.toLowerCase().includes('sinopsis') ||
      item.nama_item.toLowerCase().includes('tone')
    ) {
      return true;
    }

    // Check item name
    const nameKeywords = getKeywordsFromTerm(item.nama_item);
    for (const kw of nameKeywords) {
      if (kw.length >= 2 && (lowerText.includes(kw) || cleanText.includes(kw))) {
        return true;
      }
    }

    return false;
  });
}
