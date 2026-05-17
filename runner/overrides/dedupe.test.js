import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coalesceSignalsByDependency } from './dedupe.js';

const sig = (dependency, patched_versions, advisory_id) => ({
  source: 'dependabot-cli',
  dependency,
  patched_versions,
  advisory_id,
  is_transitive: true,
  path: 'electron-app/package-lock.json',
});

test('coalesce: varias señales misma dep → 1, versión segura máxima', () => {
  const out = coalesceSignalsByDependency([
    sig('nth-check', '>=2.0.1', 'GHSA-aaaa'),
    sig('nth-check', '>=2.0.2', 'GHSA-bbbb'),
    sig('nth-check', '>=1.9.0', 'GHSA-cccc'),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].dependency, 'nth-check');
  assert.equal(out[0].patched_versions, '>=2.0.2', 'gana la versión segura máxima');
  assert.deepEqual(
    out[0].coalesced_advisory_ids,
    ['GHSA-aaaa', 'GHSA-bbbb', 'GHSA-cccc'],
    'fusiona todos los advisory_ids del grupo (ordenados, únicos)',
  );
});

test('coalesce: deps distintas → no se mezclan, orden de primera aparición', () => {
  const out = coalesceSignalsByDependency([
    sig('svgo', '>=3.0.0', 'GHSA-x'),
    sig('nth-check', '>=2.0.1', 'GHSA-y'),
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((s) => s.dependency), ['svgo', 'nth-check']);
});

test('coalesce: señal única no gana campo coalesced (sin ruido)', () => {
  const out = coalesceSignalsByDependency([sig('nth-check', '>=2.0.1', 'GHSA-y')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].coalesced_advisory_ids, undefined);
});

test('coalesce: target no parseable → cada señal pasa individualmente', () => {
  const out = coalesceSignalsByDependency([
    sig('nth-check', 'no-version', 'GHSA-a'),
    sig('nth-check', 'tampoco', 'GHSA-b'),
  ]);
  assert.equal(out.length, 2, 'sin versión comparable no se coalesce');
});

test('coalesce: advisory_ids duplicados se deduplican en la fusión', () => {
  const out = coalesceSignalsByDependency([
    sig('nth-check', '>=2.0.1', 'GHSA-a'),
    sig('nth-check', '>=2.0.2', 'GHSA-a'),
  ]);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].coalesced_advisory_ids, ['GHSA-a']);
});

test('coalesce: entrada vacía / no-array → []', () => {
  assert.deepEqual(coalesceSignalsByDependency([]), []);
  assert.deepEqual(coalesceSignalsByDependency(null), []);
});
