# デモ準備チェックリスト

本番デモ・ステージングデプロイ前の必須確認事項

---

## 📋 事前準備（デモ24時間前）

### 1. 環境変数の検証

```bash
# 自動検証スクリプトを実行
npm run validate:production
```

**確認項目:**
- ✅ Stripe API キー（本番 or テスト）
- ✅ Stripe Webhook Secret
- ✅ PDF フォントパス（日本語・中国語）
- ✅ CORS 設定（本番ドメインのみ）
- ✅ Database 接続
- ✅ JWT Secret（デフォルト値でないこと）

### 2. Stripe Webhook の疎通確認

```bash
# Webhook health check
curl https://your-domain.com/health/webhook
```

**期待される出力:**
```json
{
  "status": "configured",
  "webhook_secret_configured": true
}
```

**Stripe Dashboard で確認:**
1. https://dashboard.stripe.com/webhooks
2. エンドポイント: `https://your-domain.com/webhooks/stripe`
3. 最近のイベントが **200 OK** を返していることを確認

### 3. デモユーザーの準備

```bash
# デモユーザーに SET プラン（全機能）を付与
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 SET
```

**確認:**
```sql
SELECT * FROM entitlements 
WHERE user_id = 'demo-user-001' 
  AND status = 'succeeded';
```

---

## 🎯 デモ当日（開始30分前）

### 1. サーバーヘルスチェック

```bash
# 全体ヘルスチェック
curl https://your-domain.com/health

# Webhook ヘルスチェック
curl https://your-domain.com/health/webhook
```

### 2. PDF 生成テスト

```bash
# 英語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "en", "sessionId": "demo-session-001"}'

# 日本語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "demo-session-001"}'
```

**確認:**
- ✅ 200 OK が返る
- ✅ PDF がダウンロードされる
- ✅ 文字化けしていない
- ✅ "Todo:" が各言語で正しく表示される（英: "Todo:", 日: "対応事項:", 中: "待办事项:"）

### 3. 決済フローのテスト

**テストカード:**
```
カード番号: 4242 4242 4242 4242
有効期限: 任意の未来の日付
CVC: 任意の3桁
郵便番号: 任意
```

**確認項目:**
1. ✅ 決済画面が表示される
2. ✅ 決済が成功する
3. ✅ Webhook が 200 OK を返す
4. ✅ `entitlements` テーブルに `status='succeeded'` が作成される
5. ✅ 結果画面にアクセスできる（402 エラーが出ない）

---

## 🚨 デモ事故防止策

### A) Webhook 疎通失敗時のバックアップ

**症状:**
- 決済は成功するが、結果画面で 402 エラーが出る
- Stripe Dashboard で Webhook が 400/500 エラーを返している

**即座の対応:**
```bash
# 手動で entitlement を付与
npm run db:seed:demo-entitlements <user_id> <session_id> SET
```

または SQL で直接:
```sql
INSERT INTO entitlements (
  user_id, session_id, product_code, billing_label,
  payment_context_id, stripe_payment_intent_id, stripe_event_id,
  status, unlocked_features, amount_cents, currency
) VALUES (
  'user-id-here',
  'session-id-here',
  'SET',
  'DEMO_SET',
  gen_random_uuid(),
  'pi_demo_manual',
  'evt_demo_manual',
  'succeeded',
  '["CLIENT_SET_UNLOCKED","CLIENT_BETTER_UNLOCKED","CLIENT_BEST_UNLOCKED","better_result","better_pdf","best_result","best_pdf","ob_commentary"]'::jsonb,
  0,
  'jpy'
);
```

### B) PDF 生成失敗時のバックアップ

**症状:**
- PDF ダウンロードボタンを押すと 500 エラー
- サーバーログに "font file not found" エラー

**即座の対応:**
1. `.env` のフォントパスを確認
2. フォントファイルが存在するか確認
3. サーバーを再起動

**Windows:**
```bash
PDF_FONT_PATH_JA=C:/Windows/Fonts/msgothic.ttc
PDF_FONT_PATH_ZH=C:/Windows/Fonts/msyh.ttc
```

**Linux:**
```bash
PDF_FONT_PATH_JA=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
PDF_FONT_PATH_ZH=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
```

### C) CORS エラー時のバックアップ

**症状:**
- フロントエンドから API を呼ぶと 403 エラー
- ブラウザコンソールに "CORS policy" エラー

**即座の対応:**
```bash
# .env に正しいフロントエンドドメインを追加
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://staging.your-frontend-domain.com
```

サーバーを再起動:
```bash
npm run start
```

