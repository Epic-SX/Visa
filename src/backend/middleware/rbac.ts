/**
 * Ticket 19: RBAC Middleware
 * Affiliate ロールは診断・レビュー閲覧不可
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string };
}

/**
 * Affiliate ロールを拒否（診断・レビュー API 用）
 * Affiliate がアクセスした場合 403
 */
export function denyAffiliate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const role = req.user?.role;
  if (role === 'Affiliate') {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Affiliate users cannot access diagnosis or review data.'
    });
    return;
  }
  next();
}
