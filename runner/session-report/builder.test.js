import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './builder.js';
import { validateReport } from './schema.js';

const SIGNAL = {
  source: 'worker',
  dependency: 'eslint',
  current_version: '^8.54.0',
  vulnerable_versions: '<8.56.0',
  patched_versions: '>=8.56.0',
  severity: 'high',
  is_transitive: false,
  dependency_type: 'dev',
  path: 'package.json',
  advisory_id: 'GHSA-xxxx-xxxx-xxxx',
  detected_at: '2026-05-10T12:00:00Z',
  signal_version: 1,
  context: {
    package_manager: 'npm',
    lockfile_present: true,
    direct_dependency: true,
    parent_dependency: null,
    dependency_chain: ['eslint'],
    fix_available: true,
  },
};

const PLAYBOOK = {
  meta: { id: 'bump-devdep-cve', version: 1, description: 'x', critical: false },
  execution: { aider: { args: [], temperature: 0.1 } },
};

const PLAYBOOK_NO_LLM = {
  meta: { id: 'rollback-on-build-failure', version: 1, description: 'x', critical: false },
  execution: { aider: null, git_revert: { mode: 'last_commit' } },
};

const FROZEN_NOW = '2026-05-10T15:30:00Z';

function callBuild(extras) {
  return buildReport({
    playbook: PLAYBOOK,
    signal: SIGNAL,
    invokerResult: null,
    policyResult: null,
    ciResult: null,
    prResult: { merged: null },
    retryCount: 0,
    classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
    nowIso: FROZEN_NOW,
    ...extras,
  });
}

describe('buildReport — happy path (failure_stage: none)', () => {
  it('compone report válido cuando todo va bien', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0,
        durationMs: 5800,
        diff: '<<<<<<< SEARCH\n...\n>>>>>>> REPLACE',
        stdout: 'Applied edit to package.json',
        stderr: '',
        filesEdited: ['package.json'],
        modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 } },
      ciResult: { testsOk: true, buildOk: true },
      retryCount: 0,
    });
    assert.equal(r.failure_stage, 'none');
    assert.equal(r.tests_passed, true);
    assert.equal(r.model_used, 'groq/llama-3.3-70b-versatile');
    assert.equal(r.policy_violations.length, 0);
    assert.equal(r.diff_size, 4);
    assert.equal(r.timestamp, FROZEN_NOW);
    assert.equal(r.playbook_id, 'bump-devdep-cve');
    assert.match(r.signal_hash, /^[0-9a-f]{64}$/);
    assert.equal(validateReport(r).ok, true);
  });
});

describe('buildReport — failure_stage: classifier', () => {
  it('cuando classifierResult es null O margin < threshold (caller decide)', () => {
    const r = callBuild({
      classifierResult: null,
    });
    assert.equal(r.failure_stage, 'classifier');
    assert.equal(r.model_used, 'none');
    assert.equal(r.diff_size, 0);
    assert.equal(r.tests_passed, false);
    assert.deepEqual(r.policy_violations, []);
    assert.equal(r.classification_margin, null);
    assert.equal(validateReport(r).ok, true);
  });
});

describe('buildReport — failure_stage: policy', () => {
  it('cuando policyResult.valid === false', () => {
    const r = callBuild({
      invokerResult: null,
      policyResult: {
        valid: false,
        violations: [
          { type: 'forbidden_operation', op: 'remove_dependency', dep: 'lodash' },
          { type: 'semver_violation', dep: 'eslint', reason: 'major_bump_forbidden' },
        ],
        ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 12 },
      },
      ciResult: null,
    });
    assert.equal(r.failure_stage, 'policy');
    assert.equal(r.policy_violations.length, 2);
    assert.equal(r.policy_violations[0].type, 'forbidden_operation');
    assert.equal(r.tests_passed, false);
    assert.equal(r.model_used, 'none');
    assert.equal(r.diff_size, 12);
    assert.equal(validateReport(r).ok, true);
  });
});

