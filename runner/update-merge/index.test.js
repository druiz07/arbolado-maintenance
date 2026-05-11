import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findReportBySignalHash, updateReportPrMerged } from './index.js';

async function makeTempRepo() {
  const root = await mkdtemp(join(tmpdir(), 'sem4-'));
  await mkdir(join(root, 'docs/auto-maintenance/session-reports/2026-05-12'), { recursive: true });
  return root;
}

const REPORT_A = {
  playbook_id: 'bump-devdep-cve', model_used: 'groq/llama-3.3-70b-versatile',
  diff_size: 4, tests_passed: true, pr_merged: null, retry_count: 0,
  policy_violations: [], classification_margin: 1.0,
  signal_hash: 'a'.repeat(64), timestamp: '2026-05-12T10:00:00Z',
  failure_stage: 'none',
};

test('findReportBySignalHash localiza el report por signal_hash', async () => {
  const root = await makeTempRepo();
  const path = join(root, 'docs/auto-maintenance/session-reports/2026-05-12/bump-devdep-cve-aaaaaaaaaaaa.json');
  await writeFile(path, JSON.stringify(REPORT_A));
  const found = await findReportBySignalHash(root, 'a'.repeat(64));
  assert.equal(found.path, path);
  assert.equal(found.report.playbook_id, 'bump-devdep-cve');
  await rm(root, { recursive: true });
});

test('findReportBySignalHash devuelve null si no hay match', async () => {
  const root = await makeTempRepo();
  const found = await findReportBySignalHash(root, 'b'.repeat(64));
  assert.equal(found, null);
  await rm(root, { recursive: true });
});

test('updateReportPrMerged escribe pr_merged y preserva el resto de campos', async () => {
  const root = await makeTempRepo();
  const path = join(root, 'docs/auto-maintenance/session-reports/2026-05-12/bump-devdep-cve-aaaaaaaaaaaa.json');
  await writeFile(path, JSON.stringify(REPORT_A));
  await updateReportPrMerged(path, true);
  const updated = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(updated.pr_merged, true);
  assert.equal(updated.signal_hash, 'a'.repeat(64));
  assert.equal(updated.failure_stage, 'none');
  await rm(root, { recursive: true });
});

test('updateReportPrMerged falla si el report ya tiene pr_merged !== null (idempotencia estricta)', async () => {
  const root = await makeTempRepo();
  const path = join(root, 'docs/auto-maintenance/session-reports/2026-05-12/bump-devdep-cve-aaaaaaaaaaaa.json');
  await writeFile(path, JSON.stringify({ ...REPORT_A, pr_merged: false }));
  await assert.rejects(
    () => updateReportPrMerged(path, true),
    /already set/,
  );
  await rm(root, { recursive: true });
});

test('updateReportPrMerged sólo acepta true|false (no null, no string)', async () => {
  const root = await makeTempRepo();
  const path = join(root, 'docs/auto-maintenance/session-reports/2026-05-12/bump-devdep-cve-aaaaaaaaaaaa.json');
  await writeFile(path, JSON.stringify(REPORT_A));
  await assert.rejects(() => updateReportPrMerged(path, 'true'), /boolean/);
  await assert.rejects(() => updateReportPrMerged(path, null), /boolean/);
  await rm(root, { recursive: true });
});
