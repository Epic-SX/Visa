# Ticket 11 & 12 Implementation Guide

This document outlines how to modify the project to meet the requirements of:

- **Ticket 11**: 専門家レビューフロー (Expert Review Flow)
- **Ticket 12**: 監査ログ実装 (Audit Log Implementation)

---

## Current State Summary

### Ticket 11 (Expert Review)
| Requirement | Status | Notes |
|-------------|--------|-------|
| AI-generated original saved | Partial | `generation_results` has `source_type=ai_generated`; diagnosis does **not** persist to `generation_results` currently |
| Human modification diff saved | Schema ready | `modification_history` exists; no API writes to it |
| Comment functionality | Missing | No `comments` table or API |
| RBAC control | Partial | `denyAffiliate`, `resolveUserFromSession`, `entitlement-guard` exist; review-specific RBAC needed |
| Diff comparison possible | Missing | No API or UI for original vs modified diff |
| Overwrite禁止 (no overwrite) | Schema supports | `generation_results` uses versioning; must enforce append-only |

### Ticket 12 (Audit Log)
| Requirement | Status | Notes |
|-------------|--------|-------|
| `audit_logs` table | Exists | Schema in `001_initial_schema.sql` |
| Writing to audit_logs | Missing | **No code inserts into `audit_logs`** |
| operator_id / role / object_id / event_type | Partial | Schema has actor_id, actor_role, resource_id, action_type; needs enforcement |
| All required events | Missing | Must instrument each operation |

---

## Ticket 11: Expert Review Flow Implementation

### 1. Database Schema Changes

Add a migration (`006_expert_review.sql`):

```sql
-- Link AI original to modified version (preserve lineage)
ALTER TABLE generation_results 
  ADD COLUMN ai_original_id UUID REFERENCES generation_results(id);

-- Comments table for review context
CREATE TABLE review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_result_id UUID NOT NULL REFERENCES generation_results(id),
  author_id UUID NOT NULL REFERENCES users(id),
  author_role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_comments_generation ON review_comments(generation_result_id);
```

### 2. Persist AI-Generated Original

**Current flow**: `POST /api/diagnosis/run` returns generation in JSON only; nothing is written to `generation_results`.

**Change**: Add a `GenerationResultRepository` and call it from `DiagnosisController.run()`:

1. After Dify returns output, insert into `generation_results`:
   - `source_type = 'ai_generated'`
   - `content` = full GenerationOutput JSON
   - `generated_by` = null (AI)
   - `session_id`, `tier` from request

2. Return `generation_result_id` in the response so the frontend can reference it for review.

### 3. Expert Review API (New)

Create `src/backend/api/review/`:

**POST /api/review/submit** (Professional/OB only)

- Body: `{ sessionId, tier, aiOriginalId, modifiedContent, changeReason?, comment? }`
- RBAC: `Professional` or `ImmigrationOB` (and possibly `Admin`) only
- Logic:
  1. Mark previous `is_latest=false` for (session_id, tier)
  2. Insert new `generation_results` row with `source_type='professional_modified'` or `ob_modified`
  3. Set `ai_original_id` to the AI row
  4. Compute diff per field (headline, todoItems, explanationText, obCommentary) and insert into `modification_history`
  5. If `comment`, insert into `review_comments`
- **Overwrite prohibition**: Never UPDATE `generation_results.content`; always INSERT a new row.

### 4. Diff Comparison API

**GET /api/review/diff/:generationResultId**

- Returns: `{ original, modified, history }` where:
  - `original` = AI-generated content (from `ai_original_id` or first row)
  - `modified` = current latest content
  - `history` = array from `modification_history` (field_name, before_value, after_value, change_reason, modifier_role, modified_at)

### 5. Comments API

- `GET /api/review/:generationResultId/comments` — list comments
- `POST /api/review/:generationResultId/comments` — add comment (RBAC: Professional/OB/Admin)

### 6. RBAC for Review

- Extend `middleware/rbac.ts`:
  - `requireProfessionalOrOB` — allow Professional, ImmigrationOB, Admin
  - Apply to `/api/review/*` routes

### 7. Key Files to Create/Modify

| File | Action |
|------|--------|
| `migrations/006_expert_review.sql` | Create |
| `src/backend/repositories/generation-result-repository.ts` | Create |
| `src/backend/api/review/routes.ts` | Create |
| `src/backend/api/review/controller.ts` | Create |
| `src/backend/middleware/rbac.ts` | Extend with `requireProfessionalOrOB` |
| `src/backend/api/diagnosis/controller.ts` | Call repo to persist AI output |
| `src/backend/server.ts` | Mount `/api/review` routes |

---

## Ticket 12: Audit Log Implementation

### 1. Audit Service

