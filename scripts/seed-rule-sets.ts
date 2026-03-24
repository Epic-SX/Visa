/**
 * Seed script: Publish rule_sets for service1 through service5
 *
 * Usage: npx ts-node scripts/seed-rule-sets.ts
 * Prerequisite: DATABASE_URL in .env; migrations 001, 002 applied
 *
 * Inserts judgment and scoring rules from config/*.json as published
 * rulesets for each service type. Use for demo/audit evidence.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const SERVICE_TYPES = ['service1', 'service2', 'service3', 'service4', 'service5'] as const;

function calculateChecksum(rulesJson: Record<string, unknown>): string {
  const canonicalJson = JSON.stringify(rulesJson, Object.keys(rulesJson).sort());
  return createHash('sha256').update(canonicalJson).digest('hex');
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required. Set it in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  const configDir = join(process.cwd(), 'config');
  const judgmentRules = JSON.parse(
    readFileSync(join(configDir, 'judgment-rules.json'), 'utf-8')
  ) as Record<string, unknown>;
  const scoringRules = JSON.parse(
    readFileSync(join(configDir, 'scoring-rules.json'), 'utf-8')
  ) as Record<string, unknown>;

  const jVersion = (judgmentRules.version as string) || '1.0.0';
  const sVersion = (scoringRules.version as string) || '1.0.0';
  const jChecksum = calculateChecksum(judgmentRules);
  const sChecksum = calculateChecksum(scoringRules);

  const client = await pool.connect();

  try {
    for (const st of SERVICE_TYPES) {
      // Archive any existing published ruleset for this (kind, service_type)
      await client.query(
        `UPDATE rule_sets SET status = 'archived', archived_at = now()
         WHERE kind = $1 AND service_type = $2 AND status = 'published'`,
        ['judgment', st]
      );
      await client.query(
        `UPDATE rule_sets SET status = 'archived', archived_at = now()
         WHERE kind = $1 AND service_type = $2 AND status = 'published'`,
        ['scoring', st]
      );

      await client.query(
        `INSERT INTO rule_sets (
          kind, service_type, version, status, rules_json, checksum, description, published_at
        ) VALUES ($1, $2, $3, 'published', $4, $5, $6, now())`,
        [
          'judgment',
          st,
          jVersion,
          JSON.stringify(judgmentRules),
          jChecksum,
          `Demo ruleset for ${st} (from config/judgment-rules.json)`
        ]
      );
      await client.query(
        `INSERT INTO rule_sets (
          kind, service_type, version, status, rules_json, checksum, description, published_at
        ) VALUES ($1, $2, $3, 'published', $4, $5, $6, now())`,
        [
          'scoring',
          st,
          sVersion,
          JSON.stringify(scoringRules),
          sChecksum,
          `Demo ruleset for ${st} (from config/scoring-rules.json)`
        ]
      );
      console.log(`Published judgment + scoring for ${st}`);
    }

    const count = await client.query(
      `SELECT service_type, kind, status, version FROM rule_sets WHERE status = 'published' ORDER BY service_type, kind`
    );
    console.log('\nPublished rulesets:');
    console.table(count.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
