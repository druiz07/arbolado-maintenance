import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDepExists } from './dep-exists.js';

test('checkDepExists: dev dep presente en devDependencies → ok:true', () => {
  const pkg = {
    name: 'app',
    devDependencies: { eslint: '^8.54.0', vitest: '^1.0.0' },
    dependencies: { react: '^18.0.0' },
  };
  const r = checkDepExists({ packageJson: pkg, depName: 'eslint', depType: 'dev' });
  assert.equal(r.ok, true);
  assert.equal(r.foundIn, 'devDependencies');
});

test('checkDepExists: runtime dep presente en dependencies → ok:true', () => {
  const pkg = {
    devDependencies: { eslint: '^8.54.0' },
    dependencies: { react: '^18.0.0' },
  };
  const r = checkDepExists({ packageJson: pkg, depName: 'react', depType: 'runtime' });
  assert.equal(r.ok, true);
  assert.equal(r.foundIn, 'dependencies');
});

test('checkDepExists: dep ausente completamente → ok:false, reason=not_in_package_json', () => {
  const pkg = {
    devDependencies: { vitest: '^1.0.0' },
    dependencies: { react: '^18.0.0' },
  };
  const r = checkDepExists({ packageJson: pkg, depName: 'eslint', depType: 'dev' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_in_package_json');
  assert.equal(r.foundIn, null);
});

test('checkDepExists: dev signal pero dep está en dependencies → ok:false, reason=wrong_section', () => {
  const pkg = {
    devDependencies: { vitest: '^1.0.0' },
    dependencies: { eslint: '^8.54.0' },
  };
  const r = checkDepExists({ packageJson: pkg, depName: 'eslint', depType: 'dev' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'wrong_section');
  assert.equal(r.foundIn, 'dependencies');
});

test('checkDepExists: package.json sin devDependencies y dep dev → ok:false', () => {
  const pkg = { name: 'app', dependencies: { react: '^18.0.0' } };
  const r = checkDepExists({ packageJson: pkg, depName: 'eslint', depType: 'dev' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_in_package_json');
});

test('checkDepExists: package.json totalmente vacío y dep dev → ok:false', () => {
  const r = checkDepExists({ packageJson: {}, depName: 'eslint', depType: 'dev' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_in_package_json');
});

test('checkDepExists: packageJson no-objeto → throws', () => {
  assert.throws(
    () => checkDepExists({ packageJson: null, depName: 'x', depType: 'dev' }),
    /packageJson must be a plain object/,
  );
  assert.throws(
    () => checkDepExists({ packageJson: 'not-an-object', depName: 'x', depType: 'dev' }),
    /packageJson must be a plain object/,
  );
  assert.throws(
    () => checkDepExists({ packageJson: [], depName: 'x', depType: 'dev' }),
    /packageJson must be a plain object/,
  );
});

test('checkDepExists: depName vacío → throws', () => {
  assert.throws(
    () => checkDepExists({ packageJson: {}, depName: '', depType: 'dev' }),
    /depName must be a non-empty string/,
  );
  assert.throws(
    () => checkDepExists({ packageJson: {}, depName: null, depType: 'dev' }),
    /depName must be a non-empty string/,
  );
});

test('checkDepExists: depType inválido → throws', () => {
  assert.throws(
    () => checkDepExists({ packageJson: {}, depName: 'x', depType: 'optional' }),
    /depType must be 'dev' or 'runtime'/,
  );
  assert.throws(
    () => checkDepExists({ packageJson: {}, depName: 'x', depType: undefined }),
    /depType must be 'dev' or 'runtime'/,
  );
});
