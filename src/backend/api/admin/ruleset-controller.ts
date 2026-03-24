/**
 * FEAT-ADMIN-01, FEAT-ADMIN-02, FEAT-ADMIN-03: RuleSet Admin API Controller
 * FEAT-VALID-01: JSON Schema validation
 * SEC-RBAC-01: Admin-only publish
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { RuleSetRepository } from '../../repositories/rule-set-repository';
import { CreateRuleSetRequest, UpdateRuleSetRequest, PublishRuleSetRequest } from '@shared/types/rule-sets';
import { validateJudgmentRules } from '../../judgment/pure-judgment-engine';
import { validateScoringRules } from '../../scoring/pure-scoring-engine';

export class RuleSetController {
  private ruleSetRepo: RuleSetRepository;

  constructor(pool: Pool) {
    this.ruleSetRepo = new RuleSetRepository(pool);
  }

  /**
   * FEAT-ADMIN-01: GET /api/admin/rulesets
   * List rulesets with filtering
   */
  async listRuleSets(req: Request, res: Response): Promise<void> {
    try {
      const { kind, service_type, status, limit, offset } = req.query;

      const result = await this.ruleSetRepo.listRuleSets({
        kind: kind as any,
        service_type: service_type as any,
        status: status as any,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined
      });

      res.status(200).json({
        ok: true,
        data: {
          rulesets: result.rulesets,
          total: result.total,
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0
        }
      });
    } catch (error) {
      console.error('List rulesets error:', error);
      res.status(500).json({
        ok: false,
        error: {
          code: 'LIST_RULESETS_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list rulesets'
        }
      });
    }
  }

  /**
   * FEAT-ADMIN-01: GET /api/admin/rulesets/:id
   * Get ruleset by ID
   */
  async getRuleSet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const ruleset = await this.ruleSetRepo.getRuleSetById(id);

      if (!ruleset) {
        res.status(404).json({
          ok: false,
          error: {
            code: 'RULESET_NOT_FOUND',
            message: 'RuleSet not found'
          }
        });
        return;
      }

      res.status(200).json({
        ok: true,
        data: ruleset
      });
    } catch (error) {
      console.error('Get ruleset error:', error);
      res.status(500).json({
        ok: false,
        error: {
          code: 'GET_RULESET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get ruleset'
        }
      });
    }
  }

  /**
   * FEAT-ADMIN-02: POST /api/admin/rulesets
   * Create new ruleset with JSON schema validation
   */
  async createRuleSet(req: Request, res: Response): Promise<void> {
    try {
      const request: CreateRuleSetRequest = req.body;
      const userId = (req as any).user?.id; // From auth middleware

      if (!userId) {
        res.status(401).json({
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
        return;
      }

      // Validation
      if (!request.kind || !request.service_type || !request.version || !request.rules_json) {
        res.status(400).json({
          ok: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: kind, service_type, version, rules_json'
          }
        });
        return;
      }

      // FEAT-VALID-01: JSON Schema validation
      if (request.kind === 'judgment') {
        if (!validateJudgmentRules(request.rules_json)) {
          res.status(400).json({
            ok: false,
            error: {
              code: 'INVALID_RULES_SCHEMA',
              message: 'Judgment rules do not match required schema. Check criteria, statusThresholds, and version fields.'
            }
          });
          return;
        }
      } else if (request.kind === 'scoring') {
        if (!validateScoringRules(request.rules_json)) {
          res.status(400).json({
            ok: false,
            error: {
              code: 'INVALID_RULES_SCHEMA',
              message: 'Scoring rules do not match required schema. Check categories, thresholds, and version fields.'
            }
          });
          return;
        }
      }

      const ruleset = await this.ruleSetRepo.createRuleSet(request, userId);

      res.status(201).json({
        ok: true,
        data: ruleset
      });
    } catch (error) {
      console.error('Create ruleset error:', error);
      
      if (error instanceof Error && error.message.includes('duplicate key')) {
        res.status(409).json({
          ok: false,
          error: {
            code: 'DUPLICATE_VERSION',
            message: 'A ruleset with this kind, service_type, and version already exists'
          }
        });
        return;
      }

      res.status(500).json({
        ok: false,
        error: {
          code: 'CREATE_RULESET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create ruleset'
        }
      });
    }
  }

  /**
   * FEAT-ADMIN-02: PATCH /api/admin/rulesets/:id
   * Update ruleset (only draft or pending_review)
   */
  async updateRuleSet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const request: UpdateRuleSetRequest = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        res.status(401).json({
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
        return;
      }

      // FEAT-VALID-01: Validate rules_json if provided
      if (request.rules_json) {
        const existingRuleSet = await this.ruleSetRepo.getRuleSetById(id);
        
        if (!existingRuleSet) {
          res.status(404).json({
            ok: false,
            error: { code: 'RULESET_NOT_FOUND', message: 'RuleSet not found' }
          });
          return;
        }

        if (existingRuleSet.kind === 'judgment') {
          if (!validateJudgmentRules(request.rules_json)) {
            res.status(400).json({
              ok: false,
              error: {
                code: 'INVALID_RULES_SCHEMA',
                message: 'Judgment rules do not match required schema'
              }
            });
            return;
          }
        } else if (existingRuleSet.kind === 'scoring') {
          if (!validateScoringRules(request.rules_json)) {
            res.status(400).json({
              ok: false,
              error: {
                code: 'INVALID_RULES_SCHEMA',
                message: 'Scoring rules do not match required schema'
              }
            });
            return;
          }
        }
      }

      const ruleset = await this.ruleSetRepo.updateRuleSet(id, request, userId);

      res.status(200).json({
        ok: true,
        data: ruleset
      });
    } catch (error) {
      console.error('Update ruleset error:', error);

      if (error instanceof Error && error.message.includes('Cannot update ruleset with status')) {
        res.status(403).json({
          ok: false,
          error: {
            code: 'INVALID_STATUS',
            message: error.message
          }
        });
        return;
      }

      res.status(500).json({
        ok: false,
        error: {
          code: 'UPDATE_RULESET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update ruleset'
        }
      });
    }
  }

  /**
   * FEAT-ADMIN-03: POST /api/admin/rulesets/:id/publish
   * SEC-RBAC-01: Admin-only publish
   * Publish ruleset (archives current published version)
   */
  async publishRuleSet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
        return;
      }

      // SEC-RBAC-01: Admin-only publish
      if (userRole !== 'Admin') {
        res.status(403).json({
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only Admin users can publish rulesets. Current role: ' + userRole
          }
        });
        return;
      }

      const ruleset = await this.ruleSetRepo.publishRuleSet(id, userId);

      res.status(200).json({
        ok: true,
        data: ruleset,
        message: 'RuleSet published successfully. Previous published version has been archived.'
      });
    } catch (error) {
      console.error('Publish ruleset error:', error);

      if (error instanceof Error && error.message.includes('already published')) {
        res.status(409).json({
          ok: false,
          error: {
            code: 'ALREADY_PUBLISHED',
            message: error.message
          }
        });
        return;
      }

      res.status(500).json({
        ok: false,
        error: {
          code: 'PUBLISH_RULESET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to publish ruleset'
        }
      });
    }
  }

  /**
   * POST /api/admin/rulesets/:id/archive
   * Archive a ruleset
   */
  async archiveRuleSet(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId) {
        res.status(401).json({
          ok: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
        return;
      }

      // Only Admin can archive
      if (userRole !== 'Admin') {
        res.status(403).json({
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only Admin users can archive rulesets'
          }
        });
        return;
      }

      const ruleset = await this.ruleSetRepo.archiveRuleSet(id, userId);

      res.status(200).json({
        ok: true,
        data: ruleset
      });
    } catch (error) {
      console.error('Archive ruleset error:', error);
      res.status(500).json({
        ok: false,
        error: {
          code: 'ARCHIVE_RULESET_ERROR',
          message: error instanceof Error ? error.message : 'Failed to archive ruleset'
        }
      });
    }
  }
}
