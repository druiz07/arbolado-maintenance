import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeReport, computeReportPath } from './writer.js';

const VALID_REPORT = {
  playbook_id: 'bump-devdep-cve',
  model_used: 'groq/llama-3.3-70b-versatile',
  diff_size: 34,
  tests_passed: true,
  pr_merged: null,
  retry_count: 0,
  policy_violations: [],
  classification_margin: 0.22,
  signal_hash: 'a1b2c3d4e5f60000111122223333444455556666777788889999aaaabbbbcccc',
  timestamp: '2026-05-10T12:00:00Z',
  failure_stage: 'none',
};

let TMP;

before(() => {
  TMP = mkdtempSync(join(tmpdir(), 'sr-test-'));
});

after(() => {
  if (TMP) rmSync(TMP, { recursive: true, force: true });
});

describe('computeReportPath', () => {
  it('estructura: docs/auto-maintenance/session-reports/<date>/<id>-<short12>.json', () => {
    const p = computeReportPath('/repo', VALID_REPORT);
    assert.equal(
      p.replace(/\\/g, '/'),
      '/repo/docs/auto-maintenance/session-reports/2026-05-10/bump-devdep-cve-a1b2c3d4e5f6.json',
    );
  });

  it('extrae fecha de timestamp YYYY-MM-DD ignorando hora', () => {
    const p = computeReportPath('/repo', { ...VALID_REPORT, timestamp: '2026-12-31T23:59:59.123Z' });
    assert.ok(p.replace(/\\/g, '/').includes('/2026-12-31/'));
  });

  it('short-hash son los primeros 12 chars del signal_hash', () => {
    const p = computeReportPath('/repo', VALID_REPORT);
    const filename = p.split(/[\\/]/).pop();
    assert.match(filename, /-a1b2c3d4e5f6\.json$/);
  });
});

describe('writeReport — escritura', () => {
  it('crea el directorio anidado y escribe el JSON', async () => {
    const r = await writeReport(TMP, VALID_REPORT);
    assert.equal(r.written, true);
    assert.ok(existsSync(r.path));
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    assert.equal(parsed.playbook_id, 'bump-devdep-cve');
    assert.equal(parsed.failure_stage, 'none');
  });

  it('escribe JSON pretty-printed (legible por humanos en commits)', async () => {
    const r = await writeReport(TMP, { ...VALID_REPORT, signal_hash: 'b'.repeat(64) });
    const raw = readFileSync(r.path, 'utf8');
    assert.ok(raw.includes('\n'), 'expected pretty-printed JSON with newlines');
    assert.ok(raw.endsWith('\n'), 'expected trailing newline');
  });

  it('NO sobreescribe si el archivo ya existe (idempotencia)', async () => {
    const reportA = { ...VALID_REPORT, signal_hash: 'c'.repeat(64), retry_count: 0 };
    const r1 = await writeReport(TMP, reportA);
    assert.equal(r1.written, true);

    const reportB = { ...reportA, retry_count: 5 };
    const r2 = await writeReport(TMP, reportB);
    assert.equal(r2.written, false);
    assert.equal(r2.reason, 'already_exists');
    assert.equal(r2.path, r1.path);

    const onDisk = JSON.parse(readFileSync(r1.path, 'utf8'));
    assert.equal(onDisk.retry_count, 0);
  });
});

describe('writeReport — validación previa', () => {
  it('rechaza si el report es inválido (no escribe nada)', async () => {
    const bad = { ...VALID_REPORT, failure_stage: 'unknown' };
    await assert.rejects(
      () => writeReport(TMP, bad),
      err => err.message.includes('failure_stage'),
    );
  });

  it('rechaza si repoRoot no existe (falla rápido)', async () => {
    await assert.rejects(
      () => writeReport(join(TMP, 'no-such-dir'), VALID_REPORT),
      err => err.message.includes('repoRoot'),
    );
  });
});

describe('writeReport — escritura atómica', () => {
  it('si una escritura es interrumpida, no deja archivos parciales con el nombre final', async () => {
    const target = computeReportPath(TMP, { ...VALID_REPORT, signal_hash: 'd'.repeat(64) });
    mkdirSync(join(TMP, 'docs/auto-maintenance/session-reports/2026-05-10'), { recursive: true });
    writeFileSync(target + '.tmp', 'partial garbage', 'utf8');
    const r = await writeReport(TMP, { ...VALID_REPORT, signal_hash: 'd'.repeat(64) });
    assert.equal(r.written, true);
    const parsed = JSON.parse(readFileSync(r.path, 'utf8'));
    assert.equal(parsed.playbook_id, 'bump-devdep-cve');
  });
});
