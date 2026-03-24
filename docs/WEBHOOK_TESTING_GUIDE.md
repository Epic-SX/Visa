# Stripe Webhook Testing Guide

## デモ事故防止チェックリスト

本番・デモ前に必ず以下を確認してください。

---

## A) Webhook疎通の事前確認（必須）

### 1. Stripe Dashboard での確認

1. **Stripe Dashboard にログイン**
   - https://dashboard.stripe.com/

2. **Developers → Webhooks に移動**
   - https://dashboard.stripe.com/webhooks

3. **Webhook エンドポイントを確認**
   - エンドポイント URL: `https://your-domain.com/webhooks/stripe`
   - Events to send: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` など

4. **Event Log を確認**
   - 最近のイベントが 200 OK を返していることを確認
   - ❌ 400/401/403/500 エラーが出ている場合は設定ミス

### 2. Webhook Secret の確認

```bash
# .env ファイルの STRIPE_WEBHOOK_SECRET が Stripe Dashboard の値と一致していることを確認
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

**確認方法:**
1. Stripe Dashboard → Developers → Webhooks
2. 該当のエンドポイントをクリック
3. "Signing secret" をクリックして表示
4. `.env` の値と完全一致することを確認

**⚠️ 不一致の場合:**
- `constructEvent` が失敗し 400 エラーになる
- 決済成功しても entitlement が付与されない → API が 402 でブロックされる

---

## B) Stripe CLI を使ったローカルテスト

開発環境で Webhook をテストする場合、Stripe CLI を使用します。

### 1. Stripe CLI のインストール

**Windows (Scoop):**
```powershell
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

**macOS (Homebrew):**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# Download from https://github.com/stripe/stripe-cli/releases
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz
tar -xvf stripe_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

### 2. Stripe CLI でログイン

```bash
stripe login
```

ブラウザが開き、Stripe アカウントへのアクセスを許可します。

### 3. Webhook のフォワーディング（ローカル開発）

```bash
# ローカルサーバーに Webhook をフォワード
stripe listen --forward-to localhost:8080/webhooks/stripe
```

**出力例:**
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx (^C to quit)
```

このシークレットを `.env` に設定します:
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

### 4. テストイベントの送信

別のターミナルで:

```bash
# payment_intent.succeeded イベントをトリガー
stripe trigger payment_intent.succeeded
```

**期待される動作:**
- サーバーログに `Payment succeeded:` が表示される
- `entitlements` テーブルに `status='succeeded'` のレコードが作成される

---

## C) ステージング環境での Webhook テスト

### 1. Stripe Dashboard で Webhook エンドポイントを追加

1. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
2. Endpoint URL: `https://staging.your-domain.com/webhooks/stripe`
3. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`
4. "Add endpoint" をクリック
5. **Signing secret をコピーして `.env` に設定**

### 2. Webhook の疎通確認

```bash
# Health check エンドポイントで確認
curl https://staging.your-domain.com/health/webhook
```

**期待される出力:**
```json
{
  "status": "configured",
  "timestamp": "2026-02-27T12:00:00.000Z",
  "webhook_endpoint": "/webhooks/stripe",
  "webhook_secret_configured": true,
  "message": "Webhook is configured. Verify signature in Stripe Dashboard."
}
```

### 3. テスト決済を実行

1. フロントエンドから実際に決済を実行
2. Stripe Dashboard → Webhooks → Event Log で確認
3. `/webhooks/stripe` が **200 OK** を返すことを確認

**❌ エラーが出た場合:**

| Status Code | 原因 | 解決方法 |
|-------------|------|---------|
| 400 | Webhook signature 不一致 | `.env` の `STRIPE_WEBHOOK_SECRET` を確認 |
| 401/403 | 認証エラー | CORS 設定を確認 |
| 404 | エンドポイントが見つからない | URL が正しいか確認 |
| 500 | サーバーエラー | サーバーログを確認 |

---

## D) 本番環境チェックリスト

### 1. 環境変数の検証

```bash
# 自動検証スクリプトを実行
node scripts/validate-production-env.js
```

**確認項目:**
- ✅ `STRIPE_SECRET_KEY` が `sk_live_` で始まる
- ✅ `STRIPE_WEBHOOK_SECRET` が `whsec_` で始まる
- ✅ `STRIPE_PRICE_ID_*` が全て設定されている
- ✅ `PDF_FONT_PATH_JA` / `PDF_FONT_PATH_ZH` が存在する
- ✅ `ALLOWED_ORIGINS` が本番ドメインのみ（localhost を含まない）

### 2. Database の確認

```sql
-- entitlements テーブルが存在するか確認
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'entitlements'
);

