/**
 * Ticket 17/20: Entitlement Service
 * Entitlement を唯一の権限ソースとして、unlock 状態を判定する。
 * 更新は Webhook 経由のみ。このサービスは参照のみ。
 */

import { Pool } from 'pg';
import { EntitlementRepository } from '../repositories/entitlement-repository';
import { RequiredFeature } from '@shared/types/entitlement';

export class EntitlementService {
  private repo: EntitlementRepository;

  constructor(pool: Pool) {
    this.repo = new EntitlementRepository(pool);
  }

  /**
   * 指定 feature が unlock されているか
   * 未決済・refund 時は false
   */
  async hasUnlock(
    userId: string,
    sessionId: string | null,
    requiredFeature: RequiredFeature | string
  ): Promise<boolean> {
    return this.repo.hasUnlock(userId, sessionId ?? '', requiredFeature);
  }

  /**
   * ユーザー＋セッションの全 unlocked features
   */
  async getUnlockedFeatures(
    userId: string,
    sessionId: string | null
  ): Promise<string[]> {
    if (sessionId) {
      return this.repo.getUnlockedFeaturesForUserSession(userId, sessionId);
    }
    return this.repo.getUnlockedFeaturesForUser(userId);
  }
}
