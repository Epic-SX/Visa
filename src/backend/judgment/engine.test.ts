/**
 * Ticket 04: Judgment Engine Tests
 * 
 * Comprehensive tests for deterministic judgment logic
 * with no external dependencies
 */

import { JudgmentEngine } from './engine';
import { JudgmentInput } from '@shared/types/layers';

describe('JudgmentEngine', () => {
  let engine: JudgmentEngine;

  beforeEach(() => {
    engine = new JudgmentEngine();
  });

  describe('Basic judgment evaluation', () => {
    test('returns status A for excellent criteria', async () => {
      const input: JudgmentInput = {
        sessionId: 'test-session-1',
        locale: 'ja',
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          office_dedicated: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          previous_visa_approvals: 2,
          financial_stability_rating: 'excellent',
          missing_documents: []
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('A');
      expect(result.reasonCodes).toHaveLength(0);
      expect(result.flaggedItems).toHaveLength(0);
      expect(result).not.toHaveProperty('timestamp'); // CR-01: No timestamp
    });

    test('returns status C for poor criteria', async () => {
      const input: JudgmentInput = {
        sessionId: 'test-session-2',
        locale: 'ja',
        answers: {
          business_plan_quality: 'incomplete',
          capital_amount: 2000000,
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 1,
          plans_to_hire_employees: false,
          previous_visa_rejections: 2,
          financial_stability_rating: 'poor',
          missing_documents: ['doc1', 'doc2', 'doc3', 'doc4']
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('C');
      expect(result.reasonCodes.length).toBeGreaterThan(0);
      expect(result.flaggedItems.length).toBeGreaterThan(0);
    });

    test('returns status B for mixed criteria', async () => {
      const input: JudgmentInput = {
        sessionId: 'test-session-3',
        locale: 'ja',
        answers: {
          business_plan_quality: 'good',
          capital_amount: 4000000, // Below minimum
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0,
          financial_stability_rating: 'good',
          missing_documents: []
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('B');
    });
  });

  describe('Individual rule evaluation', () => {
    test('flags incomplete business plan', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'incomplete',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('BP_INSUFFICIENT');
      expect(result.flaggedItems).toContain('business_plan_insufficient');
    });

    test('flags capital below minimum', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 4000000, // Below 5M threshold
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('CAP_BELOW_MIN');
      expect(result.flaggedItems).toContain('capital_below_minimum');
    });

    test('flags non-dedicated home office', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('OFF_NOT_DEDICATED');
      expect(result.flaggedItems).toContain('office_not_dedicated');
    });

    test('flags limited experience', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 2, // Less than 3 years
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('EXP_LIMITED');
      expect(result.flaggedItems).toContain('limited_experience');
    });

    test('flags previous rejections', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 1
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('HIST_REJECTION');
      expect(result.flaggedItems).toContain('previous_rejections');
    });

    test('flags poor financial stability', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          financial_stability_rating: 'poor'
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('FIN_UNSTABLE');
      expect(result.flaggedItems).toContain('financial_instability');
    });

    test('flags many missing documents', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          missing_documents: ['doc1', 'doc2', 'doc3', 'doc4']
        }
      };

      const result = await engine.evaluate(input);

      expect(result.reasonCodes).toContain('DOC_MISSING');
      expect(result.flaggedItems).toContain('many_missing_documents');
    });
  });

  describe('Status threshold logic', () => {
    test('multiple high severity flags result in status C', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'incomplete', // High severity
          capital_amount: 3000000, // High severity
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 2,
          plans_to_hire_employees: false,
          previous_visa_rejections: 1, // High severity
          financial_stability_rating: 'poor' // High severity
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('C');
      
      // Count high severity flags
      const highSeverityCount = result.reasonCodes.filter(code => 
        ['BP_INSUFFICIENT', 'CAP_BELOW_MIN', 'HIST_REJECTION', 'FIN_UNSTABLE'].includes(code)
      ).length;
      
      expect(highSeverityCount).toBeGreaterThanOrEqual(2);
    });

    test('one high severity flag can still allow status B', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 4000000, // High severity
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0,
          financial_stability_rating: 'good'
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('B');
    });
  });

  describe('Determinism and reproducibility', () => {
    test('same input produces same output', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0,
          financial_stability_rating: 'good'
        }
      };

      const result1 = await engine.evaluate(input);
      const result2 = await engine.evaluate(input);
      const result3 = await engine.evaluate(input);

      expect(result1.eligibilityStatus).toBe(result2.eligibilityStatus);
      expect(result2.eligibilityStatus).toBe(result3.eligibilityStatus);
      
      expect(result1.reasonCodes).toEqual(result2.reasonCodes);
      expect(result2.reasonCodes).toEqual(result3.reasonCodes);
      
      expect(result1.flaggedItems).toEqual(result2.flaggedItems);
      expect(result2.flaggedItems).toEqual(result3.flaggedItems);
    });

    test('multiple runs with different inputs produce consistent results', async () => {
      const testCases = [
        {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0
        },
        {
          business_plan_quality: 'average',
          capital_amount: 5000000,
          office_type: 'shared_office',
          office_lease_confirmed: true,
          business_experience_years: 3,
          plans_to_hire_employees: true,
          employee_count_planned: 1,
          previous_visa_rejections: 0
        },
        {
          business_plan_quality: 'incomplete',
          capital_amount: 2000000,
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 1,
          plans_to_hire_employees: false,
          previous_visa_rejections: 2
        }
      ];

      for (const testCase of testCases) {
        const input: JudgmentInput = { answers: testCase };
        
        const results = await Promise.all([
          engine.evaluate(input),
          engine.evaluate(input),
          engine.evaluate(input),
          engine.evaluate(input),
          engine.evaluate(input)
        ]);

        // All results should be identical
        const firstStatus = results[0].eligibilityStatus;
        for (const result of results) {
          expect(result.eligibilityStatus).toBe(firstStatus);
          expect(result.reasonCodes).toEqual(results[0].reasonCodes);
          expect(result.flaggedItems).toEqual(results[0].flaggedItems);
        }
      }
    });
  });

  describe('No external dependencies', () => {
    test('judgment is purely deterministic with no external calls', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0
        }
      };

      // Run multiple times in rapid succession
      // If there were external dependencies, this might fail
      const results = await Promise.all(
        Array(20).fill(null).map(() => engine.evaluate(input))
      );

      // All should succeed and be identical
      const firstStatus = results[0].eligibilityStatus;
      results.forEach(result => {
        expect(result.eligibilityStatus).toBe(firstStatus);
        expect(result.reasonCodes).toEqual(results[0].reasonCodes);
      });
    });

    test('evaluation completes quickly without network delays', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0
        }
      };

      const startTime = Date.now();
      await engine.evaluate(input);
      const duration = Date.now() - startTime;

      // Should complete in under 100ms (no network calls)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Edge cases', () => {
    test('handles missing optional fields', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          business_experience_years: 5
          // Missing several optional fields
        }
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBeDefined();
      expect(['A', 'B', 'C']).toContain(result.eligibilityStatus);
    });

    test('handles empty answers object', async () => {
      const input: JudgmentInput = {
        answers: {}
      };

      const result = await engine.evaluate(input);

      expect(result.eligibilityStatus).toBe('C');
      expect(result.reasonCodes.length).toBeGreaterThan(0);
    });
  });

  describe('Output structure', () => {
    test('includes all required output fields', async () => {
      const input: JudgmentInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.evaluate(input);

      expect(result).toHaveProperty('eligibilityStatus');
      expect(result).toHaveProperty('reasonCodes');
      expect(result).toHaveProperty('flaggedItems');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('ruleVersion');
      
      expect(['A', 'B', 'C']).toContain(result.eligibilityStatus);
      expect(Array.isArray(result.reasonCodes)).toBe(true);
      expect(Array.isArray(result.flaggedItems)).toBe(true);
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.ruleVersion).toBe('string');
    });
  });
});
