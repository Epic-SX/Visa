import { Router } from 'express';
import { DiagnosisController } from './controller';
import { getPool } from '../../database/client';
import {
  resolveUserFromSession,
  denyAffiliate,
  requireDiagnosisResultEntitlement,
  requirePdfEntitlement
} from '../../middleware';

const router = Router();
const pool = getPool();

// Pass the shared DB pool so DiagnosisController can wire DiagnosisService
const controller = new DiagnosisController(pool);

/**
 * POST /api/diagnosis/run
 *
 * E-01/E-02: Entitlement 必須。tier はクライアント入力でなく DB の unlocked_features で判定。
 * 決済未完了ユーザーは 402。good 相当の「無料表示」は /preview に分離。
 *
 * Middleware: resolveUserFromSession → denyAffiliate → requireDiagnosisResultEntitlement
 *
 * Required body: sessionId, answers, locale, serviceType (tier は無視；effectiveTier は DB から付与)
 */
router.post(
  '/run',
  resolveUserFromSession(pool),
  denyAffiliate,
  requireDiagnosisResultEntitlement(pool),
  (req, res) => controller.run(req, res)
);

/**
 * GET /api/diagnosis/preview
 *
 * 無料表示用（E-01 分離）。判定・スコアは返さない。決済促進メッセージ等のみ。
 */
router.get(
  '/preview',
  resolveUserFromSession(pool),
  denyAffiliate,
  (req, res) => controller.preview(req, res)
);

/**
 * POST /api/diagnosis/pdf
 * Entitlement: better_pdf または best_pdf 必須。
 */
router.post(
  '/pdf',
  resolveUserFromSession(pool),
  denyAffiliate,
  requirePdfEntitlement(pool),
  (req, res) => controller.pdf(req, res)
);

/**
 * GET /api/diagnosis/health
 * Health check covering all three diagnosis layers and DB connectivity.
 */
router.get('/health', (req, res) => controller.healthCheck(req, res));

export default router;
