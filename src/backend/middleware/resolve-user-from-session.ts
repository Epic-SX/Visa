/**
 * Session から req.user を解決するミドルウェア
 * JWT がない場合、sessionId から diagnostic_sessions + users を参照
 */

import { Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { AuthenticatedRequest } from './entitlement-guard';

/**
 * body/query/params の sessionId または session_id から user_id, role を取得し req.user に設定
 * Entitlement guard や RBAC の前提として使用
 * 両方のキー名に対応（sessionId / session_id）
 */
export function resolveUserFromSession(pool: Pool) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const sessionId =
      (req.body?.sessionId ?? req.body?.session_id ?? 
       req.query?.sessionId ?? req.query?.session_id ?? 
       req.params?.sessionId ?? req.params?.session_id) as
        | string
        | undefined;

    if (!sessionId) {
      next();
      return;
    }

    try {
      const result = await pool.query<{ user_id: string; role: string }>(
        `SELECT ds.user_id, u.role
         FROM diagnostic_sessions ds
         LEFT JOIN users u ON u.id = ds.user_id
         WHERE ds.id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found'
        });
        return;
      }

      const row = result.rows[0];
      if (!row.user_id) {
        // 匿名セッション: req.user は設定しない（good 層は許可、better/best は 401）
        next();
        return;
      }

      req.user = {
        id: row.user_id,
        role: row.role ?? 'Client'
      };
      next();
    } catch (err) {
      console.error('[resolveUserFromSession] Error:', err);
      res.status(500).json({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to resolve user from session'
      });
    }
  };
}
