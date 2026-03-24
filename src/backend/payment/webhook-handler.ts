import { Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../database/client';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-11-20.acacia'
});

/** E-04: Connect 利用時の手数料・振込先 */
const STRIPE_CONNECT_ACCOUNT_ID = process.env.STRIPE_CONNECT_ACCOUNT_ID || null;

/**
 * referrer_id → Stripe Connect Account ID のマッピング（環境変数ベース）
 * 例: STRIPE_CONNECT_ACCOUNT_REFERRER_001=acct_xxx
 */
function getConnectAccountForReferrer(referrerId: string): string | null {
  const envKey = `STRIPE_CONNECT_ACCOUNT_REFERRER_${referrerId.toUpperCase()}`;
  const accountId = process.env[envKey];
  if (accountId && accountId.trim()) {
    return accountId.trim();
  }
  // fallback: 単一 Connect アカウント
  return STRIPE_CONNECT_ACCOUNT_ID;
}

export class StripeWebhookHandler {
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const isProcessed = await this.checkEventProcessed(event.id);
    if (isProcessed) {
      console.log('Event already processed:', event.id);
      res.json({ received: true, already_processed: true });
      return;
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(event);
          break;
        case 'charge.dispute.created':
          await this.handleDisputeCreated(event);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
        default:
          console.log('Unhandled event type:', event.type);
      }

