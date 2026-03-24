/**
 * Repository for loading prohibited terms from the database.
 *
 * The prohibited term list is stored exclusively in the `prohibited_terms`
 * table, which is seeded via a secure out-of-band compliance process.
 * No term data is stored in any repository file.
 */

import { Pool } from 'pg';
import { Locale } from '@shared/types/layers';

export interface ProhibitedWordsConfig {
  ja: { patterns: string[]; replacements: Record<string, string> };
  en: { patterns: string[]; replacements: Record<string, string> };
  zh: { patterns: string[]; replacements: Record<string, string> };
}

interface TermRow {
  locale: string;
  pattern: string;
  replacement: string | null;
}

export class ProhibitedTermsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Loads all active prohibited terms from the database and returns a
   * `ProhibitedWordsConfig` grouped by locale.
   *
   * @throws if no active terms exist for any locale (safety guard against
   *         accidentally running with an empty / uninitialized term list).
   */
  async loadConfig(): Promise<ProhibitedWordsConfig> {
    const result = await this.pool.query<TermRow>(
      `SELECT locale, pattern, replacement
         FROM prohibited_terms
        WHERE active = true
        ORDER BY locale, sort_order, id`
    );

    const config: ProhibitedWordsConfig = {
      ja: { patterns: [], replacements: {} },
      en: { patterns: [], replacements: {} },
      zh: { patterns: [], replacements: {} }
    };

    for (const row of result.rows) {
      const locale = row.locale as Locale;
      if (!config[locale]) continue;

      config[locale].patterns.push(row.pattern);
      if (row.replacement !== null) {
        config[locale].replacements[row.pattern.toLowerCase()] = row.replacement;
      }
    }

    const totalTerms = result.rows.length;
    if (totalTerms === 0) {
      throw new Error(
        '[ProhibitedTermsRepository] No active prohibited terms found in the database. ' +
        'The prohibited_terms table must be seeded via the compliance-admin tooling ' +
        'before the generation layer can operate.'
      );
    }

    return config;
  }
}
