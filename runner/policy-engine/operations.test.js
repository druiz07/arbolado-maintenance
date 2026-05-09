import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateOperations, classifyOperation } from './operations.js';

function ops({ deps = [], scripts = [], engines = false } = {}) {
  return { dependencyChanges: deps, scriptChanges: scripts, enginesChanged: engines, rawDiffLines: 0 };
}

describe('classifyOperation', () => {
  it('maps changeType → operation name', () => {
    assert.equal(classifyOperation({ changeType: 'added' }), 'add_dependency');
    assert.equal(classifyOperation({ changeType: 'removed' }), 'remove_dependency');
    assert.equal(classifyOperation({ changeType: 'updated' }), 'bump_version');
    assert.equal(classifyOperation({ changeType: 'mystery' }), 'unknown');
  });
});

describe('validateOperations', () => {
  it('allows operations declared in allowed_operations', () => {
    const violations = validateOperations(
      ops({ deps: [{ name: 'eslint', section: 'devDependencies', changeType: 'updated' }] }),
      ['bump_version'],
      [],
    );
    assert.deepEqual(violations, []);
  });

  it('blocks operations declared in forbidden_operations', () => {
    const violations = validateOperations(
      ops({ deps: [{ name: 'react', section: 'dependencies', changeType: 'removed' }] }),
      ['bump_version'],
      ['remove_dependency'],
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'forbidden_operation');
    assert.equal(violations[0].op, 'remove_dependency');
    assert.equal(violations[0].dep, 'react');
  });

  it('forbidden wins over allowed when an op is in both lists', () => {
    const violations = validateOperations(
      ops({ deps: [{ name: 'eslint', section: 'devDependencies', changeType: 'updated' }] }),
      ['bump_version'],
      ['bump_version'],
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'forbidden_operation');
  });

  it('reports operations not in allowed_operations as not_allowed', () => {
    const violations = validateOperations(
      ops({ deps: [{ name: 'lodash', section: 'dependencies', changeType: 'added' }] }),
      ['bump_version'],
      [],
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'not_allowed_operation');
    assert.equal(violations[0].op, 'add_dependency');
  });

  it('blocks scripts changes when change_scripts is forbidden', () => {
    const violations = validateOperations(
      ops({ scripts: [{ name: 'test', oldValue: 'a', newValue: 'b' }] }),
      ['bump_version'],
      ['change_scripts'],
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'forbidden_scripts_change');
  });

  it('blocks engines change when modify_engines is forbidden', () => {
    const violations = validateOperations(
      ops({ engines: true }),
      ['bump_version'],
      ['modify_engines'],
    );
    assert.equal(violations.length, 1);
    assert.equal(violations[0].type, 'forbidden_engines_change');
  });

  it('does not flag scripts or engines when not in forbidden list', () => {
    const violations = validateOperations(
      ops({ scripts: [{ name: 'a', oldValue: '1', newValue: '2' }], engines: true }),
      ['bump_version'],
      [],
    );
    assert.deepEqual(violations, []);
  });
});
