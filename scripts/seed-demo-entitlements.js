/**
 * デモバックアップ対策: 事前unlock用スクリプト
 * デモ用アカウントに対して事前にentitlementをsucceededで登録
 * 決済実演が失敗しても結果画面を表示可能にする
 * 
 * Usage:
 *   node scripts/seed-demo-entitlements.js <user_id> <session_id> <product_code>
 * 
 * Example:
 *   node scripts/seed-demo-entitlements.js demo-user-001 demo-session-001 SET
 */

require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'visa_assessment',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_SECRET_KEY || 'secret_key',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

/**
 * product_code → unlocked_features マッピング
 * webhook-handler.ts の getUnlockedFeatures() と同一
 */
function getUnlockedFeatures(productCode) {
  const featureMap = {
    'BETTER': ['CLIENT_BETTER_UNLOCKED', 'better_result', 'better_pdf'],
    'BEST': ['CLIENT_BEST_UNLOCKED', 'best_result', 'best_pdf', 'ob_commentary'],
    'SET': [
      'CLIENT_SET_UNLOCKED',
      'CLIENT_BETTER_UNLOCKED',
      'CLIENT_BEST_UNLOCKED',
      'better_result',
      'better_pdf',
      'best_result',
      'best_pdf',
      'ob_commentary'
    ],
    'OPTION_MATCHING': ['CLIENT_MATCHING_UNLOCKED', 'matching_unlock', 'professional_detail_access']
  };

  return featureMap[productCode] || [];
}

async function seedDemoEntitlement(userId, sessionId, productCode) {
  const unlockedFeatures = getUnlockedFeatures(productCode);
  
  if (unlockedFeatures.length === 0) {
    console.error(`❌ Unknown product_code: ${productCode}`);
    console.log('Valid codes: BETTER, BEST, SET, OPTION_MATCHING');
    process.exit(1);
  }

  const paymentContextId = uuidv4();
  const stripePaymentIntentId = `pi_demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const result = await pool.query(`
      INSERT INTO entitlements (
        user_id,
        session_id,
        product_code,
        billing_label,
        payment_context_id,
        stripe_payment_intent_id,
        stripe_event_id,
        status,
        unlocked_features,
        amount_cents,
        currency,
        referrer_id
      ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, 'succeeded', $8, $9, $10, $11)
      ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
        updated_at = now(),
        status = 'succeeded',
        unlocked_features = EXCLUDED.unlocked_features
      RETURNING id, user_id, session_id, product_code, unlocked_features
    `, [
      userId,
      sessionId,
      productCode,
      `DEMO_${productCode}`,
      paymentContextId,
      stripePaymentIntentId,
      `evt_demo_${Date.now()}`,
      JSON.stringify(unlockedFeatures),
      0, // amount_cents (demo)
      'jpy',
      null // referrer_id
    ]);

    const row = result.rows[0];
    console.log('✅ Demo entitlement created successfully!');
    console.log('');
    console.log('Details:');
    console.log(`  ID: ${row.id}`);
    console.log(`  User ID: ${row.user_id}`);
    console.log(`  Session ID: ${row.session_id}`);
    console.log(`  Product Code: ${row.product_code}`);
    console.log(`  Unlocked Features: ${JSON.stringify(row.unlocked_features, null, 2)}`);
    console.log('');
    console.log('🎉 This user can now access premium features without payment!');
  } catch (err) {
    console.error('❌ Failed to seed demo entitlement:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Usage: node scripts/seed-demo-entitlements.js <user_id> <session_id> <product_code>');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/seed-demo-entitlements.js demo-user-001 demo-session-001 SET');
  console.log('');
  console.log('Valid product codes: BETTER, BEST, SET, OPTION_MATCHING');
  process.exit(1);
}

const [userId, sessionId, productCode] = args;

console.log('🔧 Seeding demo entitlement...');
console.log(`  User ID: ${userId}`);
console.log(`  Session ID: ${sessionId}`);
console.log(`  Product Code: ${productCode}`);
console.log('');

seedDemoEntitlement(userId, sessionId, productCode.toUpperCase());
