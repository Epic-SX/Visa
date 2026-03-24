/**
 * Test helper to create ScoringInput with required fields
 */
import { ScoringInput, JudgmentOutput } from '@shared/types/layers';

export function createScoringInput(
  answers: Record<string, any>,
  judgmentResult?: JudgmentOutput
): ScoringInput {
  const defaultJudgmentResult: JudgmentOutput = {
    eligibilityStatus: 'B',
    reasonCodes: [],
    flaggedItems: [],
    ruleVersion: '1.0.0'
  };

  return {
    judgmentResult: judgmentResult || defaultJudgmentResult,
    answers
  };
}
