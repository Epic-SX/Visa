-- Migration 002: Rule Sets and Diagnosis Runs
-- CR-T02-01: rule_sets table for DB-based rule management
-- CR-T02-02: diagnosis_runs table for audit trail

-- =====================================================
-- CR-T02-01: rule_sets table
-- =====================================================
CREATE TABLE rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule identification
  kind VARCHAR(50) NOT NULL,  -- 'judgment' or 'scoring'
  service_type VARCHAR(20) NOT NULL,  -- 'service1', 'service2', etc.
  version VARCHAR(50) NOT NULL,  -- Semantic version: '1.0.0', '1.1.0', etc.
  
  -- Lifecycle status
  status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft', 'pending_review', 'published', 'archived'
  
  -- Rule content
  rules_json JSONB NOT NULL,  -- The actual rules configuration
  
  -- Integrity
  checksum VARCHAR(64) NOT NULL,  -- SHA-256 hash of rules_json for integrity verification
  
  -- Metadata
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT rule_sets_kind_check 
    CHECK (kind IN ('judgment', 'scoring')),
  CONSTRAINT rule_sets_service_type_check 
    CHECK (service_type IN ('service1', 'service2', 'service3', 'service4', 'service5')),
  CONSTRAINT rule_sets_status_check 
    CHECK (status IN ('draft', 'pending_review', 'published', 'archived')),
  CONSTRAINT rule_sets_version_format_check
    CHECK (version ~ '^\d+\.\d+\.\d+$')  -- Semantic versioning
);

-- Indexes for common queries
CREATE INDEX idx_rule_sets_kind_service_type ON rule_sets(kind, service_type);
CREATE INDEX idx_rule_sets_status ON rule_sets(status);
CREATE INDEX idx_rule_sets_created_at ON rule_sets(created_at DESC);

-- CRITICAL: Only ONE published rule set per (kind, service_type) combination
CREATE UNIQUE INDEX idx_rule_sets_published_unique 
  ON rule_sets(kind, service_type) 
  WHERE status = 'published';

-- Unique constraint on (kind, service_type, version) to prevent duplicate versions
CREATE UNIQUE INDEX idx_rule_sets_version_unique 
  ON rule_sets(kind, service_type, version);

-- =====================================================
-- CR-T02-02: diagnosis_runs table for audit trail
-- =====================================================
CREATE TABLE diagnosis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session reference
  session_id UUID NOT NULL REFERENCES diagnostic_sessions(id),
  
  -- User context
  user_id UUID REFERENCES users(id),
  
  -- Input
  answers JSONB NOT NULL,
  locale VARCHAR(10) NOT NULL,
  service_type VARCHAR(20),
  
  -- Rule sets used (for reproducibility)
  judgment_ruleset_id UUID REFERENCES rule_sets(id),
  judgment_checksum VARCHAR(64) NOT NULL,  -- Checksum at time of execution
  scoring_ruleset_id UUID REFERENCES rule_sets(id),
  scoring_checksum VARCHAR(64) NOT NULL,   -- Checksum at time of execution
  
  -- Outputs (for audit trail)
  judgment_output JSONB NOT NULL,
  scoring_output JSONB NOT NULL,
  generation_output JSONB,
  
  -- Execution metadata
  execution_time_ms INTEGER,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'completed',  -- 'completed', 'failed', 'timeout'
  error_message TEXT,
  
  CONSTRAINT diagnosis_runs_status_check 
    CHECK (status IN ('completed', 'failed', 'timeout'))
);

-- Indexes for queries
CREATE INDEX idx_diagnosis_runs_session_id ON diagnosis_runs(session_id);
CREATE INDEX idx_diagnosis_runs_user_id ON diagnosis_runs(user_id);
CREATE INDEX idx_diagnosis_runs_executed_at ON diagnosis_runs(executed_at DESC);
CREATE INDEX idx_diagnosis_runs_judgment_ruleset ON diagnosis_runs(judgment_ruleset_id);
CREATE INDEX idx_diagnosis_runs_scoring_ruleset ON diagnosis_runs(scoring_ruleset_id);

-- Index for reproducibility queries (same input + same rules)
CREATE INDEX idx_diagnosis_runs_reproducibility 
  ON diagnosis_runs(judgment_checksum, scoring_checksum, answers);

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE rule_sets IS 'DB-based rule management system. Replaces file-based config/judgment-rules.json and config/scoring-rules.json';
COMMENT ON COLUMN rule_sets.kind IS 'Type of rules: judgment or scoring';
COMMENT ON COLUMN rule_sets.service_type IS 'Service type this ruleset applies to: service1-5';
COMMENT ON COLUMN rule_sets.checksum IS 'SHA-256 hash of rules_json for integrity verification and reproducibility';
COMMENT ON COLUMN rule_sets.status IS 'Lifecycle: draft -> pending_review -> published -> archived';
COMMENT ON INDEX idx_rule_sets_published_unique IS 'Ensures only ONE published ruleset per (kind, service_type)';

COMMENT ON TABLE diagnosis_runs IS 'Complete audit trail of diagnosis executions with ruleset references for reproducibility';
COMMENT ON COLUMN diagnosis_runs.judgment_checksum IS 'Checksum of rules used at execution time for exact reproducibility';
COMMENT ON COLUMN diagnosis_runs.scoring_checksum IS 'Checksum of rules used at execution time for exact reproducibility';
