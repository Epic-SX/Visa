-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  secret_key_hash VARCHAR(255),
  
  role VARCHAR(50) NOT NULL,
  locale VARCHAR(10) DEFAULT 'ja',
  
  professional_license_number VARCHAR(100),
  professional_verified BOOLEAN DEFAULT false,
  
  affiliate_code VARCHAR(50) UNIQUE,
  affiliate_commission_rate DECIMAL(5,2),
  
  email_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  
  CONSTRAINT user_role_check 
    CHECK (role IN ('Client', 'Affiliate', 'Professional', 'ImmigrationOB', 'Admin'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_affiliate_code ON users(affiliate_code);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Diagnostic sessions
CREATE TABLE diagnostic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  
  locale VARCHAR(10) NOT NULL DEFAULT 'ja',
  source VARCHAR(50),
  
  answers JSONB NOT NULL DEFAULT '{}',
  
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
  
  email_for_result VARCHAR(255),
  consent_given BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  
  referred_by_affiliate_code VARCHAR(50),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  
  CONSTRAINT session_status_check 
    CHECK (status IN ('in_progress', 'submitted', 'completed'))
);

CREATE INDEX idx_diagnostic_sessions_user_id ON diagnostic_sessions(user_id);
CREATE INDEX idx_diagnostic_sessions_status ON diagnostic_sessions(status);
CREATE INDEX idx_diagnostic_sessions_created_at ON diagnostic_sessions(created_at DESC);

-- Judgment results
CREATE TABLE judgment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  
  eligibility_status VARCHAR(1) NOT NULL,
  reason_codes TEXT[] NOT NULL,
  flagged_items TEXT[] NOT NULL,
  
  rule_version VARCHAR(100) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT judgment_status_check 
    CHECK (eligibility_status IN ('A', 'B', 'C'))
);

CREATE INDEX idx_judgment_results_session_id ON judgment_results(session_id);

-- Scoring results
CREATE TABLE scoring_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  judgment_result_id UUID NOT NULL REFERENCES judgment_results(id),
  
  total_score DECIMAL(5,2) NOT NULL,
  category_scores JSONB NOT NULL,
  attention_zones TEXT[] NOT NULL,
  
  rule_version VARCHAR(100) NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scoring_results_session_id ON scoring_results(session_id);

-- Entitlements
CREATE TABLE entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  session_id UUID REFERENCES diagnostic_sessions(id),
  
  product_code VARCHAR(50) NOT NULL,
  billing_label VARCHAR(50) NOT NULL,
  
  payment_context_id UUID NOT NULL UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  stripe_event_id VARCHAR(255) UNIQUE,
  
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  unlocked_features JSONB NOT NULL DEFAULT '[]',
  
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  
  referrer_id UUID REFERENCES users(id),
  referral_commission_cents INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  
  CONSTRAINT entitlement_status_check 
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed'))
);

CREATE INDEX idx_entitlements_user_id ON entitlements(user_id);
CREATE INDEX idx_entitlements_session_id ON entitlements(session_id);
CREATE INDEX idx_entitlements_payment_context_id ON entitlements(payment_context_id);
CREATE INDEX idx_entitlements_stripe_event_id ON entitlements(stripe_event_id);
CREATE INDEX idx_entitlements_status ON entitlements(status);

-- Generation results
CREATE TABLE generation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  tier VARCHAR(20) NOT NULL,
  
  version_number INTEGER NOT NULL DEFAULT 1,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  
  source_type VARCHAR(50) NOT NULL,
  
  content JSONB NOT NULL,
  
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  knowledge_version VARCHAR(100),
  dify_workflow_id VARCHAR(255),
  
  CONSTRAINT generation_tier_check 
    CHECK (tier IN ('good', 'better', 'best')),
  CONSTRAINT generation_source_check 
    CHECK (source_type IN ('ai_generated', 'professional_modified', 'ob_modified'))
);

CREATE INDEX idx_generation_results_session_id ON generation_results(session_id);
CREATE INDEX idx_generation_results_is_latest ON generation_results(is_latest);
CREATE UNIQUE INDEX idx_generation_results_latest 
  ON generation_results(session_id, tier) 
  WHERE is_latest = true;

