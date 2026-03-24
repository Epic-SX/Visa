/**
 * FEAT-T04-01 & FEAT-T04-02: Diagnosis Service
 * 
 * Orchestrates diagnosis execution:
 * 1. Fetches published rulesets from DB
 * 2. Calls pure engines with those rules
 * 3. Logs execution to diagnosis_runs
 * 4. NO FALLBACK - errors if ruleset not found
 */

import { Pool } from 'pg';
import { JudgmentInput, JudgmentOutput, ScoringInput, ScoringOutput, ServiceType } from '@shared/types/layers';
import { JudgmentRules, ScoringRules } from '@shared/types/rule-sets';
import { RuleSetRepository } from '../repositories/rule-set-repository';
import { DiagnosisRunRepository } from '../repositories/diagnosis-run-repository';
import { evaluateJudgment, validateJudgmentRules } from '../judgment/pure-judgment-engine';
import { calculateScoring, validateScoringRules } from '../scoring/pure-scoring-engine';

export class DiagnosisService {
  private ruleSetRepo: RuleSetRepository;
  private diagnosisRunRepo: DiagnosisRunRepository;

  constructor(pool: Pool) {
    this.ruleSetRepo = new RuleSetRepository(pool);
    this.diagnosisRunRepo = new DiagnosisRunRepository(pool);
  }

  /**
   * FEAT-T04-01 & FEAT-T04-02: Execute complete diagnosis
   * 
   * @throws Error if no published ruleset found for serviceType (NO FALLBACK)
   */
  async executeDiagnosis(request: {
    sessionId: string;
    answers: Record<string, any>;
    locale: string;
    serviceType: ServiceType;
    userId?: string;
  }): Promise<{
    judgment: JudgmentOutput;
    scoring: ScoringOutput;
    judgmentRulesetId: string;
    scoringRulesetId: string;
  }> {
    const startTime = Date.now();

    try {
      // FEAT-T04-01: Fetch published rulesets from DB
      const judgmentRuleSet = await this.ruleSetRepo.getPublishedRuleSet('judgment', request.serviceType);
      const scoringRuleSet = await this.ruleSetRepo.getPublishedRuleSet('scoring', request.serviceType);

      // FEAT-T04-02: NO FALLBACK - error if ruleset not found
      if (!judgmentRuleSet) {
        throw new Error(
          `No published judgment ruleset found for service type: ${request.serviceType}. ` +
          `Fallback to default rules is prohibited. Please publish a ruleset for this service type.`
        );
      }

      if (!scoringRuleSet) {
        throw new Error(
          `No published scoring ruleset found for service type: ${request.serviceType}. ` +
          `Fallback to default rules is prohibited. Please publish a ruleset for this service type.`
        );
      }

      // Validate rules structure
      if (!validateJudgmentRules(judgmentRuleSet.rules_json)) {
        throw new Error(`Invalid judgment rules structure in ruleset ${judgmentRuleSet.id}`);
      }

      if (!validateScoringRules(scoringRuleSet.rules_json)) {
        throw new Error(`Invalid scoring rules structure in ruleset ${scoringRuleSet.id}`);
      }

      const judgmentRules = judgmentRuleSet.rules_json as JudgmentRules;
      const scoringRules = scoringRuleSet.rules_json as ScoringRules;

      // FEAT-T04-03: Call pure engines (no DB access inside engines)
      const judgmentInput: JudgmentInput = {
        sessionId: request.sessionId,
        answers: request.answers,
        locale: request.locale as any,
        serviceType: request.serviceType
      };

      const judgmentOutput = evaluateJudgment(judgmentInput, judgmentRules);

      const scoringInput: ScoringInput = {
        judgmentResult: judgmentOutput,
        answers: request.answers,
        serviceType: request.serviceType
      };

      const scoringOutput = calculateScoring(scoringInput, scoringRules, false);

      const executionTime = Date.now() - startTime;

      // CR-T02-02: Log to diagnosis_runs for audit trail and reproducibility
      await this.diagnosisRunRepo.createDiagnosisRun({
        session_id: request.sessionId,
        user_id: request.userId,
        answers: request.answers,
        locale: request.locale,
        service_type: request.serviceType,
        judgment_ruleset_id: judgmentRuleSet.id,
        judgment_checksum: judgmentRuleSet.checksum,
        scoring_ruleset_id: scoringRuleSet.id,
        scoring_checksum: scoringRuleSet.checksum,
        judgment_output: judgmentOutput,
        scoring_output: scoringOutput,
        execution_time_ms: executionTime,
        status: 'completed'
      });

      return {
        judgment: judgmentOutput,
        scoring: scoringOutput,
        judgmentRulesetId: judgmentRuleSet.id,
        scoringRulesetId: scoringRuleSet.id
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Log failed diagnosis run
      try {
        await this.diagnosisRunRepo.createDiagnosisRun({
          session_id: request.sessionId,
          user_id: request.userId,
          answers: request.answers,
          locale: request.locale,
          service_type: request.serviceType,
          judgment_checksum: 'error',
          scoring_checksum: 'error',
          judgment_output: {},
          scoring_output: {},
          execution_time_ms: executionTime,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error'
        });
      } catch (logError) {
        console.error('Failed to log error to diagnosis_runs:', logError);
      }

      throw error;
    }
  }

  /**
   * TEST-T05-01: Get diagnosis runs for reproducibility testing
   */
  async getDiagnosisRunsForReproducibility(
    judgmentChecksum: string,
    scoringChecksum: string
  ) {
    return this.diagnosisRunRepo.findReproducibleRuns(judgmentChecksum, scoringChecksum);
  }
}
