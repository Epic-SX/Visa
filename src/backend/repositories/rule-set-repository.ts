/**
 * FEAT-T04-01: RuleSet Repository
 * Database access layer for rule_sets table
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { RuleSet, RuleKind, ServiceType, RuleSetStatus, CreateRuleSetRequest, UpdateRuleSetRequest } from '@shared/types/rule-sets';

export class RuleSetRepository {
  constructor(private pool: Pool) {}

  /**
   * FEAT-T04-01: Get published ruleset for specific kind and service type
   * FEAT-T04-02: Returns null if not found (caller must handle error)
   */
  async getPublishedRuleSet(kind: RuleKind, serviceType: ServiceType): Promise<RuleSet | null> {
    const query = `
      SELECT * FROM rule_sets
      WHERE kind = $1 
        AND service_type = $2 
        AND status = 'published'
      LIMIT 1
    `;
    
    const result = await this.pool.query(query, [kind, serviceType]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * Get ruleset by ID
   */
  async getRuleSetById(id: string): Promise<RuleSet | null> {
    const query = 'SELECT * FROM rule_sets WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]);
  }

  /**
   * FEAT-ADMIN-01: List rulesets with filtering
   */
  async listRuleSets(filters: {
    kind?: RuleKind;
    service_type?: ServiceType;
    status?: RuleSetStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ rulesets: RuleSet[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (filters.kind) {
      conditions.push(`kind = $${++paramCount}`);
      params.push(filters.kind);
    }

    if (filters.service_type) {
      conditions.push(`service_type = $${++paramCount}`);
      params.push(filters.service_type);
    }

    if (filters.status) {
      conditions.push(`status = $${++paramCount}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM rule_sets ${whereClause}`;
    const countResult = await this.pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get data with pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    
    const dataQuery = `
      SELECT * FROM rule_sets 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `;
    params.push(limit, offset);

    const dataResult = await this.pool.query(dataQuery, params);
    const rulesets = dataResult.rows.map(row => this.mapRow(row));

    return { rulesets, total };
  }

  /**
   * FEAT-ADMIN-02: Create new ruleset
   */
  async createRuleSet(request: CreateRuleSetRequest, userId: string): Promise<RuleSet> {
    const checksum = this.calculateChecksum(request.rules_json);
    
    const query = `
      INSERT INTO rule_sets (
        kind, service_type, version, status, rules_json, checksum, description, created_by, updated_by
      ) VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $7)
      RETURNING *
    `;
    
    const result = await this.pool.query(query, [
      request.kind,
      request.service_type,
      request.version,
      JSON.stringify(request.rules_json),
      checksum,
      request.description,
      userId
    ]);

    return this.mapRow(result.rows[0]);
  }

  /**
   * FEAT-ADMIN-02: Update existing ruleset (only if draft or pending_review)
   */
  async updateRuleSet(id: string, request: UpdateRuleSetRequest, userId: string): Promise<RuleSet> {
    // First, check current status
    const currentRuleSet = await this.getRuleSetById(id);
    if (!currentRuleSet) {
      throw new Error('RuleSet not found');
    }

    if (currentRuleSet.status === 'published' || currentRuleSet.status === 'archived') {
      throw new Error(`Cannot update ruleset with status: ${currentRuleSet.status}`);
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    if (request.rules_json) {
      const checksum = this.calculateChecksum(request.rules_json);
      updates.push(`rules_json = $${++paramCount}`);
      params.push(JSON.stringify(request.rules_json));
      updates.push(`checksum = $${++paramCount}`);
      params.push(checksum);
    }

    if (request.description !== undefined) {
      updates.push(`description = $${++paramCount}`);
      params.push(request.description);
    }

    if (request.status) {
      updates.push(`status = $${++paramCount}`);
      params.push(request.status);
    }

    updates.push(`updated_by = $${++paramCount}`);
    params.push(userId);
    updates.push(`updated_at = now()`);

    params.push(id);
    const query = `
      UPDATE rule_sets 
      SET ${updates.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING *
    `;

    const result = await this.pool.query(query, params);
    return this.mapRow(result.rows[0]);
  }

  /**
   * FEAT-ADMIN-03: Publish ruleset (with transaction to ensure only one published)
   */
  async publishRuleSet(id: string, userId: string, client?: PoolClient): Promise<RuleSet> {
    const useClient = client || this.pool;

    const executePublish = async (c: PoolClient | Pool) => {
      // Get the ruleset to publish
      const ruleSetQuery = 'SELECT * FROM rule_sets WHERE id = $1 FOR UPDATE';
      const ruleSetResult = await c.query(ruleSetQuery, [id]);
      
      if (ruleSetResult.rows.length === 0) {
        throw new Error('RuleSet not found');
      }

      const ruleSet = this.mapRow(ruleSetResult.rows[0]);

      if (ruleSet.status === 'published') {
        throw new Error('RuleSet is already published');
      }

      // Archive currently published ruleset (if exists)
      const archiveQuery = `
        UPDATE rule_sets 
        SET status = 'archived', archived_at = now()
        WHERE kind = $1 
          AND service_type = $2 
          AND status = 'published'
      `;
      await c.query(archiveQuery, [ruleSet.kind, ruleSet.service_type]);

      // Publish the new ruleset
      const publishQuery = `
        UPDATE rule_sets 
        SET status = 'published', 
            published_by = $1, 
            published_at = now(),
            updated_by = $1,
            updated_at = now()
        WHERE id = $2
        RETURNING *
      `;
      const publishResult = await c.query(publishQuery, [userId, id]);

      return this.mapRow(publishResult.rows[0]);
    };

    if (client) {
      return executePublish(client);
    }

    // Use transaction if no client provided
    const transactionClient = await this.pool.connect();
    try {
      await transactionClient.query('BEGIN');
      const result = await executePublish(transactionClient);
      await transactionClient.query('COMMIT');
      return result;
    } catch (error) {
      await transactionClient.query('ROLLBACK');
      throw error;
    } finally {
      transactionClient.release();
    }
  }

  /**
   * Archive a ruleset
   */
  async archiveRuleSet(id: string, userId: string): Promise<RuleSet> {
    const query = `
      UPDATE rule_sets 
      SET status = 'archived', 
          archived_at = now(),
          updated_by = $1,
          updated_at = now()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [userId, id]);
    
    if (result.rows.length === 0) {
      throw new Error('RuleSet not found');
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Calculate SHA-256 checksum of rules_json
   */
  private calculateChecksum(rulesJson: Record<string, any>): string {
    // Ensure deterministic JSON stringification (sorted keys)
    const canonicalJson = JSON.stringify(rulesJson, Object.keys(rulesJson).sort());
    return createHash('sha256').update(canonicalJson).digest('hex');
  }

  /**
   * Map database row to RuleSet object
   */
  private mapRow(row: any): RuleSet {
    return {
      id: row.id,
      kind: row.kind,
      service_type: row.service_type,
      version: row.version,
      status: row.status,
      rules_json: row.rules_json,
      checksum: row.checksum,
      description: row.description,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_by: row.updated_by,
      updated_at: row.updated_at,
      published_by: row.published_by,
      published_at: row.published_at,
      archived_at: row.archived_at
    };
  }
}
