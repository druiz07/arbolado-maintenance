import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dryRunSignal, dryRunBatch } from './dry-run-batch.js';

function makeSignal(over = {}) {
  return {
    source: 'dependabot-cli',
    dependency: 'eslint',
    current_version: '<8.56.0',
    vulnerable_versions: '< 8.56.0',
    patched_versions: '>=8.56.0',
    severity: 'high',
    is_transitive: false,
    dependency_type: 'dev',
    path: 'package.json',
    advisory_id: 'GHSA-aaa-bbb-ccc',
    detected_at: '2026-05-14T00:00:00Z',
    signal_version: 1,
    context: { package_manager: 'npm', lockfile_present: true, direct_dependency: true,
      parent_dependency: null, dependency_chain: ['eslint'], fix_available: true },
    _meta: { alert_number: 1, alert_state: 'open', alert_created_at: '2026-05-04T00:00:00Z', alert_fixed_at: null },
    ...over,
  };
}

const pkgWithEslint = { devDependencies: { eslint: '^7.0.0' }, dependencies: { react: '^18.0.0' } };
const pkgWithoutEslint = { devDependencies: { jest: '^28.0.0' }, dependencies: { react: '^18.0.0' } };

test('dryRunSignal: precondition pasa → failure_stage=would_invoke_aider, would_invoke=true', () => {
  const r = dryRunSignal({ signal: makeSignal(), packageJson: pkgWithEslint });
  assert.equal(r.failure_stage, 'would_invoke_aider');
  assert.equal(r.would_invoke_aider, true);
  assert.equal(r.precondition_reason, 'present');
  assert.equal(r.precondition_foundIn, 'devDependencies');
});

test('dryRunSignal: dep ausente → failure_stage=precondition, reason=not_in_package_json', () => {
  const r = dryRunSignal({ signal: makeSignal(), packageJson: pkgWithoutEslint });
  assert.equal(r.failure_stage, 'precondition');
  assert.equal(r.precondition_reason, 'not_in_package_json');
  assert.equal(r.would_invoke_aider, false);
});

test('dryRunSignal: dep en sección incorrecta → failure_stage=precondition, reason=wrong_section', () => {
  const sig = makeSignal({ dependency: 'react', dependency_type: 'dev' });
  const r = dryRunSignal({ signal: sig, packageJson: pkgWithEslint });
  assert.equal(r.failure_stage, 'precondition');
  assert.equal(r.precondition_reason, 'wrong_section');
  assert.equal(r.precondition_foundIn, 'dependencies');
});

test('dryRunSignal: incluye signal_hash determinista (12 chars hex)', () => {
  const a = dryRunSignal({ signal: makeSignal(), packageJson: pkgWithEslint });
  const b = dryRunSignal({ signal: makeSignal(), packageJson: pkgWithEslint });
  assert.equal(a.signal_hash, b.signal_hash);
  assert.match(a.signal_hash, /^[0-9a-f]{12}$/);
});

test('dryRunSignal: signal_hash distinto para advisory_id distinto', () => {
  const a = dryRunSignal({ signal: makeSignal(), packageJson: pkgWithEslint });
  const b = dryRunSignal({ signal: makeSignal({ advisory_id: 'GHSA-zzz-zzz-zzz' }), packageJson: pkgWithEslint });
  assert.notEqual(a.signal_hash, b.signal_hash);
});

test('dryRunSignal: preserva alert_state y alert_number en el resultado', () => {
  const r = dryRunSignal({
    signal: makeSignal({ _meta: { alert_number: 42, alert_state: 'fixed', alert_created_at: '2026-04-01T00:00:00Z', alert_fixed_at: '2026-05-10T00:00:00Z' } }),
    packageJson: pkgWithEslint,
  });
  assert.equal(r.alert_state, 'fixed');
  assert.equal(r.alert_number, 42);
});

test('dryRunSignal: dependency_type runtime busca en dependencies', () => {
  const sig = makeSignal({ dependency: 'react', dependency_type: 'runtime' });
  const r = dryRunSignal({ signal: sig, packageJson: pkgWithEslint });
  assert.equal(r.failure_stage, 'would_invoke_aider');
  assert.equal(r.precondition_foundIn, 'dependencies');
});

test('dryRunBatch: procesa array de signals y devuelve summary + results', () => {
  const signals = [
    makeSignal(),
    makeSignal({ dependency: 'jest', advisory_id: 'GHSA-jest' }),
    makeSignal({ dependency: 'react', dependency_type: 'dev', advisory_id: 'GHSA-react' }),
  ];
  const out = dryRunBatch({ signals, packageJson: pkgWithEslint });
  assert.equal(out.results.length, 3);
  assert.equal(out.summary.total, 3);
  assert.equal(out.summary.would_invoke_aider, 1);
  assert.equal(out.summary.by_failure_stage.would_invoke_aider, 1);
  assert.equal(out.summary.by_failure_stage.precondition, 2);
});

test('dryRunBatch: summary incluye desglose por alert_state', () => {
  const signals = [
    makeSignal({ _meta: { alert_number: 1, alert_state: 'open', alert_created_at: '', alert_fixed_at: null } }),
    makeSignal({ advisory_id: 'GHSA-2', _meta: { alert_number: 2, alert_state: 'fixed', alert_created_at: '', alert_fixed_at: '2026-05-01T00:00:00Z' } }),
    makeSignal({ advisory_id: 'GHSA-3', _meta: { alert_number: 3, alert_state: 'fixed', alert_created_at: '', alert_fixed_at: '2026-05-02T00:00:00Z' } }),
  ];
  const out = dryRunBatch({ signals, packageJson: pkgWithEslint });
  assert.equal(out.summary.by_alert_state.open, 1);
  assert.equal(out.summary.by_alert_state.fixed, 2);
});

test('dryRunBatch: signals duplicados por advisory_id se reportan como dedupe_count', () => {
  const signals = [makeSignal(), makeSignal(), makeSignal({ advisory_id: 'GHSA-2' })];
  const out = dryRunBatch({ signals, packageJson: pkgWithEslint });
  assert.equal(out.summary.total, 3);
  assert.equal(out.summary.unique_advisories, 2);
  assert.equal(out.summary.duplicate_advisories, 1);
});