-- Modification history
CREATE TABLE modification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_result_id UUID NOT NULL REFERENCES generation_results(id),
  
  modifier_id UUID NOT NULL REFERENCES users(id),
  modifier_role VARCHAR(50) NOT NULL,
  
  field_name VARCHAR(100) NOT NULL,
  before_value TEXT,
  after_value TEXT,
  change_reason TEXT,
  
  modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modification_history_generation_id 
  ON modification_history(generation_result_id);
CREATE INDEX idx_modification_history_modifier_id 
  ON modification_history(modifier_id);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  actor_id UUID REFERENCES users(id),
  actor_role VARCHAR(50),
  actor_ip_address INET,
  
  action_type VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID,
  
  request_method VARCHAR(10),
  request_path VARCHAR(500),
  request_query JSONB,
  request_body JSONB,
  
  response_status INTEGER,
  error_message TEXT,
  
  user_agent TEXT,
  session_token_id UUID,
  
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  retention_until TIMESTAMPTZ
);

CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_occurred_at ON audit_logs(occurred_at DESC);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- OCR documents
CREATE TABLE ocr_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  
  storage_path VARCHAR(500) NOT NULL,
  ocr_text JSONB,
  
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_until TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  
  encrypted BOOLEAN DEFAULT true,
  encryption_key_id VARCHAR(255)
);

CREATE INDEX idx_ocr_documents_session_id ON ocr_documents(session_id);
CREATE INDEX idx_ocr_documents_user_id ON ocr_documents(user_id);
CREATE INDEX idx_ocr_documents_retention_until ON ocr_documents(retention_until);

-- Professional profiles
CREATE TABLE professional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  languages TEXT[] NOT NULL DEFAULT '{ja}',
  regions TEXT[] NOT NULL DEFAULT '{}',
  categories TEXT[] NOT NULL DEFAULT '{}',
  online_available BOOLEAN DEFAULT false,
  
  is_published BOOLEAN DEFAULT false,
  
  total_consultations INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_professional_profiles_user_id ON professional_profiles(user_id);
CREATE INDEX idx_professional_profiles_is_published ON professional_profiles(is_published);

-- Professional subscriptions
CREATE TABLE professional_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  
  plan VARCHAR(50) NOT NULL,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  
  status VARCHAR(50) NOT NULL,
  
  features JSONB NOT NULL DEFAULT '[]',
  content_publish_limit INTEGER,
  content_publish_used_this_month INTEGER DEFAULT 0,
  
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT subscription_plan_check 
    CHECK (plan IN ('BASIC', 'STANDARD', 'PREMIUM')),
  CONSTRAINT subscription_status_check 
    CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid'))
);

CREATE INDEX idx_professional_subscriptions_user_id ON professional_subscriptions(user_id);
CREATE INDEX idx_professional_subscriptions_status ON professional_subscriptions(status);

-- Commissions
CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  entitlement_id UUID NOT NULL REFERENCES entitlements(id),
  referrer_id UUID NOT NULL REFERENCES users(id),
  payee_id UUID NOT NULL REFERENCES users(id),
  
  stripe_payment_intent_id VARCHAR(255) NOT NULL,
  stripe_transfer_id VARCHAR(255) UNIQUE,
  
  original_amount_cents INTEGER NOT NULL,
  commission_rate DECIMAL(5,2) NOT NULL,
  commission_amount_cents INTEGER NOT NULL,
  
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  
  commission_type VARCHAR(50) NOT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transferred_at TIMESTAMPTZ,
  
  CONSTRAINT commission_status_check 
    CHECK (status IN ('pending', 'transferred', 'failed', 'reversed'))
);

CREATE INDEX idx_commissions_entitlement_id ON commissions(entitlement_id);
CREATE INDEX idx_commissions_referrer_id ON commissions(referrer_id);
CREATE INDEX idx_commissions_payee_id ON commissions(payee_id);
CREATE INDEX idx_commissions_status ON commissions(status);

-- Webhook events
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processing_duration_ms INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'processed',
  error_message TEXT
);

CREATE INDEX idx_webhook_events_stripe_event_id ON webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at DESC);
