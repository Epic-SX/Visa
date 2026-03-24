/**
 * FEAT-T04-03: Pure Judgment Engine
 * 
 * Refactored to be a pure function:
 * - Receives rules as argument (no file/DB access)
 * - Same input + same rules = same output (deterministic)
 * - No side effects
 */

import { JudgmentInput, JudgmentOutput, EligibilityStatus } from '@shared/types/layers';
import { JudgmentRules } from '@shared/types/rule-sets';
import { evaluateCondition } from '../utils/condition-evaluator';

/**
 * FEAT-T04-03: Pure function for judgment evaluation
 * 
 * @param input - The answers and context
 * @param rules - The rules to apply (passed as argument, not loaded)
 * @returns JudgmentOutput - deterministic result
 */
export function evaluateJudgment(input: JudgmentInput, rules: JudgmentRules): JudgmentOutput {
  const flags: string[] = [];
  const reasonCodes: string[] = [];
  const severityCounts = { high: 0, medium: 0, low: 0 };

  // Evaluate each rule
  for (const rule of rules.criteria) {
    if (matchesCondition(input.answers, rule.condition)) {
      flags.push(rule.flag);
      reasonCodes.push(rule.reasonCode);
      severityCounts[rule.severity]++;
    }
  }

  // Calculate status based on severity counts
  const status = calculateStatus(severityCounts, rules);

  // CR-01: No timestamp for pure function reproducibility
  return {
    eligibilityStatus: status,
    reasonCodes,
    flaggedItems: flags,
    ruleVersion: rules.version
  };
}

/**
 * Evaluate a condition against answers
 */
function matchesCondition(answers: Record<string, any>, condition: string): boolean {
  try {
    return evaluateCondition(condition, answers);
  } catch (error) {
    console.error('Error evaluating condition:', condition, error);
    return false;
  }
}

/**
 * Calculate eligibility status based on severity counts
 */
function calculateStatus(
  severityCounts: { high: number; medium: number; low: number },
  rules: JudgmentRules
): EligibilityStatus {
  const { A, B, C } = rules.statusThresholds;

  // Status C: High severity threshold exceeded
  if (severityCounts.high >= C.minHighSeverityFlags) {
    return 'C';
  }

  // Status A: Within excellent thresholds
  if (
    severityCounts.high <= A.maxHighSeverityFlags &&
    severityCounts.medium <= A.maxMediumSeverityFlags
  ) {
    return 'A';
  }

  // Status B: Within acceptable thresholds
  if (
    severityCounts.high <= B.maxHighSeverityFlags &&
    severityCounts.medium <= B.maxMediumSeverityFlags
  ) {
    return 'B';
  }

  // Default to C if none of the above match
  return 'C';
}

/**
 * Validate rules structure
 */
export function validateJudgmentRules(rules: any): rules is JudgmentRules {
  if (!rules || typeof rules !== 'object') return false;
  if (!rules.version || typeof rules.version !== 'string') return false;
  if (!Array.isArray(rules.criteria)) return false;
  if (!rules.statusThresholds) return false;
  
  // Validate each criterion
  for (const criterion of rules.criteria) {
    if (!criterion.id || !criterion.condition || !criterion.flag || !criterion.reasonCode) {
      return false;
    }
    if (!['high', 'medium', 'low'].includes(criterion.severity)) {
      return false;
    }
  }

  return true;
}
