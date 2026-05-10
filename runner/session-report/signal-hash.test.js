import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSignalHash } from './signal-hash.js';

const BASE_SIGNAL = {
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
  detected_at: '2026-05-04T12:00:00Z',
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

describe('generateSignalHash — determinismo', () => {
  it('produce el mismo hash para el mismo signal', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash(BASE_SIGNAL);
    assert.equal(a, b);
  });

  it('produce hash hexadecimal de 64 chars (sha256)', () => {
    const h = generateSignalHash(BASE_SIGNAL);
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe('generateSignalHash — campos estables', () => {
  it('NO depende de detected_at', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, detected_at: '2030-01-01T00:00:00Z' });
    assert.equal(a, b);
  });

  it('NO depende de signal_version', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, signal_version: 999 });
    assert.equal(a, b);
  });

  it('NO depende de context.*', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({
      ...BASE_SIGNAL,
      context: { ...BASE_SIGNAL.context, fix_available: false, dependency_chain: ['eslint', 'plugin'] },
    });
    assert.equal(a, b);
  });

  it('NO depende de severity (operacional, no estable)', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, severity: 'critical' });
    assert.equal(a, b);
  });
});

describe('generateSignalHash — sensibilidad a cambios', () => {
  it('cambia si dependency cambia', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, dependency: 'lodash' });
    assert.notEqual(a, b);
  });

  it('cambia si current_version cambia', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, current_version: '^8.55.0' });
    assert.notEqual(a, b);
  });

  it('cambia si patched_versions cambia', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, patched_versions: '>=8.57.0' });
    assert.notEqual(a, b);
  });

  it('cambia si advisory_id cambia', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, advisory_id: 'GHSA-yyyy' });
    assert.notEqual(a, b);
  });

  it('cambia si vulnerable_versions cambia', () => {
    const a = generateSignalHash(BASE_SIGNAL);
    const b = generateSignalHash({ ...BASE_SIGNAL, vulnerable_versions: '<8.55.5' });
    assert.notEqual(a, b);
  });
});

describe('generateSignalHash — robustez', () => {
  it('acepta patched_versions: null sin lanzar', () => {
    const h = generateSignalHash({ ...BASE_SIGNAL, patched_versions: null });
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('lanza si signal no es objeto', () => {
    assert.throws(() => generateSignalHash(null), /signal/);
    assert.throws(() => generateSignalHash('foo'), /signal/);
  });

  it('lanza si dependency falta', () => {
    const { dependency: _drop, ...rest } = BASE_SIGNAL;
    assert.throws(() => generateSignalHash(rest), /dependency/);
  });
});
