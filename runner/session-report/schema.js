// validateReport — valida los 10 campos obligatorios del session report
// (más failure_stage del ajuste #8). Spec: docs/auto-maintenance/arranque-plan.md §5.

export const REPORT_FIELDS = Object.freeze([
  'playbook_id',
  'model_used',
  'diff_size',
  'tests_passed',
  'pr_merged',
  'retry_count',
  'policy_violations',
  'classification_margin',
  'signal_hash',
  'timestamp',
  'failure_stage',
]);

export const FAILURE_STAGES = Object.freeze([
  'classifier',
  'policy',
  'aider',
  'ci',
  'merge',
  'none',
]);

const HEX64 = /^[0-9a-f]{64}$/;
const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

export function validateReport(rep) {
  const errors = [];

  if (!rep || typeof rep !== 'object' || Array.isArray(rep)) {
    return { ok: false, errors: [{ path: '', message: 'report must be a plain object' }] };
  }

  for (const f of REPORT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(rep, f)) {
      errors.push({ path: f, message: 'required field missing' });
    }
  }

  for (const k of Object.keys(rep)) {
    if (!REPORT_FIELDS.includes(k)) {
      errors.push({ path: k, message: 'unexpected field: not in report contract' });
    }
  }

  if (typeof rep.playbook_id !== 'string' || rep.playbook_id.length === 0) {
    errors.push({ path: 'playbook_id', message: 'must be non-empty string' });
  }

  if (typeof rep.model_used !== 'string' || rep.model_used.length === 0) {
    errors.push({ path: 'model_used', message: 'must be non-empty string (use "none" if no LLM)' });
  }

  if (!Number.isInteger(rep.diff_size) || rep.diff_size < 0) {
    errors.push({ path: 'diff_size', message: 'must be non-negative integer' });
  }

  if (typeof rep.tests_passed !== 'boolean') {
    errors.push({ path: 'tests_passed', message: 'must be boolean' });
  }

  if (rep.pr_merged !== null && typeof rep.pr_merged !== 'boolean') {
    errors.push({ path: 'pr_merged', message: 'must be boolean or null' });
  }

  if (!Number.isInteger(rep.retry_count) || rep.retry_count < 0 || rep.retry_count > 5) {
    errors.push({ path: 'retry_count', message: 'must be integer in [0, 5]' });
  }

  if (!Array.isArray(rep.policy_violations)) {
    errors.push({ path: 'policy_violations', message: 'must be array (empty array if no violations)' });
  }

  if (rep.classification_margin !== null) {
    if (typeof rep.classification_margin !== 'number'
        || rep.classification_margin < 0
        || rep.classification_margin > 1) {
      errors.push({ path: 'classification_margin', message: 'must be number in [0, 1] or null' });
    }
  }

  if (typeof rep.signal_hash !== 'string' || !HEX64.test(rep.signal_hash)) {
    errors.push({ path: 'signal_hash', message: 'must be 64-char lowercase hex (sha256)' });
  }

  if (typeof rep.timestamp !== 'string' || !ISO8601.test(rep.timestamp)) {
    errors.push({ path: 'timestamp', message: 'must be ISO 8601 with time + Z (e.g. 2026-05-10T12:00:00Z)' });
  }

  if (!FAILURE_STAGES.includes(rep.failure_stage)) {
    errors.push({
      path: 'failure_stage',
      message: `must be one of: ${FAILURE_STAGES.join(', ')}`,
    });
  }

  return { ok: errors.length === 0, errors };
}
