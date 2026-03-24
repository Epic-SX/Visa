/**
 * Tests for ProhibitedWordsFilter.
 *
 * COMPLIANCE NOTE:
 * No actual prohibited terms appear anywhere in this file.
 * All tests use neutral ASCII placeholder strings (e.g. "PROHIBITED_TERM_JA_1")
 * injected via ProhibitedWordsFilter.fromConfig(), which is the test-only
 * factory.  The production factory (fromDatabase) loads terms from the DB.
 *
 * The filtering MECHANISM is verified here; the specific word list is
 * governed by the compliance-admin seeding process, not by this test.
 */

import { ProhibitedWordsFilter, ProhibitedWordsConfig } from './prohibited-words-filter';

// ── Neutral test configuration ────────────────────────────────────────────────
// These strings are intentionally meaningless placeholders.
// They simulate the structure of the real prohibited-word list
// without containing any actual restricted terms.

const TEST_CONFIG: ProhibitedWordsConfig = {
  ja: {
    patterns: [
      'PROHIBITED_TERM_JA_PREDICTIVE_1',
      'PROHIBITED_TERM_JA_PREDICTIVE_2',
      'PROHIBITED_TERM_JA_EVALUATIVE_1',
      'PROHIBITED_TERM_JA_RECOMMENDATION_1',
      'PROHIBITED_TERM_JA_RECOMMENDATION_2'
    ],
    replacements: {
      'prohibited_term_ja_predictive_1':   'SAFE_REPLACEMENT_JA_1',
      'prohibited_term_ja_recommendation_1': 'SAFE_REPLACEMENT_JA_REC'
    }
  },
  en: {
    patterns: [
      'PROHIBITED_TERM_EN_PREDICTIVE_1',
      'PROHIBITED_TERM_EN_PREDICTIVE_2',
      'PROHIBITED_TERM_EN_EVALUATIVE_1',
      'PROHIBITED_TERM_EN_RECOMMENDATION_1'
    ],
    replacements: {
      'prohibited_term_en_predictive_1':     'safe replacement en predictive',
      'prohibited_term_en_recommendation_1': 'safe recommendation en'
    }
  },
  zh: {
    patterns: [
      'PROHIBITED_TERM_ZH_PREDICTIVE_1',
      'PROHIBITED_TERM_ZH_PREDICTIVE_2'
    ],
    replacements: {
      'prohibited_term_zh_predictive_1': 'SAFE_REPLACEMENT_ZH_1'
    }
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFilter(): ProhibitedWordsFilter {
  return ProhibitedWordsFilter.fromConfig(TEST_CONFIG);
}

describe('ProhibitedWordsFilter', () => {
  let filter: ProhibitedWordsFilter;

  beforeEach(() => {
    filter = makeFilter();
  });

  // ── Japanese (ja) ───────────────────────────────────────────────────────────

  describe('Japanese (ja)', () => {
    test('detects prohibited terms', () => {
      const p = TEST_CONFIG.ja.patterns;
      const text = `Context before ${p[0]} middle ${p[1]} end.`;

      const violations = filter.detect(text, 'ja');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations).toContain(p[0]);
      expect(violations).toContain(p[1]);
    });

    test('replaces a term that has a safe replacement', () => {
      const p    = TEST_CONFIG.ja.patterns;
      const safe = TEST_CONFIG.ja.replacements[p[0].toLowerCase()];
      const text = `Prefix ${p[0]} suffix.`;

      const filtered = filter.filter(text, 'ja');

      expect(filtered).not.toContain(p[0]);
      expect(filtered).toContain(safe);
    });

    test('removes a term that has no safe replacement with [内容削除]', () => {
      const p    = TEST_CONFIG.ja.patterns;
      // p[2] has no replacement in the test config
      const text = `Prefix ${p[2]} suffix.`;

      const filtered = filter.filter(text, 'ja');

      expect(filtered).not.toContain(p[2]);
      expect(filtered).toContain('[内容削除]');
    });

    test('preserves text that contains no prohibited terms', () => {
      const safeText = 'This sentence contains no prohibited placeholders.';
      expect(filter.filter(safeText, 'ja')).toBe(safeText);
    });
  });

  // ── English (en) ────────────────────────────────────────────────────────────

  describe('English (en)', () => {
    test('detects prohibited terms', () => {
      const p    = TEST_CONFIG.en.patterns;
      const text = `The ${p[0]} is high. You will reach ${p[1]}.`;

      const violations = filter.detect(text, 'en');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.toUpperCase() === p[0].toUpperCase())).toBe(true);
    });

    test('replaces a term that has a safe replacement', () => {
      const p    = TEST_CONFIG.en.patterns;
      const safe = TEST_CONFIG.en.replacements[p[0].toLowerCase()];
      const text = `The ${p[0]} is 80%.`;

      const filtered = filter.filter(text, 'en');

      expect(filtered.toUpperCase()).not.toContain(p[0].toUpperCase());
      expect(filtered).toContain(safe);
    });

    test('detects case-insensitively', () => {
      const p    = TEST_CONFIG.en.patterns;
      const text = `The ${p[0].toLowerCase()} matters AND ${p[0].toUpperCase()} too.`;

      const violations = filter.detect(text, 'en');

      expect(violations.length).toBeGreaterThan(0);
    });

    test('preserves safe language', () => {
      const safeText = 'Please review your document preparation status.';
      expect(filter.filter(safeText, 'en')).toBe(safeText);
    });
  });

  // ── Chinese (zh) ────────────────────────────────────────────────────────────

  describe('Chinese (zh)', () => {
    test('detects prohibited terms', () => {
      const p    = TEST_CONFIG.zh.patterns;
      const text = `${p[0]} very high. ${p[1]} is 80%.`;

      const violations = filter.detect(text, 'zh');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations).toContain(p[0]);
      expect(violations).toContain(p[1]);
    });

    test('filters prohibited terms', () => {
      const p    = TEST_CONFIG.zh.patterns;
      const safe = TEST_CONFIG.zh.replacements[p[0].toLowerCase()];
      const text = `${p[0]} very high.`;

      const filtered = filter.filter(text, 'zh');

      expect(filtered).not.toContain(p[0]);
      expect(filtered).toContain(safe);
    });

    test('preserves safe language', () => {
      const safeText = 'Please confirm document preparation status.';
      expect(filter.filter(safeText, 'zh')).toBe(safeText);
    });
  });

  // ── filterOutput ─────────────────────────────────────────────────────────────

  describe('filterOutput', () => {
    test('filters all fields in the output object', () => {
      const p = TEST_CONFIG.ja.patterns;
      const output = {
        headline:        `Prefix ${p[0]} suffix`,
        todoItems:       [`Item with ${p[2]}`, `Item with ${p[1]}`],
        explanationText: `Explanation with ${p[4]}.`,
        disclaimer:      'Safe disclaimer text.'
      };

      const filtered = filter.filterOutput(output, 'ja');

      expect(filtered.headline).not.toContain(p[0]);
      expect(filtered.todoItems[0]).not.toContain(p[2]);
      expect(filtered.todoItems[1]).not.toContain(p[1]);
      expect(filtered.explanationText).not.toContain(p[4]);
      expect(filtered.disclaimer).toBe(output.disclaimer);
    });

    test('filters obCommentary when present', () => {
      const p = TEST_CONFIG.ja.patterns;
      const output = {
        headline:        'Safe headline',
        todoItems:       [],
        explanationText: 'Safe explanation',
        obCommentary:    [`Comment with ${p[0]}`, `Another with ${p[1]}`],
        disclaimer:      'Safe disclaimer'
      };

      const filtered = filter.filterOutput(output, 'ja');

      expect(filtered.obCommentary).toBeDefined();
      expect(filtered.obCommentary![0]).not.toContain(p[0]);
      expect(filtered.obCommentary![1]).not.toContain(p[1]);
    });
  });

  // ── Strict mode ───────────────────────────────────────────────────────────────

  describe('Strict mode', () => {
    test('throws when a prohibited term is detected in strict mode', () => {
      const p    = TEST_CONFIG.ja.patterns;
      const text = `Text with ${p[0]} inside.`;

      expect(() => filter.filter(text, 'ja', true))
        .toThrow('Prohibited words detected');
    });

    test('does not throw in non-strict mode', () => {
      const p    = TEST_CONFIG.ja.patterns;
      const text = `Text with ${p[0]} inside.`;

      expect(() => filter.filter(text, 'ja', false)).not.toThrow();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    test('handles empty string', () => {
      expect(filter.filter('', 'ja')).toBe('');
    });

    test('handles text with no prohibited terms', () => {
      const safe = 'A perfectly clean sentence with no issues.';
      expect(filter.filter(safe, 'en')).toBe(safe);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────────────────

  describe('Determinism', () => {
    test('produces identical output for identical input across multiple calls', () => {
      const p    = TEST_CONFIG.ja.patterns;
      const text = `${p[0]} and ${p[1]} are both present.`;

      const r1 = filter.filter(text, 'ja');
      const r2 = filter.filter(text, 'ja');
      const r3 = filter.filter(text, 'ja');

      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });
  });

  // ── fromConfig factory ────────────────────────────────────────────────────────

  describe('fromConfig factory', () => {
    test('returns filter with accessible patterns', () => {
      const f = ProhibitedWordsFilter.fromConfig(TEST_CONFIG);
      expect(f.getProhibitedPatterns('ja')).toEqual(TEST_CONFIG.ja.patterns);
      expect(f.getProhibitedPatterns('en')).toEqual(TEST_CONFIG.en.patterns);
      expect(f.getProhibitedPatterns('zh')).toEqual(TEST_CONFIG.zh.patterns);
    });

    test('two instances from same config behave identically', () => {
      const f1 = ProhibitedWordsFilter.fromConfig(TEST_CONFIG);
      const f2 = ProhibitedWordsFilter.fromConfig(TEST_CONFIG);
      const p    = TEST_CONFIG.en.patterns;
      const text = `Test ${p[0]} end.`;

      expect(f1.filter(text, 'en')).toBe(f2.filter(text, 'en'));
    });
  });
});
