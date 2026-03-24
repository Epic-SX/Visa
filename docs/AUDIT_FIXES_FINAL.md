# 最終監査対応完了報告

## 修正完了日: 2026-02-27

---

## 📋 修正内容サマリー

### A) ✅ PDFの言語フォールバック時に免責を再計算（最優先）

**問題:**
- フォント未設定時に英語にフォールバックするが、`disclaimerFixed` が元の言語（JA/ZH）のまま
- 免責文言が言語不一致で表示される可能性

**修正内容:**

1. **`actualLocale` 変数を導入**
   - フォールバック発生時に `actualLocale = 'en'` に切り替え
   - 以降の処理は全て `actualLocale` を使用

2. **免責文言を英語で再計算**
   - `t = getI18n('en')` で英語 i18n を完全に差し替え
   - `disclaimerFixed` を英語の `pdf.disclaimer_fixed` から再生成
   - 本文・フッターとも英語に統一

3. **prohibited filter も英語で適用**
   - `applyProhibitedFilter()` に `actualLocale` を渡す
   - 全てのコンテンツが英語として処理される

**修正ファイル:**
- `src/backend/utils/pdf-generator.ts`

**動作:**
```
フォント設定あり:
  safeLocale = 'ja' → actualLocale = 'ja'
  → 日本語 i18n、日本語免責、日本語フィルタ

フォント設定なし:
  safeLocale = 'ja' → actualLocale = 'en' (フォールバック)
  → 英語 i18n、英語免責、英語フィルタ
  → PDF 最上部に警告メッセージ表示
```

---

### B) ✅ Webhookの entitlement 付与を "payment_context_id のDB照合" で強化

**問題:**
- metadata だけで権限付与するため、改ざんリスクがある
- 悪意のある PaymentIntent で不正な entitlement が作成される可能性

**修正内容:**

1. **`payment_contexts` テーブル追加**
   - Migration: `migrations/005_payment_contexts.sql`
   - PaymentIntent 作成時に決済予定レコードを保存
   - 有効期限: 24時間（デフォルト）

2. **PaymentIntent 作成時に DB 保存**
   - `controller.ts` で `payment_context_id` を DB に INSERT
   - `user_id`, `session_id`, `product_code`, `billing_label`, `referrer_id` を保存
   - status = 'pending'

3. **Webhook 受信時に DB 照合**
   - `payment_context_id` が DB に存在するか確認
   - DB の値と metadata の値を照合（改ざん検知）
   - 不一致の場合は entitlement を作成せず破棄（ログのみ）

4. **status 管理**
   - `pending` → `processing` → `succeeded` / `failed`
   - entitlement 作成成功時: `succeeded`
   - entitlement 作成失敗時: `failed`

**セキュリティ強化:**
```
✅ DB に存在しない payment_context_id は破棄
✅ metadata と DB の値が不一致の場合は破棄
✅ 改ざん検知ログを出力
✅ 正規の決済のみ entitlement 付与
```

**修正ファイル:**
- `migrations/005_payment_contexts.sql` (新規)
- `src/backend/api/payment/controller.ts` (DB 保存追加)
- `src/backend/payment/webhook-handler.ts` (DB 照合追加)

---

### C) ✅ Stripeの Product名 / Statement Descriptor / 領収書備考の固定

**問題:**
- 商品名・明細表示・領収書備考が未設定
- 誤認リスク（紹介・成果報酬と誤解される可能性）

**修正内容:**

1. **固定文言を定義**
   ```typescript
   const STRIPE_FIXED_STRINGS = {
     // 商品名（内部表示/明細向け）
     PRODUCT_NAME: 'INSIGHTBRIDGE_DIAG',
     
     // Statement Descriptor（カード明細に表示、最大22文字）
     STATEMENT_DESCRIPTOR: 'INSIGHTBRIDGE',
     
     // 領収書備考（固定文言）
     RECEIPT_NOTE: 'This service provides information only and does not constitute legal advice or guarantee visa approval. Not a referral or success-based fee service.'
   };
   ```

2. **PaymentIntent 作成時に設定**
   - `description`: 商品名（固定）
   - `statement_descriptor_suffix`: カード明細表示（固定）
   - `metadata.receipt_note`: 領収書備考（固定）

3. **クライアント入力禁止**
   - 全てサーバ側で固定値を設定
   - クライアントから変更不可

**表示例:**
```
カード明細: INSIGHTBRIDGE
領収書: This service provides information only and does not constitute 
        legal advice or guarantee visa approval. Not a referral or 
        success-based fee service.
```

**修正ファイル:**
- `src/backend/api/payment/controller.ts`

---

## 🗂️ 新規作成ファイル

1. **`migrations/005_payment_contexts.sql`**
   - payment_contexts テーブル作成
   - Indexes 追加
   - Auto-update trigger 追加

---

## 🔧 修正ファイル