---

## 📊 デモ中のモニタリング

### 1. リアルタイムログ監視

```bash
# サーバーログをリアルタイムで監視
tail -f logs/app.log

# Webhook イベントのみフィルタ
tail -f logs/app.log | grep "\[Webhook\]"
```

### 2. Stripe Dashboard 監視

- https://dashboard.stripe.com/webhooks
- Event Log をリアルタイムで確認
- 200 OK が返っているか確認

### 3. Database 監視

```sql
-- 最新の entitlement を確認
SELECT * FROM entitlements 
ORDER BY created_at DESC 
LIMIT 10;

-- 失敗した entitlement を確認
SELECT * FROM entitlements 
WHERE status != 'succeeded' 
ORDER BY created_at DESC;
```

---

## ✅ デモ後の確認事項

### 1. Webhook イベントログの確認

```sql
-- 全 Webhook イベントを確認
SELECT * FROM webhook_events 
ORDER BY processed_at DESC 
LIMIT 20;

-- 失敗したイベントを確認
SELECT * FROM webhook_events 
WHERE status = 'failed' 
ORDER BY processed_at DESC;
```

### 2. Entitlement の確認

```sql
-- 全 entitlement の統計
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount_cents) as total_amount
FROM entitlements
GROUP BY status;

-- 最近の entitlement
SELECT 
  user_id,
  session_id,
  product_code,
  status,
  created_at
FROM entitlements
ORDER BY created_at DESC
LIMIT 20;
```

### 3. エラーログの確認

```bash
# エラーログを確認
grep "ERROR" logs/app.log

# Webhook エラーを確認
grep "Webhook.*error" logs/app.log
```

---

## 🔧 トラブルシューティング

### Q1: 決済後に 402 エラーが出る

**原因:**
- Webhook が失敗している
- `entitlements` テーブルに `status='succeeded'` がない

**解決方法:**
1. Stripe Dashboard で Webhook ログを確認
2. サーバーログで `[Webhook] Entitlement INSERT/UPDATE completed` を確認
3. 手動で entitlement を付与（上記 A) 参照）

### Q2: PDF がダウンロードできない

**原因:**
- フォントファイルが見つからない
- `PDF_FONT_PATH_JA` / `PDF_FONT_PATH_ZH` が未設定

**解決方法:**
1. `.env` のフォントパスを確認
2. フォントファイルが存在するか確認
3. サーバーを再起動

### Q3: Webhook が 400 エラーを返す

**原因:**
- `STRIPE_WEBHOOK_SECRET` が不一致
- Stripe Dashboard の Signing Secret と `.env` の値が異なる

**解決方法:**
1. Stripe Dashboard → Webhooks → Signing Secret をコピー
2. `.env` の `STRIPE_WEBHOOK_SECRET` を更新
3. サーバーを再起動

### Q4: CORS エラーが出る

**原因:**
- `ALLOWED_ORIGINS` にフロントエンドドメインが含まれていない

**解決方法:**
1. `.env` の `ALLOWED_ORIGINS` を確認
2. フロントエンドドメインを追加
3. サーバーを再起動

---

## 📚 関連ドキュメント

- [Webhook Testing Guide](./WEBHOOK_TESTING_GUIDE.md)
- [Environment Variables](./.env.example)
- [Database Migrations](../migrations/)
- [Stripe Integration](./STRIPE_CONNECT_REFERRER_DESIGN.md)

---

## 🎬 デモシナリオ例

### シナリオ1: 通常フロー（決済あり）

1. ✅ ユーザー登録
2. ✅ 診断フォーム入力
3. ✅ Good 層結果表示
4. ✅ Better プラン購入（決済）
5. ✅ Better 結果表示
6. ✅ PDF ダウンロード

### シナリオ2: デモフロー（決済なし）

1. ✅ デモユーザーでログイン（`demo-user-001`）
2. ✅ デモセッションを使用（`demo-session-001`）
3. ✅ 診断フォーム入力（スキップ可）
4. ✅ 決済画面をスキップ
5. ✅ 全機能（SET プラン）にアクセス可能
6. ✅ PDF ダウンロード（全言語）

---

## 📞 緊急連絡先

**デモ中にトラブルが発生した場合:**

1. まず上記のバックアップ対応を実施
2. それでも解決しない場合は開発チームに連絡
3. 最悪の場合はデモユーザー（事前 unlock 済み）に切り替え

**連絡先:**
- 開発チーム: [連絡先を記入]
- Slack: [チャンネル名を記入]
- 緊急電話: [電話番号を記入]
