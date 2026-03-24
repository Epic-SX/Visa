/**
 * CR-T02-02: Diagnosis Run Repository
 * Saves complete audit trail of diagnosis executions
 */

import { Pool } from 'pg';
import { DiagnosisRun } from '@shared/types/rule-sets';

export interface CreateDiagnosisRunRequest {
  session_id: string;
  user_id?: string;
  answers: Record<string, any>;
  locale: string;
  service_type?: string;
  judgment_ruleset_id?: string;
  judgment_checksum: string;
  scoring_ruleset_id?: string;
  scoring_checksum: string;
  judgment_output: Record<string, any>;
  scoring_output: Record<string, any>;
  generation_output?: Record<string, any>;
  execution_time_ms?: number;
  status: 'completed' | 'failed' | 'timeout';
  error_message?: string;
}

export class DiagnosisRunRepository {
  constructor(private pool: Pool) {}

  /**
   * CR-T02-02: Save diagnosis run for audit trail and reproducibility
   */
  async createDiagnosisRun(request: CreateDiagnosisRunRequest): Promise<DiagnosisRun> {
    const query = `
      INSERT INTO diagnosis_runs (
        session_id, user_id, answers, locale, service_type,
        judgment_ruleset_id, judgment_checksum,
        scoring_ruleset_id, scoring_checksum,
        judgment_output, scoring_output, generation_output,
        execution_time_ms, status, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      request.session_id,
      request.user_id,
      JSON.stringify(request.answers),
      request.locale,
      request.service_type,
      request.judgment_ruleset_id,
      request.judgment_checksum,
      request.scoring_ruleset_id,
      request.scoring_checksum,
      JSON.stringify(request.judgment_output),
      JSON.stringify(request.scoring_output),
      request.generation_output ? JSON.stringify(request.generation_output) : null,
      request.execution_time_ms,
      request.status,
      request.error_message
    ]);

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get diagnosis run by ID
   */
  async getDiagnosisRunById(id: string): Promise<DiagnosisRun | null> {
    const query = 'SELECT * FROM diagnosis_runs WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get diagnosis runs for a session
   */
  async getDiagnosisRunsBySession(sessionId: string): Promise<DiagnosisRun[]> {
    const query = `
      SELECT * FROM diagnosis_runs 
      WHERE session_id = $1 
      ORDER BY executed_at DESC
    `;
    const result = await this.pool.query(query, [sessionId]);

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * TEST-T05-01: Find runs with same input and rules for reproducibility testing
   */
  async findReproducibleRuns(
    judgmentChecksum: string,
    scoringChecksum: string,
    answersChecksum?: string
  ): Promise<DiagnosisRun[]> {
    const query = `
      SELECT * FROM diagnosis_runs
      WHERE judgment_checksum = $1 
        AND scoring_checksum = $2
        AND status = 'completed'
      ORDER BY executed_at DESC
      LIMIT 100
    `;

    const result = await this.pool.query(query, [judgmentChecksum, scoringChecksum]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Map database row to DiagnosisRun object
   */
  private mapRow(row: any): DiagnosisRun {
    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      answers: row.answers,
      locale: row.locale,
      service_type: row.service_type,
      judgment_ruleset_id: row.judgment_ruleset_id,
      judgment_checksum: row.judgment_checksum,
      scoring_ruleset_id: row.scoring_ruleset_id,
      scoring_checksum: row.scoring_checksum,
      judgment_output: row.judgment_output,
      scoring_output: row.scoring_output,
      generation_output: row.generation_output,
      execution_time_ms: row.execution_time_ms,
      executed_at: row.executed_at,
      status: row.status,
      error_message: row.error_message
    };
  }
}
