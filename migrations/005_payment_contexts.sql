-- Migration 005: Payment Contexts Table
-- 決済予定レコードを管理し、Webhook での payment_context_id 照合を強化

CREATE TABLE IF NOT EXISTS payment_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_context_id UUID NOT NULL UNIQUE,
  user_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  product_code VARCHAR(50) NOT NULL,
  billing_label VARCHAR(255) NOT NULL,
  referrer_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  
  CONSTRAINT payment_contexts_status_check CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'expired'))
);

-- Indexes for performance
CREATE INDEX idx_payment_contexts_payment_context_id ON payment_contexts(payment_context_id);
CREATE INDEX idx_payment_contexts_user_id ON payment_contexts(user_id);
CREATE INDEX idx_payment_contexts_stripe_payment_intent_id ON payment_contexts(stripe_payment_intent_id);
CREATE INDEX idx_payment_contexts_status ON payment_contexts(status);
CREATE INDEX idx_payment_contexts_expires_at ON payment_contexts(expires_at);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_contexts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_contexts_updated_at
  BEFORE UPDATE ON payment_contexts
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_contexts_updated_at();

-- Comments
COMMENT ON TABLE payment_contexts IS '決済予定レコード: PaymentIntent作成時に登録し、Webhook受信時に照合';
COMMENT ON COLUMN payment_contexts.payment_context_id IS 'サーバ生成UUID: metadata と DB の照合キー';
COMMENT ON COLUMN payment_contexts.status IS 'pending: 決済待ち, processing: Webhook処理中, succeeded: 完了, failed: 失敗, expired: 期限切れ';
COMMENT ON COLUMN payment_contexts.expires_at IS '有効期限（デフォルト24時間）: 期限切れレコードは定期削除';
