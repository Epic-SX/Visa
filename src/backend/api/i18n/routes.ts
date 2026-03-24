/**
 * Ticket 08: i18n 言語切替 API
 * GET /api/i18n/:locale または GET /api/i18n?locale=ja
 */

import { Router, Request, Response } from 'express';
import { getI18n, isSupportedLocale } from '../../utils/get-i18n';

const router = Router();

router.get('/:locale?', (req: Request, res: Response) => {
  const locale =
    (req.params.locale ?? (req.query.locale as string) ?? 'ja').toLowerCase();

  if (!isSupportedLocale(locale)) {
    res.status(400).json({
      code: 'INVALID_LOCALE',
      message: `Unsupported locale: ${locale}. Supported: ja, en, zh`
    });
    return;
  }

  const translations = getI18n(locale);
  res.json(translations);
});

export default router;
