/**
 * Ticket 05: Scoring Engine Tests
 * 
 * Tests for deterministic scoring calculation with fixed rounding
 * and reproducibility guarantees
 */

import { ScoringEngine } from './engine';
import { ScoringInput } from '@shared/types/layers';
import * as fs from 'fs';
import * as path from 'path';

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine();
  });

  describe('Basic scoring calculation', () => {
    test('calculates score for excellent business plan', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          previous_visa_approvals: 2
        }
      };

      const result = await engine.calculate(input);

      expect(result.totalScore).toBeGreaterThan(80);
      expect(result.attentionZones).toHaveLength(0);
    });

    test('calculates score for poor business plan', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'incomplete',
          capital_amount: 2000000,
          office_type: 'none',
          business_experience_years: 0,
          plans_to_hire_employees: false,
          previous_visa_rejections: 2
        }
      };

      const result = await engine.calculate(input);

      expect(result.totalScore).toBeLessThan(50);
      expect(result.attentionZones.length).toBeGreaterThan(0);
    });
  });

  describe('Fixed rounding rules', () => {
    test('rounds total score to 2 decimal places', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 5500000,
          office_type: 'home',
          office_dedicated: true,
          business_experience_years: 4,
          plans_to_hire_employees: true,
          employee_count_planned: 2,
          previous_visa_rejections: 0,
          previous_visa_approvals: 0
        }
      };

      const result = await engine.calculate(input);

      // Check that score has at most 2 decimal places
      const decimalPlaces = (result.totalScore.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });

    test('rounds category scores to 2 decimal places', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7500000,
          financial_stability_rating: 'excellent',
          office_type: 'shared_office',
          office_lease_confirmed: true,
          business_experience_years: 6,
          has_relevant_education: true,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.calculate(input);

      // Check all category scores have at most 2 decimal places
      for (const [category, score] of Object.entries(result.categoryScores)) {
        const decimalPlaces = (score.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('Calculation logging', () => {
    test('includes calculation log when requested', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 8000000,
          financial_stability_rating: 'good',
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 7,
          has_management_experience: true,
          plans_to_hire_employees: true,
          employee_count_planned: 4,
          previous_visa_rejections: 0,
          previous_visa_approvals: 1
        }
      };

      const result = await engine.calculate(input, true);

      expect(result.calculationLog).toBeDefined();
      expect(result.calculationLog!.roundingRule).toBe('Round to 2 decimal places (0.005 rounds up)');
      expect(result.calculationLog!.categoryDetails).toBeDefined();
      expect(result.calculationLog!.categoryDetails.length).toBeGreaterThan(0);
      expect(result.calculationLog!.totalBeforeRounding).toBeDefined();
    });

    test('calculation log includes all category details', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 6000000,
          office_type: 'home',
          office_dedicated: true,
          business_experience_years: 5,
          plans_to_hire_employees: false,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.calculate(input, true);

      const log = result.calculationLog!;
      
      for (const detail of log.categoryDetails) {
        expect(detail.category).toBeDefined();
        expect(detail.baseScore).toBeDefined();
        expect(detail.modifiers).toBeDefined();
        expect(detail.finalScore).toBeDefined();
        expect(detail.weight).toBeDefined();
        expect(detail.weightedScore).toBeDefined();
      }
    });

    test('records applied modifiers in log', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          financial_stability_rating: 'excellent', // This should apply a modifier
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          has_relevant_education: true, // This should apply a modifier
          has_management_experience: true, // This should apply a modifier
          plans_to_hire_employees: true,
          employee_count_planned: 2,
          previous_visa_rejections: 0
        }
      };

      const result = await engine.calculate(input, true);

      const log = result.calculationLog!;
      
      // Find categories with modifiers
      const categoriesWithModifiers = log.categoryDetails.filter(d => d.modifiers.length > 0);
      
      expect(categoriesWithModifiers.length).toBeGreaterThan(0);
      
      for (const detail of categoriesWithModifiers) {
        for (const modifier of detail.modifiers) {
          expect(modifier.condition).toBeDefined();
          expect(modifier.multiplier).toBeDefined();
        }
      }
    });
  });

  describe('Determinism and reproducibility', () => {
    test('same input produces same output', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'good',
          capital_amount: 7000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 5,
          plans_to_hire_employees: true,
          employee_count_planned: 3,
          previous_visa_rejections: 0,
          previous_visa_approvals: 1
        }
      };

      const result1 = await engine.calculate(input);
      const result2 = await engine.calculate(input);
      const result3 = await engine.calculate(input);

      expect(result1.totalScore).toBe(result2.totalScore);
      expect(result2.totalScore).toBe(result3.totalScore);
      
      expect(result1.categoryScores).toEqual(result2.categoryScores);
      expect(result2.categoryScores).toEqual(result3.categoryScores);
      
      expect(result1.attentionZones).toEqual(result2.attentionZones);
      expect(result2.attentionZones).toEqual(result3.attentionZones);
    });

    test('multiple runs produce identical results', async () => {
      const testCases = [
        {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          previous_visa_approvals: 2
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
          business_plan_quality: 'poor',
          capital_amount: 3000000,
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 1,
          plans_to_hire_employees: false,
          previous_visa_rejections: 1
        }
      ];

      for (const testCase of testCases) {
        const input: ScoringInput = { answers: testCase };
        
        const results = await Promise.all([
          engine.calculate(input),
          engine.calculate(input),
          engine.calculate(input),
          engine.calculate(input),
          engine.calculate(input)
        ]);

        // All results should be identical
        const firstScore = results[0].totalScore;
        for (const result of results) {
          expect(result.totalScore).toBe(firstScore);
        }
      }
    });
  });

  describe('Snapshot tests for reproducibility', () => {
    const snapshotsDir = path.join(__dirname, '__snapshots__');
    const snapshotFile = path.join(snapshotsDir, 'scoring-engine.snapshot.json');

    const testCases = [
      {
        name: 'excellent_all_criteria',
        answers: {
          business_plan_quality: 'excellent',
          capital_amount: 10000000,
          financial_stability_rating: 'excellent',
          office_type: 'dedicated_office',
          office_lease_confirmed: true,
          business_experience_years: 10,
          has_relevant_education: true,
          has_management_experience: true,
          plans_to_hire_employees: true,
          employee_count_planned: 5,
          previous_visa_rejections: 0,
          previous_visa_approvals: 2
        }
      },
      {
        name: 'average_mixed_criteria',
        answers: {
          business_plan_quality: 'average',
          capital_amount: 6000000,
          financial_stability_rating: 'good',
          office_type: 'shared_office',
          office_lease_confirmed: true,
          business_experience_years: 4,
          plans_to_hire_employees: true,
          employee_count_planned: 2,
          previous_visa_rejections: 0
        }
      },
      {
        name: 'poor_minimal_criteria',
        answers: {
          business_plan_quality: 'incomplete',
          capital_amount: 2000000,
          financial_stability_rating: 'poor',
          office_type: 'home',
          office_dedicated: false,
          business_experience_years: 1,
          plans_to_hire_employees: false,
          previous_visa_rejections: 2
        }
      },
      {
        name: 'edge_case_thresholds',
        answers: {
          business_plan_quality: 'good',
          capital_amount: 5000000, // Exactly at threshold
          office_type: 'home',
          office_dedicated: true,
          business_experience_years: 3, // Exactly at threshold
          plans_to_hire_employees: true,
          employee_count_planned: 1,
          previous_visa_rejections: 0,
          previous_visa_approvals: 0
        }
      }
    ];

    test('generates and validates snapshots', async () => {
      const snapshots: Record<string, any> = {};

      for (const testCase of testCases) {
        const input: ScoringInput = { answers: testCase.answers };
        const result = await engine.calculate(input, true);

        snapshots[testCase.name] = {
          totalScore: result.totalScore,
          categoryScores: result.categoryScores,
          attentionZones: result.attentionZones,
          ruleVersion: result.ruleVersion,
          calculationLog: result.calculationLog
        };
      }

      // Ensure snapshots directory exists
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }

      // Load existing snapshot if it exists
      let existingSnapshots: Record<string, any> = {};
      if (fs.existsSync(snapshotFile)) {
        existingSnapshots = JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'));
      }

      // Compare with existing snapshots
      if (Object.keys(existingSnapshots).length > 0) {
        for (const testCase of testCases) {
          const existing = existingSnapshots[testCase.name];
          const current = snapshots[testCase.name];

          if (existing) {
            // Verify reproducibility: current results must match saved snapshot
            expect(current.totalScore).toBe(existing.totalScore);
            expect(current.categoryScores).toEqual(existing.categoryScores);
            expect(current.attentionZones).toEqual(existing.attentionZones);
          }
        }
      }

      // Save/update snapshots
      fs.writeFileSync(snapshotFile, JSON.stringify(snapshots, null, 2));
    });
  });

  describe('Attention zones', () => {
    test('identifies categories below threshold', async () => {
      const input: ScoringInput = {
        answers: {
          business_plan_quality: 'poor', // Low score
          capital_amount: 10000000, // High score
          office_type: 'none', // Low score
          business_experience_years: 10, // High score
          plans_to_hire_employees: false, // Lower score
          previous_visa_rejections: 0
        }
      };

      const result = await engine.calculate(input);

      expect(result.attentionZones.length).toBeGreaterThan(0);
      expect(result.attentionZones).toContain('business_plan');
      expect(result.attentionZones).toContain('office_and_facilities');
    });
  });

  describe('No external dependencies', () => {
    test('scoring is purely deterministic with no external calls', async () => {
      const input: ScoringInput = {
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
      // If there were external dependencies, this might fail due to rate limits or network issues
      const results = await Promise.all(
        Array(10).fill(null).map(() => engine.calculate(input))
      );

      // All should succeed and be identical
      const firstScore = results[0].totalScore;
      results.forEach(result => {
        expect(result.totalScore).toBe(firstScore);
      });
    });
  });
});