describe('buildReport — failure_stage: aider', () => {
  it('cuando invokerResult.errorClass !== null', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 1,
        durationMs: 9200,
        diff: '',
        stdout: 'error: API key invalid',
        stderr: '',
        filesEdited: [],
        modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: 'process',
      },
      policyResult: null,
      ciResult: null,
    });
    assert.equal(r.failure_stage, 'aider');
    assert.equal(r.model_used, 'groq/llama-3.3-70b-versatile');
    assert.equal(r.diff_size, 0);
    assert.equal(r.tests_passed, false);
    assert.equal(validateReport(r).ok, true);
  });

  it('errorClass timeout también marca aider', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: null, durationMs: 120_000, diff: '', stdout: '', stderr: '',
        filesEdited: [], modelUsed: 'groq/llama-3.3-70b-versatile', errorClass: 'timeout',
      },
      policyResult: null,
      ciResult: null,
    });
    assert.equal(r.failure_stage, 'aider');
  });

  it('errorClass no_diff también marca aider', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 4200, diff: '', stdout: 'no changes needed',
        stderr: '', filesEdited: [], modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: 'no_diff',
      },
      policyResult: null,
      ciResult: null,
    });
    assert.equal(r.failure_stage, 'aider');
  });
});

describe('buildReport — failure_stage: ci', () => {
  it('cuando aider+policy ok pero tests/build fallan', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 5400, diff: '<<<<<<< SEARCH\n...\n>>>>>>> REPLACE',
        stdout: 'Applied edit to package.json', stderr: '', filesEdited: ['package.json'],
        modelUsed: 'groq/llama-3.3-70b-versatile', errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 6 } },
      ciResult: { testsOk: false, buildOk: true },
      retryCount: 2,
    });
    assert.equal(r.failure_stage, 'ci');
    assert.equal(r.tests_passed, false);
    assert.equal(r.retry_count, 2);
    assert.equal(r.diff_size, 6);
    assert.equal(validateReport(r).ok, true);
  });

  it('build falla → failure_stage ci', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 5400, diff: '<<<<<<< SEARCH', stdout: '', stderr: '',
        filesEdited: ['package.json'], modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 } },
      ciResult: { testsOk: true, buildOk: false },
    });
    assert.equal(r.failure_stage, 'ci');
    assert.equal(r.tests_passed, false);
  });
});

describe('buildReport — failure_stage: merge', () => {
  it('cuando todo verde pero prResult.merged === false (PR cerrado sin merge)', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 5400, diff: '<<<<<<< SEARCH', stdout: '', stderr: '',
        filesEdited: ['package.json'], modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 } },
      ciResult: { testsOk: true, buildOk: true },
      prResult: { merged: false },
    });
    assert.equal(r.failure_stage, 'merge');
    assert.equal(r.pr_merged, false);
  });

  it('prResult.merged === null (sin resolver) NO marca merge — eso lo actualiza Sem 4', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 5400, diff: '<<<<<<< SEARCH', stdout: '', stderr: '',
        filesEdited: ['package.json'], modelUsed: 'groq/llama-3.3-70b-versatile',
        errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 } },
      ciResult: { testsOk: true, buildOk: true },
      prResult: { merged: null },
    });
    assert.equal(r.failure_stage, 'none');
    assert.equal(r.pr_merged, null);
  });
});

describe('buildReport — playbook sin LLM (execution.aider === null)', () => {
  it('model_used="none" y errorClass null no marca aider', () => {
    const r = callBuild({
      playbook: PLAYBOOK_NO_LLM,
      invokerResult: null,
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 0 } },
      ciResult: { testsOk: true, buildOk: true },
      classifierResult: { playbookId: 'rollback-on-build-failure', margin: null },
    });
    assert.equal(r.model_used, 'none');
    assert.equal(r.failure_stage, 'none');
    assert.equal(r.playbook_id, 'rollback-on-build-failure');
  });
});

