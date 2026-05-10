import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAndWriteReport, REPORT_FIELDS } from './index.js';

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
    package_manager: 'npm', lockfile_present: true, direct_dependency: true,
    parent_dependency: null, dependency_chain: ['eslint'], fix_available: true,
  },
};

const PLAYBOOK = {
  meta: { id: 'bump-devdep-cve', version: 1, description: 'x', critical: false },
  execution: { aider: { args: [], temperature: 0.1 } },
};

let TMP;

before(() => { TMP = mkdtempSync(join(tmpdir(), 'sr-e2e-')); });
after(() => { if (TMP) rmSync(TMP, { recursive: true, force: true }); });

describe('buildAndWriteReport — E2E happy path', () => {
  it('compone, valida y escribe un report válido', async () => {
    const out = await buildAndWriteReport({
      repoRoot: TMP,
      playbook: PLAYBOOK,
      signal: SIGNAL,
      invokerResult: {
        exitCode: 0, durationMs: 5800,
        diff: '<<<<<<< SEARCH\n...\n>>>>>>> REPLACE',
        stdout: 'Applied edit to package.json',
        stderr: '', filesEdited: ['package.json'],
        modelUsed: 'groq/llama-3.3-70b-versatile', errorClass: null,
      },
      policyResult: {
        valid: true, violations: [],
        ops: { dependencyChanges: [], scriptChanges: [], enginesChanged: false, rawDiffLines: 4 },
      },
      ciResult: { testsOk: true, buildOk: true },
      prResult: { merged: null },
      retryCount: 0,
      classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
      nowIso: '2026-05-10T15:30:00Z',
    });

    assert.equal(out.written, true);
    assert.equal(out.report.failure_stage, 'none');

    const parsed = JSON.parse(readFileSync(out.path, 'utf8'));
    const keys = Object.keys(parsed).sort();
    assert.deepEqual(keys, [...REPORT_FIELDS].sort());

    assert.match(out.path.replace(/\\/g, '/'), /\/2026-05-10\/bump-devdep-cve-[0-9a-f]{12}\.json$/);
  });
});

describe('buildAndWriteReport — idempotencia E2E', () => {
  it('segundo intento con mismo signal+playbook+fecha NO sobreescribe', async () => {
    const args = {
      repoRoot: TMP,
      playbook: PLAYBOOK,
      signal: { ...SIGNAL, advisory_id: 'GHSA-second-call' },
      invokerResult: null,
      policyResult: null,
      ciResult: null,
      prResult: { merged: null },
      retryCount: 0,
      classifierResult: { playbookId: 'bump-devdep-cve', margin: null },
      nowIso: '2026-05-10T15:30:00Z',
    };
    const a = await buildAndWriteReport(args);
    const b = await buildAndWriteReport({ ...args, retryCount: 3 });
    assert.equal(a.written, true);
    assert.equal(b.written, false);
    assert.equal(a.path, b.path);
  });
});
