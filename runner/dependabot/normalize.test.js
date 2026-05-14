import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDependabotAlert, normalizeSnapshot } from './normalize.js';

function fixtureDevDirect() {
  return {
    number: 1,
    state: 'open',
    dependency: {
      package: { ecosystem: 'npm', name: 'eslint' },
      manifest_path: 'package.json',
      scope: 'development',
      relationship: 'direct',
    },
    security_advisory: {
      ghsa_id: 'GHSA-xxxx-xxxx-xxxx',
      severity: 'high',
      summary: 'eslint vuln',
    },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'eslint' },
      vulnerable_version_range: '< 8.56.0',
      first_patched_version: { identifier: '8.56.0' },
      severity: 'high',
    },
    created_at: '2026-05-04T00:00:00Z',
    updated_at: '2026-05-04T00:00:00Z',
    fixed_at: null,
    dismissed_at: null,
  };
}

function fixtureTransitiveLockfile() {
  const base = fixtureDevDirect();
  return {
    ...base,
    dependency: {
      package: { ecosystem: 'npm', name: 'lodash' },
      manifest_path: 'electron-app/package-lock.json',
      scope: null,
      relationship: 'transitive',
    },
    security_advisory: { ghsa_id: 'GHSA-yyyy', severity: 'medium', summary: 'lodash' },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'lodash' },
      vulnerable_version_range: '<4.17.21',
      first_patched_version: { identifier: '4.17.21' },
      severity: 'medium',
    },
  };
}

function fixtureNoPatch() {
  const base = fixtureDevDirect();
  return {
    ...base,
    dependency: {
      package: { ecosystem: 'npm', name: 'minimist' },
      manifest_path: 'electron-app/package.json',
      scope: 'development',
      relationship: 'direct',
    },
    security_advisory: { ghsa_id: 'GHSA-zzzz', severity: 'high', summary: 'no patch' },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'minimist' },
      vulnerable_version_range: '< 1.2.8',
      first_patched_version: null,
      severity: 'high',
    },
  };
}

function fixtureFixed() {
  return { ...fixtureDevDirect(), state: 'fixed', fixed_at: '2026-05-10T00:00:00Z' };
}

function fixtureRuntimeDirect() {
  const base = fixtureDevDirect();
  return {
    ...base,
    dependency: {
      package: { ecosystem: 'npm', name: 'axios' },
      manifest_path: 'electron-app/package.json',
      scope: 'runtime',
      relationship: 'direct',
    },
    security_advisory: { ghsa_id: 'GHSA-axios', severity: 'high', summary: 'axios' },
    security_vulnerability: {
      package: { ecosystem: 'npm', name: 'axios' },
      vulnerable_version_range: '<1.8.2',
      first_patched_version: { identifier: '1.8.2' },
      severity: 'high',
    },
  };
}

test('normalizeDependabotAlert: dev directa emite signal v1 con campos correctos', () => {
  const s = normalizeDependabotAlert(fixtureDevDirect());
  assert.equal(s.source, 'dependabot-cli');
  assert.equal(s.dependency, 'eslint');
  assert.equal(s.dependency_type, 'dev');
  assert.equal(s.is_transitive, false);
  assert.equal(s.severity, 'high');
  assert.equal(s.patched_versions, '>=8.56.0');
  assert.equal(s.path, 'package.json');
  assert.equal(s.advisory_id, 'GHSA-xxxx-xxxx-xxxx');
  assert.equal(s.signal_version, 1);
  assert.equal(s.context.fix_available, true);
  assert.equal(s.context.direct_dependency, true);
});

test('normalizeDependabotAlert: transitiva (manifest = package-lock.json) is_transitive=true', () => {
  const s = normalizeDependabotAlert(fixtureTransitiveLockfile());
  assert.equal(s.is_transitive, true);
  assert.equal(s.context.direct_dependency, false);
});

test('normalizeDependabotAlert: severity "medium" se traduce a "moderate"', () => {
  const s = normalizeDependabotAlert(fixtureTransitiveLockfile());
  assert.equal(s.severity, 'moderate');
});

test('normalizeDependabotAlert: scope=null + lockfile → dependency_type=dev', () => {
  const s = normalizeDependabotAlert(fixtureTransitiveLockfile());
  assert.equal(s.dependency_type, 'dev');
});

test('normalizeDependabotAlert: scope=runtime explícito → dependency_type=runtime', () => {
  const s = normalizeDependabotAlert(fixtureRuntimeDirect());
  assert.equal(s.dependency_type, 'runtime');
  assert.equal(s.is_transitive, false);
});

test('normalizeDependabotAlert: sin patched_version → patched_versions=null + fix_available=false', () => {
  const s = normalizeDependabotAlert(fixtureNoPatch());
  assert.equal(s.patched_versions, null);
  assert.equal(s.context.fix_available, false);
});

test('normalizeDependabotAlert: alerta fixed se normaliza igual (state no afecta el signal)', () => {
  const s = normalizeDependabotAlert(fixtureFixed());
  assert.equal(s.dependency, 'eslint');
  assert.equal(s.patched_versions, '>=8.56.0');
});

test('normalizeDependabotAlert: preserva el state original en _meta para análisis batch', () => {
  const open = normalizeDependabotAlert(fixtureDevDirect());
  const fixed = normalizeDependabotAlert(fixtureFixed());
  assert.equal(open._meta.alert_state, 'open');
  assert.equal(fixed._meta.alert_state, 'fixed');
  assert.equal(open._meta.alert_number, 1);
});

test('normalizeSnapshot: convierte array de alerts en array de signals', () => {
  const alerts = [fixtureDevDirect(), fixtureTransitiveLockfile(), fixtureFixed()];
  const { signals, skipped } = normalizeSnapshot(alerts);
  assert.equal(signals.length, 3);
  assert.equal(skipped.length, 0);
  assert.equal(signals[0].dependency, 'eslint');
  assert.equal(signals[1].dependency, 'lodash');
});

test('normalizeSnapshot: salta alertas sin first_patched_version, las reporta en skipped[]', () => {
  const alerts = [fixtureDevDirect(), fixtureNoPatch()];
  const { signals, skipped } = normalizeSnapshot(alerts, { skipUnpatchable: true });
  assert.equal(signals.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].advisory_id, 'GHSA-zzzz');
  assert.equal(skipped[0].reason, 'no_patched_version');
});

test('normalizeSnapshot: con skipUnpatchable=false incluye también las sin patch', () => {
  const alerts = [fixtureDevDirect(), fixtureNoPatch()];
  const { signals, skipped } = normalizeSnapshot(alerts, { skipUnpatchable: false });
  assert.equal(signals.length, 2);
  assert.equal(skipped.length, 0);
});

test('normalizeSnapshot: salta alertas sin estructura mínima esperada y las reporta en skipped[]', () => {
  const malformed = { number: 99, state: 'open' };
  const { signals, skipped } = normalizeSnapshot([fixtureDevDirect(), malformed]);
  assert.equal(signals.length, 1);
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].reason, 'malformed_alert');
  assert.equal(skipped[0].alert_number, 99);
});
