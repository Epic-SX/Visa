/**
 * Audit evidence: Search for prohibited expressions in the repository.
 * Outputs matches (if any) to stdout. Exit 0 = no matches (pass), 1 = matches found (fail).
 *
 * Usage: node scripts/check-prohibited-words.js
 * Or: npm run check:prohibited-words
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];

// Patterns use Unicode escapes so this script does not contain literal prohibited chars
const PATTERNS = [
  { name: '禁止表現(日本語)', regex: /\u5408\u683c|\u6210\u529f\u7387|\u8a31\u53ef\u7387|\u901a\u904e\u53ef\u80fd\u6027|\u627f\u8a8d\u3055\u308c\u308b\u53ef\u80fd\u6027/ },
  { name: 'Unicodeエスケープ', regex: /\\u5408\\u683c|\\u6210\\u529f\\u7387|\\u8a31\\u53ef\\u7387/ },
  { name: 'English prohibited', regex: /success\s+rate|approval\s+probability|guaranteed\s+approval|high\s+chance\s+of\s+approval/gi }
];

function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.includes(e.name)) walk(full, callback);
    } else {
      callback(full);
    }
  }
}

function search(filePath) {
  const relative = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
  const matches = [];

  for (const { name, regex } of PATTERNS) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push({ pattern: name, file: relative, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  return matches;
}

let total = 0;

console.log('=== 禁止表現 監査チェック ===\n');

for (const { name, regex } of PATTERNS) {
  console.log(`パターン: ${name}`);
  let count = 0;
  walk(ROOT, (filePath) => {
    const ext = path.extname(filePath);
    if (!['.ts', '.tsx', '.js', '.jsx', '.json', '.sql', '.md', '.yml', '.yaml'].includes(ext)) return;
    const relative = path.relative(ROOT, filePath);
    if (relative === 'scripts\\check-prohibited-words.js' || relative === 'scripts/check-prohibited-words.js') return;
    if (relative.startsWith('node_modules') || relative.includes('\\node_modules\\')) return;
    // Skip docs/: compliance guidelines describe "do not use" these terms, not user-facing content
    if (relative.startsWith('docs') || relative.startsWith('docs\\') || relative.startsWith('docs/')) return;

    const content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        console.log(`  ${relative}:${i + 1}: ${lines[i].trim().slice(0, 80)}`);
        count++;
      }
    }
  });
  console.log(`  一致件数: ${count}\n`);
  total += count;
}

console.log('=== 結果 ===');
console.log(`合計一致件数: ${total}`);
console.log(total === 0 ? '合格: 禁止表現は見つかりませんでした。' : '不合格: 禁止表現が見つかりました。');

process.exit(total === 0 ? 0 : 1);
