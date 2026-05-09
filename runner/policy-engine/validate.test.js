import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validatePackageJsonChange } from './validate.js';

const canonicalPolicy = {
  allowed_operations: ['bump_version'],
  forbidden_operations: ['remove_dependency', 'change_scripts', 'modify_engines'],
  require_dev_dependency: true,
  version_rules: {
    allowed_range_changes: ['patch', 'minor'],
    forbid_major_bumps: true,
    forbid_range_widening: true,
  },
  max_diff_lines: 200,
};

const before = JSON.stringify(
  {
    name: 'arbolado-test',
    version: '1.0.0',
    dependencies: { react: '^18.0.0' },
    devDependencies: { eslint: '^8.54.0' },
    scripts: { test: 'node --test' },
    engines: { node: '>=20' },
  },
  null,
  2,
);

function buildAfter(mutator) {
  const obj = JSON.parse(before);
  mutator(obj);
  return JSON.stringify(obj, null, 2);
}

describe('validatePackageJsonChange (entry point — bump-devdep-cve policy)', () => {
  it('accepts a clean dev dep patch bump', () => {
    const after = buildAfter((o) => {
      o.devDependencies.eslint = '^8.54.1';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, true, JSON.stringify(res.violations));
    assert.equal(res.violations.length, 0);
  });

  it('blocks bump on a runtime dep when require_dev_dependency is true', () => {
    const after = buildAfter((o) => {
      o.dependencies.react = '^18.0.1';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.type === 'not_dev_dependency' && v.dep === 'react'));
  });

  it('blocks dev-dep major bump (forbid_major_bumps)', () => {
    const after = buildAfter((o) => {
      o.devDependencies.eslint = '^9.0.0';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(
      res.violations.some(
        (v) => v.type === 'semver_violation' && v.reason === 'major_bump_forbidden',
      ),
    );
  });

  it('blocks script changes (change_scripts forbidden)', () => {
    const after = buildAfter((o) => {
      o.scripts.test = 'jest';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.type === 'forbidden_scripts_change'));
  });

  it('blocks engines changes (modify_engines forbidden)', () => {
    const after = buildAfter((o) => {
      o.engines.node = '>=22';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.type === 'forbidden_engines_change'));
  });

  it('blocks adding a new dep (add_dependency not in allowed_operations)', () => {
    const after = buildAfter((o) => {
      o.devDependencies.lodash = '^4.17.21';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(
      res.violations.some(
        (v) => v.type === 'not_allowed_operation' && v.dep === 'lodash',
      ),
    );
  });

  it('blocks remove_dependency (forbidden)', () => {
    const after = buildAfter((o) => {
      delete o.devDependencies.eslint;
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(
      res.violations.some(
        (v) => v.type === 'forbidden_operation' && v.op === 'remove_dependency',
      ),
    );
  });

  it('blocks wildcard widening on dev dep', () => {
    const after = buildAfter((o) => {
      o.devDependencies.eslint = '*';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.valid, false);
    assert.ok(
      res.violations.some(
        (v) => v.type === 'semver_violation' && v.reason === 'range_widening_to_wildcard',
      ),
    );
  });

  it('blocks when diff exceeds max_diff_lines', () => {
    const tightPolicy = { ...canonicalPolicy, max_diff_lines: 1 };
    const after = buildAfter((o) => {
      o.devDependencies.eslint = '^8.54.1';
    });
    const res = validatePackageJsonChange(before, after, tightPolicy);
    assert.equal(res.valid, false);
    assert.ok(res.violations.some((v) => v.type === 'diff_size_exceeded'));
  });

  it('returns ops alongside violations for inspection', () => {
    const after = buildAfter((o) => {
      o.devDependencies.eslint = '^8.54.1';
    });
    const res = validatePackageJsonChange(before, after, canonicalPolicy);
    assert.equal(res.ops.dependencyChanges.length, 1);
    assert.equal(res.ops.dependencyChanges[0].name, 'eslint');
  });
});
