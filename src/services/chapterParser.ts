/**
 * Parse chapter number from filename with strict rules.
 * Returns null if filename doesn't carry a recognizable chapter number.
 * Accepts:
 *   Chapter_01.md, Chapter-1.md, Chapter 12.md, chap_5.md, Bab_03.md
 *   01.md, 1.txt (entire filename is digits + extension)
 * Rejects (returns null):
 *   Chapter_Epilogue_2024.md (year digits not preceded by chapter prefix)
 *   Notes_v3.md (no chapter prefix; the 3 is not the chapter)
 *   Appendix_Backup_20231225.txt (date-like number, no chapter prefix)
 */
export function extractChapterNumber(filename: string): number | null {
  // Strip extension
  const base = filename.replace(/\.(md|txt)$/i, '');

  // Strategy 1: explicit chapter prefix (Chapter|chap|Bab|bab) followed by number
  const prefixMatch = base.match(/(?:^|[_\-\s])(?:Chapter|chap|Bab|bab)[_\-\s]*(\d{1,5})(?:[_\-\s].*)?$/i);
  if (prefixMatch) {
    const n = parseInt(prefixMatch[1], 10);
    if (!isNaN(n) && n >= 0 && n <= 99999) return n;
    return null;
  }

  // Strategy 2: filename is entirely digits (e.g. 01.md, 12.txt)
  if (/^\d{1,5}$/.test(base)) {
    const n = parseInt(base, 10);
    if (!isNaN(n) && n >= 0 && n <= 99999) return n;
  }

  return null;
}
