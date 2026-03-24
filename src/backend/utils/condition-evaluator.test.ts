import { evaluateCondition } from './condition-evaluator';

describe('ConditionEvaluator', () => {
  describe('Basic comparisons', () => {
    test('strict equality operator ===', () => {
      expect(evaluateCondition("status === 'active'", { status: 'active' })).toBe(true);
      expect(evaluateCondition("status === 'inactive'", { status: 'active' })).toBe(false);
    });

    test('strict inequality operator !==', () => {
      expect(evaluateCondition("status !== 'inactive'", { status: 'active' })).toBe(true);
      expect(evaluateCondition("status !== 'active'", { status: 'active' })).toBe(false);
    });

    test('greater than operator >', () => {
      expect(evaluateCondition('age > 18', { age: 25 })).toBe(true);
      expect(evaluateCondition('age > 18', { age: 18 })).toBe(false);
      expect(evaluateCondition('age > 18', { age: 10 })).toBe(false);
    });

    test('less than operator <', () => {
      expect(evaluateCondition('age < 65', { age: 30 })).toBe(true);
      expect(evaluateCondition('age < 65', { age: 65 })).toBe(false);
      expect(evaluateCondition('age < 65', { age: 70 })).toBe(false);
    });

    test('greater than or equal operator >=', () => {
      expect(evaluateCondition('capital_amount >= 5000000', { capital_amount: 5000000 })).toBe(true);
      expect(evaluateCondition('capital_amount >= 5000000', { capital_amount: 7000000 })).toBe(true);
      expect(evaluateCondition('capital_amount >= 5000000', { capital_amount: 3000000 })).toBe(false);
    });

    test('less than or equal operator <=', () => {
      expect(evaluateCondition('capital_amount <= 5000000', { capital_amount: 3000000 })).toBe(true);
      expect(evaluateCondition('capital_amount <= 5000000', { capital_amount: 5000000 })).toBe(true);
      expect(evaluateCondition('capital_amount <= 5000000', { capital_amount: 7000000 })).toBe(false);
    });
  });

  describe('Logical operators', () => {
    test('AND operator &&', () => {
      const context = { age: 25, status: 'active' };
      expect(evaluateCondition("age >= 18 && status === 'active'", context)).toBe(true);
      expect(evaluateCondition("age >= 18 && status === 'inactive'", context)).toBe(false);
      expect(evaluateCondition("age < 18 && status === 'active'", context)).toBe(false);
    });

    test('OR operator ||', () => {
      const context = { age: 25, status: 'pending' };
      expect(evaluateCondition("status === 'active' || status === 'pending'", context)).toBe(true);
      expect(evaluateCondition("status === 'active' || status === 'inactive'", context)).toBe(false);
    });

    test('complex logical expressions', () => {
      const context = { capital: 7000000, experience: 5, office: 'dedicated' };
      expect(
        evaluateCondition(
          "capital >= 5000000 && experience >= 3 && office === 'dedicated'",
          context
        )
      ).toBe(true);
      expect(
        evaluateCondition(
          "capital >= 10000000 || experience >= 10 || office === 'dedicated'",
          context
        )
      ).toBe(true);
    });
  });

  describe('Parentheses', () => {
    test('simple parentheses', () => {
      const context = { a: 10, b: 20, c: 30 };
      expect(evaluateCondition('(a > 5) && (b < 25)', context)).toBe(true);
      expect(evaluateCondition('(a > 15) && (b < 25)', context)).toBe(false);
    });

    test('nested parentheses', () => {
      const context = { a: 10, b: 20, c: 30, d: 40 };
      expect(evaluateCondition('((a > 5 && b > 15) || c < 20) && d > 30', context)).toBe(true);
    });

    test('operator precedence with parentheses', () => {
      const context = { x: 5, y: 10, z: 15 };
      expect(evaluateCondition('x > 3 && (y > 8 || z > 20)', context)).toBe(true);
      expect(evaluateCondition('x > 3 && (y > 12 || z > 20)', context)).toBe(false);
    });
  });

  describe('Real-world VISA rules', () => {
    test('business plan quality rule', () => {
      expect(evaluateCondition("business_plan_quality === 'excellent'", { business_plan_quality: 'excellent' })).toBe(true);
      expect(evaluateCondition("business_plan_quality === 'excellent'", { business_plan_quality: 'good' })).toBe(false);
    });

    test('capital amount range rule', () => {
      expect(
        evaluateCondition('capital_amount >= 7000000 && capital_amount < 10000000', { capital_amount: 8000000 })
      ).toBe(true);
      expect(
        evaluateCondition('capital_amount >= 7000000 && capital_amount < 10000000', { capital_amount: 5000000 })
      ).toBe(false);
    });

    test('office type rule', () => {
      const context = { office_type: 'dedicated_office', office_lease_confirmed: true };
      expect(
        evaluateCondition("office_type === 'dedicated_office' && office_lease_confirmed === true", context)
      ).toBe(true);
    });

    test('business experience rule', () => {
      expect(evaluateCondition('business_experience_years >= 5 && business_experience_years < 10', { business_experience_years: 7 })).toBe(true);
    });

    test('employment plan rule', () => {
      const context = { plans_to_hire_employees: true, employee_count_planned: 5 };
      expect(
        evaluateCondition('plans_to_hire_employees === true && employee_count_planned >= 5', context)
      ).toBe(true);
    });

    test('visa history rule', () => {
      const context = { previous_visa_rejections: 0, previous_visa_approvals: 2 };
      expect(
        evaluateCondition('previous_visa_rejections === 0 && previous_visa_approvals > 0', context)
      ).toBe(true);
    });

    test('incomplete business plan rule', () => {
      expect(
        evaluateCondition("business_plan_quality === 'incomplete' || business_plan_quality === 'missing'", { business_plan_quality: 'incomplete' })
      ).toBe(true);
      expect(
        evaluateCondition("business_plan_quality === 'incomplete' || business_plan_quality === 'missing'", { business_plan_quality: 'missing' })
      ).toBe(true);
      expect(
        evaluateCondition("business_plan_quality === 'incomplete' || business_plan_quality === 'missing'", { business_plan_quality: 'good' })
      ).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('boolean values', () => {
      expect(evaluateCondition('is_active === true', { is_active: true })).toBe(true);
      expect(evaluateCondition('is_active === false', { is_active: false })).toBe(true);
    });

    test('missing variables default to undefined', () => {
      expect(evaluateCondition("missing_var === 'test'", {})).toBe(false);
    });

    test('whitespace handling', () => {
      expect(evaluateCondition('  age  >=  18  ', { age: 25 })).toBe(true);
    });

    test('empty condition returns false', () => {
      expect(evaluateCondition('', { age: 25 })).toBe(false);
    });
  });

  describe('Determinism', () => {
    test('same input produces same output', () => {
      const context = { capital_amount: 7000000, experience_years: 5 };
      const condition = 'capital_amount >= 5000000 && experience_years >= 3';

      const result1 = evaluateCondition(condition, context);
      const result2 = evaluateCondition(condition, context);
      const result3 = evaluateCondition(condition, context);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1).toBe(true);
    });
  });
});
