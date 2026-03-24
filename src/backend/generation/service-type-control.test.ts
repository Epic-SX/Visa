/**
 * Ticket 16: Service Type × Review Control Logic Tests
 * 
 * Comprehensive test suite covering all service type combinations
 */

import { ServiceTypeControl, ReviewContext } from './service-type-control';

describe('ServiceTypeControl', () => {
  let control: ServiceTypeControl;

  beforeEach(() => {
    control = new ServiceTypeControl();
  });

  describe('Wording control rules', () => {
    test('service1: no professional mentions allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const wordingControl = control.getWordingControl(context);

      expect(wordingControl.allowScrivenerMentions).toBe(false);
      expect(wordingControl.allowObMentions).toBe(false);
      expect(wordingControl.allowExpertAdvice).toBe(false);
    });

    test('service2: scrivener mentions allowed, OB not allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service2',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: false
      };

      const wordingControl = control.getWordingControl(context);

      expect(wordingControl.allowScrivenerMentions).toBe(true);
      expect(wordingControl.allowObMentions).toBe(false);
      expect(wordingControl.allowExpertAdvice).toBe(true);
    });

    test('service3: OB mentions allowed, scrivener not allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service3',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: true
      };

      const wordingControl = control.getWordingControl(context);

      expect(wordingControl.allowScrivenerMentions).toBe(false);
      expect(wordingControl.allowObMentions).toBe(true);
      expect(wordingControl.allowExpertAdvice).toBe(true);
    });

    test('service4: both scrivener and OB mentions allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service4',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: true
      };

      const wordingControl = control.getWordingControl(context);

      expect(wordingControl.allowScrivenerMentions).toBe(true);
      expect(wordingControl.allowObMentions).toBe(true);
      expect(wordingControl.allowExpertAdvice).toBe(true);
    });

    test('service5: premium with all mentions allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service5',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: true
      };

      const wordingControl = control.getWordingControl(context);

      expect(wordingControl.allowScrivenerMentions).toBe(true);
      expect(wordingControl.allowObMentions).toBe(true);
      expect(wordingControl.allowExpertAdvice).toBe(true);
    });
  });

  describe('Filtering by context - Japanese', () => {
    test('removes scrivener mentions when not involved', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const text = '行政書士が確認しました。専門家のレビューが完了しています。';
      const filtered = control.filterByContext(text, 'ja', context);

      expect(filtered).not.toContain('行政書士');
      expect(filtered).not.toContain('専門家が確認');
      expect(filtered).not.toContain('専門家のレビュー');
    });

    test('removes OB mentions when not involved', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const text = '入管OBによる詳細な解説を追加しました。OBコメントをご確認ください。';
      const filtered = control.filterByContext(text, 'ja', context);

      expect(filtered).not.toContain('入管OB');
      expect(filtered).not.toContain('OBコメント');
    });

    test('preserves scrivener mentions when involved', () => {
      const context: ReviewContext = {
        serviceType: 'service2',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: false
      };

      const text = '行政書士が確認しました。';
      const filtered = control.filterByContext(text, 'ja', context);

      expect(filtered).toContain('行政書士が確認しました');
    });

    test('preserves OB mentions when involved', () => {
      const context: ReviewContext = {
        serviceType: 'service3',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: true
      };

      const text = '入管OBによる解説を追加しました。';
      const filtered = control.filterByContext(text, 'ja', context);

      expect(filtered).toContain('入管OB');
    });
  });

  describe('Filtering by context - English', () => {
    test('removes scrivener mentions when not involved', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const text = 'Reviewed by judicial scrivener. Professional review completed.';
      const filtered = control.filterByContext(text, 'en', context);

      expect(filtered.toLowerCase()).not.toContain('judicial scrivener');
      expect(filtered.toLowerCase()).not.toContain('professional review');
    });

    test('removes OB mentions when not involved', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const text = 'Immigration OB commentary has been added. OB insight provided.';
      const filtered = control.filterByContext(text, 'en', context);

      expect(filtered.toLowerCase()).not.toContain('immigration ob');
      expect(filtered.toLowerCase()).not.toContain('ob commentary');
    });
  });

  describe('Validation', () => {
    test('detects inappropriate scrivener mentions', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const output = {
        headline: '行政書士確認済み',
        todoItems: [],
        explanationText: '専門家によるレビューが完了しました。'
      };

      const violations = control.validate(output, 'ja', context);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.includes('scrivener'))).toBe(true);
    });

    test('detects inappropriate OB mentions', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const output = {
        headline: 'Assessment Results',
        todoItems: [],
        explanationText: 'Review complete',
        obCommentary: ['入管OBからのコメント']
      };

      const violations = control.validate(output, 'ja', context);

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.includes('OB'))).toBe(true);
    });

    test('detects OB commentary when not allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const output = {
        headline: 'Results',
        todoItems: [],
        explanationText: 'Review',
        obCommentary: ['Some commentary']
      };

      const violations = control.validate(output, 'ja', context);

      expect(violations.some(v => v.includes('OB commentary present'))).toBe(true);
    });

    test('passes validation when context matches content', () => {
      const context: ReviewContext = {
        serviceType: 'service4',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: true
      };

      const output = {
        headline: '行政書士確認済み',
        todoItems: [],
        explanationText: '入管OBによる詳細な解説',
        obCommentary: ['OBコメント']
      };

      const violations = control.validate(output, 'ja', context);

      expect(violations.length).toBe(0);
    });
  });

  describe('filterOutput', () => {
    test('removes OB commentary entirely when not allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const output = {
        headline: 'Results',
        todoItems: ['Item 1'],
        explanationText: 'Explanation',
        obCommentary: ['Commentary 1', 'Commentary 2'],
        disclaimer: 'Disclaimer'
      };

      const filtered = control.filterOutput(output, 'ja', context);

      expect(filtered.obCommentary).toBeUndefined();
    });

    test('preserves OB commentary when allowed', () => {
      const context: ReviewContext = {
        serviceType: 'service3',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: true
      };

      const output = {
        headline: 'Results',
        todoItems: ['Item 1'],
        explanationText: 'Explanation',
        obCommentary: ['入管OBコメント'],
        disclaimer: 'Disclaimer'
      };

      const filtered = control.filterOutput(output, 'ja', context);

      expect(filtered.obCommentary).toBeDefined();
      expect(filtered.obCommentary!.length).toBe(1);
    });

    test('filters all text fields', () => {
      const context: ReviewContext = {
        serviceType: 'service1',
        judicialScrivenerInvolved: false,
        immigrationObInvolved: false
      };

      const output = {
        headline: '行政書士確認済み結果',
        todoItems: ['専門家に相談', '入管OBコメント確認'],
        explanationText: '行政書士による詳細レビュー。入管OBからの助言。',
        disclaimer: 'Reference only'
      };

      const filtered = control.filterOutput(output, 'ja', context);

      expect(filtered.headline).not.toContain('行政書士');
      expect(filtered.todoItems[0]).not.toContain('専門家');
      expect(filtered.todoItems[1]).not.toContain('入管OB');
      expect(filtered.explanationText).not.toContain('行政書士');
      expect(filtered.explanationText).not.toContain('入管OB');
      expect(filtered.disclaimer).toBe(output.disclaimer); // Unchanged
    });
  });

  describe('All service type combinations', () => {
    const testCases: Array<{
      serviceType: ReviewContext['serviceType'];
      scrivener: boolean;
      ob: boolean;
      description: string;
    }> = [
      { serviceType: 'service1', scrivener: false, ob: false, description: 'Self-assessment only' },
      { serviceType: 'service2', scrivener: true, ob: false, description: 'With professional review' },
      { serviceType: 'service3', scrivener: false, ob: true, description: 'With OB commentary' },
      { serviceType: 'service4', scrivener: true, ob: true, description: 'Professional + OB' },
      { serviceType: 'service5', scrivener: true, ob: true, description: 'Premium service' },
    ];

    test.each(testCases)(
      'correctly handles $description ($serviceType)',
      ({ serviceType, scrivener, ob }) => {
        const context: ReviewContext = {
          serviceType,
          judicialScrivenerInvolved: scrivener,
          immigrationObInvolved: ob
        };

        const wordingControl = control.getWordingControl(context);

        expect(wordingControl.allowScrivenerMentions).toBe(scrivener);
        expect(wordingControl.allowObMentions).toBe(ob);
      }
    );
  });

  describe('Determinism', () => {
    test('produces consistent results for same input', () => {
      const context: ReviewContext = {
        serviceType: 'service2',
        judicialScrivenerInvolved: true,
        immigrationObInvolved: false
      };

      const text = '行政書士が確認しました。入管OBによる解説。';

      const result1 = control.filterByContext(text, 'ja', context);
      const result2 = control.filterByContext(text, 'ja', context);
      const result3 = control.filterByContext(text, 'ja', context);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });
});
