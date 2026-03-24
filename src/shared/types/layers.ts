export type EligibilityStatus = 'A' | 'B' | 'C';
export type Locale = 'ja' | 'en' | 'zh';
export type Tier = 'good' | 'better' | 'best';
export type UserRole = 'Client' | 'Affiliate' | 'Professional' | 'ImmigrationOB' | 'Admin';

// Ticket 16: Service type enums (1-5 as per Dify v1.1 specification)
export type ServiceType = 'service1' | 'service2' | 'service3' | 'service4' | 'service5';

export interface JudgmentInput {
  sessionId: string;
  answers: Record<string, any>;
  locale: Locale;
  // CR-03: Service type for rule switching
  serviceType?: ServiceType;
}

export interface JudgmentOutput {
  eligibilityStatus: EligibilityStatus;
  reasonCodes: string[];
  flaggedItems: string[];
  ruleVersion: string;
  // CR-01: timestamp removed for pure function reproducibility
  // Same input must produce identical JSON output
}

export interface ScoringInput {
  judgmentResult: JudgmentOutput;
  answers: Record<string, any>;
  // CR-03: Service type for rule switching
  serviceType?: ServiceType;
}

export interface ScoringOutput {
  totalScore: number;
  categoryScores: Record<string, number>;
  attentionZones: string[];
  ruleVersion: string;
  // CR-01: timestamp removed for pure function reproducibility
  // Same input must produce identical JSON output
  // Ticket 05: Calculation logging for reproducibility
  calculationLog?: {
    roundingRule: string;
    categoryDetails: Array<{
      category: string;
      baseScore: number;
      modifiers: Array<{ condition: string; multiplier: number }>;
      finalScore: number;
      weight: number;
      weightedScore: number;
    }>;
    totalBeforeRounding: number;
  };
}

export interface GenerationInput {
  reasonCodes: string[];
  locale: Locale;
  tier: Tier;
  // Ticket 16: Service type and review control
  serviceType?: ServiceType;
  judicialScrivenerInvolved?: boolean;
  immigrationObInvolved?: boolean;
}

/**
 * LLM-generated output type with explicit branding
 * This type is marked as LLM-generated to prevent confusion with deterministic outputs
 */
export interface GenerationOutput {
  readonly headline: string;
  readonly todoItems: readonly string[];
  readonly explanationText: string;
  readonly obCommentary?: readonly string[];
  readonly disclaimer: string;
  readonly __llmGenerated: true;  // Brand to prevent mixing with deterministic types
  // Ticket 18: Knowledge version tracking
  readonly knowledgeVersion: string;  // e.g., "2023" (fixed as per specification)
  // Ticket 06: Generation metadata
  readonly generationId?: string;
  readonly generatedAt: string;
}

/**
 * Finalized deterministic outputs (immutable after Layer 1 & 2 completion)
 * These types ensure judgment and scoring results cannot be modified by Layer 3 (LLM)
 */
export type FinalizedJudgmentOutput = Readonly<JudgmentOutput>;
export type FinalizedScoringOutput = Readonly<ScoringOutput>;

export interface ReviewContext {
  original: GenerationOutput;
  modified: GenerationOutput;
  reviewerId: string;
  reviewerRole: 'professional' | 'ob';
  timestamp: string;
  changeHistory: Array<{
    field: string;
    before: string;
    after: string;
    reason: string;
  }>;
}
