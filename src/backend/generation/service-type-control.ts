/**
 * Ticket 16: Service Type × Review Control Logic
 * 
 * Controls output wording based on service type and review context
 * to prevent displaying mentions of professionals who were not involved.
 * 
 * CRITICAL: API-side enforcement prevents frontend from showing
 * inappropriate role attributions.
 */

import { ServiceType, Locale } from '@shared/types/layers';

export interface ReviewContext {
  serviceType: ServiceType;
  judicialScrivenerInvolved: boolean;
  immigrationObInvolved: boolean;
}

interface WordingControl {
  allowScrivenerMentions: boolean;
  allowObMentions: boolean;
  allowExpertAdvice: boolean;
}

/**
 * Service type definitions as per Dify v1.1 specification
 */
const SERVICE_TYPE_DEFINITIONS: Record<ServiceType, {
  name: Record<Locale, string>;
  scrivenerInvolved: boolean;
  obInvolved: boolean;
  expertLevel: 'none' | 'basic' | 'advanced';
}> = {
  service1: {
    name: { ja: 'セルフ診断', en: 'Self-Assessment', zh: '自助评估' },
    scrivenerInvolved: false,
    obInvolved: false,
    expertLevel: 'none'
  },
  service2: {
    name: { ja: '専門家レビュー付き', en: 'With Professional Review', zh: '含专业审核' },
    scrivenerInvolved: true,
    obInvolved: false,
    expertLevel: 'basic'
  },
  service3: {
    name: { ja: 'OB解説付き', en: 'With Immigration OB Commentary', zh: '含入管OB解说' },
    scrivenerInvolved: false,
    obInvolved: true,
    expertLevel: 'basic'
  },
  service4: {
    name: { ja: '専門家+OB統合', en: 'Professional + OB Integrated', zh: '专业+OB综合' },
    scrivenerInvolved: true,
    obInvolved: true,
    expertLevel: 'advanced'
  },
  service5: {
    name: { ja: 'プレミアム', en: 'Premium', zh: '高级服务' },
    scrivenerInvolved: true,
    obInvolved: true,
    expertLevel: 'advanced'
  }
};

/**
 * Prohibited phrases by role context
 */
const ROLE_SPECIFIC_PHRASES: Record<'scrivener' | 'ob', Record<Locale, string[]>> = {
  scrivener: {
    ja: [
      '行政書士',
      '専門家が確認',
      '専門家のレビュー',
      '専門家による',
      '書士による'
    ],
    en: [
      'judicial scrivener',
      'professional review',
      'expert verification',
      'reviewed by professional',
      'scrivener confirmed'
    ],
    zh: [
      '行政书士',
      '专家确认',
      '专家审核',
      '专业审查'
    ]
  },
  ob: {
    ja: [
      '入管OB',
      'OBによる',
      '元入管職員',
      '入国管理局OB',
      'OBコメント'
    ],
    en: [
      'Immigration OB',
      'former immigration officer',
      'OB commentary',
      'immigration veteran',
      'OB insight'
    ],
    zh: [
      '入管OB',
      '前入管官员',
      'OB评论',
      '入管退休人员'
    ]
  }
};

export class ServiceTypeControl {
  /**
   * Determines wording control rules based on review context
   */
  getWordingControl(context: ReviewContext): WordingControl {
    const serviceConfig = SERVICE_TYPE_DEFINITIONS[context.serviceType];

    return {
      allowScrivenerMentions: context.judicialScrivenerInvolved && serviceConfig.scrivenerInvolved,
      allowObMentions: context.immigrationObInvolved && serviceConfig.obInvolved,
      allowExpertAdvice: serviceConfig.expertLevel !== 'none'
    };
  }

  /**
   * Filters output text to remove role-specific mentions when not applicable
   * 
   * CRITICAL: Prevents displaying "reviewed by professional" when no professional was involved
   */
  filterByContext(
    text: string,
    locale: Locale,
    context: ReviewContext
  ): string {
    const control = this.getWordingControl(context);
    let filteredText = text;

    // Remove scrivener mentions if not involved
    if (!control.allowScrivenerMentions) {
      const scrivenerPhrases = ROLE_SPECIFIC_PHRASES.scrivener[locale];
      for (const phrase of scrivenerPhrases) {
        const regex = new RegExp(this.escapeRegex(phrase), 'gi');
        filteredText = filteredText.replace(regex, '');
      }
    }

    // Remove OB mentions if not involved
    if (!control.allowObMentions) {
      const obPhrases = ROLE_SPECIFIC_PHRASES.ob[locale];
      for (const phrase of obPhrases) {
        const regex = new RegExp(this.escapeRegex(phrase), 'gi');
        filteredText = filteredText.replace(regex, '');
      }
    }

    // Clean up multiple spaces and empty parentheses
    filteredText = filteredText
      .replace(/\s+/g, ' ')
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .trim();

    return filteredText;
  }

  /**
   * Validates if output content is appropriate for the service type
   * 
   * Returns array of violations (empty if valid)
   */
  validate(
    output: {
      headline: string;
      todoItems: string[];
      explanationText: string;
      obCommentary?: string[];
    },
    locale: Locale,
    context: ReviewContext
  ): string[] {
    const control = this.getWordingControl(context);
    const violations: string[] = [];

    const allText = [
      output.headline,
      ...output.todoItems,
      output.explanationText,
      ...(output.obCommentary || [])
    ].join(' ');

    // Check for inappropriate scrivener mentions
    if (!control.allowScrivenerMentions) {
      const scrivenerPhrases = ROLE_SPECIFIC_PHRASES.scrivener[locale];
      for (const phrase of scrivenerPhrases) {
        if (allText.includes(phrase)) {
          violations.push(`Inappropriate scrivener mention: "${phrase}" (judicialScrivenerInvolved=false)`);
        }
      }
    }

    // Check for inappropriate OB mentions
    if (!control.allowObMentions) {
      const obPhrases = ROLE_SPECIFIC_PHRASES.ob[locale];
      for (const phrase of obPhrases) {
        if (allText.includes(phrase)) {
          violations.push(`Inappropriate OB mention: "${phrase}" (immigrationObInvolved=false)`);
        }
      }
    }

    // Check for OB commentary when not allowed
    if (!control.allowObMentions && output.obCommentary && output.obCommentary.length > 0) {
      violations.push('OB commentary present but immigrationObInvolved=false');
    }

    return violations;
  }

  /**
   * Filters entire output object based on review context
   */
  filterOutput(
    output: {
      headline: string;
      todoItems: string[];
      explanationText: string;
      obCommentary?: string[];
      disclaimer: string;
    },
    locale: Locale,
    context: ReviewContext
  ): typeof output {
    const control = this.getWordingControl(context);

    return {
      headline: this.filterByContext(output.headline, locale, context),
      todoItems: output.todoItems.map(item => this.filterByContext(item, locale, context)),
      explanationText: this.filterByContext(output.explanationText, locale, context),
      // Remove OB commentary entirely if not allowed
      obCommentary: control.allowObMentions 
        ? output.obCommentary?.map(item => this.filterByContext(item, locale, context))
        : undefined,
      disclaimer: output.disclaimer // Disclaimer is always shown
    };
  }

  /**
   * Get service type name for display
   */
  getServiceTypeName(serviceType: ServiceType, locale: Locale): string {
    return SERVICE_TYPE_DEFINITIONS[serviceType].name[locale];
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
