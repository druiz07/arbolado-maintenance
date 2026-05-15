// TDD del bridge resultado-override → ficheros que espera build-and-write-report.
//
// El orquestador runOverridePlaybook devuelve { status, stage, ... }. El cron
// reusa el build-and-write-report.mjs del flujo Aider SIN modificarlo: para eso
// este mapper traduce el resultado determinista a los mismos intermedios
// (invoker.json, policy.json) y outcomes (ci-tests, ci-build) que el builder
// deriva. El vocabulario failure_stage es classifier|policy|aider|ci|merge|none;
// override no tiene Aider, así que los fallos deterministas se atribuyen al
// stage existente más cercano y honesto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOverrideResult } from './report-bridge.js';

test('applied → none: policy ok, ci ok, PR elegible, invoker sin Aider', () => {
  const m = mapOverrideResult({ status: 'applied', operation: 'add', targetVersion: '2.0.1', diffLines: 3 });
  assert.equal(m.invoker.errorClass, null);
  assert.equal(m.invoker.modelUsed, 'none');
  assert.equal(m.policy.valid, true);
  assert.deepEqual(m.policy.violations, []);
  assert.equal(m.policy.ops.rawDiffLines, 3);
  assert.equal(m.ciTests, true);
  assert.equal(m.ciBuild, true);
  assert.equal(m.issue, null);
  assert.equal(m.prEligible, true);
});

test('noop (already_pinned) → none, PR elegible (audit trail con --allow-empty)', () => {
  const m = mapOverrideResult({ status: 'noop', stage: 'already_pinned', targetVersion: '2.0.1' });
  assert.equal(m.policy.valid, true);
  assert.equal(m.ciTests, true);
  assert.equal(m.ciBuild, true);
  assert.equal(m.prEligible, true);
});

test('blocked:diff_size → policy inválida con violation diff_size_exceeded, sin PR', () => {
  const m = mapOverrideResult({ status: 'blocked', stage: 'diff_size', reason: 'block_diff_size_exceeded', diffLines: 99 });
  assert.equal(m.policy.valid, false);
  assert.equal(m.policy.violations.length, 1);
  assert.equal(m.policy.violations[0].type, 'diff_size_exceeded');
  assert.equal(m.policy.violations[0].observed, 99);
  assert.equal(m.policy.ops.rawDiffLines, 99);
  assert.equal(m.prEligible, false);
  assert.equal(m.issue, null);
});

test('skipped:not_transitive → policy inválida (override_skipped), sin PR, sin issue', () => {
  const m = mapOverrideResult({ status: 'skipped', stage: 'not_transitive', reason: 'wrong_playbook_use_bump_devdep_cve' });
  assert.equal(m.policy.valid, false);
  assert.equal(m.policy.violations[0].type, 'override_skipped');
  assert.equal(m.policy.violations[0].stage, 'not_transitive');
  assert.equal(m.prEligible, false);
  assert.equal(m.issue, null);
});

test('rolled_back:npm_install → ci fail + issue parent_strict_range', () => {
  const m = mapOverrideResult({ status: 'rolled_back', stage: 'npm_install', operation: 'add', targetVersion: '2.0.1', detail: 'ERESOLVE' });
  assert.equal(m.ciTests, false);
  assert.equal(m.ciBuild, false);
  assert.equal(m.prEligible, false);
  assert.ok(m.issue, 'debe abrir issue por edge_case parent_strict_range');
  assert.match(m.issue.title, /override/i);
  assert.match(m.issue.body, /npm install/i);
});

test('rolled_back:audit → ci fail (audit aún reporta la advisory), sin issue', () => {
  const m = mapOverrideResult({ status: 'rolled_back', stage: 'audit', targetVersion: '2.0.1', auditReason: 'still_vulnerable' });
  assert.equal(m.ciTests, false);
  assert.equal(m.ciBuild, false);
  assert.equal(m.issue, null);
  assert.equal(m.prEligible, false);
});

test('rolled_back:tests → ci-tests fail, ci-build fail', () => {
  const m = mapOverrideResult({ status: 'rolled_back', stage: 'tests', targetVersion: '2.0.1' });
  assert.equal(m.ciTests, false);
  assert.equal(m.ciBuild, false);
  assert.equal(m.prEligible, false);
});

test('rolled_back:build → ci-tests pasó, ci-build falló (fallo aislado en build)', () => {
  const m = mapOverrideResult({ status: 'rolled_back', stage: 'build', targetVersion: '2.0.1' });
  assert.equal(m.ciTests, true);
  assert.equal(m.ciBuild, false);
  assert.equal(m.prEligible, false);
});

test('estado desconocido → tratado como fallo seguro (sin PR, policy inválida)', () => {
  const m = mapOverrideResult({ status: 'wat', stage: 'mystery' });
  assert.equal(m.prEligible, false);
  assert.equal(m.policy.valid, false);
});

test('invoker siempre sin errorClass (override no usa Aider) — nunca failure_stage=aider', () => {
  for (const status of ['applied', 'noop', 'blocked', 'skipped', 'rolled_back', 'wat']) {
    const m = mapOverrideResult({ status, stage: 'x' });
    assert.equal(m.invoker.errorClass, null, `status=${status} no debe atribuir a Aider`);
  }
});
