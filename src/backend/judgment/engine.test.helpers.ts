/**
 * Test helper to create JudgmentInput with required fields
 */
import { JudgmentInput } from '@shared/types/layers';

export function createJudgmentInput(
  answers: Record<string, any>,
  sessionId: string = 'test-session',
  locale: 'ja' | 'en' | 'zh' = 'ja'
): JudgmentInput {
  return {
    sessionId,
    locale,
    answers
  };
}
