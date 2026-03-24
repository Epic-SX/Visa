/**
 * E-03: Checkout / PaymentIntent 生成はサーバ固定マッピングのみ。
 * クライアントからの金額指定は禁止。product_code → price_id はサーバで決定。
 */

import { Response } from 'express';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../database/client';
import type { AuthenticatedRequest } from '../../middleware';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

/** product_code → Stripe Price ID（サーバ固定。クライアントは変更不可） */
const PRODUCT_PRICE_IDS: Record<string, string> = {
  BETTER: process.env.STRIPE_PRICE_ID_BETTER || '',
  BEST: process.env.STRIPE_PRICE_ID_BEST || '',
  SET: process.env.STRIPE_PRICE_ID_SET || '',
  OPTION_MATCHING: process.env.STRIPE_PRICE_ID_OPTION_MATCHING || ''
};

/** C) 固定文言: 商品名・明細表示・領収書備考（クライアント入力禁止） */
const STRIPE_FIXED_STRINGS = {
  // 商品名（内部表示/明細向け）
  PRODUCT_NAME: 'INSIGHTBRIDGE_DIAG',
  
  // Statement Descriptor（カード明細に表示、最大22文字、英大文字推奨）
  STATEMENT_DESCRIPTOR: 'INSIGHTBRIDGE',
  
  // 領収書備考（固定文言）
  RECEIPT_NOTE: 'This service provides information only and does not constitute legal advice or assurance of visa outcome. Not a referral or outcome-based fee service.'
};

/** E-04: Connect 利用時はアカウント指定・手数料を設定。紹介者別分配は docs/STRIPE_CONNECT_REFERRER_DESIGN.md 参照 */
const STRIPE_CONNECT_ACCOUNT_ID = process.env.STRIPE_CONNECT_ACCOUNT_ID || null;

/**
 * referrer_id → Stripe Connect Account ID のマッピング（環境変数ベース）
 * 例: STRIPE_CONNECT_ACCOUNT_REFERRER_001=acct_xxx
 */
function getConnectAccountForReferrer(referrerId: string | null): string | null {
  if (!referrerId) return STRIPE_CONNECT_ACCOUNT_ID;
  const envKey = `STRIPE_CONNECT_ACCOUNT_REFERRER_${referrerId.toUpperCase()}`;
  const accountId = process.env[envKey];
  if (accountId && accountId.trim()) {
    return accountId.trim();
  }
  return STRIPE_CONNECT_ACCOUNT_ID;
}

export type CreatePaymentIntentBody = {
  product_code: 'BETTER' | 'BEST' | 'SET' | 'OPTION_MATCHING';
  session_id: string;
  /** Server-generated only. Client-provided value is ignored; always use uuidv4(). */
  payment_context_id?: string;
  billing_label?: string;
  referrer_id?: string | null;
};

/**
 * POST /api/payment/create-payment-intent
 * サーバで product_code → price_id を解決し、PaymentIntent を生成。金額はクライアント指定不可。
 */
export async function createPaymentIntent(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    return;
  }

  const body = req.body as CreatePaymentIntentBody;
  const { product_code, session_id, billing_label, referrer_id } = body;

  if (!product_code || !session_id) {
    res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'product_code and session_id are required'
    });
    return;
  }

  const priceId = PRODUCT_PRICE_IDS[product_code];
  if (!priceId) {
    res.status(400).json({
      code: 'UNKNOWN_PRODUCT',
      message: `No server-side price configured for product_code: ${product_code}`
    });
    return;
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.unit_amount || price.unit_amount <= 0) {
      res.status(500).json({
        code: 'PRICE_ERROR',
        message: 'Price must have a positive unit_amount'
      });
      return;
    }

    // E-05: payment_context_id は常にサーバで UUID 生成（DB 型 UUID と整合）
    const paymentContextId = uuidv4();

    // B) payment_context を DB に保存（Webhook 照合用）
    await db.query(`
      INSERT INTO payment_contexts (
        payment_context_id,
        user_id,
        session_id,
        product_code,
        billing_label,
        referrer_id,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
    `, [
      paymentContextId,
      userId,
      session_id,
      product_code,
      billing_label || product_code,
      referrer_id || null
    ]);

    const metadata: Record<string, string> = {
      user_id: userId,
      session_id,
      product_code,
      billing_label: billing_label || product_code,
      payment_context_id: paymentContextId
    };
    if (referrer_id) metadata.referrer_id = referrer_id;

    // C) 固定文言を追加（誤認防止）
    const enhancedMetadata = {
      ...metadata,
      receipt_note: STRIPE_FIXED_STRINGS.RECEIPT_NOTE
    };

    const createParams: Stripe.PaymentIntentCreateParams = {
      amount: price.unit_amount,
      currency: price.currency,
      automatic_payment_methods: { enabled: true },
      description: STRIPE_FIXED_STRINGS.PRODUCT_NAME,
      statement_descriptor_suffix: STRIPE_FIXED_STRINGS.STATEMENT_DESCRIPTOR.substring(0, 22),
      metadata: enhancedMetadata
    };

    const destinationAccount = getConnectAccountForReferrer(referrer_id ?? null);
    if (destinationAccount) {
      const applicationFeePercent = Number(process.env.STRIPE_APPLICATION_FEE_PERCENT) || 10;
      const applicationFeeAmount = Math.round(
        (price.unit_amount * applicationFeePercent) / 100
      );
      (createParams as any).application_fee_amount = applicationFeeAmount;
      (createParams as any).transfer_data = {
        destination: destinationAccount
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(createParams);

    res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      payment_context_id: paymentContextId
    });
  } catch (err: any) {
    console.error('[PaymentController] createPaymentIntent error:', err);
    res.status(500).json({
      code: 'PAYMENT_INTENT_ERROR',
      message: err.message || 'Failed to create PaymentIntent'
    });
  }
}
