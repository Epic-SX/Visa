# デプロイ・運用ガイド

本番環境へのデプロイとデモ実施のための完全ガイド

---

## 🚀 クイックスタート

### 1. 環境検証（必須）

```bash
# 全ての設定を自動検証
npm run validate:production
```

### 2. Webhook 疎通確認（必須）

```bash
# Webhook の設定状態を確認
curl https://your-domain.com/health/webhook
```

### 3. デモユーザー準備（デモ時のみ）

```bash
# デモユーザーに全機能を付与
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 SET
```

---

## 📚 ドキュメント一覧

### 必読ドキュメント

1. **[Milestone 1 Fixes Summary](./docs/MILESTONE1_FIXES_SUMMARY.md)**
   - 全修正内容のサマリー
   - コードレビュー対応状況

2. **[Quick Reference](./docs/QUICK_REFERENCE.md)**
   - 緊急対応コマンド集
   - トラブルシューティング
   - ワンライナー集

3. **[Demo Preparation](./docs/DEMO_PREPARATION.md)**
   - デモ準備の完全チェックリスト
   - デモ事故防止策
   - デモ中のモニタリング

4. **[Webhook Testing Guide](./docs/WEBHOOK_TESTING_GUIDE.md)**
   - Webhook の詳細テスト手順
   - Stripe CLI の使い方
   - トラブルシューティング

---

## 🛠️ 便利なスクリプト

### 環境検証

```bash
# 本番環境の設定を一括検証
npm run validate:production

# または
npm run validate:env
```

**検証項目:**
- Stripe 設定（API キー、Webhook Secret、Price IDs）
- PDF フォント設定（日本語・中国語）
- CORS 設定
- Database 接続
- JWT Secret
- LLM 設定

### デモユーザー管理

```bash
# デモユーザーに entitlement を付与
npm run db:seed:demo-entitlements <user_id> <session_id> <product_code>

# 例: SET プラン（全機能）を付与
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 SET

# 例: BETTER プランのみ付与
npm run db:seed:demo-entitlements demo-user-001 demo-session-001 BETTER
```

**Product Codes:**
- `BETTER`: Better 診断結果のみ
- `BEST`: Best 診断結果のみ
- `SET`: 全機能（Better + Best + マッチング）
- `OPTION_MATCHING`: マッチング機能のみ

---

## 🔍 ヘルスチェック

### サーバーヘルスチェック

```bash
# 全体のヘルスチェック
curl https://your-domain.com/health

# Webhook 設定の確認
curl https://your-domain.com/health/webhook
```

### PDF 生成テスト

```bash
# 英語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "en", "sessionId": "test-session"}'

# 日本語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "ja", "sessionId": "test-session"}'

# 中国語 PDF
curl -X POST https://your-domain.com/api/diagnosis/generate-pdf \
  -H "Content-Type: application/json" \
  -d '{"locale": "zh", "sessionId": "test-session"}'
```

---

## 🚨 緊急対応

### 決済後に 402 エラーが出た場合

```bash
# 手動で entitlement を付与
npm run db:seed:demo-entitlements <user_id> <session_id> SET
```

### Webhook が失敗している場合

1. Stripe Dashboard で Event Log を確認
2. `.env` の `STRIPE_WEBHOOK_SECRET` を確認
3. サーバーを再起動

### PDF 生成が失敗する場合

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

---

## 📊 モニタリング

### ログ監視

```bash
# リアルタイムログ監視
tail -f logs/app.log

# Webhook ログのみ
tail -f logs/app.log | grep "\[Webhook\]"

# エラーログのみ
tail -f logs/app.log | grep "ERROR"
```

### Database 監視

```sql
-- 最新の entitlement
SELECT * FROM entitlements 
ORDER BY created_at DESC 
LIMIT 10;

-- 失敗した entitlement
SELECT * FROM entitlements 
WHERE status != 'succeeded' 
ORDER BY created_at DESC;

-- Webhook イベント
SELECT * FROM webhook_events 
ORDER BY processed_at DESC 
LIMIT 10;
```

---

## 🎯 デプロイチェックリスト

### デプロイ前（24時間前）

- [ ] `npm run validate:production` を実行
- [ ] Stripe Dashboard で Webhook エンドポイントを確認
- [ ] `.env` の全ての環境変数を確認
- [ ] Database マイグレーションを実行
- [ ] PDF フォントファイルの存在を確認

### デプロイ前（1時間前）

- [ ] サーバーヘルスチェック: `curl https://your-domain.com/health`
- [ ] Webhook ヘルスチェック: `curl https://your-domain.com/health/webhook`
- [ ] PDF 生成テスト（英語・日本語・中国語）
- [ ] デモユーザーの準備

### デプロイ後

- [ ] サーバーが起動していることを確認
- [ ] Database 接続を確認
- [ ] Webhook が 200 OK を返すことを確認
- [ ] テスト決済を実行
- [ ] PDF ダウンロードを確認

---

## 🎬 デモシナリオ

### シナリオ1: 通常フロー（決済あり）

1. ユーザー登録
2. 診断フォーム入力
3. Good 層結果表示
4. Better プラン購入（決済）
5. Better 結果表示
6. PDF ダウンロード

### シナリオ2: デモフロー（決済なし）

1. デモユーザーでログイン（`demo-user-001`）
2. デモセッションを使用（`demo-session-001`）
3. 診断フォーム入力（スキップ可）
4. 決済画面をスキップ
5. 全機能（SET プラン）にアクセス可能
6. PDF ダウンロード（全言語）

---

## 🔗 重要なリンク

### Stripe

- [Dashboard](https://dashboard.stripe.com/)
- [Webhooks](https://dashboard.stripe.com/webhooks)
- [API Keys](https://dashboard.stripe.com/apikeys)
- [Prices](https://dashboard.stripe.com/prices)

### ドキュメント

- [Milestone 1 Fixes Summary](./docs/MILESTONE1_FIXES_SUMMARY.md)
- [Quick Reference](./docs/QUICK_REFERENCE.md)
- [Demo Preparation](./docs/DEMO_PREPARATION.md)
- [Webhook Testing Guide](./docs/WEBHOOK_TESTING_GUIDE.md)

---

## 📞 サポート

### トラブルシューティング

1. まず [Quick Reference](./docs/QUICK_REFERENCE.md) を確認
2. [Webhook Testing Guide](./docs/WEBHOOK_TESTING_GUIDE.md) のトラブルシューティングセクションを確認
3. それでも解決しない場合は開発チームに連絡

### 連絡先

- 開発チーム: [連絡先を記入]
- Slack: [チャンネル名を記入]
- 緊急電話: [電話番号を記入]

---

## 📝 変更履歴

### 2026-02-27

- ✅ Webhook 権限付与ロジック修正
- ✅ PaymentIntent ユーザー解決修正
- ✅ PDF フォント設定追加
- ✅ PDF "Todo:" ラベルの i18n 対応
- ✅ デモバックアップ対策スクリプト追加
- ✅ 本番環境検証スクリプト追加
- ✅ Webhook Health Check エンドポイント追加
- ✅ ドキュメント整備

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

---

**最終更新:** 2026-02-27  
**バージョン:** 1.0.0  
**ステータス:** 本番デプロイ準備完了