Create `src/backend/services/audit-service.ts`:

```typescript
// Ensure: operator_id (actor_id), role (actor_role), object_id (resource_id), event_type (action_type) are REQUIRED
export async function logAudit(params: {
  operatorId: string | null;  // null for system/webhook
  role: string;
  objectId: string | null;
  eventType: string;
  resourceType: string;
  payload?: Record<string, unknown>;
  requestMethod?: string;
  requestPath?: string;
  responseStatus?: number;
  ipAddress?: string;
}): Promise<void>
```

Insert into `audit_logs` with mapping:

- `actor_id` ← operatorId  
- `actor_role` ← role  
- `resource_id` ← objectId  
- `action_type` ← eventType  
- `resource_type` ← resourceType  
- `request_body` or JSONB column for payload  

### 2. Required Audit Events (Ticket 12 Checklist)

| Event | event_type | resource_type | Where to Instrument |
|-------|------------|---------------|---------------------|
| Eligibility output | `eligibility_output` | `diagnosis` | `DiagnosisController.run()` after success |
| Better/Best result display | `better_result_view` / `best_result_view` | `diagnosis` | When result is fetched (or in run if tier is better/best) |
| PDF generate/download | `pdf_generate` / `pdf_download` | `diagnosis` | `DiagnosisController.pdf()` |
| Matching details view | `matching_view` | `matching` | Matching API (if exists; else N/A for now) |
| Matching contact creation | `matching_contact_create` | `matching` | Same |
| BPO dataset view | `bpo_dataset_view` | `bpo_dataset` | BPO API (if exists; else N/A) |
| BPO dataset download | `bpo_dataset_download` | `bpo_dataset` | Same |
| BPO link-case | `bpo_link_case` | `bpo_dataset` | Same |
| Content submit | `content_submit` | `content` | Content API (if exists) |
| Content publish | `content_publish` | `content` | Same |
| Content reject | `content_reject` | `content` | Same |
| Content archive | `content_archive` | `content` | Same |
| Stripe webhook received | `stripe_webhook_received` | `webhook` | `StripeWebhookHandler.handleWebhook()` |

### 3. Instrumentation Points

**Already Implemented (instrument these):**

1. **DiagnosisController.run()** — After successful diagnosis:
   - event: `eligibility_output` or `better_result_display` / `best_result_display` (based on tier)
   - object_id: session_id
   - operator_id, role from `req.user`

2. **DiagnosisController.pdf()** — After PDF buffer generated:
   - event: `pdf_generate` and/or `pdf_download`
   - object_id: session_id

3. **StripeWebhookHandler.handleWebhook()** — At start (after signature verification):
   - event: `stripe_webhook_received`
   - object_id: event.id
   - operator_id: null, role: `system`

**Not Yet Implemented (future):**

- Matching, BPO dataset, Content submit/publish/reject/archive — add audit when those features exist.

### 4. Schema Alignment

The current `audit_logs` schema already has:

- `actor_id` (→ operator_id)
- `actor_role` (→ role)
- `resource_id` (→ object_id)
- `action_type` (→ event_type)
- `resource_type`

Add a migration if you need `payload` or `event_type` as a distinct column; otherwise `request_body` can store extra payload.

Optional migration for `event_type` as alias and NOT NULL:

```sql
-- Ensure critical fields are NOT NULL for compliance
ALTER TABLE audit_logs 
  ALTER COLUMN action_type SET NOT NULL,
  ALTER COLUMN resource_type SET NOT NULL;
-- actor_id can be NULL for system events (e.g. webhook)
```

### 5. Key Files to Create/Modify

| File | Action |
|------|--------|
| `src/backend/services/audit-service.ts` | Create |
| `src/backend/api/diagnosis/controller.ts` | Add audit calls for run, pdf |
| `src/backend/payment/webhook-handler.ts` | Add audit call for webhook received |
| `migrations/007_audit_log_constraints.sql` | Optional: NOT NULL constraints |

---

## Execution Order

1. **Ticket 12 first** — Audit logging is foundational and can be added to existing flows without new features.
2. **Ticket 11 second** — Expert review builds on persisted generation results and benefits from audit of review actions.

---

## Testing

### Ticket 11
- Save AI original on diagnosis run; verify `generation_results` row exists.
- Submit expert modification; verify new row + `modification_history` entries.
- GET diff; verify original vs modified comparison.
- Verify no UPDATE of `generation_results.content` (only INSERT).

### Ticket 12
- Run diagnosis; verify `audit_logs` row with `eligibility_output` or `better/best_result_display`.
- Generate PDF; verify `pdf_generate` log.
- Send Stripe webhook; verify `stripe_webhook_received` log.
- Confirm all logs have `operator_id` (or null for system), `role`, `object_id`, `event_type`.
