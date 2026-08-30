/**
 * Test Suite: Robust LLM JSON Parser
 * ====================================
 * Verifies cleanJsonString and brace-matching extraction for all LLM output variations.
 *
 * Runs via: bun test test/json-parser.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';

// Implementation matching cleanJsonString in server.ts
function extractFirstJsonBlock(input: string): string | null {
  const firstBrace = input.indexOf('{');
  const firstBracket = input.indexOf('[');

  let startIdx = -1;
  let openChar = '{';
  let closeChar = '}';

  if (firstBrace !== -1 && firstBracket !== -1) {
    if (firstBrace < firstBracket) {
      startIdx = firstBrace;
      openChar = '{';
      closeChar = '}';
    } else {
      startIdx = firstBracket;
      openChar = '[';
      closeChar = ']';
    }
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
    openChar = '{';
    closeChar = '}';
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    openChar = '[';
    closeChar = ']';
  } else {
    return null;
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let i = startIdx; i < input.length; i++) {
    const char = input[i];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) {
        depth++;
      } else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          return input.slice(startIdx, i + 1);
        }
      }
    }
  }

  return null;
}

function cleanJsonString<T = any>(str: string): T {
  if (!str || typeof str !== 'string' || !str.trim()) {
    throw new Error('LLM returned empty or non-string response');
  }

  let text = str.trim();

  // 1. Extract first fenced code block if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  // 2. Strip single-backtick wrapper if present
  if (text.startsWith('`') && text.endsWith('`') && text.length >= 2) {
    text = text.slice(1, -1).trim();
  }

  // 3. Try direct JSON.parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // 4. Try brace-matching extraction for embedded JSON (preamble/trailing prose)
    const extracted = extractFirstJsonBlock(text) || extractFirstJsonBlock(str);
    if (extracted) {
      try {
        return JSON.parse(extracted) as T;
      } catch {
        // Fall through to error
      }
    }
  }

  const preview = (str.length > 200 ? str.slice(0, 200) + '...' : str).replace(/[\r\n]+/g, ' ');
  throw new Error(`LLM returned invalid JSON: ${preview}`);
}

describe('cleanJsonString LLM Parser', () => {
  test('Pure JSON: {"terms":[]} -> parsed', () => {
    const input = '{"terms":[{"istilah_asli":"剑","istilah_terjemahan":"Pedang","kategori":"Item"}]}';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.ok(Array.isArray(result.terms));
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, '剑');
  });

  test('Fenced JSON with json tag: ```json\n{...}\n``` -> parsed', () => {
    const input = '```json\n{"terms":[{"istilah_asli":"Spatial Ring","istilah_terjemahan":"Cincin Spasial"}]}\n```';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Spatial Ring');
  });

  test('Fenced JSON without language tag: ```\n{...}\n``` -> parsed', () => {
    const input = '```\n{"terms":[{"istilah_asli":"Dan","istilah_terjemahan":"Pil"}]}\n```';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Dan');
  });

  test('Fenced JSON with PREAMBLE: Berikut glosariumnya:\n```json\n{...}\n``` -> parsed', () => {
    const input = 'Berikut daftar glosarium yang berhasil diekstrak:\n```json\n{"terms":[{"istilah_asli":"Cultivator","istilah_terjemahan":"Kultivator"}]}\n```';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Cultivator');
  });

  test('Fenced JSON with TRAILING prose: ```json\n{...}\n```\nSemoga membantu -> parsed', () => {
    const input = '```json\n{"terms":[{"istilah_asli":"Qi","istilah_terjemahan":"Hawa Murni"}]}\n```\nSemoga informasi ini bermanfaat untuk penerjemahan.';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Qi');
  });

  test('Single-backtick wrapper: `{"terms":[]}` -> parsed', () => {
    const input = '`{"terms":[{"istilah_asli":"Lin Feng","istilah_terjemahan":"Lin Feng","kategori":"Nama"}]}`';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Lin Feng');
  });

  test('Embedded JSON in plain text without fences: Here is the result: {...} and that is it -> parsed', () => {
    const input = 'Here is the result of glossary extraction: {"terms":[{"istilah_asli":"Dao","istilah_terjemahan":"Jalan"}]} and that is all.';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'Dao');
  });

  test('Multiple fenced blocks: First one is extracted and parsed', () => {
    const input = '```json\n{"terms":[{"istilah_asli":"First","istilah_terjemahan":"Pertama"}]}\n```\nSome notes\n```json\n{"terms":[{"istilah_asli":"Second","istilah_terjemahan":"Kedua"}]}\n```';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.equal(result.terms[0].istilah_asli, 'First');
  });

  test('Nested JSON with braces and escape characters inside string literals: {"terms":[{"a":"b{c}d"}]} -> parsed', () => {
    const input = 'Hasil ekstraksi: {"terms":[{"istilah_asli":"Test","konteks":"Contoh dengan kurung {kurawal} dan \\"tanda kutip\\" di dalam"}]} selesai.';
    const result = cleanJsonString<{ terms: any[] }>(input);
    assert.equal(result.terms.length, 1);
    assert.ok(result.terms[0].konteks.includes('{kurawal}'));
  });

  test('Empty string throws typed error', () => {
    assert.throws(() => cleanJsonString(''), /empty or non-string/);
  });

  test('Whitespace-only string throws typed error', () => {
    assert.throws(() => cleanJsonString('   \n\t  '), /empty or non-string/);
  });

  test('Completely garbage text ("bukan json") throws typed error with truncated preview', () => {
    assert.throws(() => cleanJsonString('Mohon maaf, saya tidak dapat mengekstrak glosarium dari bab ini.'), /LLM returned invalid JSON: Mohon maaf/);
  });
});
