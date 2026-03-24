-- stripe_payment_intent_id に UNIQUE 制約を追加し、Webhook の冪等化 (ON CONFLICT) を可能にする
-- 既存の重複があれば削除または一意化が必要。Stripe pi_* は実質一意のため通常は問題なし。

-- 重複を確認（オプション）
-- SELECT stripe_payment_intent_id, COUNT(*) FROM entitlements WHERE stripe_payment_intent_id IS NOT NULL GROUP BY stripe_payment_intent_id HAVING COUNT(*) > 1;

ALTER TABLE entitlements
  ADD CONSTRAINT entitlements_stripe_payment_intent_id_unique
  UNIQUE (stripe_payment_intent_id)
  DEFERRABLE INITIALLY IMMEDIATE;
