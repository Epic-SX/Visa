import { ScoringInput, ScoringOutput, ServiceType } from '@shared/types/layers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCondition } from '../utils/condition-evaluator';

interface ScoringCriterion {
  condition: string;
  score: number;
}

interface ScoringModifier {
  condition: string;
  modifier: number;
}

interface CategoryConfig {
  weight: number;
  maxScore: number;
  description: string;
  criteria: ScoringCriterion[];
  modifiers?: ScoringModifier[];
}

interface ScoringRules {
  version: string;
  lastUpdated: string;
  categories: Record<string, CategoryConfig>;
  thresholds: {
    A: { minScore: number };
    B: { minScore: number; maxScore: number };
    C: { maxScore: number };
  };
  attentionZoneThreshold: number;
}

export class ScoringEngine {
  private defaultRules: ScoringRules;
  private serviceRulesCache: Map<ServiceType, ScoringRules> = new Map();

  constructor() {
    this.defaultRules = this.loadRules();
  }

  /**
   * Load default rules from config (used only as a legacy path).
   * The primary execution path is DiagnosisService → pure-scoring-engine
   * which receives rules as arguments from the DB.
   */
  private loadRules(): ScoringRules {
    const rulesPath = join(process.cwd(), 'config', 'scoring-rules.json');
    const rulesContent = readFileSync(rulesPath, 'utf-8');
    return JSON.parse(rulesContent);
  }

  /**
   * Get rules for a specific service type.
   * FALLBACK PROHIBITED: throws if serviceType-specific file is not found.
   * NOTE: This class is kept for backward-compatibility.
   * New code must use DiagnosisService → pure-scoring-engine with DB rules.
   */
  private getRules(serviceType?: ServiceType): ScoringRules {
    if (!serviceType) {
      return this.defaultRules;
    }

    if (this.serviceRulesCache.has(serviceType)) {
      return this.serviceRulesCache.get(serviceType)!;
    }

    // Load service-specific file — NO FALLBACK
    const serviceRulesPath = join(process.cwd(), 'config', `scoring-rules-${serviceType}.json`);
    try {
      const rulesContent = readFileSync(serviceRulesPath, 'utf-8');
      const rules: ScoringRules = JSON.parse(rulesContent);
      this.serviceRulesCache.set(serviceType, rules);
      return rules;
    } catch (error) {
      // フォールバック禁止: デフォルトルールへの自動フォールバックは行わない
      throw new Error(
        `No scoring rules found for service type: ${serviceType}. ` +
        `Fallback to default rules is prohibited. ` +
        `Please publish a ruleset for this service type via the admin API.`
      );
    }
  }

  async calculate(input: ScoringInput, includeCalculationLog: boolean = false): Promise<ScoringOutput> {
    // CR-03: Get rules for the specific service type
    const rules = this.getRules(input.serviceType);
    
    const categoryScores: Record<string, number> = {};
    const attentionZones: string[] = [];
    const calculationLog: any = includeCalculationLog ? {
      roundingRule: 'Round to 2 decimal places (0.005 rounds up)',
      categoryDetails: []
    } : undefined;

    for (const [categoryName, config] of Object.entries(rules.categories)) {
      const baseScore = this.calculateCategoryScore(input.answers, config);
      const { modifiedScore, appliedModifiers } = this.applyModifiersWithLog(baseScore, input.answers, config);
      const finalScore = Math.min(modifiedScore, config.maxScore);
      
      // Ticket 05: Fixed rounding to 2 decimal places
      const roundedFinalScore = this.roundToTwoDecimals(finalScore);
      categoryScores[categoryName] = roundedFinalScore;

      if (roundedFinalScore < rules.attentionZoneThreshold) {
        attentionZones.push(categoryName);
      }

      // Ticket 05: Calculation process logging
      if (includeCalculationLog) {
        const weightedScore = roundedFinalScore * config.weight;
        calculationLog.categoryDetails.push({
          category: categoryName,
          baseScore,
          modifiers: appliedModifiers,
          finalScore: roundedFinalScore,
          weight: config.weight,
          weightedScore: this.roundToTwoDecimals(weightedScore)
        });
      }
    }

    const totalScoreBeforeRounding = this.calculateWeightedTotal(categoryScores, rules);
    // Ticket 05: Fixed rounding to 2 decimal places
    const totalScore = this.roundToTwoDecimals(totalScoreBeforeRounding);

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
   * Ticket 05: Fixed rounding rule
   * Rounds to 2 decimal places using standard rounding (0.005 rounds up)
   * This ensures deterministic and reproducible calculations
   */
  private roundToTwoDecimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private calculateCategoryScore(answers: Record<string, any>, config: CategoryConfig): number {
    for (const criterion of config.criteria) {
      if (this.matchesCondition(answers, criterion.condition)) {
        return criterion.score;
      }
    }
    return 0;
  }

  private applyModifiers(
    baseScore: number,
    answers: Record<string, any>,
    config: CategoryConfig
  ): number {
    if (!config.modifiers) {
      return baseScore;
    }

    let modifiedScore = baseScore;

    for (const modifier of config.modifiers) {
      if (this.matchesCondition(answers, modifier.condition)) {
        modifiedScore *= modifier.modifier;
      }
    }

    return modifiedScore;
  }

  /**
   * Ticket 05: Apply modifiers with logging for audit trail
   */
  private applyModifiersWithLog(
    baseScore: number,
    answers: Record<string, any>,
    config: CategoryConfig
  ): { modifiedScore: number; appliedModifiers: Array<{ condition: string; multiplier: number }> } {
    if (!config.modifiers) {
      return { modifiedScore: baseScore, appliedModifiers: [] };
    }

    let modifiedScore = baseScore;
    const appliedModifiers: Array<{ condition: string; multiplier: number }> = [];

    for (const modifier of config.modifiers) {
      if (this.matchesCondition(answers, modifier.condition)) {
        modifiedScore *= modifier.modifier;
        appliedModifiers.push({
          condition: modifier.condition,
          multiplier: modifier.modifier
        });
      }
    }

    return { modifiedScore, appliedModifiers };
  }

  private matchesCondition(answers: Record<string, any>, condition: string): boolean {
    try {
      return evaluateCondition(condition, answers);
    } catch (error) {
      console.error('Error evaluating condition:', condition, error);
      return false;
    }
  }

  private calculateWeightedTotal(categoryScores: Record<string, number>, rules: ScoringRules): number {
    let total = 0;

    for (const [categoryName, score] of Object.entries(categoryScores)) {
      const weight = rules.categories[categoryName].weight;
      total += score * weight;
    }

    return total;
  }

  reloadRules(): void {
    this.defaultRules = this.loadRules();
    this.serviceRulesCache.clear();
    console.log(`Scoring rules reloaded. Version: ${this.defaultRules.version}`);
  }
}
