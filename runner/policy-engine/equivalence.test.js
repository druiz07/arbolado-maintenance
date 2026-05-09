import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { astEquivalent, normalizeDeps, areDiffsCompatible } from './equivalence.js';

describe('astEquivalent', () => {
  it('treats deps with the same content but different key order as equivalent', () => {
    const a = { dependencies: { react: '^18', lodash: '^4' }, devDependencies: { eslint: '^8' } };
    const b = { dependencies: { lodash: '^4', react: '^18' }, devDependencies: { eslint: '^8' } };
    assert.equal(astEquivalent(a, b), true);
  });

  it('treats different versions as not equivalent', () => {
    const a = { dependencies: { react: '^18.0.0' } };
    const b = { dependencies: { react: '^18.1.0' } };
    assert.equal(astEquivalent(a, b), false);
  });

  it('ignores non-tracked sections (peerDependencies, optionalDependencies)', () => {
    const a = { dependencies: { react: '^18' }, peerDependencies: { foo: '^1' } };
    const b = { dependencies: { react: '^18' }, peerDependencies: { foo: '^2' } };
    assert.equal(astEquivalent(a, b), true);
  });

  it('handles missing sections (no dependencies / no devDependencies)', () => {
    const a = {};
    const b = { dependencies: {}, devDependencies: {} };
    assert.equal(astEquivalent(a, b), true);
  });
});

describe('normalizeDeps', () => {
  it('sorts deps alphabetically per section', () => {
    const norm = normalizeDeps({ dependencies: { z: '1', a: '1', m: '1' } });
    assert.deepEqual(Object.keys(norm.dependencies), ['a', 'm', 'z']);
  });
});

describe('areDiffsCompatible (double-run)', () => {
  it('returns true when after-states are AST-equivalent', () => {
    const a = { after: { dependencies: { react: '^18' } }, diffLines: 10 };
    const b = { after: { dependencies: { react: '^18' } }, diffLines: 30 };
    assert.equal(areDiffsCompatible(a, b), true);
  });

  it('returns true when same dep keys and similar diff sizes', () => {
    const a = { after: { dependencies: { react: '^18.0.0' } }, diffLines: 10 };
    const b = { after: { dependencies: { react: '^18.0.1' } }, diffLines: 12 };
    assert.equal(areDiffsCompatible(a, b), true);
  });

  it('returns false when same dep keys but diff sizes diverge a lot', () => {
    const a = { after: { dependencies: { react: '^18.0.0' } }, diffLines: 10 };
    const b = { after: { dependencies: { react: '^18.0.1' } }, diffLines: 100 };
    assert.equal(areDiffsCompatible(a, b), false);
  });

  it('returns false when dep keys differ', () => {
    const a = { after: { dependencies: { react: '^18' } }, diffLines: 10 };
    const b = { after: { dependencies: { vue: '^3' } }, diffLines: 10 };
    assert.equal(areDiffsCompatible(a, b), false);
  });
});
