/**
 * CR-T02-01: Rule Sets Types
 * Database-based rule management system
 */

export type RuleKind = 'judgment' | 'scoring';
export type RuleSetStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type ServiceType = 'service1' | 'service2' | 'service3' | 'service4' | 'service5';

/**
 * CR-T02-01: RuleSet database record
 */
export interface RuleSet {
  id: string;
  kind: RuleKind;
  service_type: ServiceType;
  version: string;  // Semantic version: '1.0.0'
  status: RuleSetStatus;
  rules_json: Record<string, any>;  // The actual rules configuration
  checksum: string;  // SHA-256 hash
  description?: string;
  created_by?: string;
  created_at: Date;
  updated_by?: string;
  updated_at: Date;
  published_by?: string;
  published_at?: Date;
  archived_at?: Date;
}

/**
 * CR-T02-02: Diagnosis Run record
 */
export interface DiagnosisRun {
  id: string;
  session_id: string;
  user_id?: string;
  answers: Record<string, any>;
  locale: string;
  service_type?: ServiceType;
  
  // Rule sets used
  judgment_ruleset_id?: string;
  judgment_checksum: string;
  scoring_ruleset_id?: string;
  scoring_checksum: string;
  
  // Outputs
  judgment_output: Record<string, any>;
  scoring_output: Record<string, any>;
  generation_output?: Record<string, any>;
  
  // Execution metadata
  execution_time_ms?: number;
  executed_at: Date;
  status: 'completed' | 'failed' | 'timeout';
  error_message?: string;
}

/**
 * FEAT-ADMIN-01: RuleSet list query parameters
 */
export interface RuleSetListQuery {
  kind?: RuleKind;
  service_type?: ServiceType;
  status?: RuleSetStatus;
  limit?: number;
  offset?: number;
}

/**
 * FEAT-ADMIN-02: RuleSet create/update request
 */
export interface CreateRuleSetRequest {
  kind: RuleKind;
  service_type: ServiceType;
  version: string;
  rules_json: Record<string, any>;
  description?: string;
}

export interface UpdateRuleSetRequest {
  rules_json?: Record<string, any>;
  description?: string;
  status?: RuleSetStatus;
}

/**
 * FEAT-ADMIN-03: Publish request
 */
export interface PublishRuleSetRequest {
  id: string;
  // Optional: require approval comment
  approval_comment?: string;
}

/**
 * FEAT-T04-03: Pure function rules input
 * Rules are passed as arguments to engines for pure function behavior
 */
export interface JudgmentRules {
  version: string;
  lastUpdated: string;
  criteria: Array<{
    id: string;
    category: string;
    condition: string;
    flag: string;
    reasonCode: string;
    severity: 'high' | 'medium' | 'low';
    description: string;
  }>;
  statusThresholds: {
    A: { maxHighSeverityFlags: number; maxMediumSeverityFlags: number };
    B: { maxHighSeverityFlags: number; maxMediumSeverityFlags: number };
    C: { minHighSeverityFlags: number };
  };
}

export interface ScoringRules {
  version: string;
  lastUpdated: string;
  categories: Record<string, {
    weight: number;
    maxScore: number;
    description: string;
    criteria: Array<{
      condition: string;
      score: number;
    }>;
    modifiers?: Array<{
      condition: string;
      modifier: number;
    }>;
  }>;
  thresholds: {
    A: { minScore: number };
    B: { minScore: number; maxScore: number };
    C: { maxScore: number };
  };
  attentionZoneThreshold: number;
}
