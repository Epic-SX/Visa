/**
 * Diagnosis API Controller
 * Enforces strict 3-layer execution sequence:
 * 1. Judgment Engine (deterministic, DB rule_sets)
 * 2. Scoring Engine (deterministic, DB rule_sets)
 * 3. Generation Engine (LLM-based, explanation only)
 *
 * ARCHITECTURAL ENFORCEMENT:
 * - Layers 1 & 2 are executed via DiagnosisService which fetches
 *   published rule_sets from the database (NO file-based fallback).
 * - LLM output NEVER modifies judgment or scoring results.
 * - Every execution is logged to diagnosis_runs with ruleset_id + checksum.
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { DiagnosisService } from '../../services/diagnosis-service';
import { DifyClient } from '../../generation/dify-client';
import { getI18n } from '../../utils/get-i18n';
import { generatePdf, getProhibitedFilterForPdf, type PdfContent } from '../../utils/pdf-generator';
import type { AuthenticatedRequest } from '../../middleware';
import {
  GenerationInput,
  GenerationOutput,
  FinalizedJudgmentOutput,
  FinalizedScoringOutput,
  ServiceType,
  Locale,
  Tier
} from '@shared/types/layers';

interface DiagnosisRequest {
  sessionId: string;
  answers: Record<string, any>;
  locale: Locale;
  /** E-01: クライアントの tier は参照しない。effectiveTier をミドルウェアが DB から付与 */
  serviceType: ServiceType;
  userId?: string;
}

interface DiagnosisResponse {
  // Layer 1: Judgment (deterministic, finalized, immutable)
  judgment: FinalizedJudgmentOutput;
  // Layer 2: Scoring (deterministic, finalized, immutable)
  scoring: FinalizedScoringOutput;
  // Layer 3: Generation (LLM-based, explanation only)
  generation: GenerationOutput;
  // Audit metadata
  judgmentRulesetId: string;
  scoringRulesetId: string;
  executionSequence: string[];
  // NOTE: timestamp is intentionally omitted from the response body.
  // Deterministic fields only. The execution time is stored in diagnosis_runs.executed_at.
}

export class DiagnosisController {
  private pool: Pool;
  private diagnosisService: DiagnosisService;
  private generationClient: DifyClient;

  constructor(pool: Pool) {
    this.pool = pool;
    // Layers 1 & 2: DB-based, via DiagnosisService
    this.diagnosisService = new DiagnosisService(pool);
    // Layer 3: LLM generation — pool is passed so the prohibited-words filter
    // can be lazy-loaded from the database (no word list in source files).
    this.generationClient = new DifyClient(pool);
  }

