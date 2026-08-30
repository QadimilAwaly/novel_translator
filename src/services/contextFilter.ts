import { GlossaryItem, ReferenceItem } from '../types';

/**
 * Normalizes text for matching across CJK (Chinese/Japanese/Korean) and Latin scripts.
 * Strips punctuation and converts Latin to lower case.
 */
export function cleanSearchKeyword(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]/g, '')
    .trim();
}

/**
 * Extracts sub-terms from a glossary term string.
 * Retained for backwards compatibility.
 */
export function getKeywordsFromTerm(termStr: string): string[] {
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PURE_CJK_REGEX = /^[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af]+$/;

/**
 * Returns candidate sub-keywords for matching a glossary/reference term against chapter text.
 * 1. Original term (trimmed) as the FIRST entry (whole-term match is preferred).
 * 2. For terms containing a language alternation separator (/ ( |), additionally returns each side trimmed.
 * 3. Does NOT split on space for Latin portions (prevents noisy sub-words from over-matching).
 */
export function getKeywordsForMatching(termStr: string): string[] {
  if (!termStr || !termStr.trim()) return [];

  const candidates: string[] = [];
  const rawTrimmed = termStr.trim();
  if (rawTrimmed.length > 0) {
    candidates.push(rawTrimmed);
  }

  // Check for language alternation separators
  if (/[\/\(\|]/.test(termStr)) {
    const parts = termStr.split(/[\/\(\|]/);
    for (const part of parts) {
      const cleanedPart = part.replace(/\)/g, '').trim();
      if (cleanedPart.length > 0 && !candidates.includes(cleanedPart)) {
        candidates.push(cleanedPart);
      }
    }
  }

  return candidates;
}

/**
 * Checks if a candidate keyword/term matches within lowerText.
 * - For pure CJK candidates: uses substring includes without word boundary.
 * - For Latin / mixed candidates: uses word-boundary regex \b...\b to prevent cross-word false matches.
 * - Accepts length >= 1 for CJK, length >= 2 for Latin, and length === 1 for Latin Unicode letters.
 */
function isCandidateMatching(candidate: string, lowerText: string): boolean {
  if (!candidate || !lowerText) return false;
  const candLower = candidate.toLowerCase();

  // Pure CJK (or Hangul/Kana): substring match is sufficient and correct
  if (PURE_CJK_REGEX.test(candidate)) {
    return lowerText.includes(candLower);
  }

  // Latin / Mixed terms: use word boundary to avoid false positives on partial words (e.g. "ring" matching "ringing")
  if (candidate.length >= 2) {
    try {
      const regex = new RegExp(`\\b${escapeRegex(candLower)}\\b`, 'i');
      return regex.test(lowerText);
    } catch {
      return lowerText.includes(candLower);
    }
  }

  // Single-character Latin/letter: require word boundary
  if (candidate.length === 1 && /\p{L}/u.test(candidate)) {
    try {
      const regex = new RegExp(`\\b${escapeRegex(candLower)}\\b`, 'i');
      return regex.test(lowerText);
    } catch {
      return lowerText.includes(candLower);
    }
  }

  return false;
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

  return glossaries.filter((item) => {
    // 1. Direct raw whole-term match check on original term (fast path)
    if (lowerText.includes(item.istilah_asli.toLowerCase())) {
      return true;
    }

    // 2. Candidates check with word boundaries and language alternation splitting
    const candidates = getKeywordsForMatching(item.istilah_asli);
    for (const cand of candidates) {
      if (isCandidateMatching(cand, lowerText)) {
        return true;
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

    // Check item name using candidates matching
    const candidates = getKeywordsForMatching(item.nama_item);
    for (const cand of candidates) {
      if (isCandidateMatching(cand, lowerText)) {
        return true;
      }
    }

    return false;
  });
}
