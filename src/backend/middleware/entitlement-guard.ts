/**
 * Ticket 20: Entitlement Guard Middleware
 * unlock なしでアクセスされた場合 402 Payment Required を返す
 *
 * E-01: tier はクライアント入力で判断しない。DB の entitlements (unlocked_features) のみで判定。
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { EntitlementService } from '../services/entitlement-service';
import {
  RequiredFeature,
  SCREEN_ENTITLEMENT_MAP
} from '@shared/types/entitlement';

/** Entitlement で確定した表示 tier（good=縮約のみ / better / best） */
export type EffectiveTier = 'good' | 'better' | 'best';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
  /** E-01: DB の unlocked_features から導出。クライアントの tier は使わない */
  effectiveTier?: EffectiveTier;
}

/**
 * 指定 feature の unlock を必須とするミドルウェア
 * req.user.id と sessionId（body/query/params）を使用。
 * resolveUserFromSession を事前に適用すること。
 */
export function requireEntitlement(
  requiredFeature: RequiredFeature | string,
  pool: Pool
) {
  const entitlementService = new EntitlementService(pool);

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }

    const sessionId =
      (req.body?.sessionId ?? req.query?.sessionId ?? req.params?.sessionId) as
        | string
        | undefined;

    const hasUnlock = await entitlementService.hasUnlock(
      userId,
      sessionId ?? null,
      requiredFeature
    );

    if (!hasUnlock) {
      res.status(402).json({
        code: 'PAYMENT_REQUIRED',
        message: 'This feature requires payment. Please complete checkout.',
        requiredFeature
      });
      return;
    }

    next();
  };
}

/**
 * PDF 出力用: better_pdf または best_pdf の unlock を必須とする。
 * いずれかがあれば許可。
 */
export function requirePdfEntitlement(pool: Pool) {
  const entitlementService = new EntitlementService(pool);

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }

    const sessionId =
      (req.body?.sessionId ?? req.query?.sessionId ?? req.params?.sessionId) as string | undefined;

    const hasBetter = await entitlementService.hasUnlock(
      userId,
      sessionId ?? null,
      'better_pdf'
    );
    const hasBest = await entitlementService.hasUnlock(
      userId,
      sessionId ?? null,
      'best_pdf'
    );

    if (hasBetter || hasBest) {
      next();
      return;
    }

    res.status(402).json({
      code: 'PAYMENT_REQUIRED',
      message: 'PDF download requires payment. Please complete checkout.',
      requiredFeature: 'better_pdf'
    });
  };
}

/**
 * 判定・スコア API 用: DB の unlocked_features のみで entitlement を判定する。
 * クライアントの tier は一切使わない（E-01）。good 相当は常にスキップせず、未決済なら 402。
 * effectiveTier を req に付与（better / best のみ付与；good の場合は 402 のため付与しない）。
 */
export function requireDiagnosisResultEntitlement(pool: Pool) {
  const entitlementService = new EntitlementService(pool);
  const BETTER = SCREEN_ENTITLEMENT_MAP['C-50'];
  const BEST = SCREEN_ENTITLEMENT_MAP['C-70'];

  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }

    const sessionId =
      (req.body?.sessionId ?? req.query?.sessionId ?? req.params?.sessionId) as string | undefined;

    const unlocked = await entitlementService.getUnlockedFeatures(userId, sessionId ?? null);

    if (unlocked.includes(BEST)) {
      (req as AuthenticatedRequest).effectiveTier = 'best';
      next();
      return;
    }
    if (unlocked.includes(BETTER)) {
      (req as AuthenticatedRequest).effectiveTier = 'better';
      next();
      return;
    }

    res.status(402).json({
      code: 'PAYMENT_REQUIRED',
      message: 'This feature requires payment. Please complete checkout.',
      requiredFeature: BETTER
    });
  };
}
