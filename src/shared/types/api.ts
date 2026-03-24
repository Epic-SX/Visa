import { EligibilityStatus, Locale, Tier, UserRole } from './layers';

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface LoginRequest {
  email: string;
  secret_key: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  role: UserRole;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface RefreshResponse {
  access_token: string;
}

export interface CreateSessionRequest {
  locale?: Locale;
  source?: string;
}

export interface CreateSessionResponse {
  session_id: string;
}

export interface SaveAnswersRequest {
  [key: string]: any;
}

export interface SubmitGoodRequest {
  email: string;
  consent: boolean;
}

export interface GoodResultResponse {
  status: EligibilityStatus;
  headline: string;
  todo_items: string[];
}

export interface BetterResultResponse {
  issue_scores: Array<{
    key: string;
    score: number;
  }>;
  attention_zones: string[];
  disclaimer: string;
}

export interface BestResultResponse extends BetterResultResponse {
  ob_commentary: Array<{
    ob_attribute: string;
    comment: string;
  }>;
  missed_points: string[];
}

export interface CreateCheckoutRequest {
  product_code: 'BETTER' | 'BEST' | 'SET' | 'OPTION_MATCHING';
  currency_choice: 'CHF' | 'EUR' | 'USD' | 'JPY';
  price_tier: string;
  session_id: string;
}

export interface CreateCheckoutResponse {
  checkout_url: string;
  payment_context_id: string;
}

export interface PaymentStatusResponse {
  status: 'pending' | 'succeeded' | 'failed';
  unlocked_entitlements: string[];
}

export interface ProfessionalListResponse {
  professionals: Array<{
    professional_id: string;
    languages: string[];
    regions: string[];
    categories: string[];
    online_available: boolean;
  }>;
}

export interface ProfessionalDetailResponse {
  professional_id: string;
  profile: Record<string, any>;
  contact_methods: Record<string, any>;
}

export interface MatchingConsentRequest {
  consent: boolean;
  context: 'matching';
}

export interface MatchingRequestCreate {
  professional_id: string;
  preferred_times: string[];
  language?: string;
  notes?: string;
}

export interface MatchingRequestResponse {
  request_id: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_role: string;
  action_type: string;
  resource_type: string;
  resource_id?: string;
  occurred_at: string;
  payload: Record<string, any>;
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[];
}
