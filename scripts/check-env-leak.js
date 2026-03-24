/**
 * CI Check: .env 混入検知スクリプト
 * 成果物（zip/tarball）に .env が含まれていないか検証
 * 
 * Usage:
 *   node scripts/check-env-leak.js [directory]
 * 
 * Exit codes:
 *   0 - OK (no .env found)
 *   1 - ERROR (.env found or script error)
 */

const fs = require('fs');
const path = require('path');

const FORBIDDEN_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test'
];

const FORBIDDEN_PATTERNS = [
  /\.env$/,
  /\.env\./,
  /secrets\//,
  /\.pem$/,
  /\.key$/,
  /private.*\.json$/
];

function checkDirectory(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(process.cwd(), fullPath);

    // Skip node_modules, .git, dist, build
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
        continue;
      }
      checkDirectory(fullPath, results);
      continue;
    }

    // Check forbidden files
    if (FORBIDDEN_FILES.includes(entry.name)) {
      results.push({
        type: 'FORBIDDEN_FILE',
        path: relativePath,
        message: `Forbidden file found: ${entry.name}`
      });
    }

    // Check forbidden patterns
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(entry.name)) {
        results.push({
          type: 'FORBIDDEN_PATTERN',
          path: relativePath,
          message: `File matches forbidden pattern: ${pattern}`
        });
        break;
      }
    }
  }

  return results;
}

function main() {
  const targetDir = process.argv[2] || process.cwd();

  console.log('🔍 Checking for environment file leaks...');
  console.log(`Target directory: ${targetDir}\n`);

  if (!fs.existsSync(targetDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const results = checkDirectory(targetDir);

  if (results.length === 0) {
    console.log('✅ No environment file leaks detected!');
    console.log('✅ Safe to package/deploy\n');
    process.exit(0);
  }

  console.error('❌ ENVIRONMENT FILE LEAKS DETECTED!\n');
  console.error('The following forbidden files were found:\n');

  results.forEach((result, index) => {
    console.error(`${index + 1}. [${result.type}] ${result.path}`);
    console.error(`   ${result.message}\n`);
  });

  console.error('⚠️  DO NOT DEPLOY OR PACKAGE UNTIL THESE FILES ARE REMOVED!\n');
  console.error('Action required:');
  console.error('1. Remove these files from the directory');
  console.error('2. Verify .gitignore includes these patterns');
  console.error('3. Run this check again\n');

  process.exit(1);
}

main();
