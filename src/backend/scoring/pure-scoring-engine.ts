/**
 * FEAT-T04-03: Pure Scoring Engine
 * 
 * Refactored to be a pure function:
 * - Receives rules as argument (no file/DB access)
 * - Same input + same rules = same output (deterministic)
 * - No side effects
 */

import { ScoringInput, ScoringOutput } from '@shared/types/layers';
import { ScoringRules } from '@shared/types/rule-sets';
import { evaluateCondition } from '../utils/condition-evaluator';

/**
 * FEAT-T04-03: Pure function for scoring calculation
 * 
 * @param input - The answers and judgment result
 * @param rules - The rules to apply (passed as argument, not loaded)
 * @param includeCalculationLog - Whether to include detailed calculation log
 * @returns ScoringOutput - deterministic result
 */
export function calculateScoring(
  input: ScoringInput,
  rules: ScoringRules,
  includeCalculationLog: boolean = false
): ScoringOutput {
  const categoryScores: Record<string, number> = {};
  const attentionZones: string[] = [];
  const calculationLog: any = includeCalculationLog ? {
    roundingRule: 'Round to 2 decimal places (0.005 rounds up)',
    categoryDetails: []
  } : undefined;

  // Calculate score for each category
  for (const [categoryName, config] of Object.entries(rules.categories)) {
    const baseScore = calculateCategoryScore(input.answers, config);
    const { modifiedScore, appliedModifiers } = applyModifiersWithLog(baseScore, input.answers, config);
    const finalScore = Math.min(modifiedScore, config.maxScore);
    
    // CR-01/Ticket 05: Fixed rounding to 2 decimal places
    const roundedFinalScore = roundToTwoDecimals(finalScore);
    categoryScores[categoryName] = roundedFinalScore;

    // Check if this category needs attention
    if (roundedFinalScore < rules.attentionZoneThreshold) {
      attentionZones.push(categoryName);
    }

    // Add to calculation log if requested
    if (includeCalculationLog) {
      const weightedScore = roundedFinalScore * config.weight;
      calculationLog.categoryDetails.push({
        category: categoryName,
        baseScore,
        modifiers: appliedModifiers,
        finalScore: roundedFinalScore,
        weight: config.weight,
        weightedScore: roundToTwoDecimals(weightedScore)
      });
    }
  }

  // Calculate weighted total
  const totalScoreBeforeRounding = calculateWeightedTotal(categoryScores, rules);
  const totalScore = roundToTwoDecimals(totalScoreBeforeRounding);

  if (includeCalculationLog) {
    calculationLog.totalBeforeRounding = totalScoreBeforeRounding;
  }

  // CR-01: No timestamp for pure function reproducibility
  return {
    totalScore,
    categoryScores,
    attentionZones,
    ruleVersion: rules.version,
    calculationLog
  };
}

/**
 * Fixed rounding rule
 */
function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate score for a single category
 */
function calculateCategoryScore(answers: Record<string, any>, config: any): number {
  for (const criterion of config.criteria) {
    if (matchesCondition(answers, criterion.condition)) {
      return criterion.score;
    }
  }
  return 0;
}

/**
 * Apply modifiers with logging
 */
function applyModifiersWithLog(
  baseScore: number,
  answers: Record<string, any>,
  config: any
): { modifiedScore: number; appliedModifiers: Array<{ condition: string; multiplier: number }> } {
  if (!config.modifiers) {
    return { modifiedScore: baseScore, appliedModifiers: [] };
  }

  let modifiedScore = baseScore;
  const appliedModifiers: Array<{ condition: string; multiplier: number }> = [];

  for (const modifier of config.modifiers) {
    if (matchesCondition(answers, modifier.condition)) {
      modifiedScore *= modifier.modifier;
      appliedModifiers.push({
        condition: modifier.condition,
        multiplier: modifier.modifier
      });
    }
  }

  return { modifiedScore, appliedModifiers };
}

/**
 * Evaluate a condition
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
 * Calculate weighted total score
 */
function calculateWeightedTotal(categoryScores: Record<string, number>, rules: ScoringRules): number {
  let total = 0;

  for (const [categoryName, score] of Object.entries(categoryScores)) {
    const weight = rules.categories[categoryName].weight;
    total += score * weight;
  }

  return total;
}

/**
 * Validate rules structure
 */
export function validateScoringRules(rules: any): rules is ScoringRules {
  if (!rules || typeof rules !== 'object') return false;
  if (!rules.version || typeof rules.version !== 'string') return false;
  if (!rules.categories || typeof rules.categories !== 'object') return false;
  if (!rules.thresholds) return false;
  if (typeof rules.attentionZoneThreshold !== 'number') return false;

  // Validate each category
  for (const [name, config] of Object.entries(rules.categories)) {
    const cat = config as any;
    if (typeof cat.weight !== 'number') return false;
    if (typeof cat.maxScore !== 'number') return false;
    if (!Array.isArray(cat.criteria)) return false;
  }

  return true;
}