-- 既存の entitlement を確認
SELECT * FROM entitlements ORDER BY created_at DESC LIMIT 10;
```

### 3. PDF 生成テスト

```bash
# 英語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "en", "sessionId": "test-session-001"}'

# 日本語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "test-session-001"}'

# 中国語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "zh", "sessionId": "test-session-001"}'
```

**期待される動作:**
- ✅ 200 OK が返る
- ✅ PDF ファイルがダウンロードされる
- ✅ 日本語・中国語が文字化けしていない

---

## E) デモバックアップ対策

デモ中に決済が失敗しても結果画面を表示できるよう、事前に entitlement を作成します。

### 1. デモユーザーの作成

```sql
-- デモユーザーを作成（既に存在する場合はスキップ）
INSERT INTO users (id, email, role, created_at)
VALUES ('demo-user-001', 'demo@example.com', 'Client', NOW())
ON CONFLICT (id) DO NOTHING;

-- デモセッションを作成
INSERT INTO diagnostic_sessions (id, user_id, status, created_at)
VALUES ('demo-session-001', 'demo-user-001', 'completed', NOW())
ON CONFLICT (id) DO NOTHING;
```

### 2. 事前 Entitlement の付与

```bash
# SET プラン（全機能アンロック）を付与
node scripts/seed-demo-entitlements.js demo-user-001 demo-session-001 SET
```

**出力例:**
```
✅ Demo entitlement created successfully!

Details:
  ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  User ID: demo-user-001
  Session ID: demo-session-001
  Product Code: SET
  Unlocked Features: [
    "CLIENT_SET_UNLOCKED",
    "CLIENT_BETTER_UNLOCKED",
    "CLIENT_BEST_UNLOCKED",
    "better_result",
    "better_pdf",
    "best_result",
    "best_pdf",
    "ob_commentary"
  ]

🎉 This user can now access premium features without payment!
```

### 3. デモ実行時の注意

- ✅ デモユーザーでログイン
- ✅ デモセッションを使用
- ✅ 決済画面をスキップして直接結果画面にアクセス可能

---

## F) トラブルシューティング

### 問題: Webhook が 200 を返すが entitlement が作成されない

**原因:**
- `metadata` に必須フィールドが不足している
- `payment_context_id` が UUID 形式でない

**解決方法:**
```javascript
// create-payment-intent で必ず以下を設定
const metadata = {
  user_id: userId,
  session_id: sessionId,
  product_code: productCode,
  billing_label: billingLabel,
  payment_context_id: uuidv4() // UUID 必須
};
```

### 問題: PDF 生成が失敗する

**原因:**
- フォントファイルが見つからない
- `PDF_FONT_PATH_JA` / `PDF_FONT_PATH_ZH` が未設定

**解決方法:**
```bash
# Windows の場合
PDF_FONT_PATH_JA=C:/Windows/Fonts/msgothic.ttc
PDF_FONT_PATH_ZH=C:/Windows/Fonts/msyh.ttc

# Linux の場合
PDF_FONT_PATH_JA=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
PDF_FONT_PATH_ZH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

### 問題: 決済後に 402 エラーが出る

**原因:**
- `entitlements` テーブルに `status='succeeded'` のレコードがない
- Webhook が失敗している

**確認方法:**
```sql
-- ユーザーの entitlement を確認
SELECT * FROM entitlements 
WHERE user_id = 'your-user-id' 
  AND session_id = 'your-session-id'
ORDER BY created_at DESC;
```

**解決方法:**
1. Stripe Dashboard → Webhooks → Event Log で 200 OK を確認
2. サーバーログで `[Webhook] Entitlement INSERT/UPDATE completed` を確認
3. 必要に応じて手動で entitlement を作成（デモバックアップ対策）

---

## G) 参考リンク

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Testing Webhooks Locally](https://stripe.com/docs/webhooks/test)
