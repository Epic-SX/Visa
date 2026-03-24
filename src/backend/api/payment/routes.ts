import { Router } from 'express';
import { createPaymentIntent } from './controller';
import { checkPaymentStatus, checkEntitlementStatus } from './status-controller';
import { getPool } from '../../database/client';
import { resolveUserFromSession } from '../../middleware';

const router = Router();
const pool = getPool();

/**
 * POST /api/payment/create-payment-intent
 * E-03: product_code のみ受け取り、price_id はサーバ固定。金額はクライアント指定禁止。
 */
router.post(
  '/create-payment-intent',
  resolveUserFromSession(pool),
  (req, res) => createPaymentIntent(req as any, res)
);

/**
 * GET /api/payment/status/:paymentIntentId
 * Webhook遅延時のUX改善: 決済完了後、権限反映待ちの状態を確認
 */
router.get(
  '/status/:paymentIntentId',
  resolveUserFromSession(pool),
  (req, res) => checkPaymentStatus(req as any, res)
);

/**
 * GET /api/payment/entitlement-status
 * 現在のユーザーのentitlement状態を確認
 */
router.get(
  '/entitlement-status',
  resolveUserFromSession(pool),
  (req, res) => checkEntitlementStatus(req as any, res)
);

export default router;
