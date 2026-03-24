import { JudgmentInput, JudgmentOutput, EligibilityStatus, ServiceType } from '@shared/types/layers';
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCondition } from '../utils/condition-evaluator';

interface JudgmentRule {
  id: string;
  category: string;
  condition: string;
  flag: string;
  reasonCode: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

interface JudgmentRules {
  version: string;
  lastUpdated: string;
  criteria: JudgmentRule[];
  statusThresholds: {
    A: { maxHighSeverityFlags: number; maxMediumSeverityFlags: number };
    B: { maxHighSeverityFlags: number; maxMediumSeverityFlags: number };
    C: { minHighSeverityFlags: number };
  };
}

export class JudgmentEngine {
  private defaultRules: JudgmentRules;
  private serviceRulesCache: Map<ServiceType, JudgmentRules> = new Map();

  constructor() {
    this.defaultRules = this.loadRules();
  }

  /**
   * Load default rules from config (used only as a legacy path).
   * The primary execution path is DiagnosisService → pure-judgment-engine
   * which receives rules as arguments from the DB.
   */
  private loadRules(): JudgmentRules {
    const rulesPath = join(process.cwd(), 'config', 'judgment-rules.json');
    const rulesContent = readFileSync(rulesPath, 'utf-8');
    return JSON.parse(rulesContent);
  }

  /**
   * Get rules for a specific service type.
   * FALLBACK PROHIBITED: throws if serviceType-specific file is not found.
   * NOTE: This class is kept for backward-compatibility.
   * New code must use DiagnosisService → pure-judgment-engine with DB rules.
   */
  private getRules(serviceType?: ServiceType): JudgmentRules {
    if (!serviceType) {
      return this.defaultRules;
    }

    if (this.serviceRulesCache.has(serviceType)) {
      return this.serviceRulesCache.get(serviceType)!;
    }

    // Load service-specific file — NO FALLBACK
    const serviceRulesPath = join(process.cwd(), 'config', `judgment-rules-${serviceType}.json`);
    try {
      const rulesContent = readFileSync(serviceRulesPath, 'utf-8');
      const rules: JudgmentRules = JSON.parse(rulesContent);
      this.serviceRulesCache.set(serviceType, rules);
      return rules;
    } catch (error) {
      // フォールバック禁止: デフォルトルールへの自動フォールバックは行わない
      throw new Error(
        `No judgment rules found for service type: ${serviceType}. ` +
        `Fallback to default rules is prohibited. ` +
        `Please publish a ruleset for this service type via the admin API.`
      );
    }
  }

  async evaluate(input: JudgmentInput): Promise<JudgmentOutput> {
    // CR-03: Get rules for the specific service type
    const rules = this.getRules(input.serviceType);
    
    const flags: string[] = [];
    const reasonCodes: string[] = [];
    const severityCounts = { high: 0, medium: 0, low: 0 };

    for (const rule of rules.criteria) {
      if (this.matchesCondition(input.answers, rule.condition)) {
        flags.push(rule.flag);
        reasonCodes.push(rule.reasonCode);
        severityCounts[rule.severity]++;
      }
    }

    const status = this.calculateStatus(severityCounts, rules);

    // CR-01: No timestamp for pure function reproducibility
    return {
      eligibilityStatus: status,
      reasonCodes,
      flaggedItems: flags,
      ruleVersion: rules.version
    };
  }

  private matchesCondition(answers: Record<string, any>, condition: string): boolean {
    try {
      return evaluateCondition(condition, answers);
    } catch (error) {
      console.error('Error evaluating condition:', condition, error);
      return false;
    }
  }

  private calculateStatus(severityCounts: { high: number; medium: number; low: number }, rules: JudgmentRules): EligibilityStatus {
    const { A, B, C } = rules.statusThresholds;

    if (severityCounts.high >= C.minHighSeverityFlags) {
      return 'C';
    }

    if (
      severityCounts.high <= A.maxHighSeverityFlags &&
      severityCounts.medium <= A.maxMediumSeverityFlags
    ) {
      return 'A';
    }

    if (
      severityCounts.high <= B.maxHighSeverityFlags &&
      severityCounts.medium <= B.maxMediumSeverityFlags
    ) {
      return 'B';
    }

    return 'C';
  }

  reloadRules(): void {
    this.defaultRules = this.loadRules();
    this.serviceRulesCache.clear();
    console.log(`Judgment rules reloaded. Version: ${this.defaultRules.version}`);
  }
}
