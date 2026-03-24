/**
 * 本番環境チェックリスト自動検証スクリプト
 * デモ前・本番デプロイ前に実行して設定ミスを防止
 * 
 * Usage:
 *   node scripts/validate-production-env.js
 */

require('dotenv').config();
const fs = require('fs');

const checks = [];
let hasErrors = false;
let hasWarnings = false;

function addCheck(category, name, status, message, severity = 'error') {
  checks.push({ category, name, status, message, severity });
  if (status === 'FAIL') {
    if (severity === 'error') hasErrors = true;
    if (severity === 'warning') hasWarnings = true;
  }
}

console.log('🔍 Production Environment Validation');
console.log('=====================================\n');

// 1. Stripe Configuration
console.log('📦 Checking Stripe Configuration...');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const stripePriceIdBetter = process.env.STRIPE_PRICE_ID_BETTER;
const stripePriceIdBest = process.env.STRIPE_PRICE_ID_BEST;
const stripePriceIdSet = process.env.STRIPE_PRICE_ID_SET;
const stripePriceIdMatching = process.env.STRIPE_PRICE_ID_OPTION_MATCHING;

addCheck(
  'Stripe',
  'STRIPE_SECRET_KEY',
  stripeSecretKey && stripeSecretKey.startsWith('sk_') ? 'PASS' : 'FAIL',
  stripeSecretKey ? 'Secret key configured' : 'Missing STRIPE_SECRET_KEY'
);

addCheck(
  'Stripe',
  'STRIPE_WEBHOOK_SECRET',
  stripeWebhookSecret && stripeWebhookSecret.startsWith('whsec_') ? 'PASS' : 'FAIL',
  stripeWebhookSecret ? 'Webhook secret configured' : 'Missing STRIPE_WEBHOOK_SECRET - Webhook verification will fail!'
);

addCheck(
  'Stripe',
  'Price IDs',
  stripePriceIdBetter && stripePriceIdBest && stripePriceIdSet && stripePriceIdMatching ? 'PASS' : 'FAIL',
  'All product price IDs configured',
  'error'
);

// 2. PDF Font Configuration
console.log('📄 Checking PDF Font Configuration...');

const fontPathJa = process.env.PDF_FONT_PATH_JA;
const fontPathZh = process.env.PDF_FONT_PATH_ZH;

const jaFontExists = fontPathJa && fs.existsSync(fontPathJa);
const zhFontExists = fontPathZh && fs.existsSync(fontPathZh);

addCheck(
  'PDF',
  'PDF_FONT_PATH_JA',
  jaFontExists ? 'PASS' : 'FAIL',
  jaFontExists ? `Japanese font found: ${fontPathJa}` : 'Japanese font not configured or file not found - PDF generation will fail for JA locale!',
  'error'
);

addCheck(
  'PDF',
  'PDF_FONT_PATH_ZH',
  zhFontExists ? 'PASS' : 'FAIL',
  zhFontExists ? `Chinese font found: ${fontPathZh}` : 'Chinese font not configured or file not found - PDF generation will fail for ZH locale!',
  'error'
);

// 3. CORS Configuration
console.log('🌐 Checking CORS Configuration...');

const allowedOrigins = process.env.ALLOWED_ORIGINS || '';
const origins = allowedOrigins.split(',').map(o => o.trim()).filter(Boolean);

const hasLocalhost = origins.some(o => o.includes('localhost') || o.includes('127.0.0.1'));
const isProduction = process.env.NODE_ENV === 'production';

addCheck(
  'CORS',
  'ALLOWED_ORIGINS',
  origins.length > 0 ? 'PASS' : 'FAIL',
  `${origins.length} origin(s) configured: ${origins.join(', ')}`,
  'error'
);

if (isProduction && hasLocalhost) {
  addCheck(
    'CORS',
    'Production Origins',
    'FAIL',
    'WARNING: localhost origins detected in production environment!',
    'warning'
  );
}

// 4. Database Configuration
console.log('🗄️  Checking Database Configuration...');

const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_SECRET_KEY;

addCheck(
  'Database',
  'DB Configuration',
  dbHost && dbPort && dbName && dbUser && dbPassword ? 'PASS' : 'FAIL',
  'All database credentials configured'
);

// 5. LLM Configuration
console.log('🤖 Checking LLM Configuration...');

const difyEndpoint = process.env.DIFY_API_ENDPOINT;

addCheck(
  'LLM',
  'DIFY_API_ENDPOINT',
  difyEndpoint ? 'PASS' : 'FAIL',
  difyEndpoint ? `Endpoint: ${difyEndpoint}` : 'Missing DIFY_API_ENDPOINT'
);

// Print Results
async function printResults() {

  console.log('\n📊 Validation Results');
  console.log('=====================\n');

  const categories = [...new Set(checks.map(c => c.category))];

  categories.forEach(category => {
    console.log(`\n${category}:`);
    checks.filter(c => c.category === category).forEach(check => {
      const icon = check.status === 'PASS' ? '✅' : (check.severity === 'warning' ? '⚠️' : '❌');
      console.log(`  ${icon} ${check.name}: ${check.message}`);
    });
  });

  console.log('\n' + '='.repeat(50));
  
  const passCount = checks.filter(c => c.status === 'PASS').length;
  const failCount = checks.filter(c => c.status === 'FAIL').length;
  const totalCount = checks.length;

  console.log(`\nTotal: ${passCount}/${totalCount} checks passed`);

  if (hasErrors) {
    console.log('\n❌ CRITICAL ERRORS FOUND - Fix before deployment!');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('\n⚠️  WARNINGS FOUND - Review before deployment');
    process.exit(0);
  } else {
    console.log('\n✅ All checks passed - Ready for deployment!');
    process.exit(0);
  }
}

printResults().catch(err => {
  console.error('Validation script error:', err);
  process.exit(1);
});
