import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePackageJsonDiff, PolicyEngineMalformedJsonError } from './diff.js';

const baseBefore = {
  name: 'pkg',
  version: '1.0.0',
  dependencies: { react: '^18.0.0' },
  devDependencies: { eslint: '^8.54.0' },
  scripts: { test: 'node --test' },
  engines: { node: '>=20' },
};

function as(obj) {
  return JSON.stringify(obj, null, 2);
}

describe('parsePackageJsonDiff', () => {
  it('detects added dep in dependencies', () => {
    const after = { ...baseBefore, dependencies: { ...baseBefore.dependencies, lodash: '^4.17.21' } };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.equal(ops.dependencyChanges.length, 1);
    assert.deepEqual(ops.dependencyChanges[0], {
      name: 'lodash',
      section: 'dependencies',
      oldRange: null,
      newRange: '^4.17.21',
      changeType: 'added',
    });
  });

  it('detects removed dep in devDependencies', () => {
    const after = { ...baseBefore, devDependencies: {} };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.equal(ops.dependencyChanges.length, 1);
    assert.equal(ops.dependencyChanges[0].changeType, 'removed');
    assert.equal(ops.dependencyChanges[0].section, 'devDependencies');
  });

  it('detects updated dep in devDependencies', () => {
    const after = { ...baseBefore, devDependencies: { eslint: '^8.56.0' } };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.equal(ops.dependencyChanges.length, 1);
    assert.equal(ops.dependencyChanges[0].changeType, 'updated');
    assert.equal(ops.dependencyChanges[0].oldRange, '^8.54.0');
    assert.equal(ops.dependencyChanges[0].newRange, '^8.56.0');
  });

  it('detects changes in peerDependencies and optionalDependencies', () => {
    const before = { ...baseBefore, peerDependencies: { react: '^17' }, optionalDependencies: { fsevents: '^2' } };
    const after = { ...baseBefore, peerDependencies: { react: '^18' }, optionalDependencies: { fsevents: '^2.3' } };
    const ops = parsePackageJsonDiff(as(before), as(after));
    const sections = ops.dependencyChanges.map((c) => c.section).sort();
    assert.deepEqual(sections, ['optionalDependencies', 'peerDependencies']);
  });

  it('detects script changes', () => {
    const after = { ...baseBefore, scripts: { test: 'jest' } };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.equal(ops.scriptChanges.length, 1);
    assert.equal(ops.scriptChanges[0].name, 'test');
    assert.equal(ops.scriptChanges[0].oldValue, 'node --test');
    assert.equal(ops.scriptChanges[0].newValue, 'jest');
  });

  it('detects engines changes', () => {
    const after = { ...baseBefore, engines: { node: '>=22' } };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.equal(ops.enginesChanged, true);
  });

  it('returns no changes when files are identical', () => {
    const ops = parsePackageJsonDiff(as(baseBefore), as(baseBefore));
    assert.equal(ops.dependencyChanges.length, 0);
    assert.equal(ops.scriptChanges.length, 0);
    assert.equal(ops.enginesChanged, false);
    assert.equal(ops.rawDiffLines, 0);
  });

  it('throws on malformed before JSON (never falls back to regex)', () => {
    assert.throws(
      () => parsePackageJsonDiff('{invalid', as(baseBefore)),
      PolicyEngineMalformedJsonError,
    );
  });

  it('throws on malformed after JSON', () => {
    assert.throws(
      () => parsePackageJsonDiff(as(baseBefore), '{invalid'),
      PolicyEngineMalformedJsonError,
    );
  });

  it('reports rawDiffLines > 0 when content differs', () => {
    const after = { ...baseBefore, devDependencies: { eslint: '^8.56.0' } };
    const ops = parsePackageJsonDiff(as(baseBefore), as(after));
    assert.ok(ops.rawDiffLines > 0);
  });
});