describe('buildReport — orden de precedencia del failure_stage', () => {
  it('classifier gana sobre policy/aider/ci/merge cuando classifierResult=null', () => {
    const r = callBuild({
      classifierResult: null,
      invokerResult: {
        exitCode: 1, durationMs: 100, diff: '', stdout: '', stderr: '',
        filesEdited: [], modelUsed: 'x', errorClass: 'process',
      },
      policyResult: { valid: false, violations: [{ type: 'foo' }], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 0 } },
      ciResult: { testsOk: false, buildOk: false },
    });
    assert.equal(r.failure_stage, 'classifier');
  });

  it('policy gana sobre aider/ci/merge', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 1, durationMs: 100, diff: '', stdout: '', stderr: '',
        filesEdited: [], modelUsed: 'x', errorClass: 'process',
      },
      policyResult: { valid: false, violations: [{ type: 'foo' }], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 0 } },
      ciResult: { testsOk: false, buildOk: false },
    });
    assert.equal(r.failure_stage, 'policy');
  });

  it('aider gana sobre ci/merge', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 1, durationMs: 100, diff: '', stdout: '', stderr: '',
        filesEdited: [], modelUsed: 'x', errorClass: 'process',
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 0 } },
      ciResult: { testsOk: false, buildOk: false },
    });
    assert.equal(r.failure_stage, 'aider');
  });

  it('ci gana sobre merge', () => {
    const r = callBuild({
      invokerResult: {
        exitCode: 0, durationMs: 5400, diff: '<<<<<<< SEARCH', stdout: '', stderr: '',
        filesEdited: ['package.json'], modelUsed: 'x', errorClass: null,
      },
      policyResult: { valid: true, violations: [], ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 } },
      ciResult: { testsOk: false, buildOk: true },
      prResult: { merged: false },
    });
    assert.equal(r.failure_stage, 'ci');
  });
});

describe('buildReport with null playbook (load-playbook failure)', () => {
  it('playbook=null + classifierResult con hint → playbook_id del hint, failure_stage=classifier', () => {
    const r = callBuild({
      playbook: null,
      classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
    });
    assert.equal(r.playbook_id, 'bump-devdep-cve');
    assert.equal(r.failure_stage, 'classifier');
    assert.equal(r.model_used, 'none');
    assert.equal(r.diff_size, 0);
    assert.equal(r.tests_passed, false);
    assert.deepEqual(r.policy_violations, []);
    assert.equal(validateReport(r).ok, true);
  });

  it('playbook=null + classifierResult=null → playbook_id="unknown", failure_stage=classifier', () => {
    const r = callBuild({
      playbook: null,
      classifierResult: null,
    });
    assert.equal(r.playbook_id, 'unknown');
    assert.equal(r.failure_stage, 'classifier');
    assert.equal(r.model_used, 'none');
    assert.equal(r.diff_size, 0);
    assert.equal(r.tests_passed, false);
    assert.deepEqual(r.policy_violations, []);
    assert.equal(validateReport(r).ok, true);
  });

  it('playbook=null + policyResult.valid=false → failure_stage=classifier (regression: classifier order beats policy)', () => {
    const r = callBuild({
      playbook: null,
      classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
      policyResult: {
        valid: false,
        violations: [{ type: 'forbidden_operation' }],
        ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 99 },
      },
      invokerResult: {
        exitCode: 1, durationMs: 100, diff: '', stdout: '', stderr: '',
        filesEdited: [], modelUsed: 'x', errorClass: 'process',
      },
      ciResult: { testsOk: false, buildOk: false },
    });
    assert.equal(r.failure_stage, 'classifier');
    assert.equal(r.playbook_id, 'bump-devdep-cve');
    // policy_violations sigue surfaceado por trazabilidad aunque failure_stage sea classifier
    assert.equal(r.policy_violations.length, 1);
    assert.equal(validateReport(r).ok, true);
  });
});

describe('buildReport — defaults y bordes', () => {
  it('rechaza si playbook.meta.id falta', () => {
    assert.throws(
      () => callBuild({ playbook: { meta: {}, execution: { aider: null } } }),
      /playbook.meta.id/,
    );
  });

  it('rechaza si signal no tiene los 5 campos para el hash', () => {
    const { dependency: _drop, ...badSignal } = SIGNAL;
    assert.throws(
      () => callBuild({ signal: badSignal }),
      /signal/i,
    );
  });

  it('usa Date.now() si nowIso no se pasa', () => {
    const r = buildReport({
      playbook: PLAYBOOK,
      signal: SIGNAL,
      invokerResult: null,
      policyResult: null,
      ciResult: null,
      prResult: { merged: null },
      retryCount: 0,
      classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
    });
    assert.match(r.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);
  });
});
