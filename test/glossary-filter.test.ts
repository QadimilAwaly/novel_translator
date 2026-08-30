/**
 * Test Suite: Glossary Filtering & Context Matching
 * ===================================================
 * Verifies BUG-02 (over-matching prevention via word-boundary and no space splitting)
 * and BUG-03 (single-character CJK preservation in dual-language entries).
 *
 * Runs via: bun test test/glossary-filter.test.ts
 */

import { test, describe } from 'bun:test';
import assert from 'assert';
import { filterRelevantGlossaries, getKeywordsForMatching } from '../src/services/contextFilter';
import { GlossaryItem } from '../src/types';

function createMockGlossary(terms: string[]): GlossaryItem[] {
  return terms.map((term, i) => ({
    id: `gloss-${i + 1}`,
    novel_id: 'novel-test',
    istilah_asli: term,
    istilah_terjemahan: `Translation_${i + 1}`,
    kategori: 'Istilah Khusus',
  }));
}

describe('getKeywordsForMatching helper', () => {
  test('should return whole term as first candidate', () => {
    const candidates = getKeywordsForMatching('Spatial Ring / 储物戒');
    assert.equal(candidates[0], 'Spatial Ring / 储物戒');
  });

  test('should split language alternation separators (/, (, |) but NOT space for Latin', () => {
    const candidates = getKeywordsForMatching('Spatial Ring / 储物戒');
    assert.deepEqual(candidates, ['Spatial Ring / 储物戒', 'Spatial Ring', '储物戒']);
  });

  test('should not split on spaces for Latin compound terms without alternation', () => {
    const candidates = getKeywordsForMatching('Nine-Star Martial Realm');
    assert.deepEqual(candidates, ['Nine-Star Martial Realm']);
  });

  test('should handle parenthetical dual terms', () => {
    const candidates = getKeywordsForMatching('Sword (剑)');
    assert.deepEqual(candidates, ['Sword (剑)', 'Sword', '剑']);
  });
});

describe('filterRelevantGlossaries (BUG-02 & BUG-03 Fix Verification)', () => {
  test('BUG-03: Single-character CJK inside dual term ("Sword / 剑") matches chapter containing only 剑', () => {
    const glossaries = createMockGlossary(['Sword / 剑']);
    const chapterText = '他拔出腰间的宝剑，手握剑柄，用剑斩向敌人。';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, 'Sword / 剑');
  });

  test('BUG-02: Sub-word inside longer word ("Spatial Ring" vs "ringing") does NOT match', () => {
    const glossaries = createMockGlossary(['Spatial Ring']);
    const chapterText = 'In the distance, the church bell was ringing loudly into the morning.';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 0, 'Should not match "ringing" when searching for "Spatial Ring"');
  });

  test('Whole-term Latin match ("Spatial Ring") matches properly', () => {
    const glossaries = createMockGlossary(['Spatial Ring']);
    const chapterText = 'He activated his Spatial Ring and stored the pills.';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, 'Spatial Ring');
  });

  test('BUG-02: Isolated generic number in compound term ("Nine-Star Martial Realm" vs "nine days") does NOT match', () => {
    const glossaries = createMockGlossary(['Nine-Star Martial Realm']);
    const chapterText = 'Nine days passed in the blink of an eye during his solitary meditation.';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 0, 'Should not match "nine days" for "Nine-Star Martial Realm"');
  });

  test('Dual-term CJK match ("Nine-Star Martial Realm / 九星武界") matches CJK chapter text', () => {
    const glossaries = createMockGlossary(['Nine-Star Martial Realm / 九星武界']);
    const chapterText = '传闻中，九星武界位于天元大陆的极东之地。';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, 'Nine-Star Martial Realm / 九星武界');
  });

  test('BUG-02: Sub-title match ("Elder Liu / 刘长老" vs generic "长老") does NOT match when name is absent', () => {
    const glossaries = createMockGlossary(['Elder Liu / 刘长老']);
    const chapterText = '大殿之中，几位宗门长老请留步，商议明日的大比。';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 0, 'Should not match generic "长老" when the entry is specifically "Elder Liu / 刘长老"');
  });

  test('BUG-02: Latin partial word boundary ("Lin Feng" vs "linoleum") does NOT match', () => {
    const glossaries = createMockGlossary(['Lin Feng']);
    const chapterText = 'She walked across the shiny linoleum floor in the hallway.';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 0, 'Should not match "linoleum" when searching for "Lin Feng"');
  });

  test('Regression: Latin whole term ("Lin Feng") matches chapter text', () => {
    const glossaries = createMockGlossary(['Lin Feng']);
    const chapterText = 'Lin Feng walked forward with a calm smile.';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, 'Lin Feng');
  });

  test('Regression: Pure CJK term ("储物戒") matches chapter text', () => {
    const glossaries = createMockGlossary(['储物戒']);
    const chapterText = '那枚古朴的储物戒突然发出一道幽光。';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, '储物戒');
  });

  test('Mixed parenthetical dual term ("Sword (剑)") matches chapter text containing 剑', () => {
    const glossaries = createMockGlossary(['Sword (剑)']);
    const chapterText = '战士们纷纷拔出手中利剑，使用剑攻击前方的妖兽。';
    const result = filterRelevantGlossaries(chapterText, glossaries);

    assert.equal(result.length, 1);
    assert.equal(result[0].istilah_asli, 'Sword (剑)');
  });

  test('Edge cases: Empty text and empty glossaries return empty array', () => {
    const glossaries = createMockGlossary(['Spatial Ring']);
    assert.deepEqual(filterRelevantGlossaries('', glossaries), []);
    assert.deepEqual(filterRelevantGlossaries('   ', glossaries), []);
    assert.deepEqual(filterRelevantGlossaries('Some chapter text', []), []);
  });
});
