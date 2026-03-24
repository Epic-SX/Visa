/**
 * Ticket 17: Entitlement Repository
 * Entitlement テーブルは Webhook 経由でのみ更新。
 * このリポジトリは参照のみ（SELECT）。
 */

import { Pool } from 'pg';

export interface EntitlementRow {
  id: string;
  user_id: string;
  session_id: string | null;
  product_code: string;
  status: string;
  unlocked_features: string[];
}

export class EntitlementRepository {
  constructor(private pool: Pool) {}

  /**
   * ユーザー＋セッションの有効な entitlement から
   * 全 unlocked_features を合算して返す。
   * status = 'succeeded' のみ有効。refunded 等は無効。
   */
  async getUnlockedFeaturesForUserSession(
    userId: string,
    sessionId: string
  ): Promise<string[]> {
    const result = await this.pool.query<{ unlocked_features: string[] }>(
      `SELECT unlocked_features FROM entitlements
       WHERE user_id = $1 AND (session_id = $2 OR session_id IS NULL)
         AND status = 'succeeded'
       ORDER BY created_at DESC`,
      [userId, sessionId]
    );

    const set = new Set<string>();
    for (const row of result.rows) {
      const arr = Array.isArray(row.unlocked_features)
        ? row.unlocked_features
        : (row.unlocked_features as unknown as string[]);
      if (arr) arr.forEach((f) => set.add(f));
    }
    return Array.from(set);
  }

  /**
   * ユーザーの全有効 entitlement から unlocked_features を合算
   * （session に紐づかない場合用）
   */
  async getUnlockedFeaturesForUser(userId: string): Promise<string[]> {
    const result = await this.pool.query<{ unlocked_features: string[] }>(
      `SELECT unlocked_features FROM entitlements
       WHERE user_id = $1 AND status = 'succeeded'
       ORDER BY created_at DESC`,
      [userId]
    );

    const set = new Set<string>();
    for (const row of result.rows) {
      const arr = Array.isArray(row.unlocked_features)
        ? row.unlocked_features
        : (typeof row.unlocked_features === 'object' && row.unlocked_features !== null
            ? (row.unlocked_features as string[])
            : []);
      if (Array.isArray(arr)) arr.forEach((f) => set.add(f));
    }
    return Array.from(set);
  }

  /**
   * 指定 feature が unlock されているか
   * sessionId が null の場合はユーザー全体の unlock を参照
   */
  async hasUnlock(
    userId: string,
    sessionId: string | null,
    requiredFeature: string
  ): Promise<boolean> {
    const features =
      sessionId != null && sessionId !== ''
        ? await this.getUnlockedFeaturesForUserSession(userId, sessionId)
        : await this.getUnlockedFeaturesForUser(userId);
    return features.includes(requiredFeature);
  }
}
