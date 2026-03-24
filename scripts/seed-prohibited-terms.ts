/**
 * Seed script: Insert prohibited terms into prohibited_terms table
 *
 * Prerequisite:
 * 1. Copy config/prohibited-terms-seed.example.json to config/prohibited-terms-seed.json
 * 2. Populate with compliance-approved terms (obtain from compliance team)
 * 3. The real seed file is gitignored; do not commit it
 *
 * Usage: npx ts-node scripts/seed-prohibited-terms.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SEED_PATH = join(process.cwd(), 'config', 'prohibited-terms-seed.json');

async function main() {
  if (!existsSync(SEED_PATH)) {
    console.error(
      `Seed file not found: ${SEED_PATH}\n` +
      'Copy config/prohibited-terms-seed.example.json to config/prohibited-terms-seed.json\n' +
      'and populate with compliance-approved terms.'
    );
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required. Set it in .env');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(SEED_PATH, 'utf-8'));
  const config = raw as { ja?: { patterns: string[]; replacements?: Record<string, string> }; en?: { patterns: string[]; replacements?: Record<string, string> }; zh?: { patterns: string[]; replacements?: Record<string, string> } };

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    await client.query('DELETE FROM prohibited_terms');

    let ord = 0;
    for (const locale of ['ja', 'en', 'zh'] as const) {
      const lc = config[locale];
      if (!lc?.patterns?.length) continue;

      for (let i = 0; i < lc.patterns.length; i++) {
        const pattern = lc.patterns[i];
        const replacement = lc.replacements?.[pattern.toLowerCase()] ?? null;
        await client.query(
          `INSERT INTO prohibited_terms (locale, pattern, replacement, sort_order) VALUES ($1, $2, $3, $4)`,
          [locale, pattern, replacement, ++ord]
        );
      }
    }

    const count = await client.query('SELECT COUNT(*) as n FROM prohibited_terms');
    console.log(`Inserted ${count.rows[0].n} prohibited terms.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
