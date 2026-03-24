/**
 * E-12: 決済 → unlock → 診断 の E2E テスト
 *
 * Stripe テストモードで以下を自動検証する想定:
 * 1. 決済 API で PaymentIntent 作成
 * 2. Webhook で payment_intent.succeeded 受信 → entitlement 作成
 * 3. 診断 API が entitlement 必須で 402 なしで JSON 取得可能
 *
 * 実行前に .env に STRIPE_SECRET_KEY (sk_test_...), STRIPE_WEBHOOK_SECRET,
 * STRIPE_PRICE_ID_BETTER 等を設定し、Stripe CLI で Webhook 転送するか
 * テスト用の Webhook エンドポイントを用意すること。
 *
 * CI では Stripe テストモード＋Webhook モックまたは転送で自動成功確認を推奨。
 */

describe('Payment flow E2E', () => {
  it('should create payment intent and require entitlement for diagnosis', async () => {
    // TODO: 1. Create session / auth token
    // TODO: 2. POST /api/payment/create-payment-intent with product_code BETTER, session_id
    // TODO: 3. Simulate or forward Stripe webhook payment_intent.succeeded with metadata
    // TODO: 4. POST /api/diagnosis/run with same session_id → expect 200 and full JSON
    // TODO: 5. Without payment: POST /api/diagnosis/run → expect 402
    expect(true).toBe(true); // placeholder until Stripe test mode + webhook is wired
  });
});
