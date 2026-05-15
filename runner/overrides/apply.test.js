import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOverride } from './apply.js';

test('applyOverride: sin overrides previos → add_override', () => {
  const pkg = { name: 'app', dependencies: { react: '^18' } };
  const r = applyOverride({ packageJson: pkg, dependency: 'nth-check', version: '2.1.1' });
  assert.equal(r.operation, 'add_override');
  assert.deepEqual(r.next.overrides, { 'nth-check': '2.1.1' });
});

test('applyOverride: override existente con versión distinta → bump_override', () => {
  const pkg = { overrides: { 'nth-check': '2.0.0', tough: '5.0.0' } };
  const r = applyOverride({ packageJson: pkg, dependency: 'nth-check', version: '2.1.1' });
  assert.equal(r.operation, 'bump_override');
  assert.equal(r.next.overrides['nth-check'], '2.1.1');
  assert.equal(r.next.overrides.tough, '5.0.0', 'no toca otros overrides');
});

test('applyOverride: override ya en la versión objetivo → noop', () => {
  const pkg = { overrides: { 'nth-check': '2.1.1' } };
  const r = applyOverride({ packageJson: pkg, dependency: 'nth-check', version: '2.1.1' });
  assert.equal(r.operation, 'noop');
  assert.equal(r.next.overrides['nth-check'], '2.1.1');
});

test('applyOverride: no muta el packageJson de entrada', () => {
  const pkg = { name: 'app' };
  applyOverride({ packageJson: pkg, dependency: 'x', version: '1.0.0' });
  assert.equal(pkg.overrides, undefined, 'el objeto original queda intacto');
});

test('applyOverride: prev refleja el estado anterior exacto', () => {
  const pkg = { overrides: { a: '1.0.0' } };
  const r = applyOverride({ packageJson: pkg, dependency: 'a', version: '2.0.0' });
  assert.deepEqual(r.prev.overrides, { a: '1.0.0' });
  assert.deepEqual(r.next.overrides, { a: '2.0.0' });
});

test('applyOverride: overrides previo no-objeto se reemplaza por objeto limpio', () => {
  const pkg = { overrides: 'weird' };
  const r = applyOverride({ packageJson: pkg, dependency: 'a', version: '1.0.0' });
  assert.deepEqual(r.next.overrides, { a: '1.0.0' });
});

test('applyOverride: validación de argumentos', () => {
  assert.throws(() => applyOverride({ packageJson: null, dependency: 'a', version: '1' }), /plain object/);
  assert.throws(() => applyOverride({ packageJson: [], dependency: 'a', version: '1' }), /plain object/);
  assert.throws(() => applyOverride({ packageJson: {}, dependency: '', version: '1' }), /dependency must be/);
  assert.throws(() => applyOverride({ packageJson: {}, dependency: 'a', version: '' }), /version must be/);
});