      await this.recordWebhookEvent(event, 'processed');
    } catch (err: any) {
      console.error('Webhook handler error:', err);
      await this.recordWebhookEvent(event, 'failed', err.message);
      res.status(500).send('Webhook handler failed');
      return;
    }

    res.json({ received: true });
  }

  private async checkEventProcessed(eventId: string): Promise<boolean> {
    const result = await db.query(`
      SELECT id FROM webhook_events WHERE stripe_event_id = $1
    `, [eventId]);

    return result.rows.length > 0;
  }

  private async handlePaymentIntentSucceeded(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const metadata = paymentIntent.metadata || {};

    // E-05: 必須 metadata 不足時は DB 処理せずログ出力し 200 返却（Webhook 再送ループ回避）
    const required = ['user_id', 'session_id', 'product_code', 'billing_label', 'payment_context_id'];
    const missing = required.filter((k) => !metadata[k] || String(metadata[k]).trim() === '');
    if (missing.length > 0) {
      console.warn('[Webhook] payment_intent.succeeded missing metadata:', {
        paymentIntentId: paymentIntent.id,
        missing,
        metadata: Object.keys(metadata)
      });
      return;
    }

    const paymentContextId = String(metadata.payment_context_id).trim();
    if (!isValidUuid(paymentContextId)) {
      console.error('[Webhook] payment_context_id is not valid UUID:', {
        paymentIntentId: paymentIntent.id,
        paymentContextId,
        eventId: event.id
      });
      throw new Error(`payment_context_id invalid UUID: ${paymentContextId}`);
    }

    // B) payment_context_id の DB 照合（セキュリティ強化）
    const contextResult = await db.query(`
      SELECT 
        user_id,
        session_id,
        product_code,
        billing_label,
        referrer_id,
        status
      FROM payment_contexts
      WHERE payment_context_id = $1::uuid
    `, [paymentContextId]);

    if (contextResult.rows.length === 0) {
      console.error('[Webhook] payment_context_id not found in DB (possible attack):', {
        paymentIntentId: paymentIntent.id,
        paymentContextId,
        eventId: event.id,
        metadata
      });
      // セキュリティ: DB に存在しない payment_context_id は破棄（entitlement 作成しない）
      return;
    }

    const dbContext = contextResult.rows[0];

    // DB の値と metadata の値を照合（改ざん検知）
    if (
      dbContext.user_id !== String(metadata.user_id) ||
      dbContext.session_id !== String(metadata.session_id) ||
      dbContext.product_code !== String(metadata.product_code)
    ) {
      console.error('[Webhook] payment_context mismatch (possible tampering):', {
        paymentIntentId: paymentIntent.id,
        paymentContextId,
        eventId: event.id,
        dbContext,
        metadata
      });
      // セキュリティ: DB と metadata が不一致の場合は破棄
      return;
    }

    console.log('Payment succeeded:', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      metadata,
      verified: true
    });

    // payment_context の status を processing に更新
    await db.query(`
      UPDATE payment_contexts
      SET status = 'processing',
          stripe_payment_intent_id = $1
      WHERE payment_context_id = $2::uuid
    `, [paymentIntent.id, paymentContextId]);

    await this.createEntitlement({
      userId: String(metadata.user_id),
      sessionId: String(metadata.session_id),
      productCode: String(metadata.product_code),
      billingLabel: String(metadata.billing_label),
      paymentContextId,
      stripePaymentIntentId: paymentIntent.id,
      stripeEventId: event.id,
      amountCents: paymentIntent.amount,
      currency: paymentIntent.currency,
      referrerId: metadata.referrer_id ? String(metadata.referrer_id) : null
    });

    if (metadata.referrer_id) {
      await this.distributeCommission({
        paymentIntentId: paymentIntent.id,
        referrerId: String(metadata.referrer_id),
        amountCents: paymentIntent.amount
      });
    }
  }

  private async handlePaymentIntentFailed(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    await db.query(`
      UPDATE entitlements
      SET status = 'failed', updated_at = now()
      WHERE stripe_payment_intent_id = $1
    `, [paymentIntent.id]);

    console.log('Payment failed:', paymentIntent.id);
  }

  private async handleChargeRefunded(event: Stripe.Event): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    const paymentIntentId = charge.payment_intent as string;

    await db.query(`
      UPDATE entitlements
      SET status = 'refunded', updated_at = now()
      WHERE stripe_payment_intent_id = $1
    `, [paymentIntentId]);

    console.log('Charge refunded:', paymentIntentId);
  }

  private async handleDisputeCreated(event: Stripe.Event): Promise<void> {
    const dispute = event.data.object as Stripe.Dispute;
    console.warn('Dispute created:', dispute.id);
  }

  private async handleSubscriptionCreated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    console.log('Subscription created:', subscription.id);
  }

  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    console.log('Subscription updated:', subscription.id);
  }

  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    console.log('Subscription deleted:', subscription.id);
  }

  private async createEntitlement(data: {
    userId: string;
    sessionId: string;
    productCode: string;
    billingLabel: string;
    paymentContextId: string;
    stripePaymentIntentId: string;
    stripeEventId: string;
    amountCents: number;
    currency: string;
    referrerId: string | null;
  }): Promise<void> {
    const unlockedFeatures = this.getUnlockedFeatures(data.productCode);

    try {
      const result = await db.query(`
        INSERT INTO entitlements (
          user_id,
          session_id,
          product_code,
          billing_label,
          payment_context_id,
          stripe_payment_intent_id,
          stripe_event_id,
          status,
          unlocked_features,
          amount_cents,
          currency,
          referrer_id
        ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, 'succeeded', $8, $9, $10, $11)
        ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
          updated_at = now(),
          status = 'succeeded'
      `, [
        data.userId,
        data.sessionId,
        data.productCode,
        data.billingLabel,
        data.paymentContextId,
        data.stripePaymentIntentId,
        data.stripeEventId,
        JSON.stringify(unlockedFeatures),
        data.amountCents,
        data.currency,
        data.referrerId
      ]);

      const rowCount = result.rowCount ?? 0;
      console.log('[Webhook] Entitlement INSERT/UPDATE completed:', {
        userId: data.userId,
        productCode: data.productCode,
        stripePaymentIntentId: data.stripePaymentIntentId,
        paymentContextId: data.paymentContextId,
        features: unlockedFeatures,
        rowCount
      });

      // payment_context の status を succeeded に更新
      await db.query(`
        UPDATE payment_contexts
        SET status = 'succeeded'
        WHERE payment_context_id = $1::uuid
      `, [data.paymentContextId]);

    } catch (err: any) {
      console.error('[Webhook] Entitlement INSERT failed:', {
        error: err.message,
        paymentContextId: data.paymentContextId,
        stripePaymentIntentId: data.stripePaymentIntentId,
        userId: data.userId
      });

      // payment_context の status を failed に更新
      await db.query(`
        UPDATE payment_contexts
        SET status = 'failed'
        WHERE payment_context_id = $1::uuid
      `, [data.paymentContextId]);

      throw err;
    }
  }

  /**
   * T17/T20: product_code → unlocked_features
   * Screen ID 対応: C-50/C-70/C-83/C-95 の Guard 用キーを含める
   */
  private getUnlockedFeatures(productCode: string): string[] {
    const featureMap: Record<string, string[]> = {
      'BETTER': ['CLIENT_BETTER_UNLOCKED', 'better_result', 'better_pdf'],
      'BEST': ['CLIENT_BEST_UNLOCKED', 'best_result', 'best_pdf', 'ob_commentary'],
      'SET': [
        'CLIENT_SET_UNLOCKED',
        'CLIENT_BETTER_UNLOCKED',
        'CLIENT_BEST_UNLOCKED',
        'better_result',
        'better_pdf',
        'best_result',
        'best_pdf',
        'ob_commentary'
      ],
      'OPTION_MATCHING': ['CLIENT_MATCHING_UNLOCKED', 'matching_unlock', 'professional_detail_access']
    };

    return featureMap[productCode] || [];
  }

  /**
   * E-04: Connect 利用時は transfer でアフィリエイトに分配。
   * referrer_id → connect_account_id のマッピングを環境変数で解決。
   * 詳細: docs/STRIPE_CONNECT_REFERRER_DESIGN.md
   */
  private async distributeCommission(data: {
    paymentIntentId: string;
    referrerId: string;
    amountCents: number;
  }): Promise<void> {
    console.log('Distributing commission:', data);

    const destinationAccount = getConnectAccountForReferrer(data.referrerId);
    if (!destinationAccount) {
      console.warn('[Webhook] No Connect account configured for referrer:', data.referrerId);
      return;
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId);
      const chargeId = typeof paymentIntent.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : (paymentIntent.latest_charge as Stripe.Charge)?.id;
      if (!chargeId) return;

      const commissionPercent = Number(process.env.STRIPE_AFFILIATE_COMMISSION_PERCENT) || 5;
      const amount = Math.round((data.amountCents * commissionPercent) / 100);

      await stripe.transfers.create(
        {
          amount,
          currency: (paymentIntent as any).currency || 'jpy',
          destination: destinationAccount,
          source_transaction: chargeId,
          metadata: { referrer_id: data.referrerId }
        },
        undefined
      );

      console.log('[Webhook] Commission transferred:', {
        referrerId: data.referrerId,
        destination: destinationAccount,
        amount
      });
    } catch (err: any) {
      console.error('[Webhook] distributeCommission error:', err.message);
    }
  }

  private async recordWebhookEvent(
    event: Stripe.Event,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    await db.query(`
      INSERT INTO webhook_events (
        stripe_event_id,
        event_type,
        payload,
        processed_at,
        status,
        error_message
      ) VALUES ($1, $2, $3, now(), $4, $5)
      ON CONFLICT (stripe_event_id) DO NOTHING
    `, [
      event.id,
      event.type,
      JSON.stringify(event),
      status,
      errorMessage || null
    ]);
  }
}
