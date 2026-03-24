/**
 * Ticket 06: Prohibited Words Filter
 *
 * Filters compliance-violating expressions from LLM output to prevent
 * speculative or evaluative language that could be interpreted as
 * assurances or official judgments.
 *
 * COMPLIANCE ARCHITECTURE:
 * - The filter is constructed with a `ProhibitedWordsConfig` object whose
 *   contents are loaded exclusively from the `prohibited_terms` database
 *   table at runtime.
 * - No prohibited word strings exist in any repository file.
 * - Use `ProhibitedWordsFilter.fromDatabase(pool)` at server startup.
 * - Use `ProhibitedWordsFilter.fromConfig(config)` in unit tests with
 *   neutral placeholder words.
 */

import { Pool } from 'pg';
import { Locale } from '@shared/types/layers';
import {
  ProhibitedWordsConfig,
  ProhibitedTermsRepository
} from '../repositories/prohibited-terms-repository';

export { ProhibitedWordsConfig };

export class ProhibitedWordsFilter {
  private readonly patterns:     Map<Locale, RegExp[]>;
  private readonly replacements: Map<Locale, Map<string, string>>;
  private readonly rawPatterns:  Map<Locale, string[]>;

  private constructor(config: ProhibitedWordsConfig) {
    this.patterns     = new Map();
    this.replacements = new Map();
    this.rawPatterns  = new Map();
    this.initializePatterns(config);
  }

  // ── Static factories ─────────────────────────────────────────────────────────

  /**
   * Production factory: loads terms from the `prohibited_terms` DB table.
   * Call once during server startup; share the returned instance.
   */
  static async fromDatabase(pool: Pool): Promise<ProhibitedWordsFilter> {
    const repo   = new ProhibitedTermsRepository(pool);
    const config = await repo.loadConfig();
    return new ProhibitedWordsFilter(config);
  }

  /**
   * Test / injection factory: accepts a pre-built config (neutral test words).
   * No actual prohibited terms should appear in test source files.
   */
  static fromConfig(config: ProhibitedWordsConfig): ProhibitedWordsFilter {
    return new ProhibitedWordsFilter(config);
  }

  // ── Private initialisation ───────────────────────────────────────────────────

  private initializePatterns(config: ProhibitedWordsConfig): void {
    for (const locale of ['ja', 'en', 'zh'] as Locale[]) {
      const lc = config[locale];

      this.rawPatterns.set(locale, lc.patterns);
      this.patterns.set(locale, lc.patterns.map(w => new RegExp(this.escapeRegex(w), 'gi')));

      const repMap = new Map<string, string>();
      for (const [key, value] of Object.entries(lc.replacements ?? {})) {
        repMap.set(key.toLowerCase(), value);
      }
      this.replacements.set(locale, repMap);
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Filters text by removing or replacing prohibited words.
   *
   * @param text    Text to filter
   * @param locale  Locale for language-specific filtering
   * @param strict  If true, throws on the first detected violation
   */
  filter(text: string, locale: Locale, strict: boolean = false): string {
    const patterns     = this.patterns.get(locale)     ?? [];
    const replacements = this.replacements.get(locale) ?? new Map();

    let filteredText = text;
    const violations: string[] = [];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          violations.push(match);
          const replacement = replacements.get(match.toLowerCase());
          const escaped = new RegExp(this.escapeRegex(match), 'gi');
          filteredText = filteredText.replace(escaped, replacement ?? '[内容削除]');
        }
      }
    }

    if (strict && violations.length > 0) {
      throw new Error(
        `Prohibited words detected: ${violations.join(', ')}. ` +
        `LLM output violates compliance guidelines and must be regenerated.`
      );
    }

    if (violations.length > 0) {
      console.warn('[ProhibitedWordsFilter] Violations detected and filtered:', violations);
    }

    return filteredText;
  }

  /**
   * Returns all detected prohibited words in `text` without modifying it.
   */
  detect(text: string, locale: Locale): string[] {
    const patterns   = this.patterns.get(locale) ?? [];
    const violations: string[] = [];
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) violations.push(...matches);
    }
    return violations;
  }

  /**
   * Filters all text fields of a GenerationOutput object.
   */
  filterOutput(output: {
    headline: string;
    todoItems: string[];
    explanationText: string;
    obCommentary?: string[];
    disclaimer: string;
  }, locale: Locale): typeof output {
    return {
      headline:        this.filter(output.headline, locale),
      todoItems:       output.todoItems.map(item => this.filter(item, locale)),
      explanationText: this.filter(output.explanationText, locale),
      obCommentary:    output.obCommentary?.map(item => this.filter(item, locale)),
      disclaimer:      this.filter(output.disclaimer, locale)
    };
  }

  /**
   * Returns the runtime-decoded pattern strings for a locale.
   * Used by tests to build dynamic test inputs without hardcoding terms.
   */
  getProhibitedPatterns(locale: Locale): string[] {
    return this.rawPatterns.get(locale) ?? [];
  }
}