1. **`src/backend/utils/pdf-generator.ts`**
   - `actualLocale` 変数導入
   - フォールバック時の免責再計算
   - 全コンテンツを英語で処理

2. **`src/backend/api/payment/controller.ts`**
   - payment_context の DB 保存
   - 固定文言の追加（商品名・明細・領収書）

3. **`src/backend/payment/webhook-handler.ts`**
   - payment_context_id の DB 照合
   - metadata と DB の値の照合
   - status 管理（pending → processing → succeeded/failed）

---

## 🧪 テスト方法

### A) PDF 言語フォールバックテスト

```bash
# フォントパスを削除または無効化
# PDF_FONT_PATH_JA=
# PDF_FONT_PATH_ZH=

# 日本語 PDF を生成
curl -X POST http://localhost:8080/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "test-session"}'

# 期待される動作:
# ✅ 500 エラーにならない
# ✅ 英語 PDF が生成される
# ✅ PDF 最上部に警告メッセージが表示される
# ✅ 免責文言も英語で表示される
```

### B) payment_context_id 照合テスト

```bash
# 1. 正常な決済フロー
curl -X POST http://localhost:8080/api/payment/create-payment-intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "product_code": "BETTER",
    "session_id": "test-session-001"
  }'

# DB 確認
psql $DATABASE_URL -c "SELECT * FROM payment_contexts ORDER BY created_at DESC LIMIT 1;"

# 期待される動作:
# ✅ payment_contexts に pending レコードが作成される
# ✅ payment_context_id が UUID 形式
# ✅ user_id, session_id, product_code が正しく保存される

# 2. Webhook 受信後
# ✅ payment_contexts の status が succeeded に更新される
# ✅ entitlements に succeeded レコードが作成される
```

### C) 固定文言テスト

```bash
# PaymentIntent を作成
curl -X POST http://localhost:8080/api/payment/create-payment-intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "product_code": "BETTER",
    "session_id": "test-session-001"
  }'

# Stripe Dashboard で確認:
# ✅ Description: INSIGHTBRIDGE_DIAG
# ✅ Statement Descriptor: INSIGHTBRIDGE
# ✅ Metadata に receipt_note が含まれる
```

---

## 📊 セキュリティ強化効果

### Before（修正前）

```
❌ metadata のみで権限付与
❌ 改ざんされた metadata でも entitlement 作成
❌ 不正な PaymentIntent で権限取得可能
```

### After（修正後）

```
✅ DB 照合で正規の決済のみ処理
✅ metadata と DB の値を照合（改ざん検知）
✅ 不正な payment_context_id は破棄
✅ 改ざん試行をログに記録
✅ セキュリティログで監視可能
```

---

## 🔍 監視ポイント

### 1. 改ざん検知ログ

```bash
# payment_context_id not found（攻撃の可能性）
grep "payment_context_id not found in DB" logs/app.log

# metadata 不一致（改ざんの可能性）
grep "payment_context mismatch" logs/app.log
```

### 2. payment_contexts の状態確認

```sql
-- 期限切れレコード
SELECT * FROM payment_contexts 
WHERE expires_at < NOW() 
  AND status = 'pending';

-- 失敗したレコード
SELECT * FROM payment_contexts 
WHERE status = 'failed' 
ORDER BY created_at DESC;

-- 処理中のまま停止しているレコード
SELECT * FROM payment_contexts 
WHERE status = 'processing' 
  AND updated_at < NOW() - INTERVAL '1 hour';
```

### 3. 定期クリーンアップ（推奨）

```sql
-- 期限切れレコードを削除（cron で実行推奨）
DELETE FROM payment_contexts 
WHERE expires_at < NOW() - INTERVAL '7 days';
```

---

## 📚 関連ドキュメント

- [AUDIT_FIXES.md](./AUDIT_FIXES.md) - 前回の監査対応
- [Webhook Testing Guide](./WEBHOOK_TESTING_GUIDE_EN.md)
- [Demo Preparation](./DEMO_PREPARATION.md)

---

## ✅ チェックリスト

### デプロイ前

- [ ] Migration 実行: `migrations/005_payment_contexts.sql`
- [ ] PDF フォントパスを設定（本番環境）
- [ ] 固定文言が正しく表示されることを確認
- [ ] payment_contexts テーブルが作成されていることを確認

### デプロイ後

- [ ] PDF 生成テスト（JA/ZH/EN）
- [ ] 決済フロー全体のテスト
- [ ] payment_contexts の状態確認
- [ ] Stripe Dashboard で固定文言を確認
- [ ] 改ざん検知ログの監視設定

### 運用

- [ ] payment_contexts の定期クリーンアップ設定
- [ ] 改ざん検知ログの監視
- [ ] 失敗レコードの定期確認

---

**修正完了日:** 2026-02-27  
**修正者:** AI Assistant  
**レビュー状態:** ✅ 全修正完了・レビュー待ち
