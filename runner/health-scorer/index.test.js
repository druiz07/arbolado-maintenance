import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHealthMetrics } from './index.js';

function makeReport(overrides) {
  return {
    playbook_id: 'bump-devdep-cve',
    model_used: 'groq/llama-3.3-70b-versatile',
    diff_size: 4,
    tests_passed: true,
    pr_merged: null,
    retry_count: 0,
    policy_violations: [],
    classification_margin: 1.0,
    signal_hash: 'a'.repeat(64),
    timestamp: '2026-05-12T10:00:00Z',
    failure_stage: 'none',
    ...overrides,
  };
}

test('insufficient_data si menos de 5 reports con pr_merged !== null', () => {
  const reports = Array.from({ length: 4 }, (_, i) =>
    makeReport({ pr_merged: true, signal_hash: String(i).padStart(64, '0') }));
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  assert.equal(m.insufficient_data, true);
  assert.equal(m.pr_merge_rate, null);
});

test('pr_merge_rate global = merged / (merged+rejected)', () => {
  const reports = [
    ...Array.from({ length: 7 }, () => makeReport({ pr_merged: true })),
    ...Array.from({ length: 3 }, () => makeReport({ pr_merged: false })),
  ];
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  assert.equal(m.insufficient_data, false);
  assert.equal(m.pr_merge_rate, 0.7);
});

test('pr_merge_rate ignora reports con pr_merged=null (PR todavía abierto)', () => {
  const reports = [
    makeReport({ pr_merged: true }), makeReport({ pr_merged: true }),
    makeReport({ pr_merged: false }), makeReport({ pr_merged: null }),
    makeReport({ pr_merged: true }), makeReport({ pr_merged: null }),
    makeReport({ pr_merged: true }), makeReport({ pr_merged: false }),
    makeReport({ pr_merged: true }), makeReport({ pr_merged: false }),
  ];
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  // 5 merged + 3 rejected = 8 closed total; 5/8 = 0.625
  assert.equal(m.pr_merge_rate, 0.625);
});

test('failure_stage breakdown — fracción por stage', () => {
  const reports = [
    ...Array.from({ length: 6 }, () => makeReport({ failure_stage: 'none', pr_merged: true })),
    ...Array.from({ length: 2 }, () => makeReport({ failure_stage: 'classifier', pr_merged: false })),
    ...Array.from({ length: 2 }, () => makeReport({ failure_stage: 'policy', pr_merged: false })),
  ];
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  assert.equal(m.failure_stages.none, 0.6);
  assert.equal(m.failure_stages.classifier, 0.2);
  assert.equal(m.failure_stages.policy, 0.2);
});

test('ventana móvil 14 días excluye reports antiguos', () => {
  const reports = [
    ...Array.from({ length: 5 }, () => makeReport({
      pr_merged: true, timestamp: '2026-04-01T00:00:00Z',  // > 14d antes
    })),
    ...Array.from({ length: 5 }, () => makeReport({
      pr_merged: true, timestamp: '2026-05-20T00:00:00Z',
    })),
  ];
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  // Sólo 5 reports en ventana → insufficient
  assert.equal(m.insufficient_data, true);
  assert.equal(m.total_reports_in_window, 5);
});

test('per_playbook breakdown', () => {
  const reports = [
    ...Array.from({ length: 5 }, () => makeReport({ playbook_id: 'bump-devdep-cve', pr_merged: true })),
    ...Array.from({ length: 5 }, () => makeReport({ playbook_id: 'lint-prettier-autofix', pr_merged: false })),
  ];
  const m = computeHealthMetrics(reports, { nowIso: '2026-05-26T00:00:00Z' });
  assert.equal(m.per_playbook['bump-devdep-cve'].pr_merge_rate, 1.0);
  assert.equal(m.per_playbook['bump-devdep-cve'].samples, 5);
  assert.equal(m.per_playbook['lint-prettier-autofix'].pr_merge_rate, 0.0);
  assert.equal(m.per_playbook['lint-prettier-autofix'].samples, 5);
});

test('lista vacía → insufficient_data + total_reports_in_window=0', () => {
  const m = computeHealthMetrics([], { nowIso: '2026-05-26T00:00:00Z' });
  assert.equal(m.insufficient_data, true);
  assert.equal(m.total_reports_in_window, 0);
  assert.deepEqual(m.failure_stages, {});
  assert.deepEqual(m.per_playbook, {});
});
