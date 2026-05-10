import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateReport, REPORT_FIELDS, FAILURE_STAGES } from './schema.js';

const VALID_REPORT = {
  playbook_id: 'bump-devdep-cve',
  model_used: 'groq/llama-3.3-70b-versatile',
  diff_size: 34,
  tests_passed: true,
  pr_merged: null,
  retry_count: 0,
  policy_violations: [],
  classification_margin: 0.22,
  signal_hash: 'a'.repeat(64),
  timestamp: '2026-05-10T12:00:00Z',
  failure_stage: 'none',
};

describe('REPORT_FIELDS — los 10 campos obligatorios', () => {
  it('lista exactamente los 11 campos del contrato (10 originales + failure_stage)', () => {
    const expected = [
      'playbook_id', 'model_used', 'diff_size', 'tests_passed', 'pr_merged',
      'retry_count', 'policy_violations', 'classification_margin', 'signal_hash',
      'timestamp', 'failure_stage',
    ].sort();
    assert.deepEqual([...REPORT_FIELDS].sort(), expected);
  });
});

describe('FAILURE_STAGES — valores aceptados', () => {
  it('expone exactamente {classifier, policy, aider, ci, merge, none}', () => {
    assert.deepEqual(
      [...FAILURE_STAGES].sort(),
      ['aider', 'ci', 'classifier', 'merge', 'none', 'policy'],
    );
  });
});

describe('validateReport — happy path', () => {
  it('acepta report válido', () => {
    const r = validateReport(VALID_REPORT);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
  });

  it('acepta classification_margin null (parcial 3 — sin classifier todavía)', () => {
    const r = validateReport({ ...VALID_REPORT, classification_margin: null });
    assert.equal(r.ok, true);
  });

  it('acepta pr_merged true/false además de null', () => {
    for (const v of [null, true, false]) {
      const r = validateReport({ ...VALID_REPORT, pr_merged: v });
      assert.equal(r.ok, true, `pr_merged=${v} should be valid`);
    }
  });

  it('acepta model_used "none" para playbooks sin LLM', () => {
    const r = validateReport({ ...VALID_REPORT, model_used: 'none', failure_stage: 'none' });
    assert.equal(r.ok, true);
  });
});

describe('validateReport — campos faltantes', () => {
  for (const f of [
    'playbook_id', 'model_used', 'diff_size', 'tests_passed', 'pr_merged',
    'retry_count', 'policy_violations', 'classification_margin', 'signal_hash',
    'timestamp', 'failure_stage',
  ]) {
    it(`rechaza si falta ${f}`, () => {
      const { [f]: _drop, ...rest } = VALID_REPORT;
      const r = validateReport(rest);
      assert.equal(r.ok, false);
      assert.ok(r.errors.some(e => e.path === f), `expected error on path=${f}, got: ${JSON.stringify(r.errors)}`);
    });
  }
});

describe('validateReport — tipos', () => {
  it('rechaza playbook_id no-string', () => {
    const r = validateReport({ ...VALID_REPORT, playbook_id: 123 });
    assert.equal(r.ok, false);
  });

  it('rechaza diff_size negativo', () => {
    const r = validateReport({ ...VALID_REPORT, diff_size: -5 });
    assert.equal(r.ok, false);
  });

  it('rechaza diff_size no-entero', () => {
    const r = validateReport({ ...VALID_REPORT, diff_size: 3.5 });
    assert.equal(r.ok, false);
  });

  it('rechaza tests_passed no-boolean', () => {
    const r = validateReport({ ...VALID_REPORT, tests_passed: 'yes' });
    assert.equal(r.ok, false);
  });

  it('rechaza retry_count fuera de [0, 5]', () => {
    assert.equal(validateReport({ ...VALID_REPORT, retry_count: -1 }).ok, false);
    assert.equal(validateReport({ ...VALID_REPORT, retry_count: 99 }).ok, false);
  });

  it('rechaza policy_violations no-array', () => {
    const r = validateReport({ ...VALID_REPORT, policy_violations: { foo: 'bar' } });
    assert.equal(r.ok, false);
  });

  it('rechaza classification_margin fuera de [0, 1] (cuando no es null)', () => {
    assert.equal(validateReport({ ...VALID_REPORT, classification_margin: 1.5 }).ok, false);
    assert.equal(validateReport({ ...VALID_REPORT, classification_margin: -0.1 }).ok, false);
  });

  it('rechaza signal_hash no-hex64', () => {
    assert.equal(validateReport({ ...VALID_REPORT, signal_hash: 'short' }).ok, false);
    assert.equal(validateReport({ ...VALID_REPORT, signal_hash: 'Z'.repeat(64) }).ok, false);
  });

  it('rechaza timestamp con formato no-ISO', () => {
    assert.equal(validateReport({ ...VALID_REPORT, timestamp: '10-05-2026' }).ok, false);
    assert.equal(validateReport({ ...VALID_REPORT, timestamp: '2026-05-10' }).ok, false);
  });

  it('rechaza failure_stage fuera de los 6 valores aceptados', () => {
    const r = validateReport({ ...VALID_REPORT, failure_stage: 'unknown' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.path === 'failure_stage'));
  });
});

describe('validateReport — ningún campo extra inesperado', () => {
  it('rechaza claves no documentadas', () => {
    const r = validateReport({ ...VALID_REPORT, extra_field: 'oops' });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some(e => e.message.includes('unexpected')));
  });
});
