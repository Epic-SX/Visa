/**
 * Payment Status Controller
 * Webhook遅延時のUX改善: 決済完了後、権限反映待ちの状態を確認できるAPI
 * 
 * 用途:
 * - 決済完了後、Webhook処理中の状態を表示
 * - 「決済は完了、権限反映を確認中（最大数十秒）」のUX実現
 * 
 * 注意:
 * - このAPIは状態確認のみ。権限付与はあくまでWebhook経由
 */

import { Response } from 'express';
import Stripe from 'stripe';
import { db } from '../../database/client';
import type { AuthenticatedRequest } from '../../middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

export interface PaymentStatusResponse {
  payment_intent_id: string;
  stripe_status: string;
  entitlement_status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'not_found';
  message: string;
  can_access: boolean;
  estimated_wait_seconds?: number;
}

/**
 * GET /api/payment/status/:paymentIntentId
 * 
 * 決済状態とentitlement付与状態を確認
 * フロントエンドでポーリングして「権限反映中」を表示
 */
export async function checkPaymentStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ 
      code: 'UNAUTHORIZED', 
      message: 'Authentication required' 
    });
    return;
  }

  const { paymentIntentId } = req.params;

  if (!paymentIntentId || !paymentIntentId.startsWith('pi_')) {
    res.status(400).json({
      code: 'INVALID_PAYMENT_INTENT_ID',
      message: 'Invalid payment intent ID format'
    });
    return;
  }

  try {
    // 1. Stripe PaymentIntent の状態を確認
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // 2. Entitlement の状態を確認
    const entitlementResult = await db.query(`
      SELECT 
        id,
        status,
        unlocked_features,
        created_at,
        updated_at
      FROM entitlements
      WHERE stripe_payment_intent_id = $1
        AND user_id = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [paymentIntentId, userId]);

    const response: PaymentStatusResponse = {
      payment_intent_id: paymentIntentId,
      stripe_status: paymentIntent.status,
      entitlement_status: 'not_found',
      message: '',
      can_access: false
    };

    // 3. 状態判定ロジック
    if (paymentIntent.status === 'succeeded') {
      if (entitlementResult.rows.length > 0) {
        const entitlement = entitlementResult.rows[0];
        
        if (entitlement.status === 'succeeded') {
          // 完了: 権限付与済み
          response.entitlement_status = 'succeeded';
          response.message = 'Payment completed and access granted';
          response.can_access = true;
        } else if (entitlement.status === 'failed') {
          // 失敗: Webhook処理でエラー
          response.entitlement_status = 'failed';
          response.message = 'Payment succeeded but entitlement grant failed. Please contact support.';
          response.can_access = false;
        } else {
          // 処理中（稀なケース）
          response.entitlement_status = 'processing';
          response.message = 'Payment completed. Processing access grant...';
          response.can_access = false;
          response.estimated_wait_seconds = 30;
        }
      } else {
        // Webhook未到達 or 処理中
        const elapsedSeconds = Math.floor((Date.now() - paymentIntent.created * 1000) / 1000);
        
        if (elapsedSeconds < 60) {
          // 1分以内: 正常範囲内の遅延
          response.entitlement_status = 'processing';
          response.message = 'Payment completed. Confirming access grant (usually takes 5-30 seconds)...';
          response.can_access = false;
          response.estimated_wait_seconds = Math.max(30 - elapsedSeconds, 5);
        } else {
          // 1分以上: 異常な遅延
          response.entitlement_status = 'pending';
          response.message = 'Payment completed but taking longer than expected. Please wait or contact support.';
          response.can_access = false;
          response.estimated_wait_seconds = 60;
        }
      }
    } else if (paymentIntent.status === 'processing') {
      // 決済処理中
      response.entitlement_status = 'pending';
      response.message = 'Payment is being processed...';
      response.can_access = false;
      response.estimated_wait_seconds = 60;
    } else if (paymentIntent.status === 'requires_payment_method') {
      // 決済失敗
      response.entitlement_status = 'failed';
      response.message = 'Payment failed. Please try again.';
      response.can_access = false;
    } else {
      // その他の状態
      response.entitlement_status = 'pending';
      response.message = `Payment status: ${paymentIntent.status}`;
      response.can_access = false;
    }

    res.status(200).json(response);

  } catch (err: any) {
    console.error('[PaymentStatus] Error:', err);
    
    if (err.type === 'StripeInvalidRequestError') {
      res.status(404).json({
        code: 'PAYMENT_INTENT_NOT_FOUND',
        message: 'Payment intent not found'
      });
      return;
    }

    res.status(500).json({
      code: 'PAYMENT_STATUS_ERROR',
      message: 'Failed to check payment status'
    });
  }
}

/**
 * GET /api/payment/entitlement-status
 * 
 * 現在のユーザーのentitlement状態を確認
 * セッション単位での権限確認
 */
export async function checkEntitlementStatus(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ 
      code: 'UNAUTHORIZED', 
      message: 'Authentication required' 
    });
    return;
  }

  const { sessionId } = req.query;

  try {
    let query = `
      SELECT 
        id,
        product_code,
        status,
        unlocked_features,
        created_at,
        stripe_payment_intent_id
      FROM entitlements
      WHERE user_id = $1
        AND status = 'succeeded'
    `;
    const params: any[] = [userId];

    if (sessionId) {
      query += ` AND session_id = $2`;
      params.push(sessionId);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, params);

    res.status(200).json({
      entitlements: result.rows,
      has_access: result.rows.length > 0,
      total_count: result.rows.length
    });

  } catch (err: any) {
    console.error('[EntitlementStatus] Error:', err);
    res.status(500).json({
      code: 'ENTITLEMENT_STATUS_ERROR',
      message: 'Failed to check entitlement status'
    });
  }
}
