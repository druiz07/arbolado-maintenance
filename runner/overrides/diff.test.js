import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countPackageJsonDiffLines, enforceMaxDiff } from './diff.js';

test('countPackageJsonDiffLines: añadir un override → pocas líneas', () => {
  const prev = { name: 'app', version: '1.0.0' };
  const next = { name: 'app', version: '1.0.0', overrides: { 'nth-check': '2.1.1' } };
  const n = countPackageJsonDiffLines(prev, next);
  assert.ok(n > 0 && n < 10, `esperado cambio pequeño, fue ${n}`);
});

test('countPackageJsonDiffLines: sin cambios → 0', () => {
  const pkg = { name: 'app', overrides: { a: '1.0.0' } };
  assert.equal(countPackageJsonDiffLines(pkg, structuredClone(pkg)), 0);
});

test('countPackageJsonDiffLines: bump de versión de override → cuenta el cambio', () => {
  const prev = { overrides: { a: '1.0.0' } };
  const next = { overrides: { a: '2.0.0' } };
  assert.ok(countPackageJsonDiffLines(prev, next) >= 2);
});

test('enforceMaxDiff: cambio pequeño bajo el límite → ok', () => {
  const prev = { name: 'app' };
  const next = { name: 'app', overrides: { x: '1.0.0' } };
  const r = enforceMaxDiff({ prev, next, max: 80 });
  assert.equal(r.ok, true);
  assert.ok(r.lines <= 80);
});

test('enforceMaxDiff: excede el límite → ok:false', () => {
  const prev = {};
  const big = {};
  for (let i = 0; i < 100; i++) big['k' + i] = 'v' + i;
  const r = enforceMaxDiff({ prev, next: big, max: 80 });
  assert.equal(r.ok, false);
  assert.ok(r.lines > 80);
});

test('enforceMaxDiff: max inválido → throws', () => {
  assert.throws(() => enforceMaxDiff({ prev: {}, next: {}, max: 0 }), /positive integer/);
  assert.throws(() => enforceMaxDiff({ prev: {}, next: {}, max: -1 }), /positive integer/);
});

test('countPackageJsonDiffLines: argumentos no-objeto → throws', () => {
  assert.throws(() => countPackageJsonDiffLines(null, {}), /must be objects/);
  assert.throws(() => countPackageJsonDiffLines({}, null), /must be objects/);
});
