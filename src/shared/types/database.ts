import { EligibilityStatus, Locale, UserRole } from './layers';

export interface User {
  id: string;
  email: string;
  secret_key_hash?: string;
  role: UserRole;
  locale: Locale;
  professional_license_number?: string;
  professional_verified: boolean;
  affiliate_code?: string;
  affiliate_commission_rate?: number;
  email_verified: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  revoked_at?: Date;
}

export interface DiagnosticSession {
  id: string;
  user_id?: string;
  locale: Locale;
  source?: string;
  answers: Record<string, any>;
  status: 'in_progress' | 'submitted' | 'completed';
  email_for_result?: string;
  consent_given: boolean;
  consent_timestamp?: Date;
  referred_by_affiliate_code?: string;
  created_at: Date;
  updated_at: Date;
  submitted_at?: Date;
}

export interface JudgmentResult {
  id: string;
  session_id: string;
  eligibility_status: EligibilityStatus;
  reason_codes: string[];
  flagged_items: string[];
  rule_version: string;
  calculated_at: Date;
}

export interface ScoringResult {
  id: string;
  session_id: string;
  judgment_result_id: string;
  total_score: number;
  category_scores: Record<string, number>;
  attention_zones: string[];
  rule_version: string;
  calculated_at: Date;
}

export interface Entitlement {
  id: string;
  user_id: string;
  session_id?: string;
  product_code: string;
  billing_label: string;
  payment_context_id: string;
  stripe_payment_intent_id?: string;
  stripe_event_id?: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
  unlocked_features: string[];
  amount_cents: number;
  currency: string;
  referrer_id?: string;
  referral_commission_cents?: number;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
}

export interface GenerationResult {
  id: string;
  session_id: string;
  tier: 'good' | 'better' | 'best';
  version_number: number;
  is_latest: boolean;
  source_type: 'ai_generated' | 'professional_modified' | 'ob_modified';
  content: Record<string, any>;
  generated_by?: string;
  generated_at: Date;
  knowledge_version?: string;
  dify_workflow_id?: string;
}

export interface ModificationHistory {
  id: string;
  generation_result_id: string;
  modifier_id: string;
  modifier_role: 'professional' | 'ob';
  field_name: string;
  before_value?: string;
  after_value?: string;
  change_reason?: string;
  modified_at: Date;
}

export interface AuditLog {
  id: string;
  actor_id?: string;
  actor_role?: string;
  actor_ip_address?: string;
  action_type: string;
  resource_type: string;
  resource_id?: string;
  request_method?: string;
  request_path?: string;
  request_query?: Record<string, any>;
  request_body?: Record<string, any>;
  response_status?: number;
  error_message?: string;
  user_agent?: string;
  session_token_id?: string;
  occurred_at: Date;
  retention_until?: Date;
}

export interface OcrDocument {
  id: string;
  session_id: string;
  user_id: string;
  document_type: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  storage_path: string;
  ocr_text?: Record<string, any>;
  uploaded_at: Date;
  retention_until: Date;
  deleted_at?: Date;
  encrypted: boolean;
  encryption_key_id?: string;
}

export interface ProfessionalProfile {
  id: string;
  user_id: string;
  display_name: string;
  bio?: string;
  languages: string[];
  regions: string[];
  categories: string[];
  online_available: boolean;
  is_published: boolean;
  total_consultations: number;
  created_at: Date;
  updated_at: Date;
}

export interface ProfessionalSubscription {
  id: string;
  user_id: string;
  plan: 'BASIC' | 'STANDARD' | 'PREMIUM';
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid';
  features: string[];
  content_publish_limit?: number;
  content_publish_used_this_month: number;
  current_period_start?: Date;
  current_period_end?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Commission {
  id: string;
  entitlement_id: string;
  referrer_id: string;
  payee_id: string;
  stripe_payment_intent_id: string;
  stripe_transfer_id?: string;
  original_amount_cents: number;
  commission_rate: number;
  commission_amount_cents: number;
  status: 'pending' | 'transferred' | 'failed' | 'reversed';
  commission_type: string;
  created_at: Date;
  transferred_at?: Date;
}

export interface WebhookEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  payload: Record<string, any>;
  processed_at: Date;
  processing_duration_ms?: number;
  status: string;
  error_message?: string;
}
