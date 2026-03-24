# クイックリファレンス

デモ・本番運用時の緊急対応マニュアル

---

## 🚨 緊急対応コマンド

### 決済後に 402 エラーが出た場合

```bash
# 手動で entitlement を付与（SET プラン = 全機能）
npm run db:seed:demo-entitlements <user_id> <session_id> SET
```

**例:**
```bash
npm run db:seed:demo-entitlements user-123 session-456 SET
```

### 環境設定を一括確認

```bash
# 全ての設定を自動検証
npm run validate:production
```

### Webhook の状態確認

```bash
# Webhook health check
curl https://your-domain.com/health/webhook
```

### PDF 生成テスト

```bash
# 英語
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "en", "sessionId": "test-session"}'

# 日本語
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "test-session"}'
```

---

## 📊 データベース確認クエリ

### Entitlement の確認

```sql
-- 最新の entitlement（成功のみ）
SELECT * FROM entitlements 
WHERE status = 'succeeded' 
ORDER BY created_at DESC 
LIMIT 10;

-- 特定ユーザーの entitlement
SELECT * FROM entitlements 
WHERE user_id = 'user-id-here' 
ORDER BY created_at DESC;

-- 失敗した entitlement
SELECT * FROM entitlements 
WHERE status != 'succeeded' 
ORDER BY created_at DESC;
```

### Webhook イベントの確認

```sql
-- 最新の Webhook イベント
SELECT * FROM webhook_events 
ORDER BY processed_at DESC 
LIMIT 10;

-- 失敗した Webhook イベント
SELECT * FROM webhook_events 
WHERE status = 'failed' 
ORDER BY processed_at DESC;
```

---

## 🔧 環境変数チェックリスト

### 必須項目

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_... または sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_BETTER=price_...
STRIPE_PRICE_ID_BEST=price_...
STRIPE_PRICE_ID_SET=price_...
STRIPE_PRICE_ID_OPTION_MATCHING=price_...

# PDF フォント（日本語・中国語で必須）
PDF_FONT_PATH_JA=C:/Windows/Fonts/msgothic.ttc
PDF_FONT_PATH_ZH=C:/Windows/Fonts/msyh.ttc

# CORS（本番では localhost を削除）
ALLOWED_ORIGINS=https://your-domain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

---

## 📱 Stripe Dashboard チェック

### Webhook 疎通確認

1. https://dashboard.stripe.com/webhooks
2. エンドポイント: `https://your-domain.com/webhooks/stripe`
3. Event Log で最近のイベントが **200 OK** を返しているか確認

### Webhook Secret の取得

1. Stripe Dashboard → Developers → Webhooks
2. 該当のエンドポイントをクリック
3. "Signing secret" → "Reveal" → コピー
4. `.env` の `STRIPE_WEBHOOK_SECRET` に貼り付け

---

## 🎯 Product Code と Feature のマッピング

| Product Code | Unlocked Features |
|--------------|-------------------|
| `BETTER` | `CLIENT_BETTER_UNLOCKED`, `better_result`, `better_pdf` |
| `BEST` | `CLIENT_BEST_UNLOCKED`, `best_result`, `best_pdf`, `ob_commentary` |
| `SET` | 上記全て + `CLIENT_SET_UNLOCKED` |
| `OPTION_MATCHING` | `CLIENT_MATCHING_UNLOCKED`, `matching_unlock`, `professional_detail_access` |

---

## 🔍 ログ確認コマンド

```bash
# 全ログをリアルタイム監視
tail -f logs/app.log

# Webhook ログのみ
tail -f logs/app.log | grep "\[Webhook\]"

# エラーログのみ
tail -f logs/app.log | grep "ERROR"

# 特定ユーザーのログ
tail -f logs/app.log | grep "user-id-here"
```

---

## 🎬 デモ用コマンド

### デモユーザーの準備

```bash
# 1. デモユーザーに全機能を付与
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 SET

# 2. 確認
psql $DATABASE_URL -c "SELECT * FROM entitlements WHERE user_id='demo-user-001';"
```

### デモ実行

1. デモユーザーでログイン: `demo-user-001`
2. デモセッションを使用: `demo-session-001`
3. 決済画面をスキップして直接結果画面にアクセス可能

---

## 📞 トラブルシューティング

### 症状: Webhook が 400 エラー

**原因:** `STRIPE_WEBHOOK_SECRET` が不一致

**解決:**
1. Stripe Dashboard で Signing Secret を確認
2. `.env` を更新
3. サーバー再起動

### 症状: PDF 生成が 500 エラー

**原因:** フォントファイルが見つからない

**解決:**
1. `.env` のフォントパスを確認
2. ファイルが存在するか確認
3. サーバー再起動

### 症状: 決済後に 402 エラー

**原因:** Entitlement が作成されていない

**解決:**
```bash
# 手動で entitlement を付与
npm run db:seed:demo-entitlements <user_id> <session_id> SET
```

### 症状: CORS エラー

**原因:** `ALLOWED_ORIGINS` にドメインが含まれていない

**解決:**
1. `.env` に正しいドメインを追加
2. サーバー再起動

---

## 📚 詳細ドキュメント

- [Webhook Testing Guide](./WEBHOOK_TESTING_GUIDE.md) - Webhook の詳細テスト手順
- [Demo Preparation](./DEMO_PREPARATION.md) - デモ準備の完全チェックリスト
- [Environment Variables](../.env.example) - 環境変数の説明

---

## ⚡ ワンライナー集

```bash
# 環境検証 + Webhook 確認 + PDF テスト（一括実行）
npm run validate:production && \
curl https://your-domain.com/health/webhook && \
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "test"}'

# デモユーザー作成 + entitlement 付与（一括実行）
psql $DATABASE_URL -c "INSERT INTO users (id, email, role) VALUES ('demo-user-001', 'demo@example.com', 'Client') ON CONFLICT DO NOTHING;" && \
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 SET

# 最新の entitlement と webhook イベントを確認
psql $DATABASE_URL -c "SELECT * FROM entitlements ORDER BY created_at DESC LIMIT 5;" && \
psql $DATABASE_URL -c "SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT 5;"
```