  /**
   * POST /api/diagnosis/run
   */
  async run(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const { sessionId, answers, locale, serviceType, userId }: DiagnosisRequest = req.body;

      // E-01/E-02: tier は body で受け取らない。effectiveTier は requireDiagnosisResultEntitlement が DB から付与
      const effectiveTier: Tier = authReq.effectiveTier === 'best' ? 'best' : 'better';

      // ── Validation ──────────────────────────────────────────────────────
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ code: 'INVALID_SESSION_ID', message: 'sessionId is required' });
        return;
      }
      if (!answers || typeof answers !== 'object') {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'answers must be a valid object' });
        return;
      }
      if (!['ja', 'en', 'zh'].includes(locale)) {
        res.status(400).json({ code: 'INVALID_LOCALE', message: 'locale must be ja, en, or zh' });
        return;
      }
      if (!['service1', 'service2', 'service3', 'service4', 'service5'].includes(serviceType)) {
        res.status(400).json({
          code: 'INVALID_SERVICE_TYPE',
          message: 'serviceType must be one of service1–service5'
        });
        return;
      }

      const executionSequence: string[] = [];
      const startTime = Date.now();

      // ── LAYERS 1 & 2: Judgment + Scoring via DiagnosisService (DB rules) ──
      executionSequence.push('Layer 1+2: DiagnosisService - Started');

      const { judgment, scoring, judgmentRulesetId, scoringRulesetId } =
        await this.diagnosisService.executeDiagnosis({
          sessionId,
          answers,
          locale,
          serviceType,
          userId
        });

      executionSequence.push(
        `Layer 1: Judgment - Completed (status: ${judgment.eligibilityStatus}, ` +
        `ruleset: ${judgmentRulesetId})`
      );
      executionSequence.push(
        `Layer 2: Scoring - Completed (score: ${scoring.totalScore}, ` +
        `ruleset: ${scoringRulesetId})`
      );

      // ── CRITICAL CHECKPOINT ───────────────────────────────────────────────
      // Judgment and Scoring are FINALIZED and IMMUTABLE from this point.
      // Layer 3 can ONLY add explanatory text; it cannot alter L1/L2 values.
      const finalizedJudgment: FinalizedJudgmentOutput = Object.freeze({ ...judgment });
      const finalizedScoring: FinalizedScoringOutput  = Object.freeze({ ...scoring });

      // ── LAYER 3: Generation (LLM, explanation only) ───────────────────────
      executionSequence.push('Layer 3: Generation Engine - Started');

      const generationInput: GenerationInput = {
        reasonCodes: judgment.reasonCodes,
        locale,
        tier: effectiveTier,
        serviceType
      };

      const generationOutput: GenerationOutput =
        await this.generationClient.generateExplanation(generationInput);

      executionSequence.push('Layer 3: Generation Engine - Completed');

      // ── Assemble response ─────────────────────────────────────────────────
      const response: DiagnosisResponse = {
        judgment: finalizedJudgment,
        scoring: finalizedScoring,
        generation: generationOutput,
        judgmentRulesetId,
        scoringRulesetId,
        executionSequence
        // timestamp omitted: deterministic fields only; see diagnosis_runs.executed_at
      };

      console.log(`[DiagnosisController] Completed in ${Date.now() - startTime}ms`, {
        sessionId,
        serviceType,
        status: judgment.eligibilityStatus,
        totalScore: scoring.totalScore,
        judgmentRulesetId,
        scoringRulesetId
      });

      res.status(200).json(response);

    } catch (error) {
      console.error('[DiagnosisController] Error:', error);

      // Surface "no published ruleset" errors as 422 so clients know it's
      // a configuration problem, not a runtime crash.
      const message = error instanceof Error ? error.message : 'An error occurred';
      const isRulesetMissing =
        message.includes('No published judgment ruleset') ||
        message.includes('No published scoring ruleset');

      res.status(isRulesetMissing ? 422 : 500).json({
        code: isRulesetMissing ? 'RULESET_NOT_PUBLISHED' : 'DIAGNOSIS_ERROR',
        message
      });
    }
  }

  /**
   * GET /api/diagnosis/preview
   * E-01: 無料表示用。判定・スコアは返さない。決済促進メッセージのみ。
   */
  async preview(req: Request, res: Response): Promise<void> {
    const locale = (req.query?.locale as Locale) || 'ja';
    const safeLocale = ['ja', 'en', 'zh'].includes(locale) ? locale : 'ja';
    const t = getI18n(safeLocale) as Record<string, Record<string, string>>;
    const message = t?.payment?.payment_required ?? 'Payment required to access this feature';
    res.status(200).json({
      code: 'PREVIEW_ONLY',
      message,
      judgment: null,
      scoring: null,
      generation: null
    });
  }

  /**
   * POST /api/diagnosis/pdf
   * Entitlement: better_pdf または best_pdf 必須。
   * Body: { sessionId, locale?, headline?, todoItems?, explanationText?, disclaimer? }
   */
  async pdf(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId, locale: localeParam, headline, todoItems, explanationText, disclaimer } = req.body ?? {};

      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ code: 'INVALID_INPUT', message: 'sessionId is required' });
        return;
      }

      const locale = (localeParam as Locale) || 'ja';
      const safeLocale = ['ja', 'en', 'zh'].includes(locale) ? locale : 'ja';

      const content: PdfContent = {
        headline: headline ?? undefined,
        todoItems: Array.isArray(todoItems) ? todoItems : undefined,
        explanationText: explanationText ?? undefined,
        disclaimer: disclaimer ?? undefined
      };

      const prohibitedFilter = await getProhibitedFilterForPdf(this.pool);
      const buffer = await generatePdf(this.pool, content, {
        locale: safeLocale,
        prohibitedFilter
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="diagnosis-result.pdf"');
      res.send(buffer);
    } catch (error) {
      console.error('[DiagnosisController] PDF error:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate PDF';
      res.status(500).json({
        code: 'PDF_ERROR',
        message
      });
    }
  }

  /**
   * GET /api/diagnosis/health
   * Verifies that the DB connection and a test published ruleset are reachable.
   */
  async healthCheck(req: Request, res: Response): Promise<void> {
    const health: Record<string, string> = {
      layer1_judgment: 'unchecked',
      layer2_scoring: 'unchecked',
      layer3_generation: 'operational'
    };

    try {
      // Minimal smoke test: attempt to fetch a published ruleset for service1
      // (will error with 422 if not published, which is expected in dev)
      await this.diagnosisService.executeDiagnosis({
        sessionId: 'health-check',
        answers: {
          business_plan_quality: 'good',
          capital_amount: 5000000,
          office_type: 'dedicated_office',
          business_experience_years: 5
        },
        locale: 'ja',
        serviceType: 'service1'
      });
      health.layer1_judgment = 'operational';
      health.layer2_scoring  = 'operational';
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'unknown';
      health.layer1_judgment = msg.includes('No published') ? 'no_published_ruleset' : 'error';
      health.layer2_scoring  = health.layer1_judgment;
    }

    const allOk = ['layer1_judgment', 'layer2_scoring', 'layer3_generation']
      .every(k => health[k] === 'operational');

    res.status(allOk ? 200 : 503).json(health);
  }
}
